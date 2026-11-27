import assert from "node:assert/strict";
import test from "node:test";

import { historyNotice } from "../src/pages/chat/queryChat/history-notice.ts";

// A transcript that has not loaded yet is not an outage. Saying it is sends
// people looking for a network problem that does not exist, which is exactly
// what the first local-first build did on every fresh conversation.

test("an online machine never claims to be offline", () => {
  for (const source of ["offline", "cache", "sync-failed", ""])
    assert.doesNotMatch(historyNotice(source, true), /无法联网/);
});

test("offline is only said when the machine is really offline", () => {
  assert.equal(
    historyNotice("offline", false),
    "当前无法联网，这段会话本机还没有缓存。",
  );
  assert.equal(historyNotice("offline", true), "");
});

test("normal local reads stay silent; only actual offline state gets an offline notice", () => {
  assert.equal(historyNotice("cache", true), "");
  assert.equal(historyNotice("cache", false), "当前离线，已保存的聊天记录可继续阅读。");
});

test("a failed latest-page verification reports failed synchronization without inventing an outage", () => {
  assert.equal(historyNotice("sync-failed", true), "最新消息暂未同步，已保存的聊天记录可继续阅读。");
  assert.equal(historyNotice("sync-failed", false), "当前离线，已保存的聊天记录可继续阅读。");
});

test("nothing is claimed while a page is loading normally", () => {
  assert.equal(historyNotice("", true), "");
  assert.equal(historyNotice("", false), "");
});
