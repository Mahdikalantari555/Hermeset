# Cloudflare Workers Telegram Agent

Research date: 2026-09-22

## Executive recommendation

Build a custom Workers-first agent harness. Do not try to deploy the full OpenClaw, Hermes Agent, or NanoClaw runtime directly on Cloudflare Workers.

The practical architecture is:

1. Telegram sends updates to a Cloudflare Worker webhook.
2. The ingress Worker validates the webhook secret, deduplicates the update, stores a compact job record in D1, and enqueues work.
3. A Queue consumer Worker runs a bounded agent loop.
4. The agent calls your Kilo API or another OpenAI-compatible API for intelligence. Cloudflare Workers AI is not required.
5. The agent reads and writes durable memory in D1, or in a SQLite-backed Durable Object for per-chat serialization.
6. Fast tools run as allowlisted HTTP calls or Cloudflare bindings.
7. Heavy shell, browser, filesystem, or long-running tools can be delegated to GitHub Actions or another external sandbox.
8. The Worker sends the result back through the Telegram Bot API.

This gives you a lightweight, customizable agent that is deployable on Cloudflare while keeping the expensive intelligence in the external model provider you already plan to use.

## Why not run OpenClaw, Hermes, or NanoClaw directly?

| Runtime | Finding | Workers decision |
| --- | --- | --- |
| OpenClaw | Host-oriented TypeScript Gateway with process execution, SQLite, sandboxing, native components, and channel adapters. It expects a supported Node.js host. | Run on a VPS/container if you want the full runtime; use Workers only as an optional Telegram ingress or durability edge. |
| Hermes Agent | Python agent with CLI/TUI/gateway, messaging gateways, tools, skills, memory, scheduling, and dependencies such as Python, Node, ripgrep, ffmpeg, FastAPI/Uvicorn-related packages, and platform tooling. | Run on a conventional Python host, container, VPS, Modal/Daytona, or another supported backend. |
| NanoClaw | Lightweight compared with OpenClaw, but still requires Node 22+, pnpm, Docker, a host process, per-session SQLite, and agent-runner containers. | Use its host/inbox/runner/outbox pattern as a design blueprint, not as a Worker bundle. |

The important distinction is that a custom Workers harness can implement the useful protocol without inheriting the host-only runtime.

Primary sources:

- OpenClaw README and architecture: https://raw.githubusercontent.com/openclaw/openclaw/main/README.md and https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/architecture.md
- OpenClaw package/runtime metadata: https://raw.githubusercontent.com/openclaw/openclaw/main/package.json
- OpenClaw Telegram transport: https://raw.githubusercontent.com/openclaw/openclaw/main/docs/channels/telegram/transports.md
- Hermes README: https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md
- Hermes dependency metadata: https://raw.githubusercontent.com/NousResearch/hermes-agent/main/pyproject.toml
- NanoClaw README and architecture: https://raw.githubusercontent.com/nanocoai/nanoclaw/main/README.md and https://raw.githubusercontent.com/nanocoai/nanoclaw/main/docs/architecture.md

## Cloudflare free-plan limits that matter

These are the limits to design against for a personal free account:

| Service | Free limit relevant to this design | Use |
| --- | --- | --- |
| Workers | 100,000 requests/day; 10 ms CPU/request; 128 MB memory/isolate; 50 subrequests/request; 5 Cron triggers; 100 Workers/account | Telegram ingress, API orchestration, small agent steps |
| D1 | 5 GB total storage/account; 500 MB maximum/database; 5 million rows read/day; 100,000 rows written/day; 50 queries/invocation | Primary structured memory and job state |
| SQLite-backed Durable Objects | 5 GB total storage/account; 1 GB per-object practical free limit documented in Cloudflare's FAQ; strongly consistent per-object state | One object per Telegram chat when serialized turns are needed |
| Workers KV | 1 GB storage/account; 100,000 reads/day; 1,000 writes to different keys/day | Small configuration and low-write caches |
| R2 | 10 GB-month storage; 1 million Class A operations/month; 10 million Class B operations/month; free egress | Attachments, media, snapshots, exports |
| Queues | 10,000 standard operations/day; 24-hour retention; 128 KB/message | Reliable asynchronous admission and retries |
| Workflows | 100,000 requests/day shared with Workers; 3,000 steps/day; 1 GB-month storage; 10 ms CPU/invocation | Multi-step jobs, approvals, scheduled maintenance |
| Workers AI | Available, but not needed for this design | Optional embeddings or classification only if you later want edge inference |

Sources:

- Workers plans and pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- KV limits: https://developers.cloudflare.com/kv/platform/limits/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Workflows pricing: https://developers.cloudflare.com/workers/platform/pricing/#workflows

The 10 ms free CPU limit does not mean the whole agent turn must finish in 10 ms. Waiting for the external model API, Telegram, D1, or another network request is not CPU time. It does mean the JavaScript orchestration, JSON parsing, memory selection, tool dispatch, and response construction must remain very small. Keep each Queue consumer step lean and split expensive work into separate steps if CPU errors appear.

## Recommended architecture

### 1. Telegram ingress Worker

Route:

```text
POST /telegram/webhook
```

Responsibilities:

- Validate the Telegram webhook secret token.
- Parse the update and extract `update_id`, chat ID, message ID, sender, text, and media metadata.
- Reject unauthorized chats or maintain an explicit allowlist.
- Insert an idempotency record into D1 using the Telegram update ID or message ID.
- Enqueue a compact job containing the chat ID, update ID, and a reference to the stored update.
- Return HTTP 200 quickly.

Do not hold Telegram's webhook acknowledgement while the model is thinking. Telegram updates should be treated as at-least-once events, so deduplication is required.

Public Workers Telegram examples demonstrate the basic webhook pattern:

- https://raw.githubusercontent.com/cvzi/telegram-bot-cloudflare/main/README.md
- https://raw.githubusercontent.com/tbxark/ChatGPT-Telegram-Workers/master/README.md

The official Telegram Bot API pages were blocked by the research network policy, so exact current method limits were not independently fetched. The official documentation remains the authoritative reference: https://core.telegram.org/bots/api

### 2. Durable memory

Use D1 as the default memory store.

Suggested tables:

```text
chats
- id
- telegram_chat_id
- permissions
- created_at
- updated_at

messages
- id
- chat_id
- telegram_message_id
- role
- content
- created_at

memories
- id
- chat_id
- scope
- content
- importance
- created_at
- expires_at

tool_results
- id
- chat_id
- tool_name
- request_hash
- result
- created_at

agent_jobs
- id
- chat_id
- telegram_update_id
- status
- attempt_count
- created_at
- updated_at

idempotency
- key
- chat_id
- status
- created_at
```

Use compact recent messages plus selected long-term memories in each model request. Periodically summarize old conversation turns and store the summary as memory instead of sending an unlimited transcript.

Use a Durable Object per chat only if you need strict serialization of concurrent messages, pending tool calls, or per-chat coordination. D1 is simpler and is the better first implementation.

### 3. Agent-core Queue consumer

The Queue consumer should run a bounded loop:

1. Load the chat state and recent messages from D1.
2. Select relevant memories.
3. Call the external OpenAI-compatible model API.
4. Parse a structured response or tool call.
5. Validate the tool name against an allowlist.
6. Execute only approved tools.
7. Store the tool result and continue for a maximum number of steps.
8. Save the final answer and enqueue or perform Telegram delivery.

Recommended bounds for a first version:

- 1 to 3 tool-call iterations per user turn.
- 1 explicit tool allowlist.
- A maximum output token budget.
- A maximum wall-clock budget per job.
- Idempotency keys for every external side effect.
- Retry only transient failures; send permanent failures to a dead-letter path.

### 4. External OpenAI-compatible model provider

Configure the Worker with:

```text
OPENAI_BASE_URL=https://your-provider.example/v1
OPENAI_API_KEY=<Worker secret>
MODEL=<model name>
```

The exact base URL, authentication header, and tool-calling schema must follow the selected provider's current documentation. Implement the provider as an adapter so Kilo API can be replaced by another OpenAI-compatible provider without changing the agent core.

The adapter should support at least:

- Chat completion or responses-style generation.
- Structured JSON output.
- Tool/function calling when the provider supports it.
- A fallback parser for providers that do not support native tool calling.
- Streaming only if you need it; Telegram delivery can use an initial message followed by edits.

Cloudflare Workers AI is not part of the required design. The external provider supplies the model intelligence; Workers supplies ingress, orchestration, memory, and tools.

### 5. Tool boundary

Workers-native tools are appropriate:

- HTTP APIs.
- D1 queries.
- KV reads/writes.
- R2 object operations.
- Workers service bindings.
- Workers AI embeddings or classifiers, if added later.
- Telegram Bot API calls.

Do not expose arbitrary shell, filesystem, browser, or process execution to Telegram users. If those tools are required, put them behind a separate sandbox. GitHub Actions is a reasonable optional sandbox for delayed heavy work, but it is not the interactive agent core.

## GitHub repository as memory

A GitHub repository can store memory files, but it should not be the primary hot memory for this bot.

Problems with GitHub as the live store:

- Authenticated REST API usage is generally 5,000 requests/hour for personal access tokens or GitHub App installation tokens.
- `GITHUB_TOKEN` in Actions is limited to 1,000 requests/hour per repository.
- Updating a file requires reading its current SHA and then making a serial `PUT` that creates a commit.
- Concurrent updates can conflict.
- The Contents API fully supports files up to 1 MB; larger files require different handling, and files over 100 MB are unsupported through that endpoint.
- GitHub warns that Git is not designed as a backup tool and recommends keeping repositories ideally below 1 GB.

Use GitHub for:

- Periodic memory snapshots.
- Human-readable exports.
- Audit history.
- Backups of important memories.
- A source of configuration or tool definitions.

Use D1 or a SQLite-backed Durable Object for live state.

Sources:

- GitHub REST rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub repository contents API: https://docs.github.com/en/rest/repos/contents
- GitHub large-file guidance: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

## GitHub Actions: useful, but auxiliary

GitHub Actions can add value in four areas:

1. Heavy tools that do not fit Workers: shell commands, browser automation, package installation, long-running scripts, and large file processing.
2. Scheduled maintenance: memory summarization, stale-job cleanup, D1 exports, and periodic GitHub snapshots.
3. Human-approved operations: a Worker can create a pending approval record, and an Actions workflow can perform the privileged step after approval.
4. Development operations: tests, linting, deployments, and migration checks.

It should not be the main Telegram agent runtime because runner startup and queueing add latency, Actions is event/schedule oriented, and the free private-repository allowance is limited.

Relevant limits and behavior:

- Public repositories can use standard GitHub-hosted runners without consuming the private-repository minute allowance.
- GitHub Free private repositories include 2,000 Linux minutes/month, 500 MB artifact storage, and 10 GB cache per repository.
- `GITHUB_TOKEN` is limited to 1,000 requests/hour per repository.
- GitHub Actions schedules have a minimum interval of five minutes.
- Concurrency groups can serialize work per chat or per job; queued runs can otherwise be canceled by default.

Sources:

- GitHub Actions billing: https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- GitHub Actions usage limits: https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration
- Workflow triggers: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows
- Workflow syntax: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- Concurrency: https://docs.github.com/en/actions/using-jobs/using-concurrency

Recommended Actions boundary:

```text
Telegram Worker
  -> D1 job record
  -> GitHub repository dispatch
  -> Actions reads job by ID
  -> Actions runs allowlisted heavy tool
  -> Actions writes result to D1 or calls a signed callback
  -> Agent Worker delivers result to Telegram
```

Never pass a large or untrusted Telegram payload directly into a privileged workflow. Pass only a job ID and validated parameters. Use least-privilege tokens, pinned action versions, per-chat concurrency, and idempotency.

## Telegram access from your connection

Your local connection needing a VPN to reach Telegram does not prevent this design. Telegram connects to the public Cloudflare Worker webhook, and the Worker connects to the Telegram Bot API from Cloudflare's network. Your phone or computer only needs to reach Telegram normally; it does not need to reach the agent host directly.

The Worker still needs:

- A Telegram Bot token stored as a Cloudflare Worker secret.
- A webhook secret token.
- A provider API key stored as a Worker secret.
- An optional GitHub token stored as a Worker secret if Actions dispatch is used.

## Implementation plan

### Phase 1: minimal working bot

- One Worker with `/telegram/webhook` and `/registerWebhook` routes.
- D1 schema for chats, messages, jobs, and idempotency.
- External OpenAI-compatible provider adapter.
- Text-only Telegram send/reply.
- One bounded model call with no tools.

### Phase 2: memory and reliability

- Queue consumer Worker.
- Recent-message window plus durable memories.
- Periodic summarization.
- Update deduplication and job retries.
- Allowlisted HTTP tools.
- Delivery state and dead-letter handling.

### Phase 3: heavy tools and GitHub Actions

- Repository dispatch integration.
- Actions workflow that reads a job ID from D1.
- Per-chat concurrency and idempotency.
- Optional browser/shell/code tools in the external runner.
- Signed callback or D1 result polling.

### Phase 4: operational hardening

- Chat allowlist and admin commands.
- Token rotation.
- Usage metrics and error alerts.
- Memory retention and export jobs.
- Load testing against Workers free limits.

## Final decision

The best fit for your requirements is a custom lightweight harness, not a direct deployment of OpenClaw, Hermes, or NanoClaw.

Use Cloudflare Workers for the Telegram-facing edge and durable orchestration, D1 for live memory, an external OpenAI-compatible API such as Kilo API for model intelligence, and GitHub Actions only for delayed heavy tools or maintenance. This architecture is deployable on Cloudflare, works even when your own connection cannot reach Telegram directly, and leaves room to replace the model provider or add stronger tools later.
