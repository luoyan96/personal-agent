import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { routes } from "@research-agent-platform/contracts";
import { readConfig } from "../../../apps/api/dist/config.js";
import { openDatabase, migrate, seed } from "../../../apps/api/dist/database.js";
import { provisionTestAccounts } from "../../../apps/api/dist/auth.js";
import { createServer } from "../../../apps/api/dist/server.js";
import { createPlannerTasks, plannerPlanInput } from "../src/research/planner-chat.ts";

// Real local HTTP and SQLite using the unchanged current API. No model, SDK,
// personal credentials, live service or user material is involved.
for (const { lost, count } of [
  { lost: "editPlan", count: 7 },
  { lost: "confirmPlan", count: 7 },
  { lost: "confirmPlan", count: 1 },
  { lost: "confirmPlan", count: 3 },
])
  test(`a ${count}-item draft creates exactly ${count} real task(s) after a lost ${lost} receipt`, async () => {
    const testRoot = realpathSync(tmpdir());
    const directory = mkdtempSync(join(testRoot, "acceptcat-planner-task-"));
    const config = readConfig({
      NODE_ENV: "test",
      DATABASE_PATH: join(directory, "platform.sqlite"),
      BLOB_ROOT: join(directory, "blobs"),
      APP_ORIGIN: "http://127.0.0.1:4397",
    });
    mkdirSync(config.blobRoot);
    const db = openDatabase(config.databasePath, true);
    let app;
    try {
      migrate(db);
      seed(db, "test");
      const password = randomBytes(24).toString("hex");
      await provisionTestAccounts(db, "test", [
        { memberId: "member_A", username: "synthetic_single_task", password },
      ]);
      app = createServer(config);
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      let cookie = "",
        csrf = "",
        failAfterWrite = false;
      const calls = [];
      const call = async (name, options = {}) => {
        calls.push(name);
        const route = routes[name];
        const response = await fetch(
          address + route.path.replace("{id}", options.params?.id || "synthetic"),
          {
            method: route.method,
            headers: {
              origin: config.origin,
              "content-type": "application/json",
              cookie,
              "x-csrf-token": csrf,
              "Idempotency-Key": options.idempotencyKey || randomUUID(),
            },
            ...(route.method === "GET"
              ? {}
              : { body: JSON.stringify(options.body || {}) }),
          },
        );
        const body = await response.json();
        assert(response.ok, JSON.stringify(body));
        if (name === "login") cookie = response.headers.get("set-cookie").split(";")[0];
        route.response.parse(body);
        if (failAfterWrite && name === lost) {
          failAfterWrite = false;
          throw new Error("synthetic response lost after commit");
        }
        return body;
      };
      await call("login", { body: { username: "synthetic_single_task", password } });
      csrf = (await call("session")).data.csrfToken;
      const items = Array.from({ length: count }, (_, i) => ({
        id: `step_${i + 1}`,
        title: `Synthetic step ${i + 1}`,
        goal: `Purpose ${i + 1}`,
        deliverable: `Deliverable ${i + 1}`,
        acceptanceCriteria: `Criterion ${i + 1}`,
        allocation: { kind: "self" },
        dependencies: i ? [`step_${i}`] : [],
        schedule: {
          suggested: null,
          hardDeadline: null,
          committed: null,
          estimatedHumanHours: null,
          checkpoint: null,
        },
        inputArtifactIds: [],
        budget: null,
      }));
      const plan = (
        await call("createPlan", {
          body: {
            labId: "lab_synthetic",
            goal: "Improve a synthetic research project",
            proposedItems: items,
            unresolvedQuestions: [],
          },
        })
      ).data;
      const intent = {
        key: randomUUID(),
        plan,
        deadline: { date: "2026-11-01", target: "final" },
      };
      const preview = plannerPlanInput(plan, intent.deadline);
      failAfterWrite = true;
      await assert.rejects(
        createPlannerTasks(call, intent, () => true),
        /response lost/,
      );
      const result = await createPlannerTasks(call, intent, () => true);
      assert.equal(result.taskIds.length, count);
      assert.equal(Number(db.prepare("SELECT count(*) n FROM tasks").get().n), count);
      assert.equal(
        Number(db.prepare("SELECT count(*) n FROM assignments").get().n),
        count,
      );
      assert.equal(
        calls.filter((name) => name === "editPlan").length,
        1, // All cases persist the explicitly stated final deadline before confirming.
      );
      assert.equal(calls.filter((name) => name === "confirmPlan").length, 1);
      assert.deepEqual(result.plan.proposedItems, preview.proposedItems);
      const detail = (await call("task", { params: { id: result.taskIds.at(-1) } }))
        .data.task;
      assert.equal(detail.title, preview.proposedItems.at(-1).title);
      assert.equal(detail.goal, items.at(-1).goal);
      assert.equal(detail.schedule.hardDeadline.value.date, "2026-11-01");
      assert.equal(result.plan.version, 3);
      assert.equal(
        (await call("getPlan", { params: { id: plan.id } })).data.proposedItems.length,
        count,
      );
    } finally {
      if (app) await app.close();
      db.close();
      // Exact test-owned temporary directory, no user/runtime data.
      assert.equal(dirname(realpathSync(directory)), testRoot);
      assert(basename(directory).startsWith("acceptcat-planner-task-"));
      rmSync(directory, { recursive: true, force: true });
    }
  });
