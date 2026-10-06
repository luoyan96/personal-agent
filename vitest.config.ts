import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.spec.ts", "apps/*/tests/**/*.spec.ts", "integrations/deepseek-harness/runtime/tests/**/*.spec.ts"],
    // Several suites launch HTTP processes and durable SQLite databases. Bound
    // file concurrency so those checks do not compete with every CPU at once.
    // Hosted Windows runners also start bounded PDF child processes. Run files
    // serially there so concurrent hashing/database work cannot consume their
    // parsing deadline; retain the actual production parser time limit.
    maxWorkers: process.env.CI && process.platform === 'win32' ? 1 : 2,
  },
});
