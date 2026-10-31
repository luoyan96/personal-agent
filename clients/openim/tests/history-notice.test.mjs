import assert from "node:assert/strict";
import test from "node:test";

import { historyNotice } from "../src/pages/chat/queryChat/history-notice.ts";

// A transcript that has not loaded yet is not an outage. Saying it is sends
// people looking for a network problem that does not exist, which is exactly
// what the first local-first build did on every fresh conversation.

test("an online machine never claims to be offline", () => {
  for (const source of ["connecting", "offline", "cache", ""])
    assert.doesNotMatch(historyNotice(source, true), /无法联网/);
});

test("offline is only said when the machine is really offline", () => {
  assert.equal(
    historyNotice("offline", false),
    "当前无法联网，这段会话本机还没有缓存。",
  );
  // Same state, but the machine is online: it is a connection problem, not an
  // outage, and it must not be reported as one.
  assert.equal(historyNotice("offline", true), "正在连接服务器…");
});

test("only a cache hit is described as a cache", () => {
  assert.match(historyNotice("cache", true), /本机缓存/);
  assert.match(historyNotice("cache", false), /本机缓存/);
});

test("nothing is claimed while a page is loading normally", () => {
  assert.equal(historyNotice("", true), "");
  assert.equal(historyNotice("", false), "");
});
