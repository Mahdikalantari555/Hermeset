# hermeset implementation plan

## Goal

Build `hermeset` as a deployable Cloudflare Agents + Think assistant for one Telegram user, with direct-message-only text interaction, a provider-agnostic OpenAI-compatible model adapter, durable conversation memory, Markdown workspace writing, secret-based configuration, and an actual Telegram end-to-end test as the final acceptance gate.

This is a greenfield implementation. The existing `Research/` artifacts are reference material and should remain untouched.

## Fixed decisions

- Project name: `hermeset`.
- Runtime: Cloudflare Workers through the `agents` runtime package and `@cloudflare/think`.
- Harness: Think, using its native Telegram messenger adapter.
- Provider: provider-agnostic OpenAI-compatible API via `@ai-sdk/openai`; no Workers AI binding is required.
- Telegram scope: direct messages only, one allowed user, no groups, mentions, channels, or actions.
- First functional phase: text-only interaction.
- File scope: no file delivery. Markdown writing in the Think workspace is in scope and should be restricted to `.md` files.
- Execution safety: no arbitrary shell, browser, PDF/DOCX, large-file processing, reminders, external runner, R2, or GitHub integration in the first implementation.
- Deployment is the priority. Local development is supported, but the implementation is not considered complete until it is deployed and tested through Telegram.
- Secrets must come from environment configuration and Wrangler secrets, never source code.

## Architecture

```text
Telegram DM
  -> secret-validated webhook
  -> Think Telegram messenger
  -> HermesetAgent
  -> provider-agnostic OpenAI-compatible model
  -> durable Think session / SQLite memory
  -> Telegram reply
  -> Telegram response
```

The Worker owns ingress, durable state, model orchestration, Markdown workspace policy, and Telegram delivery. The external model provider owns intelligence only.

## Package and runtime choices

Pin the implementation to known-compatible versions while keeping the provider and messenger boundaries replaceable:

- `agents`: `0.24.0`
- `@cloudflare/think`: `0.19.0`
- `ai`: `7.0.109`
- `@ai-sdk/openai`: `4.0.72`
- `@chat-adapter/telegram`: `4.41.0`
- `zod`: `4.6.5`
- `wrangler`: `4.136.2`
- `typescript`: `7.0.2`
- `vitest`: `5.0.1`
- `tsx`: current compatible release for the webhook-registration script
- `@cloudflare/workers-types`: current compatible release

Use the `agents` package, not the older `@cloudflare/agents` package, because the current Think package documents and depends on `agents >=0.24.0`.

Think's documentation recommends Node 24+. The current local runtime is Node 22.23.2, so the implementation plan should treat Node 24 as the preferred local/CI runtime. If Node 22 cannot run the toolchain, upgrade locally before implementation rather than weakening the runtime choice.

## Configuration contract

### Worker environment

Use `src/env.d.ts` to define the Worker environment:

- `TELEGRAM_BOT_TOKEN`: secret
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`: secret
- `OPENAI_COMPATIBLE_API_KEY`: secret
- `TELEGRAM_BOT_USERNAME`: non-secret var
- `TELEGRAM_ALLOWED_USER_ID`: non-secret var, numeric Telegram user ID
- `OPENAI_COMPATIBLE_BASE_URL`: non-secret var, OpenAI-compatible base URL
- `OPENAI_COMPATIBLE_MODEL`: non-secret var, for example `gpt-5.5` or equivalent
- `APP_NAME`: non-secret var, default `hermeset`

Do not commit real credentials. Add `.env.example` with placeholders and document the exact `wrangler secret put` commands.

### Wrangler configuration

Create `wrangler.jsonc` with:

- `name: "hermeset"`
- `main: "src/server.ts"`
- `compatibility_date: "2026-06-11"` or newer
- `compatibility_flags: ["nodejs_compat"]`
- Durable Object binding for `HermesetAgent`
- SQLite migration using `new_sqlite_classes: ["HermesetAgent"]`
- No `ai` binding, because the model adapter is external
- No R2, browser, worker loader, or sandbox bindings in phase 1

## Source layout

Create the application under the project root:

- `src/env.d.ts`
- `src/config.ts`
- `src/provider.ts`
- `src/telegram.ts`
- `src/markdown.ts`
- `src/agent.ts`
- `src/server.ts`
- `test/provider.test.ts`
- `test/telegram.test.ts`
- `test/markdown.test.ts`
- `test/agent.test.ts`
- `scripts/register-telegram-webhook.ts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `wrangler.jsonc`
- `.env.example`
- `README.md`

Keep the existing `Research/` directory unchanged.

## Module responsibilities

### `src/config.ts`

- Parse and validate non-secret configuration.
- Normalize the Telegram bot username, allowed user ID, model name, and provider base URL.
- Keep validation small and boundary-focused.
- Export pure helpers so tests do not need Workers or Telegram.

### `src/provider.ts`

- Build the provider-agnostic model adapter.
- Use `createOpenAI({ apiKey, baseURL })(model)` from `@ai-sdk/openai`.
- Return an AI SDK `LanguageModel`.
- Keep all provider selection in environment configuration.
- Do not hard-code Kilo, OpenAI, or any other provider URL.
- Export a pure configuration resolver for tests.

`HermesetAgent.getModel()` will return the `LanguageModel` from this module.

### `src/telegram.ts`

- Build the Telegram messenger options for `telegramMessenger(...)`.
- Use `respondTo: ["direct-message"]
- Set `conversation: "self"` so the single-user DM uses one durable conversation.
- Use `secretToken` for webhook verification.
- Add a custom `verifyWebhook` wrapper that:
  - preserves Think's secret-token verification, and
  - clones the request before parsing JSON so the original body remains available to Think, and
  - rejects updates whose `message.from.id` does not equal `TELEGRAM_ALLOWED_USER_ID`.
- Keep the wrapper pure/testable by separating update authorization from request handling.
- Set a safe generic delivery error message so internal exceptions are not leaked into Telegram.

This is the main single-user enforcement point. The bot token, webhook secret, DM-only routing, and numeric user allowlist together define the access boundary.

### `src/markdown.ts`

- Define the Markdown-only workspace policy.
- Export a pure `isMarkdownPath(path)` helper.
- Enforce `.md` files for read/write/edit/delete operations.
- Allow directory listing only when needed for navigation.
- Do not allow arbitrary file creation or deletion outside Markdown paths.
- Keep the policy independent from Think so it can be unit-tested.

### `src/agent.ts`

Define `HermesetAgent extends Think<Env>` with:

- `getModel()` returning the provider adapter model.
- `getMessengers()` returning the Telegram messenger definition.
- `configureContext()` with:
  - a read-only `soul` block describing the assistant's personality and operating constraints;
  - a writable `memory` block for durable user facts and conversation summaries.
- `workspaceBash = false`.
- `beforeTurn()` to:
  - hide reasoning from the Telegram surface if desired;
  - limit active tools to the safe Markdown workspace tool set;
  - keep tool-call iterations bounded.
- `beforeToolCall()` to enforce the Markdown-only path policy before any workspace mutation.
- `authorizeTurn()` returning the minimal grant needed for the current phase; no actions are enabled in phase 1.
- Optional health callable if the Agents decorator compiles cleanly, but the HTTP health route is the required health surface.

The Agent should be single-user by construction: one Telegram bot, one allowed user ID, DM-only ingress, and one root conversation.

### `src/server.ts`

Export:

- `HermesetAgent`
- `ThinkMessengerStateAgent`

Implement the default Worker fetch handler:

- `GET /healthz` returns JSON with service status and configuration presence, without exposing secrets.
- `GET /healthz/model` performs one minimal provider smoke call and returns model response metadata.
- All other requests delegate to `routeAgentRequest(request, env)`.
- Return 404 for unmatched routes.

The health route gives a deploy-time check before Telegram is registered. The model probe gives a provider check without needing a Telegram message.

### `scripts/register-telegram-webhook.ts`

Create a small deployment helper that:

- reads `TELEGRAM_BOT_TOKEN`, `DEPLOYMENT_URL`, and `TELEGRAM_WEBHOOK_SECRET_TOKEN` from the environment;
- calls Telegram `setWebhook` with the deployed URL and secret token;
- optionally calls `getWebhookInfo` to verify registration;
- fails clearly if required environment variables are missing.

Add npm scripts for:

- `dev`
- `deploy`
- `typecheck`
- `test`
- `telegram:register`
- optional `telegram:unregister`

## Task graph

### Ticket 1 — Project scaffold and deployment skeleton

Blocks: all other tickets.

Deliver:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `wrangler.jsonc`
- `.env.example`
- basic npm scripts
- source/test directories

Acceptance:

- dependencies install cleanly;
- TypeScript config is valid;
- Wrangler config is valid;
- no secrets are committed.

### Ticket 2 — Provider adapter

Blocks: Ticket 3.

Deliver:

- `src/config.ts`
- `src/provider.ts`
- `test/provider.test.ts`

Acceptance:

- OpenAI-compatible base URL, API key, and model are configurable;
- missing required configuration fails clearly;
- no provider URL is hard-coded;
- unit tests cover configuration normalization and validation.

### Ticket 3 — Think Agent core

Blocks: Ticket 4 and Ticket 5.

Deliver:

- `src/agent.ts`
- `src/markdown.ts`
- `test/markdown.test.ts`
- `test/agent.test.ts`

Acceptance:

- `HermesetAgent.getModel()` returns the provider adapter model;
- durable context blocks are configured;
- workspace Bash is disabled;
- Markdown-only tool policy is enforced;
- tool iterations are bounded;
- no arbitrary shell or file-delivery tools are exposed.

### Ticket 4 — Telegram DM ingress and single-user guard

Blocks: Ticket 5 and Ticket 6.

Deliver:

- `src/telegram.ts`
- `test/telegram.test.ts`

Acceptance:

- Telegram messenger uses secret-token verification;
- only direct messages are accepted;
- only `TELEGRAM_ALLOWED_USER_ID` is accepted;
- unauthorized updates are rejected before model execution;
- messenger configuration is testable without a live bot.

### Ticket 5 — Worker entrypoint and health surfaces

Blocks: Ticket 6.

Deliver:

- `src/server.ts`
- `scripts/register-telegram-webhook.ts`
- `README.md`

Acceptance:

- `/healthz` responds after deployment;
- `/healthz/model` performs one provider smoke call;
- Telegram webhook registration script works with a deployed HTTPS URL;
- README documents setup, secrets, deployment, webhook registration, and Telegram verification.

### Ticket 6 — End-to-end Telegram verification

Blocks: completion.

Deliver:

- deployed Worker;
- registered Telegram webhook;
- executed Telegram test checklist;
- recorded result in the PR or session notes.

Acceptance:

- allowed Telegram user receives a reply;
- a second message demonstrates durable conversation memory across restart/deployment;
- unauthorized Telegram user;
- Worker is deployed;
- health endpoint responds;
- provider smoke call succeeds;
- Telegram DM from the allowed user receives a reply;
- a second DM demonstrates durable conversation memory after restart or redeploy;
- unauthorized user receives no assistant response;
- Markdown-only workspace behavior is exercised if the model attempts file work;
- no secrets appear in logs, responses, or source.

## Verification plan

### Local verification

Run, in order:

1. `npm install`
2. `npm run typecheck`
3. `npm test`
4. `npm run dev`
5. `curl https://localhost.../healthz` or the Wrangler-assigned local URL
6. `curl https://localhost.../healthz/model` with provider configuration present

Do not claim local success if the Node version is below the Think-recommended runtime and the toolchain refuses to run.

### Deployment verification

1. Create the Cloudflare Worker through Wrangler.
2. Set secrets with `wrangler secret put`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET_TOKEN`
   - `OPENAI_COMPATIBLE_API_KEY`
3. Set non-secret vars:
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_ALLOWED_USER_ID`
   - `OPENAI_COMPATIBLE_BASE_URL`
   - `OPENAI_COMPATIBLE_MODEL`
   - `APP_NAME`
4. Run `npm run deploy`.
5. Run `npm run telegram:register` with `DEPLOYMENT_URL` set to the deployed Worker URL.
6. Confirm webhook registration with Telegram `getWebhookInfo`.
7. Send a DM from the allowed user.
8. Send a second DM that refers to the first message.
9. Redeploy or restart the Worker and send a third DM that refers to the earlier conversation.
10. Send a DM from a different Telegram user and confirm there is no assistant response.
11. Ask the assistant to create or edit a Markdown note and confirm only `.md` paths are allowed.
12. Confirm no file delivery, shell, browser, reminders, or non-Markdown file operations are available.

### Test matrix

- Provider config: valid config, missing API key, missing model, custom base URL.
- Markdown policy: `.md` allowed, other extensions blocked, directory traversal blocked.
- Telegram guard: allowed DM accepted, non-DM rejected, wrong user rejected, malformed update rejected.
- Agent config: model resolver wired, Bash disabled, context blocks present, tool bounds present.
- Health route: returns safe JSON, does not expose secrets.
- Deployment: Wrangler config validates, Worker deploys, webhook registers.
- Telegram E2E: allowed user gets reply, memory persists across restart, unauthorized user gets no reply.

## Acceptance criteria

The implementation is complete only when all of the following are true:

1. The Worker deploys successfully.
2. `/healthz` responds.
3. `/healthz/model` performs one external model call successfully.
4. Telegram webhook registration succeeds with a secret token.
5. A DM from the allowed user receives a reply.
6. A second DM demonstrates durable conversation memory.
7. A redeploy or restart does not erase the conversation.
8. A DM from any other user is rejected before model execution.
9. Markdown writing is limited to `.md` files.
10. No arbitrary shell, file delivery, browser, PDF/DOCX, reminder, or external-runner capability is present in phase 1.
11. Secrets are configured through environment variables and Wrangler secrets only.

## Out of scope for phase 1

- Group chats, mentions, channels, and button actions.
- Multi-user tenancy.
- File delivery through Telegram.
- R2 storage.
- PDF/DOCX generation.
- Browser automation.
- Arbitrary shell execution.
- Reminders and schedules.
- MCP, sub-agents, Workflows, or external runners.
- GitHub snapshots or audit exports.
- Advanced analytics, token rotation automation, or production SLO dashboards.

## Risks and mitigations

- Think is experimental: pin package versions and keep provider/messenger boundaries isolated.
- Telegram webhook authorization must not consume the request body: clone the request before parsing the update.
- Provider APIs differ: keep the adapter thin and configurable through base URL, API key, and model name.
- Node 22 may be below Think's recommended runtime: use Node 24+ for local verification if needed.
- Telegram rate limits and webhook retries can duplicate work: rely on Think's durable messenger fibers and idempotent delivery path.
- Markdown policy must be enforced before tool execution, not only by prompt instructions.

## Implementation workflow after this plan

1. Create a dedicated implementation branch.
2. Create the spec issue and tickets matching the task graph above.
3. Open a draft PR that closes the spec and tickets.
4. Implement independent tickets in parallel where dependencies allow.
5. Merge completed ticket work back to the PR branch.
6. Run typecheck, unit tests, deployment checks, and the Telegram E2E checklist.
7. Run code review on the PR branch.
8. Fix review findings in one follow-up change.
9. Mark the PR ready for review.
10. Clean up any temporary worktrees.

## Final note

This plan intentionally stops at the first deployable Telegram text assistant. The next iteration can add reminders, richer tools, file delivery, or heavy execution only after the Telegram path, durable memory, provider adapter, and single-user boundary are proven.

