import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { routes, type RouteName } from "@research-agent-platform/contracts";
import { readConfig } from "../src/config.js";
import { openDatabase, migrate } from "../src/database.js";
import { createServer } from "../src/server.js";
import { ChatWorker } from "../src/chat-worker.js";
import type { ModelCall, ModelResult } from "../src/execution-worker.js";
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const pkg = {
  name: "private-analysis",
  description: "分析用户提供的文字，结论按事实与推断分开",
  release: "1.0",
  instructions: "PRIVATE_METHOD_ALPHA。输出结论，然后列出依据。",
  references: [
    {
      path: "references/check.md",
      text: "SELECTED_REFERENCE_BETA：没有证据就列出缺项。",
    },
    { path: "references/unselected.md", text: "UNSELECTED_SECRET_GAMMA" },
  ],
  requirements: [],
  scriptCount: 0,
  assetCount: 0,
};
const source = { kind: "zip", label: "synthetic-skill.zip", revision: null };
const result = (text: string): ModelResult => ({
  text,
  failure: null,
  inputTokens: 200,
  outputTokens: 50,
  elapsedMs: 20,
});
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "rap-skills-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, "key");
  writeFileSync(key, randomBytes(32).toString("hex"), { mode: 0o600 });
  const config = readConfig({
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1:4491",
    DATABASE_PATH: join(dir, "db.sqlite"),
    BLOB_ROOT: join(dir, "blobs"),
    B3_AI_ENABLED: "1",
    LAB_CREDENTIAL_KEY_FILE: key,
  });
  mkdirSync(config.blobRoot);
  const db = openDatabase(config.databasePath, true);
  migrate(db);
  cleanup.push(() => db.close());
  const app = createServer(config),
    url = await app.listen({ host: "127.0.0.1", port: 0 });
  cleanup.push(() => app.close());
  const actors: { cookie: string; csrf: string; id: string }[] = [];
  async function call(
    name: RouteName,
    body: unknown = null,
    id?: string,
    actor = 0,
    key = randomUUID(),
    query = ""
  ) {
    const route = routes[name],
      r = await fetch(url + route.path.replace("{id}", id ?? "") + query, {
        method: route.method,
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          "idempotency-key": key,
          ...(actors[actor]
            ? {
                cookie: actors[actor]!.cookie,
                "x-csrf-token": actors[actor]!.csrf,
              }
            : {}),
        },
        ...(route.method === "GET" ? {} : { body: JSON.stringify(body) }),
      });
    return {
      status: r.status,
      value: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  const chats: any[] = [];
  for (let n = 0; n < 3; n++) {
    const username = "skill_" + randomUUID().slice(0, 8);
    expect(
      (
        await call(
          "register",
          { username, password: "12345678", displayName: "Skill test " + n },
          undefined,
          n
        )
      ).status
    ).toBe(201);
    const login = await call(
      "login",
      { username, password: "12345678" },
      undefined,
      n
    );
    actors[n] = { cookie: login.cookie, csrf: "", id: login.value.data.id };
    actors[n]!.csrf = (
      await call("session", null, undefined, n)
    ).value.data.csrfToken;
    expect(
      (
        await call(
          "createPersonalModel",
          {
            name: "synthetic",
            provider: "deepseek",
            model: "deepseek-flash",
            apiKey: "synthetic-never-live",
            enabled: true,
          },
          undefined,
          n
        )
      ).status
    ).toBe(201);
    chats[n] = (
      await call("personalConversation", {}, undefined, n)
    ).value.data;
  }
  const install = async (packageValue = pkg) => {
    const r = await call("installSkill", { package: packageValue, source });
    expect(r.status, JSON.stringify(r.value)).toBe(201);
    return r.value.data;
  };
  const configure = async (skill: any, patch: object) => {
    const r = await call(
      "updateSkillSettings",
      { ...skill.settings, ...patch, expectedVersion: skill.version },
      skill.id
    );
    expect(r.status, JSON.stringify(r.value)).toBe(200);
    return r.value.data;
  };
  const bind = async (skill: any) =>
    configure(skill, { boundAgentIds: [chats[0].agent.id] });
  const send = async (
    skill: any,
    text = "请分析这段合成材料",
    actor = 0,
    extra = {}
  ) =>
    call(
      "agentChatMessage",
      {
        text,
        continuous: true,
        skill: {
          id: skill.id,
          version: skill.version,
          referencePaths: ["references/check.md"],
          acceptLimitations: false,
          ...extra,
        },
      },
      chats[actor].conversation.id,
      actor
    );
  const tick = (model: ModelCall) =>
    new ChatWorker(
      db,
      config,
      model,
      undefined,
      () => Date.now() + 10000
    ).tick();
  return { call, actors, chats, install, configure, bind, send, tick, db };
}
describe(
  "private skill installation and real chat integration (synthetic model only)",
  { timeout: 30000 },
  () => {
    it("defaults private; source/list/uses/version APIs do not expose other users, including public descriptions", async () => {
      const s = await setup();
      let skill = await s.install();
      expect(skill.settings).toEqual({
        enabled: true,
        listed: false,
        boundAgentIds: [],
        callMemberIds: [],
        sourceMemberIds: [],
      });
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
      expect(
        (
          await s.call(
            "installedSkills",
            null,
            undefined,
            1,
            undefined,
            "?scope=public"
          )
        ).value.data
      ).toEqual([]);
      skill = await s.configure(skill, { listed: true });
      const listing = await s.call(
        "installedSkills",
        null,
        undefined,
        1,
        undefined,
        "?scope=public"
      );
      expect(listing.value.data[0]).toMatchObject({
        canCall: false,
        canReadSource: false,
        owned: false,
        settings: null,
        references: [],
      });
      expect(JSON.stringify(listing)).not.toContain("PRIVATE_METHOD");
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
      expect((await s.call("skillVersions", null, skill.id, 1)).status).toBe(
        404
      );
      expect((await s.send(skill, "request", 1)).status).toBe(403);
      expect(
        (
          await s.call(
            "updateSkillSettings",
            {
              ...skill.settings,
              expectedVersion: skill.version,
              boundAgentIds: [s.chats[1].agent.id],
            },
            skill.id
          )
        ).status
      ).toBe(403);
      expect(
        (
          await s.call(
            "updateSkillSettings",
            {
              ...skill.settings,
              expectedVersion: skill.version,
              callMemberIds: [s.actors[1]!.id],
            },
            skill.id
          )
        ).status
      ).toBe(403);
    });
    it("loads complete private instructions and only selected references, keeps method out of human messages, records actual reply", async () => {
      const s = await setup(),
        skill = await s.bind(await s.install()),
        sent = await s.send(skill);
      expect(sent.status, JSON.stringify(sent.value)).toBe(201);
      expect(sent.value.data.message.text).toBe("请分析这段合成材料");
      expect(sent.value.data.turn.budget.maxTokens).toBe(128000);
      await s.tick(async (input) => {
        const p = JSON.parse(input.prompt);
        expect(p.selectedSkill.instructions).toBe(pkg.instructions);
        expect(p.selectedSkill.references).toEqual([pkg.references[0]]);
        expect(input.prompt).not.toContain("UNSELECTED_SECRET_GAMMA");
        expect(input.system).toContain("No shell, Python");
        return result("结论：合成材料缺少证据。");
      });
      const uses = await s.call("skillUses", null, skill.id);
      expect(uses.value.data[0]).toMatchObject({
        revision: 1,
        status: "succeeded",
        failure: null,
      });
      const turn = await s.call("chatTurn", null, sent.value.data.turn.id);
      expect(turn.value.data.status).toBe("succeeded");
      expect((await s.call("skillUses", null, skill.id, 1)).status).toBe(404);
    });
    it("updates append immutable versions; exact replay cannot create duplicates; rollback bumps generation and disables queued old calls", async () => {
      const s = await setup(),
        key = randomUUID();
      const first = await s.call(
          "installSkill",
          { package: pkg, source },
          undefined,
          0,
          key
        ),
        again = await s.call(
          "installSkill",
          { package: pkg, source },
          undefined,
          0,
          key
        );
      expect(first.value.data.id).toBe(again.value.data.id);
      expect(
        s.db.prepare("SELECT count(*) n FROM installed_skills").get()!.n
      ).toBe(1);
      let skill = await s.bind(first.value.data);
      const sent = await s.send(skill);
      const revised = await s.call(
        "reviseSkill",
        {
          expectedVersion: skill.version,
          package: { ...pkg, release: "2.0", instructions: "NEW_METHOD_DELTA" },
          source,
        },
        skill.id
      );
      expect(revised.status, JSON.stringify(revised.value)).toBe(200);
      skill = revised.value.data;
      expect(skill.revision).toBe(2);
      expect(
        (await s.call("chatTurn", null, sent.value.data.turn.id)).value.data
          .status
      ).not.toBe("queued");
      await s.tick(async () => {
        throw Error("old generation must never call");
      });
      const rollback = await s.call(
        "rollbackSkill",
        { expectedVersion: skill.version, revision: 1 },
        skill.id
      );
      expect(rollback.status).toBe(200);
      expect(rollback.value.data.version).toBe(skill.version + 1);
      expect(
        (await s.call("skillSource", null, skill.id)).value.data.package
          .instructions
      ).toBe(pkg.instructions);
      expect((await s.send(skill)).status).toBe(409);
    });
    it("separates friend call from source copying; revoke cancels late result and never uses owner model credentials", async () => {
      const s = await setup(),
        friend = await s.call(
          "requestContact",
          {},
          s.chats[1].conversation.members.find(
            (m: any) => m.contactId !== s.chats[1].agent.id
          ).contactId
        );
      expect(friend.status).toBe(200);
      const request = friend.value.data.relationship;
      expect(
        (
          await s.call(
            "decideContactRequest",
            { expectedVersion: request.version, decision: "accept" },
            request.requestId,
            1
          )
        ).status
      ).toBe(200);
      let skill = await s.configure(await s.bind(await s.install()), {
        callMemberIds: [s.actors[1]!.id],
      });
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
      const sent = await s.send(skill, "use my model", 1);
      expect(sent.status, JSON.stringify(sent.value)).toBe(201);
      let enter!: () => void, release!: (r: ModelResult) => void;
      const ready = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const running = s.tick(async (input, signal) => {
        expect(JSON.parse(input.prompt).ownerId).toBe(s.actors[1]!.id);
        enter();
        return new Promise((resolve) => {
          release = resolve;
        });
      });
      await ready;
      skill = await s.configure(skill, { callMemberIds: [] });
      release(result("late PRIVATE_METHOD result"));
      await running;
      const turn = await s.call("chatTurn", null, sent.value.data.turn.id, 1);
      expect(turn.value.data.outputMessageId).toBeNull();
      expect(turn.value.data.status).not.toBe("succeeded");
    });
    it("requires limitations acknowledgment; same-generation supplements merge once, different skill starts a new batch", async () => {
      const s = await setup(),
        complex = await s.bind(
          await s.install({
            ...pkg,
            scriptCount: 1,
            instructions: "Use IMAGE_GENERATE and run scripts/check.py",
          })
        );
      expect(complex.requirements).toContain("脚本执行");
      expect((await s.send(complex)).status).toBe(409);
      const one = await s.send(complex, "只讨论方案", 0, {
          acceptLimitations: true,
        }),
        two = await s.send(complex, "再补充条件", 0, {
          acceptLimitations: true,
        });
      expect(one.value.data.turn.id).toBe(two.value.data.turn.id);
      const other = await s.bind(await s.install({ ...pkg, name: "other" })),
        three = await s.send(other);
      expect(three.value.data.turn.id).not.toBe(one.value.data.turn.id);
      expect(
        (await s.call("chatTurn", null, one.value.data.turn.id)).value.data
          .status
      ).toBe("cancelled");
      expect(
        (await s.send(other, "bad path", 0, { referencePaths: ["../secret"] }))
          .status
      ).toBe(404);
    });
  }
);
