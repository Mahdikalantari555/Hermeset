# Research brief

## Refined question

How can an agent system comparable to OpenClaw or Hermes be run on Cloudflare Workers and connected to a Telegram bot, including whether a custom lightweight harness such as fx, nanoclaw, or another claw-like agent is a better fit than deploying a full agent runtime?

## Scope boundaries

In scope:
- Cloudflare Workers runtime limits, execution model, storage, networking, cron, queues, and AI Gateway/Workers AI considerations.
- OpenClaw and Hermes agent architectures, especially whether they can run directly in Workers or need an external runtime.
- Lightweight custom harnesses such as fx, nanoclaw, or other claw-like agents, including their runtime, tool-loop, persistence, and Workers compatibility.
- Telegram Bot API integration patterns: webhooks, long polling, updates, messages, files, and deployment security.
- Practical reference architectures, minimal prototypes, and operational tradeoffs.
- Evidence current through 2026-09-22.

Out of scope:
- Building and deploying a production bot for the user.
- Paid Cloudflare plan specifics beyond publicly documented limits and likely deployment implications.
- Security-sensitive credential handling beyond general best practices.

## Assumptions

- "OpenClaw" refers to the open-source OpenClaw agent platform; if multiple projects use that name, the report will distinguish them.
- "Hermes" refers to an agent framework or agent runtime with that name; the report will identify the relevant project and note ambiguity if necessary.
- The desired outcome is a technically credible architecture, not merely a theoretical claim that any JavaScript can run in Workers.
- Telegram webhook deployment must account for Workers' request/response lifecycle and any external state or model runtime.

## Depth

Standard: 3-5 independent research angles, one follow-up round if gaps remain, targeting at least 15 sources.

## Angles

1. Cloudflare Workers execution model and hard limits relevant to agents: CPU time, wall time, memory, subrequests, streaming, cron, queues, Durable Objects, R2, KV, D1, and vector/search services.
2. OpenClaw architecture and deployment options: runtime dependencies, tool execution, persistence, memory, model providers, and compatibility with edge runtimes.
3. Hermes agent architecture and deployment options: runtime, model/tool loop, persistence, plugins, and compatibility with Workers or edge deployment.
4. Telegram Bot API integration from Workers: webhook versus polling, update handling, file downloads, rate limits, security verification, and failure/retry behavior.
5. End-to-end reference architectures and practitioner evidence: direct Workers bot, Workers orchestration plus external agent host, hybrid queue/Durable Object designs, and known examples or blockers.
6. Lightweight custom agent harnesses: fx, nanoclaw, and similar claw-like designs; direct Workers feasibility, delegation boundaries, and minimal viable architecture.
