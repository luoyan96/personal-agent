FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY integrations/deepseek-harness/runtime ./integrations/deepseek-harness/runtime
COPY agents ./agents
COPY scripts ./scripts
COPY deploy/openim ./deploy/openim
ENV pnpm_config_verify_deps_before_run=false
RUN pnpm install --frozen-lockfile \
    && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/contracts build \
    && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/research-core build \
    && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/harness-runtime build \
    && pnpm --config.verify-deps-before-run=false --filter @research-agent-platform/api build
CMD ["node", "deploy/openim/run-test.mjs", "api"]
