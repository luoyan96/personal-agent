import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    await fs.readFile(
      new URL(
        "../src/pages/chat/ConversationSider/useConversationWidth.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { module, exports: module.exports, require: () => ({}), Number, Math, Infinity },
);
const { clampConversationWidth: clamp, DEFAULT_CONVERSATION_WIDTH: initial } =
  module.exports;

test("invalid saved widths recover to the default", () => {
  assert.equal(clamp(NaN), initial);
  assert.equal(clamp(Infinity), initial);
  assert.equal(clamp(-Infinity), initial);
});
test("dragging clamps both ends and rounds fractional pixels", () => {
  assert.equal(clamp(-500), 220);
  assert.equal(clamp(9000), 480);
  assert.equal(clamp(321.4), 321);
});
test("narrow desktop reserves space for the conversation body", () => {
  assert.equal(clamp(480, 760), 400);
  assert.equal(clamp(480, 650), 290);
  assert.equal(clamp(480, 580), 220);
});
test("resizing back to a wide desktop restores the preferred width", () => {
  const preferred = 420;
  assert.equal(clamp(preferred, 650), 290);
  assert.equal(clamp(preferred, 1200), preferred);
});
