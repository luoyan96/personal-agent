import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { routes, type RouteName, type RequestFor } from "@research-agent-platform/contracts";
import { readConfig } from "../src/config.js";
import { openDatabase, migrate } from "../src/database.js";
import { createServer } from "../src/server.js";
import { ChatWorker } from "../src/chat-worker.js";
import { parseImportedSkill } from "@research-agent-platform/research-skills/import";
import { loadResearchSkills } from "@research-agent-platform/research-skills";
import type { ModelCall, ModelResult } from "../src/execution-worker.js";
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const pkg: RequestFor<"installSkill">["body"]["package"] = {
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
    it("preserves exact-limit text through install, revise, rollback and selected-reference chat", async () => {
      const s = await setup();
      let skill = await s.bind(await s.install());
      const legacy = s.db.prepare("SELECT * FROM installed_skill_versions WHERE skill_id=? AND revision=1").get(skill.id);
      const instructions = "x".repeat(120000);
      const revised = await s.call("reviseSkill", {
        expectedVersion: skill.version,
        package: { ...pkg, instructions, references: [] }, source,
      }, skill.id);
      expect(revised.status, JSON.stringify(revised.value)).toBe(200);
      expect((await s.call("skillSource", null, skill.id)).value.data.package.instructions).toBe(instructions);
      const rolledBack = await s.call("rollbackSkill", { expectedVersion: revised.value.data.version, revision: 1 }, skill.id);
      expect(rolledBack.status).toBe(200);
      expect(s.db.prepare("SELECT * FROM installed_skill_versions WHERE skill_id=? AND revision=1").get(skill.id)).toEqual(legacy);

      const end = "REFERENCE_END_17", text = "x".repeat(120000 - end.length) + end;
      expect(text.length).toBe(120000);
      skill = await s.bind(await s.install({ ...pkg, references: [
        { path: "references/check.md", text }, pkg.references[1]!,
      ] }));
      expect((await s.send(skill)).status).toBe(201);
      let calls = 0;
      await s.tick(async (request) => {
        const input = JSON.parse(request.prompt);
        expect(input.selectedSkill.references).toEqual([{ path: "references/check.md", text }]);
        expect(request.prompt).not.toContain("UNSELECTED_SECRET_GAMMA");
        calls++;
        return result("Synthetic exact-limit reference received; no research quality claim.");
      });
      expect(calls).toBe(1);
      expect((await s.call("skillUses", null, skill.id)).value.data[0].status).toBe("succeeded");
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
      const before = s.db.prepare("SELECT count(*) AS n FROM installed_skills").get()!.n;
      expect((await s.call("installSkill", { package: { ...pkg, references: [{ path: "references/oversize.md", text: "x".repeat(120001) }] }, source })).status).toBe(400);
      expect(s.db.prepare("SELECT count(*) AS n FROM installed_skills").get()!.n).toBe(before);
    });
    it("preserves parsed nested numeric releases through revise/replay/rollback without rewriting legacy versions or permissions", async () => {
      const s = await setup();
      let skill = await s.bind(await s.install({ ...pkg, release: "未标注" }));
      const legacy = s.db.prepare("SELECT * FROM installed_skill_versions WHERE skill_id=? AND revision=1").get(skill.id);
      const parsed = parseImportedSkill([
        { path: "SKILL.md", text: `---\nname: ${pkg.name}\ndescription: ${pkg.description}\nmetadata:\n  version: 2.10\n---\n${pkg.instructions}` },
        ...pkg.references,
      ]);
      expect(parsed.release).toBe("2.10");
      const request = { expectedVersion: skill.version, package: parsed, source }, key = randomUUID();
      const revised = await s.call("reviseSkill", request, skill.id, 0, key);
      expect(revised.status, JSON.stringify(revised.value)).toBe(200);
      expect((await s.call("reviseSkill", request, skill.id, 0, key)).value.data.digest).toBe(revised.value.data.digest);
      skill = revised.value.data;
      expect(skill).toMatchObject({ release: "2.10", revision: 2, enabled: true });
      expect(skill.settings.listed).toBe(false);
      expect(skill.settings.callMemberIds).toEqual([]);
      expect(skill.settings.sourceMemberIds).toEqual([]);
      expect(s.db.prepare("SELECT * FROM installed_skill_versions WHERE skill_id=? AND revision=1").get(skill.id)).toEqual(legacy);
      expect((await s.call("skillVersions", null, skill.id)).value.data.map((v: any) => [v.revision, v.release])).toEqual([[2, "2.10"], [1, "未标注"]]);
      const queued = await s.send(skill);
      expect(queued.status).toBe(201);
      const restored = await s.call("rollbackSkill", { expectedVersion: skill.version, revision: 1 }, skill.id);
      expect(restored.status).toBe(200);
      expect(restored.value.data).toMatchObject({ release: "未标注", revision: 1, digest: legacy!.digest });
      let called = false;
      await s.tick(async () => { called = true; return result("must not run stale revision"); });
      expect(called).toBe(false);
      expect((await s.call("chatTurn", null, queued.value.data.turn.id)).value.data.status).not.toBe("succeeded");
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
      expect((await s.call("skillSource", null, skill.id)).value.data.package.release).toBe("未标注");
    });
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
    it.each([false, true])("runs canonical SLR text and bound evidence in one Skill batch (withdraw before execution: %s)", async withdraw => {
      const s = await setup(), bundled = loadResearchSkills().find(skill => skill.name === "systematic-literature-review")!;
      const path = "references/slr-checklist.md";
      const procedure = parseImportedSkill([
        { path: "SKILL.md", text: `---\nname: ${bundled.name}\ndescription: ${JSON.stringify(bundled.description)}\n---\n${bundled.content}` },
        { path, text: readFileSync(join(bundled.directory, path), "utf8") },
      ]);
      const skill = await s.bind(await s.install(procedure));
      const created = await s.call("createResearchCollection", { name: "合成综述资料", scope: "owner_private" });
      expect(created.status).toBe(201);
      const collection = created.value.data;
      const uploaded = await s.call("importResearchFile", { expectedCollectionVersion: collection.version, filename: "synthetic-studies.txt", mediaType: "text/plain", contentBase64: Buffer.from("SYNTHETIC_SLR_STUDY S1：合成方法A，无对照数据。S2：仅有摘要，未取得全文；不能声称完成系统综述。").toString("base64") }, collection.id);
      expect(uploaded.status, JSON.stringify(uploaded.value)).toBe(201);
      const file = uploaded.value.data;
      const binding = await s.call("bindAgentResearchCollections", { expectedVersion: 1, collectionIds: [collection.id] }, s.chats[0].agent.id);
      expect(binding.status).toBe(200);
      const first = await s.send(skill, "请帮我研究 SYNTHETIC_SLR_STUDY 的综述问题和筛选表", 0, { referencePaths: [path] });
      const second = await s.send(skill, "补充：S2只有摘要，请标记未取得全文", 0, { referencePaths: [path] });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.value.data.turn.id).toBe(first.value.data.turn.id);
      if (withdraw) {
        const current = (await s.call("researchCollections")).value.data.find((c: any) => c.id === collection.id);
        const removed = await s.call("withdrawResearchCollection", { expectedVersion: current.version }, collection.id);
        expect(removed.status).toBe(200);
      }
      let calls = 0;
      await s.tick(async input => {
        calls++;
        const prompt = JSON.parse(input.prompt);
        expect(prompt.selectedSkill.instructions).toBe(bundled.content);
        expect(prompt.selectedSkill.references).toEqual(procedure.references);
        expect(prompt.researchLibrary.excerpts.some((e: any) => e.text.includes("SYNTHETIC_SLR_STUDY"))).toBe(true);
        expect(prompt.researchLibrary.excerpts[0].citation).toMatchObject({ collectionId: collection.id, sourceId: file.id, version: 1, sha256: file.sha256 });
        expect(input.system).toContain("No shell, Python");
        return result("合成执行器输出：这是一份不完整的范围综述；S2全文未取得，不声称PRISMA完整，也未创建文件。");
      });
      const completed = (await s.call("chatTurn", null, first.value.data.turn.id)).value.data;
      expect(calls).toBe(withdraw ? 0 : 1);
      if (withdraw) {
        expect(completed.status).not.toBe("succeeded");
        expect(completed.outputMessageId).toBeNull();
        expect(s.db.prepare("SELECT count(*) n FROM chat_attempts WHERE turn_id=?").get(completed.id)!.n).toBe(0);
      } else {
        expect(completed.status).toBe("succeeded");
        expect(completed.libraryRead.sources[0].citation.sourceId).toBe(file.id);
        expect(completed.createdAgent).toBeUndefined();
        expect(completed.assistantReceipt).toBeUndefined();
        const reply = JSON.parse(String(s.db.prepare("SELECT document FROM chat_messages WHERE id=?").get(completed.outputMessageId)!.document));
        expect(reply.text).toContain("不完整的范围综述");
      }
      expect((await s.call("researchFile", null, file.id, 1)).status).toBe(404);
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
    });
    it.each([
      ["creation wording in the selected procedure", "创建一个文献整理 Agent，给出研究问题和纳入标准", "补充：先按技能整理输入条件"],
      ["research imperative in the first message", "请帮我研究合成材料中的方法差异", "补充：缺失的证据单独列出"],
      ["research imperative in a supplement", "背景：下面只使用提供的合成材料", "请帮我制定研究问题和筛选表"],
    ])("keeps %s in one explicit Skill batch, without assistant delegation or contact creation", async (_label, firstText, supplement) => {
      const s = await setup(), skill = await s.bind(await s.install());
      const countContacts = () => Number(s.db.prepare("SELECT count(*) n FROM chat_contacts").get()!.n);
      const contactsBefore = countContacts();
      const first = await s.send(skill, firstText);
      const second = await s.send(skill, supplement);
      expect(first.status, JSON.stringify(first.value)).toBe(201);
      expect(second.status, JSON.stringify(second.value)).toBe(201);
      expect(second.value.data.turn.id).toBe(first.value.data.turn.id);
      const id = first.value.data.turn.id;
      const request = JSON.parse(String(s.db.prepare("SELECT request_json FROM chat_turns WHERE id=?").get(id)!.request_json));
      expect(request.skill).toEqual({ id: skill.id, version: skill.version, referencePaths: ["references/check.md"], acceptLimitations: false });
      expect(request.continuous.messageIds).toEqual([first.value.data.message.id, second.value.data.message.id]);
      expect(request.purpose).toBeUndefined();
      expect(request.assistantMode).toBeUndefined();
      expect(request.personalAssistant).toBeUndefined();
      let calls = 0;
      await s.tick(async input => {
        calls++;
        const prompt = JSON.parse(input.prompt);
        expect(prompt.selectedSkill.instructions).toBe(pkg.instructions);
        expect(prompt.selectedSkill.references).toEqual([pkg.references[0]]);
        expect(prompt.currentRequest.messageIds).toEqual(request.continuous.messageIds);
        const textIndex = prompt.messageColumns.indexOf("text");
        expect(prompt.messages.map((m: unknown[]) => m[textIndex])).toEqual([firstText, supplement]);
        expect(prompt.localSpecialists).toBeUndefined();
        expect(prompt.collaboratingHumans).toBeUndefined();
        expect(input.system).toContain("selectedSkill is an explicitly chosen");
        expect(input.prompt).not.toContain("UNSELECTED_SECRET_GAMMA");
        return result("按所选技能整理：合成材料缺少方法证据，暂不能比较。");
      });
      expect(calls).toBe(1);
      const completed = (await s.call("chatTurn", null, id)).value.data;
      expect(completed.status).toBe("succeeded");
      expect(completed.createdAgent).toBeUndefined();
      expect(completed.assistantReceipt).toBeUndefined();
      expect(countContacts()).toBe(contactsBefore);
      const reply = JSON.parse(String(s.db.prepare("SELECT document FROM chat_messages WHERE id=?").get(completed.outputMessageId)!.document));
      expect(reply.text).toBe("按所选技能整理：合成材料缺少方法证据，暂不能比较。");
      expect((await s.call("skillUses", null, skill.id)).value.data).toHaveLength(1);
      expect((await s.call("skillSource", null, skill.id, 1)).status).toBe(404);
    });
    it.each([
      { purpose: "create_agent" },
      { assistantMode: "coordinate", personalAssistant: true },
    ])("fences legacy mixed Skill/assistant routing %j before model execution or retry", async route => {
      const s = await setup(), skill = await s.bind(await s.install());
      const sent = await s.send(skill, "创建一个文献整理 Agent，先给出研究问题");
      expect(sent.status).toBe(201);
      const id = sent.value.data.turn.id, row = s.db.prepare("SELECT request_json FROM chat_turns WHERE id=?").get(id)!;
      s.db.prepare("UPDATE chat_turns SET request_json=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(String(row.request_json)), ...route }), id);
      let calls = 0;
      await s.tick(async () => { calls++; return result("must not execute an inconsistent route"); });
      expect(calls).toBe(0);
      expect(s.db.prepare("SELECT count(*) n FROM chat_attempts WHERE turn_id=?").get(id)!.n).toBe(0);
      const stopped = (await s.call("chatTurn", null, id)).value.data;
      expect(stopped).toMatchObject({ status: "cancelled", failure: "INPUT_CHANGED", outputMessageId: null });
      expect(stopped.allowedActions).not.toContain("retry");
      expect((await s.call("retryChatTurn", { expectedVersion: stopped.version, budget: { maxTokens: 4000, maxSeconds: 90 } }, id)).status).toBe(409);
      const fresh = await s.send(skill, "请帮我研究合成材料中的方法差异");
      expect(fresh.status).toBe(201);
      expect(fresh.value.data.turn.id).not.toBe(id);
      await s.tick(async input => {
        calls++;
        expect(JSON.parse(input.prompt).selectedSkill.instructions).toBe(pkg.instructions);
        return result("新的所选 Skill 调用可以正常回复。");
      });
      expect(calls).toBe(1);
      expect((await s.call("chatTurn", null, fresh.value.data.turn.id)).value.data.status).toBe("succeeded");
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
