import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ChatHistoryDatabase } from "../electron/utils/chatHistory.ts";
import {
  knownMember,
  rememberIdentity,
} from "../electron/utils/chatHistoryIdentity.ts";

const service = "https://rap.example.org";

const message = (index, extra = {}) => ({
  clientMsgID: `m${index}`,
  sendTime: 1_000 + index,
  seq: index,
  contentType: 101,
  textElem: { content: `synthetic-${index}` },
  ...extra,
});

const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, index) => message(from + index));

async function open(t, memberId = "member_A") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acceptcat-history-"));
  const db = new ChatHistoryDatabase(root, service, memberId);
  t.after(async () => {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, db };
}

test("a late history page cannot undo a withdrawal this machine saw", async (t) => {
  const { db } = await open(t);
  db.savePage("group", [message(1)], { reachedStart: true });

  const patch = {
    clientMsgID: "m1",
    contentType: 2101,
    notificationElem: { detail: JSON.stringify({ clientMsgID: "m1" }) },
  };
  db.revoke("m1", patch);

  // A page that started before the event and lands after it used to write the
  // original body back over the withdrawal. The fact must win instead.
  db.savePage("group", [message(1)], { reachedStart: true });

  const page = db.page("group");
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0].contentType, 2101);
  assert.equal(
    JSON.parse(page.messages[0].notificationElem.detail).clientMsgID,
    "m1",
  );
});

test("a message removed on this machine stays removed after a late page", async (t) => {
  const { db } = await open(t);
  db.savePage("group", [message(1), message(2)], { reachedStart: true });
  db.remove(["m1"]);
  db.savePage("group", [message(1), message(2)], { reachedStart: true });

  const page = db.page("group");
  assert.deepEqual(
    page.messages.map((item) => item.clientMsgID),
    ["m2"],
  );
  // Continuity still runs through the removed message, so paging past it works.
  assert.equal(page.hasMore, false);
  assert.equal(page.reachedStart, true);
});

test("a page that skips messages is reported instead of claimed as complete", async (t) => {
  const { db } = await open(t);
  db.savePage("group", range(1, 10), { reachedStart: true });
  // A head page whose oldest message does not touch the run already cached.
  // The previous attempt chained 21 straight onto 10 and still reported that
  // the beginning had been reached.
  db.savePage("group", range(21, 30));

  const page = db.page("group");
  assert.deepEqual(
    page.messages.map((item) => item.clientMsgID),
    range(21, 30).map((item) => item.clientMsgID),
  );
  assert.equal(page.reachedStart, false);
  assert.equal(page.hasMore, true);
  assert.equal(page.incomplete, true);
});

test("verified pages page back through the transcript in order", async (t) => {
  const { db } = await open(t);
  db.savePage("group", range(11, 30));
  db.savePage("group", range(1, 10), { before: "m11", reachedStart: true });

  const head = db.page("group");
  assert.equal(head.messages.length, 20);
  assert.equal(head.messages[0].clientMsgID, "m11");
  assert.equal(head.messages.at(-1).clientMsgID, "m30");
  assert.equal(head.hasMore, true);
  assert.equal(head.reachedStart, false);
  assert.equal(head.incomplete, false);

  const older = db.page("group", "m11");
  assert.equal(older.messages.length, 10);
  assert.equal(older.messages[0].clientMsgID, "m1");
  assert.equal(older.messages.at(-1).clientMsgID, "m10");
  assert.equal(older.hasMore, false);
  assert.equal(older.reachedStart, true);
  assert.equal(older.incomplete, false);
});

test("an empty cache answers empty without inventing continuity", async (t) => {
  const { db } = await open(t);
  assert.deepEqual(db.page("group"), {
    messages: [],
    hasMore: false,
    reachedStart: false,
    incomplete: false,
  });
});

test("each account gets its own file and its own transcript", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acceptcat-history-"));
  const first = new ChatHistoryDatabase(root, service, "member_A");
  const second = new ChatHistoryDatabase(root, service, "member_B");
  t.after(async () => {
    first.close();
    second.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  first.savePage("group", [message(1)], { reachedStart: true });
  assert.equal(second.page("group").messages.length, 0);

  const files = await fs.readdir(root);
  assert.equal(files.filter((name) => name.endsWith(".sqlite")).length, 2);
});

test("forget drops one conversation and keeps the others", async (t) => {
  const { db } = await open(t);
  db.savePage("group", [message(1)], { reachedStart: true });
  db.savePage("single", [message(2)], { reachedStart: true });

  db.forget("group");
  assert.equal(db.page("group").messages.length, 0);
  assert.equal(db.page("single").messages.length, 1);
});

test("invalid input is rejected before it reaches the file", async (t) => {
  const { db } = await open(t);
  assert.throws(() => db.savePage("", [message(1)]), /无效的会话/);
  assert.throws(
    () => db.savePage("group", [{ clientMsgID: "" }]),
    /无效的消息/,
  );
  assert.throws(() => db.page("group", undefined, 0), /无效的消息分页/);
  assert.throws(() => db.revoke("", {}), /无效的消息/);
  assert.throws(() => db.remove([]), /无效的消息选择/);
  assert.throws(() => db.revoke("m1", "nope"), /无效的撤回记录/);
});

test("an offline launch still knows which account the cookie belongs to", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acceptcat-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "identity.json");

  assert.equal(knownMember(file, service, "token_a_0123456789"), null);
  rememberIdentity(file, service, "token_a_0123456789", "member_A");

  // Same cookie: the transcript is readable with no network at all.
  assert.equal(knownMember(file, service, "token_a_0123456789"), "member_A");
  // A new login issues a new token, so it must not inherit the old account.
  assert.equal(knownMember(file, service, "token_b_0123456789"), null);
  // Another service is a different transcript even with the same token.
  assert.equal(
    knownMember(file, "https://other.example.org", "token_a_0123456789"),
    null,
  );

  const stored = await fs.readFile(file, "utf8");
  assert.ok(!stored.includes("token_a_0123456789"), "the cookie itself is never stored");

  await fs.writeFile(file, "not json");
  assert.equal(knownMember(file, service, "token_a_0123456789"), null);
});

test("every channel the preload calls has a main-process handler", async () => {
  const base = new URL("../", import.meta.url);
  const preload = await fs.readFile(
    new URL("electron/preload/index.ts", base),
    "utf8",
  );
  const main = await fs.readFile(
    new URL("electron/main/chatHistoryManage.ts", base),
    "utf8",
  );
  const called = [
    ...new Set(
      [...preload.matchAll(/"chat-history-([a-zA-Z]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  assert.deepEqual(called, [
    "close",
    "forget",
    "open",
    "page",
    "remove",
    "revoke",
    "savePage",
  ]);
  for (const channel of called)
    assert.ok(
      channel === "open" || channel === "close"
        ? main.includes(`"chat-history-${channel}"`)
        : main.includes(`"${channel}",`),
      `no handler for chat-history-${channel}`,
    );
});
