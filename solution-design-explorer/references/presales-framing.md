# Pre-sales / client-facing framing (optional)

Include this framing **only** when the audience is pre-sales or client-facing. For internal architecture reviews, skip it — it reads as sales noise to a build team. When you do include it, keep every claim *earned*: tie it to something concrete in the design, never boast in the abstract.

## The "how we help" close (§14)

Every pre-sales deliverable should end by answering the client's unspoken question: *why you, and not the in-house team or another vendor?* Structure the close as:

1. **The differentiator** — the one or two things that are genuinely hard to replicate. For a domain-heavy AI agent this is often: (a) deep domain modeling that a generic LLM integrator would get wrong, and (b) a delivery method that de-risks the build. Name the client's real moat too (their proprietary data, their schema knowledge) and show how the design *compounds* it rather than commoditizing it.
2. **The delivery angle** — how you ship this: rapid thin-foundation MVP first, then waves; reuse via an agent-factory / accelerators; an established reference architecture so you're assembling, not inventing.
3. **The honest scope tie-in** — connect back to §13.2: here's what the first increment buys, here's wave 2. Credibility beats over-promising.

## Reference-architecture hooks (when the topic is an AI agent)

If the client's proposal references a platform/stack, mirror it so the design lands as "fits what you already chose," not "rip and replace." Common AI-delivery reference points to weave in **only if they match the brief**:

- **Cloud & models:** AWS + Bedrock, model-agnostic via a gateway (LiteLLM / Portkey) so model choice stays a config decision.
- **Orchestration:** Kubernetes; durable workflow (Temporal) so long jobs resume rather than restart; LangGraph / Claude Agent SDK for the agent layer.
- **Data & memory:** Postgres + a graph store (Neo4j) where relationships matter; vector store (PGVector / Chroma); a memory layer (Mem0 / Cognee) for stateful agents.
- **Control plane:** Next.js + FastAPI; identity via WorkOS (OAuth2 / on-behalf-of).
- **Observability & evals:** Langfuse / OpenTelemetry for tracing; DeepEvals / Langfuse evals for quality gates.
- **Eventing:** SQS / Kafka / EventBridge.
- **Isolation:** untrusted documents parsed in a microVM (Firecracker); tenant credentials vaulted behind a proxy, never passed into tool sandboxes.

Two recurring guardrails that clients value hearing stated explicitly:
- **Agents must not query legacy systems of record directly** — data flows through service APIs (e.g., Spring Boot) or MCP adapters, so the agent never becomes a back door around existing access controls.
- **Proprietary tuning corpus is gated by a data-rights program** — the client's data advantage is protected, not silently absorbed.

## Tone

Pre-sales readers are smart and allergic to fluff. The design itself is the sell; this section just makes the "why us" explicit. If a claim here isn't backed by something earlier in the document, cut it.
