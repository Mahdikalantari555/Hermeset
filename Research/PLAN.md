# Plan: Cloudflare Agents 2026 for a Telegram-First Personal AI Assistant

Research date: 2026-09-22
Target: single-user personal assistant with durable memory, personality, tools, reminders, file generation, and Telegram as the primary interface.

## 1. Executive Decision

**Build on Cloudflare Agents 2026 with Think (`@cloudflare/think`) as the primary harness.** This is the recommended path over both the earlier Workers-only custom harness and a self-hosted OpenClaw/Hermes/NanoClaw runtime.

Cloudflare Agents gives you the durable identity, embedded SQLite state, callable methods, schedules, fibers, Workflows, and messenger integrations that the Workers-only baseline lacked. Think adds the agentic loop, persistent conversation history, memory compaction, sub-agent RPC, approvals, and a native Telegram messenger adapter on top of the Agents SDK.

**Do not try to deploy OpenClaw, Hermes Agent, or NanoClaw directly on Cloudflare.** They are host-oriented runtimes requiring Node/Python, local filesystems, process execution, and native toolchains. Cloudflare Agents replaces their orchestration and persistence layer, not their arbitrary local execution environment.

**Model intelligence comes from Kilo API or another OpenAI-compatible provider.** Cloudflare supplies ingress, memory, orchestration, and tool boundaries. Workers AI models are not required and should not be used for the primary agent loop.

## 2. Target Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Telegram                                 │
│                    (DM, groups, mentions)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ webhook (secret-validated)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Agents + Think Harness                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Telegram    │  │ Agent Loop   │  │ Session / Memory API    │ │
│  │ Messenger   │  │ (Think)      │  │ (Durable Object SQLite) │ │
│  └─────────────┘  └──────┬───────┘  └───────────┬─────────────┘ │
│                          │                      │               │
│                 ┌────────▼────────┐    ┌────────▼────────┐     │
│                 │ Durable Fibers  │    │ Schedules /     │     │
│                 │ (recovery)      │    │ Queues /        │     │
│                 └─────────────────┘    │ Workflows       │     │
│                                        └─────────────────┘     │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┬──────────────────┐
              ▼              ▼              ▼                  ▼
     ┌────────────────┐ ┌───────────┐ ┌────────────┐   ┌──────────────┐
     │ Kilo API /     │ │ R2        │ │ GitHub     │   │ External     │
     │ OpenAI-Compat  │ │ (files)   │ │ (exports)  │   │ Tool Runner  │
     └────────────────┘ └───────────┘ └────────────┘   │ (optional)   │
                                                        └──────────────┘
```

### Core principle

Cloudflare Agents owns:

- Telegram ingress and delivery
- Durable conversation state
- Long-term memory
- Personality and user profile
- Scheduling and reminders
- Multi-step orchestration
- Tool policy and allowlisting
- Recovery and idempotency

The external provider owns:

- Model intelligence (Kilo API or other OpenAI-compatible endpoint)

The external runner (optional) owns:

- Arbitrary shell, browser, filesystem, PDF/DOCX, and large-file toolchains

## 3. Why Cloudflare Agents 2026 Over the Workers-Only Baseline

| Capability | Workers-only baseline | Cloudflare Agents 2026 |
| --- | --- | --- |
| Durable identity | Manual D1/Durable Object plumbing | Built into every Agent instance |
| Per-chat state | Custom schema | Embedded SQLite per Agent |
| Agentic loop | Hand-written | Think provides it |
| Conversation memory | Custom tables | Think Sessions with compaction and FTS5 |
| Recovery | Manual retry logic | Durable fibers with checkpointing |
| Scheduling | Cron triggers | Per-Agent delayed, cron, and interval schedules |
| Multi-step jobs | Queues/Workflows only | Fibers + Workflows + external events |
| Telegram | Custom webhook handler | Native Think messenger adapter |
| Sub-agents | Not available | First-class RPC |
| MCP | External integration | Native support |

The Agents SDK is materially stronger than the earlier Workers-only orchestration baseline. For a single-user assistant that must feel persistent over months, the built-in durability model is worth adopting.

## 4. Recommended Component Plan

### 4.1 Harness: Think (`@cloudflare/think`)

Use Think as the default harness. It provides:

- Agentic tool loop with bounded iterations
- Persistent messages and non-destructive compaction
- Context blocks for personality, instructions, and retrieved memories
- Full-text search over session history
- Sub-agent RPC for delegated tasks
- Programmatic submissions for scheduled and background jobs
- Approval gates for sensitive actions
- Recovery after interruption

**Decision:** Start with Think. Only write a custom Agent ingress if you need routing, admin controls, or provider-specific behavior that Think does not expose.

### 4.2 Telegram messenger

Use Think's native Telegram messenger adapter for the first implementation.

It supports:

- Webhook secret validation
- Direct-message and mention routing
- Per-thread conversation isolation
- Durable reply fibers
- Streamed delivery
- Recovery after restart

**Configuration decisions:**

- One Agent instance per Telegram chat/thread for memory isolation and serialization.
- Use `SessionManager` only if a single Agent must manage multiple named conversations.
- Actions and subscribed-thread messages require explicit opt-in.
- Keep the built-in workspace Bash disabled by default, or tightly approval-gated.

### 4.3 Memory: Durable Object SQLite / Think Sessions

Use the Session API as the hot store for:

- Conversation history
- Personality and system instructions
- User preferences
- Episodic notes
- Tool results
- Pending approvals
- Reminder state

Think Sessions use Durable Object SQLite by default and support:

- Tree-structured messages
- Context blocks
- FTS5 full-text search
- LLM-writable memory
- R2 skill providers
- Optional external Postgres providers

**Memory strategy:**

1. Keep recent turns in the active session.
2. Periodically compact old conversation into summaries.
3. Extract durable facts into structured memory blocks.
4. Retrieve relevant memories with FTS5 plus importance scoring.
5. Keep the model prompt bounded: recent turns + selected memories + personality.

### 4.4 Model provider: Kilo API / OpenAI-compatible

Configure the provider as an adapter so it can be swapped without changing the agent core.

Required adapter surface:

- Chat completions or responses-style generation
- Structured JSON output
- Tool/function calling when supported
- Fallback parser for providers without native tool calling
- Optional streaming

**Do not use Workers AI for the primary agent loop.** The external provider supplies intelligence; Cloudflare supplies the durable runtime.

### 4.5 Tools and execution boundaries

**Workers/Agents-native tools (free-tier viable):**

- HTTP APIs
- D1 queries
- KV reads/writes
- R2 object operations
- Workers service bindings
- Telegram Bot API calls
- Think workspace read/write/edit/list/find/grep/delete

**Delegated tools (external runner or paid Cloudflare Sandbox):**

- Arbitrary shell commands
- Browser automation
- Package installation
- PDF/DOCX generation
- Large-file processing
- Long-lived local processes

**Decision:** Keep the first version to a curated, allowlisted tool set. Add an external runner only when a specific heavy tool is needed.

### 4.6 Background work

Use the right primitive for each job type:

| Job type | Primitive |
| --- | --- |
| Simple FIFO background work | Built-in Agent queue |
| Delayed or recurring tasks | Agent schedules |
| Multi-step with retries/sleep/approval | Workflows |
| Long-running checkpointed computation | Durable fibers |
| Heavy shell/browser/filesystem | External runner or paid Sandbox |

The built-in Agent queue is FIFO, sequential, persistent, and retryable, but it is not a globally managed consumer. Do not assume it scales like a separate queue service.

### 4.7 File generation

**Free-tier viable:**

- Markdown
- Code files
- CSV
- Small JSON/text artifacts
- Small images or documents that fit the Worker-safe pipeline

Store generated artifacts in:

- The Agent workspace for small, transient files
- R2 for durable artifacts and large objects

**Requires external runner or paid Cloudflare Sandbox:**

- PDF generation with typical document libraries
- DOCX generation
- Large artifact processing
- Browser-rendered output

Telegram delivery of generated files is architecturally straightforward through Bot API document/photo/message methods. Exact current file-size and method limits should be verified against the official Telegram Bot API documentation at implementation time.

### 4.8 GitHub integration

Use GitHub only for:

- Periodic memory snapshots
- Human-readable exports
- Audit history
- Backups of important memories
- Configuration or tool definitions

Do not use a GitHub repository as the live memory database. Git is not designed as a hot store:

- Contents API is limited to 1 MB per file through the standard endpoint.
- Updates require reading the current SHA and issuing a serial commit.
- Concurrent updates conflict.
- Rate limits apply (5,000 requests/hour for personal access tokens; 1,000/hour for `GITHUB_TOKEN` in Actions).

### 4.9 GitHub Actions as an auxiliary executor

Use Actions for:

- Heavy tools that do not fit Workers
- Scheduled maintenance (summarization, cleanup, exports)
- Human-approved privileged operations
- Development operations (tests, linting, deployments)

Do not use Actions as the interactive agent core. Runner startup and queueing add latency, and Actions is event/schedule oriented.

**Boundary pattern:**

```text
Telegram Worker
  -> Durable job record
  -> repository dispatch with job ID
  -> Actions reads job from durable store
  -> Actions runs allowlisted heavy tool
  -> Actions writes result back
  -> Agent delivers result to Telegram
```

Pass only a job ID and validated parameters. Never pass a large or untrusted Telegram payload directly into a privileged workflow.

## 5. Phased Implementation Plan

### Phase 0 — Foundation (Week 1)

- Create Cloudflare Agents project.
- Pin `@cloudflare/agents` and `@cloudflare/think` versions.
- Configure Kilo API or chosen OpenAI-compatible provider as an adapter.
- Set up Worker secrets for bot token, webhook secret, and provider API key.
- Deploy a minimal Agent with a health-check method.

**Exit criteria:** Agent deploys, receives an HTTP call, and calls the external model provider.

### Phase 1 — Telegram text loop (Week 1-2)

- Enable Think's Telegram messenger adapter.
- Register the webhook with a secret token.
- Implement DM and mention routing.
- Store conversation state in Think Sessions.
- Send text replies with durable delivery state.
- Add idempotency for Telegram update IDs.

**Exit criteria:** You can chat with the agent from Telegram and it remembers the conversation across restarts.

### Phase 2 — Memory and personality (Week 2-3)

- Add personality and system-instruction context blocks.
- Implement memory extraction from conversations.
- Add FTS5 retrieval of relevant memories.
- Implement non-destructive compaction of old turns.
- Add user preference storage.
- Add explicit memory edit/delete commands.

**Exit criteria:** The agent maintains a consistent personality and recalls user preferences over multiple sessions.

### Phase 3 — Tools and reminders (Week 3-4)

- Add an allowlisted set of HTTP tools.
- Add Think workspace read/write/edit/list/find/grep/delete.
- Implement Agent schedules for reminders and recurring tasks.
- Add approval gates for sensitive actions.
- Add bounded tool-call iterations per turn.

**Exit criteria:** The agent can use tools, set reminders, and ask for approval before sensitive operations.

### Phase 4 — Files and heavy tools (Week 4-6)

- Add R2 binding for generated artifacts.
- Implement Markdown, CSV, code, and small JSON file generation.
- Send generated files back through Telegram.
- Evaluate whether PDF/DOCX generation is needed.
- If needed, add an external runner (GitHub Actions, Modal, Daytona, or paid Cloudflare Sandbox) behind an allowlist.

**Exit criteria:** The agent can generate and deliver small files, and heavy tools are delegated safely when required.

### Phase 5 — Hardening and operations (Week 6+)

- Add chat allowlist and admin commands.
- Add token rotation procedures.
- Add usage metrics and error alerts.
- Add memory retention and export jobs.
- Add GitHub snapshots for audit history.
- Load-test against Cloudflare free-tier limits.
- Document recovery procedures for fiber and Workflow failures.

**Exit criteria:** The bot is maintainable, observable, and safe for daily use.

## 6. Free-Tier Viability Assessment

**Credible on Cloudflare Free:**

- Telegram webhook ingress
- Think harness and Agent runtime
- Durable Object SQLite session state
- Text-only agent loop with external model provider
- Memory, personality, and reminders
- Simple HTTP tools
- Small file generation (Markdown, CSV, code, JSON)
- R2 storage for artifacts
- Schedules and basic Workflows

**Not fully free-tier viable:**

- Cloudflare Sandbox (real filesystem, shell, language runtimes)
- Browser and Code Mode tools
- Large file processing
- High-volume tool execution
- PDF/DOCX generation toolchains

**Budget against:**

- Agents: 1 GB maximum state per unique Agent, 30 seconds of compute per Agent refreshed by incoming HTTP requests, WebSocket messages, or scheduled tasks.
- Workflows on Free: 10 ms CPU per step, 1,024 steps per Workflow, 100 MB persisted state per instance, 100 concurrent running instances, 100,000 executions/day shared with Workers, 1 MiB non-stream step results/event payloads.
- D1: 5 GB total storage, 500 MB per database, 5 million rows read/day, 100,000 rows written/day, 50 queries per invocation.
- R2: 10 GB-month storage, 1 million Class A operations/month, 10 million Class B operations/month, free egress.
- Queues: 10,000 standard operations/day, 24-hour retention.

For a single user, the free tier is a realistic starting point if the tool set is curated and heavy work is delegated.

## 7. Risk Register and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Think API instability | Medium | Pin versions; keep model and tool interfaces adapter-based |
| Fiber recovery gaps | Medium | Implement explicit `onFiberRecovered()` policy; do not assume closure serialization |
| Telegram rate limits | Medium | Batch, back off, and respect Bot API guidance; verify limits at implementation |
| Vendor lock-in | Medium-High | Keep provider and tool interfaces abstract; export memory regularly |
| Free-tier CPU limits | Medium | Keep orchestration lean; move heavy work to external runner |
| Tool safety | High | Allowlist only; approval gates for sensitive actions; no arbitrary shell by default |
| Upstream dependency | Medium | Monitor `cloudflare/agents` issues; avoid unsupported forks |
| Memory bloat | Medium | Compaction, retention policies, and FTS5 retrieval limits |

## 8. Final Recommendation

**Build it.** Cloudflare Agents 2026 with Think is the right platform for a single advanced user who wants a smart, persistent, Telegram-first personal assistant with low infrastructure maintenance.

**Complexity score: 6/10** — significantly easier than self-hosting OpenClaw or Hermes, but more complex than a simple Workers bot because of durable state, recovery, and tool boundaries.

**Maintenance burden: Low to Medium** — Cloudflare manages the runtime, but you still own provider adaptation, memory policy, tool allowlisting, and operational monitoring.

**Free-tier viability: Strong for text-first** — memory, reminders, personality, simple HTTP tools, and small file generation are viable. Arbitrary shell, browser, PDF/DOCX, and large artifact processing need an external runner or paid Cloudflare services.

**Long-term viability: Good with caveats** — the platform is actively developed and the durability model is strong, but Think and Agents are still maturing. Pin versions, keep interfaces adapter-based, and export your memory regularly.

**Worth building for you: Yes.** You already have local AI tools on Android (MiMoCode/Acode), so you can use Cloudflare Agents as the always-on Telegram brain while keeping heavy local toolchains on your devices when needed. The hybrid model gives you the best of both: durable cloud presence plus unrestricted local execution when a task demands it.

## 9. Immediate Next Steps

1. Create the Cloudflare Agents project and install pinned `@cloudflare/agents` and `@cloudflare/think` versions.
2. Implement the Kilo API / OpenAI-compatible provider adapter.
3. Enable the Think Telegram messenger and register the webhook.
4. Verify one end-to-end text turn from Telegram through the external model and back.
5. Add Session-based memory and personality context blocks.
6. Only then add tools, reminders, and file generation in that order.
