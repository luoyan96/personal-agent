import { test } from "node:test";
import assert from "node:assert/strict";
import { validateResearchServiceUrl } from "../electron/utils/researchService.ts";
test("accepts explicit HTTPS and local development endpoints", () => {
  for (const value of [
    "https://lab.example.org",
    "http://127.0.0.1:4317",
    "http://localhost:4317",
    "http://[::1]:4317",
  ])
    assert.ok(validateResearchServiceUrl(value));
  assert.equal(
    validateResearchServiceUrl(" https://lab.example.org "),
    "https://lab.example.org/",
  );
});
test("rejects remote HTTP, credentials, query fragments and non-web protocols", () => {
  for (const value of [
    "",
    null,
    "http://lab.example.org",
    "https://user:secret@lab.example.org",
    "https://lab.example.org/?key=secret",
    "https://lab.example.org/#token",
    "file:///C:/",
    "javascript:alert(1)",
    "not-a-url",
  ])
    assert.throws(() => validateResearchServiceUrl(value));
});
