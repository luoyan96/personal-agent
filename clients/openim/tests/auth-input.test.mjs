import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountPassword, AccountUsername } from "@research-agent-platform/contracts";
import { normalizeAuthBody, serviceErrorMessage, validationMessage } from "../src/research/api-errors.ts";

test("auth normalization trims account and invitation only, preserving exact password and invisible invalid characters", () => {
  const body = { username: " luoyan ", inviteCode: " RAP-synthetic ", password: " abcdef " };
  assert.deepEqual(normalizeAuthBody(body), { username: "luoyan", inviteCode: "RAP-synthetic", password: " abcdef " });
  assert.equal(body.username, " luoyan ");
  assert.equal(AccountUsername.safeParse("luo\u200byan").success, false);
});
test("the installed shared contract accepts simple eight-character and long passwords without changing spaces", () => {
  assert.equal(AccountPassword.safeParse("abcdefgh").success, true);
  assert.equal(AccountPassword.safeParse("abcdefg").success, false);
  assert.equal(AccountPassword.parse(" abcdef "), " abcdef ");
  assert.equal(AccountPassword.safeParse("a".repeat(300)).success, true);
});
test("field and service guidance is Chinese and does not expose internal codes or issue JSON", () => {
  assert.match(validationMessage([{ path: ["username"], code: "invalid_format" }]), /字母、数字、下划线和连字符/);
  assert.equal(validationMessage([{ path: ["password"] }]), "密码至少 8 个字符。");
  assert.match(serviceErrorMessage("UNAUTHENTICATED", 401, "login"), /用户名或密码不正确/);
  assert.doesNotMatch(serviceErrorMessage("SECRET_INTERNAL_CODE", 500), /SECRET|\[|\{/);
});
