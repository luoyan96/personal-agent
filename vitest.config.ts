import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.spec.ts", "apps/*/tests/**/*.spec.ts", "integrations/deepseek-harness/runtime/tests/**/*.spec.ts"],
    // Several suites launch HTTP processes and durable SQLite databases. Bound
    // file concurrency so those checks do not compete with every CPU at once.
    maxWorkers: 2,
  },
});
