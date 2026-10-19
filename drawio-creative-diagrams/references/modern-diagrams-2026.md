# Modern diagram idioms (2025–2026) + the archetype catalog

This file extends the cloud-stencil idiom to the diagrams that dominate real design
reviews now: **mixed-vendor "system topology" pictures** that put SaaS brand logos next
to AWS/Azure/GCP icons, overlay **phase band-arrows**, annotate edges with **latency /
SLA / cost**, and route flows through **transport hops** ("Internet", "Streaming
WebSocket API"). The attached-reference style — a Twilio→STT→LLM→TTS voice pipeline with
a Multi-Tenant RAG zone, `~500ms`/`~200ms` budgets, and big *Speech Input → Text Output*
band arrows — is the canonical example. Read this when the user hands you a picture like
that, names third-party products (Twilio, Deepgram, ElevenLabs, Qdrant, Snowflake,
Datadog…), or asks for a "realtime AI pipeline", "RAG architecture", "CI/CD diagram", or
any of the archetypes in §7.

It composes with everything else: you still want a **banner**, **semantic colour**, **one
hero path**, a **legend**, **nested zones** (cloud-architecture-stencils.md), and **flow
animation** on the live edges. The four idioms below are *additions* to that spine.

---

## 1. 2025–2026 visual trends (what "current" looks like)

- **Brand/SaaS logos mixed with cloud icons.** Real product marks (Twilio, Kafka,
  Snowflake, Qdrant, OpenAI, Datadog, Stripe) sit alongside official provider icons
  instead of generic boxes. §2.
- **Latency / SLA / cost call-outs.** Edges carry `p95`, `~200ms`, throughput, `$/1k tok`.
  Standard on AI and microservice diagrams; voice-AI shows a sub-second turn budget. §4.
- **Happy-path hero highlighting.** One bold path traces the primary flow; secondary /
  error / async paths are thinner, dashed, or greyed. (Already the §A.0 "hero path" rule.)
- **Phase band-arrows / chevrons.** Big labelled stage arrows ("Ingest → Transform →
  Serve", "Speech Input → Text Output", "Build → Test → Deploy") frame a pipeline into
  named phases, laid in a clear strip *parallel* to the components. §3.
- **Control-plane vs data-plane separation.** Stacked planes or distinct background
  regions; dominant in mesh / k8s / zero-trust / IDP diagrams.
- **Dark-mode + glass.** Dark canvas, neon accent edges, frosted translucent containers
  for hero decks (`glass=1`, dark `fillColor`, light `fontColor`).
- **Isometric for hero decks only.** 2.5D (`mxgraph.aws3d.*`, isometric sets) for
  exec/poster views; flat 2D for working engineering docs.
- **Observability side-rail.** A right-edge lane for logs/metrics/traces
  (OpenTelemetry, Grafana, Langfuse on AI diagrams) attached to the main flow. (§A.0 side rail.)

---

## 2. Third-party / SaaS brand icons

The cloud stencils cover AWS/Azure/GCP. Everything else — Twilio, Deepgram, ElevenLabs,
Qdrant, Snowflake, MongoDB, Kafka, Datadog, OpenAI, Stripe, **Temporal, Firecracker** — has
**no guaranteed stencil**. This is the primary **fallback** target of the Icon Selection
Protocol ([icon-selection.md](icon-selection.md)): when `find_icon.py "<name>"` returns no
real stencil but the name is a known brand, it hands you the hex for the chip below. Two
robust options, in preference order:

**(a) Brand-coloured chip (default — always works, always validates).** A rounded box
filled with the vendor's brand hex, a **bold white label**, and an optional emoji glyph.
It reads as "that product" instantly and never renders blank:

```xml
<mxCell id="twilio" parent="1" vertex="1" value="&lt;b&gt;Twilio&lt;/b&gt;&lt;br&gt;&lt;font style='font-size:10px'&gt;Programmable Voice&lt;/font&gt;"
  style="rounded=1;arcSize=20;html=1;whiteSpace=wrap;fillColor=#F22F46;strokeColor=none;fontColor=#ffffff;fontSize=12;shadow=1;">
  <mxGeometry x="120" y="200" width="130" height="56" as="geometry" />
</mxCell>
```

Rule: **dark/saturated brand fill → white font; pale brand fill → dark font** (the §A.7
contrast check enforces this). Representative brand hexes (verify the exact mark if it
matters — these are close):

| Vendor | hex | | Vendor | hex | | Vendor | hex |
|---|---|---|---|---|---|---|---|
| Twilio | `#F22F46` | | Deepgram | `#13EF93`¹ | | ElevenLabs | `#0B0B0B`¹ |
| Qdrant | `#DC244C` | | Pinecone | `#1C17FF` | | Weaviate | `#FF6D5A` |
| OpenAI | `#10A37F` | | Anthropic/Claude | `#D97757` | | Hugging Face | `#FFD21E`¹ |
| LangChain | `#1C3C3C` | | Snowflake | `#29B5E8` | | Databricks | `#FF3621` |
| MongoDB | `#47A248` | | Postgres | `#4169E1` | | Redis | `#FF4438` |
| Kafka | `#231F20` | | Stripe | `#635BFF` | | Datadog | `#632CA6` |
| Grafana | `#F46800` | | Prometheus | `#E6522C` | | Elastic | `#FEC514`¹ |
| Cloudflare | `#F38020` | | GitHub | `#181717` | | GitLab | `#FC6D26` |
| Kubernetes | `#326CE5` | | Docker | `#2496ED` | | Terraform | `#7B42BC` |

¹ pale/near-white or light-green marks: use a **dark** `fontColor` (`#101820`) for contrast.

**(b) Official logo image (preferred for branded products)** —
`shape=image;image=<data-uri>`. Per the Icon Selection Protocol
([icon-selection.md](icon-selection.md)), when a third-party product has no stencil the
**first** fallback is its *official* logo, fetched online and **embedded as a
self-contained `data:` image node** — run `python scripts/fetch_logo.py "<name>"` (it
knows verified sources for Temporal, Firecracker, Qdrant, Pinecone, Deepgram, LangChain,
OpenAI, Anthropic, or takes a URL). Embed the `data:` URI, **not** an `http(s)` reference
(external URLs may not load offline and the validator can't see a wrong path — it renders
blank). **Always keep the text label** so a broken image still reads. The brand chip (a)
is now the *graceful degradation* — use it only when no official logo can be
obtained/embedded.

> Keep a category convention: managed cloud service → **provider stencil icon** (aws4/azure2/gcp2);
> third-party SaaS/product → **official embedded logo** (or brand chip if none) ; your own
> logical components (orchestrator, adapter, agent, registry) → **semantic-coloured lane**
> (the §A.0 palette). Three visual classes, decoded in the legend, tells the reader
> "vendor vs cloud vs ours" at a glance.

---

## 3. Phase band-arrows (chevron stage bands)

The big *Speech Input → Text Output* / *Speech Response ← Text Response* arrows are
**phase bands**: a giant block arrow that labels a *span* of the pipeline. Use draw.io's
built-in block-arrow shapes (no stencil needed):

- `shape=singleArrow;direction=east|west|north|south` — one big arrow.
- `shape=doubleArrow` — bidirectional (a round-trip phase).
- tune the proportions with `arrowWidth` (0–1, shaft thickness) and `arrowSize` (head).

```xml
<!-- a pale-yellow forward phase band sitting in a CLEAR strip below the service row -->
<mxCell id="band_in" parent="1" vertex="1" value="&lt;b&gt;Speech Input&lt;/b&gt;"
  style="shape=singleArrow;direction=east;html=1;whiteSpace=wrap;arrowWidth=0.55;arrowSize=0.18;
         fillColor=#fff2cc;strokeColor=#d6b656;fontColor=#7a5c00;fontStyle=1;fontSize=14;">
  <mxGeometry x="520" y="560" width="300" height="70" as="geometry" />
</mxCell>
```

**The one hard rule: a band-arrow lives in its own clear strip, never on top of nodes.**
The §A.7 validator reports a partial overlap with a service box as an **error**. In the
reference picture the yellow bands sit in the gutter *between* the service rows and the
pink bands sit in a strip *below* them — give the band its own horizontal (or vertical,
§6) lane with ≥40px clearance, exactly like a side rail. Pale fill + dark font keeps it a
background "phase label", not a competing hero.

Chevron pipelines (medallion Bronze→Silver→Gold, CI/CD Build→Test→Deploy) are the same
move repeated: a **row of `singleArrow;direction=east` bands**, one per stage, each a step
colour, with the stage's components nested in a zone directly under its band.

---

## 4. Metric / latency / SLA tags

The red `~500ms`, `~200ms`, `~100ms` budgets are **borderless metric tags**. Two ways:

- **As an edge label** (preferred when it belongs to one hop): put it in the edge `value`
  and colour the edge's font, e.g. `…;fontColor=#d6322c;fontStyle=1;fontSize=11;`. Travels
  with the edge, never overlaps.
- **As a floating tag** in a clear gap (for a span-level budget like the long `~200 ms`
  measure line under the band): a borderless label — `fillColor=none;strokeColor=none` —
  so it's exempt from the contrast check and, kept in open canvas, from overlap:

```xml
<mxCell id="lat1" parent="1" vertex="1" value="~500ms"
  style="text;html=1;fillColor=none;strokeColor=none;fontColor=#d6322c;fontStyle=1;fontSize=12;align=center;">
  <mxGeometry x="980" y="300" width="70" height="20" as="geometry" />
</mxCell>
```

Colour convention: **red** for a latency budget / SLO you must beat, **grey** for an
informational measure. A long red double-arrow measure line (`shape=doubleArrow` thin, or a
plain edge with `startArrow=block;endArrow=block`) under a phase band reproduces the
"~200 ms end-to-end" bracket. Keep tags small and in clear space; two tags closer than
~6px will trip the overlap check.

---

## 5. Transport-hop glyphs ("Internet", "WebSocket API")

Between two services that talk over the network the reference shows a small **cloud** with
a dashed **"Streaming WebSocket API"** sublabel. Use the built-in cloud:

```xml
<mxCell id="net1" parent="1" vertex="1" value="Internet"
  style="ellipse;shape=cloud;html=1;fillColor=#eeeeee;strokeColor=#999999;fontColor=#555555;fontSize=11;">
  <mxGeometry x="430" y="240" width="90" height="60" as="geometry" />
</mxCell>
<!-- the protocol sublabel: a borderless caption parked just under the hop, in clear space -->
<mxCell id="net1_sub" parent="1" vertex="1" value="Streaming WebSocket API"
  style="text;html=1;fillColor=none;strokeColor=none;fontColor=#8a8a8a;fontSize=10;fontStyle=2;align=center;">
  <mxGeometry x="400" y="305" width="150" height="16" as="geometry" />
</mxCell>
```

Grey + light is deliberate: transport is *plumbing*, it should recede behind the services
and the hero path. Animate the edges *into and out of* the cloud (the flow is moving), but
leave the cloud itself static.

---

## 6. Vertical context band

The right-edge *Transcript & Context* arrow is a phase band turned vertical
(`shape=singleArrow;direction=south`) occupying its **own column** — a §A.0 side rail
rendered as a big arrow to say "this concern flows down across the whole system". Same
clear-strip rule: give it a dedicated right-hand column, don't overlap the zones. Good for
"data lineage", "request context", "trust boundary", or "promotion direction" annotations
that span the whole picture.

---

## 7. The archetype catalog — ~50 diagrams the skill can be asked for

When the user names one of these (or describes it), you already know the metaphor, the
signature elements, and which idioms above to reach for. Pick the **layout** from here,
then build it with the §A.0 spine + the relevant idiom (zones, band-arrows, brand chips,
metric tags). Domains: **SW** software · **CL** cloud · **AI** ai/agentic · **DX** sdlc/devops.

### Software architecture
1. **C4 System Context** (SW) — central system, surrounding actors + external systems; person glyphs, "uses" edges, zero internal detail.
2. **C4 Container** (SW) — boundary box of apps + datastores; tech tags `[Spring Boot]`, protocol-labelled edges. The microservices workhorse.
3. **C4 Component** (SW) — inside one container: controller/service/repository, dependency arrows.
4. **C4 Dynamic** (SW) — a C4 view with numbered ①②③ edges showing one runtime scenario.
5. **Layered / N-tier** (SW) — stacked full-width tiers (Presentation→Domain→Data); top-down arrows, "no skipping".
6. **Hexagonal / Ports & Adapters** (SW) — hex core, driving adapters left, driven right, port labels on the boundary.
7. **Event-driven microservices** (SW) — services around a central broker lane; topic lanes, async dashed edges, event names.
8. **Event sourcing + CQRS** (SW) — command→event-store→projections→query, split L/R; append-only cylinder, replay arrows.
9. **Saga (orchestration vs choreography)** (SW) — orchestrator hub-and-spoke or chained events; compensating dashed back-arrows, step numbers.
10. **API gateway + BFF** (SW) — clients→gateway/BFF→services; single edge gateway, per-client BFF lanes, auth at the boundary.
11. **DDD bounded-context map** (SW) — context bubbles + relationship lines (ACL, Conformist, Shared Kernel), U/D markers.
12. **Strangler-fig migration** (SW) — legacy monolith, facade in front, services peeling off; "% migrated" annotation, fading block.
13. **Request sequence (ByteByteGo style)** (SW) — vertical lifelines, ordered messages, activation bars, hero happy-path (use §A.5c).
14. **ER / data model** (SW) — entity tables (HTML-table nodes!), crow's-foot relations, PK/FK markers.
15. **State machine / lifecycle** (SW) — ring of states, guarded transitions, start/end, self-loops.
16. **Modular monolith ("modulith")** (SW) — one deployable, internal module partitions, allowed-dependency arrows, shared DB call-out.

### Cloud / infrastructure
17. **AWS 3-tier VPC** (CL) — VPC box, public/private subnets across AZ columns; ALB/EC2/RDS icons, NAT/IGW at edge, SG call-outs.
18. **Serverless event-driven** (CL) — trigger→Lambda→downstream; API GW/EventBridge/SQS icons, DynamoDB stream arrows, "scales to zero".
19. **Multi-region / DR** (CL) — two mirrored regional blocks + replication link; active-active vs passive, failover arrow, RTO/RPO tags.
20. **Hub-and-spoke landing zone** (CL) — central hub VNet/VPC, radiating spokes; peering, transit gateway, shared-services hub.
21. **Kubernetes cluster** (CL) — control-plane band over worker-node grid; API-server/etcd/scheduler, pods-in-nodes, ingress at edge.
22. **Service mesh** (CL) — sidecar data-plane + separate control-plane; Envoy pairs, mTLS lock icons, telemetry export.
23. **Zero-trust network** (CL) — nested trust zones, PEP/PDP on every edge, microsegmentation, "verify every request".
24. **Data lakehouse / medallion** (CL) — Bronze→Silver→Gold **band-arrows** (§3); sources into bronze, BI/ML off gold, Delta/Iceberg icons.
25. **Streaming pipeline (Kafka)** (CL) — sources→topic lanes→stream processor→sinks; partitions, Flink/Spark node, schema-registry.
26. **Data mesh** (CL) — decentralized domain "data product" nodes around a self-serve platform band; domain swimlanes, federated governance.
27. **CDN / edge delivery** (CL) — user→edge PoPs→origin, geographically fanned; cache hit/miss + latency tags (§4), WAF at edge.
28. **Hybrid / multi-cloud** (CL) — on-prem + 2 cloud blocks joined by interconnects; Direct Connect/ExpressRoute, VPN, identity federation.
29. **Landing-zone / org overview** (CL) — account/OU tree with guardrail bands; management account top, SCP policies, security account.
30. **Isometric infra hero** (CL) — 2.5D stacked planes, isometric 3D shapes, depth per layer, exec-deck aesthetic.
31. **Observability pipeline** (CL) — services→OTel collector→metrics/logs/traces split→Grafana/Loki/Tempo→alerting branch.
32. **Identity / SSO flow** (CL) — user→IdP→token→resources; OAuth/OIDC arrows, JWT/scope labels, trust-boundary line.

### AI / LLM / agentic / RAG
33. **Naive RAG** (AI) — query→embed→vector search→prompt→LLM→answer; vector-DB cylinder, top-k tag, prompt-assembly box.
34. **Ingestion / indexing (offline RAG)** (AI) — docs→chunk→embed→upsert; splitter node, metadata tagging; separate "offline" band vs online query band.
35. **Agentic RAG** (AI) — agent treats retrieval as one tool; planner/router, retrieve-decide loop, multiple tools, "decides when to retrieve".
36. **Hybrid search + rerank** (AI) — parallel dense + BM25 lanes merging into a cross-encoder reranker; RRF fusion, top-k→top-n funnel.
37. **GraphRAG** (AI) — knowledge-graph cluster feeding retrieval; entity-relation nodes, community summaries, graph+vector merge.
38. **Multi-hop / query-rewriting RAG** (AI) — rewrite→retrieve→reason→re-query loop; decomposition node, hop counter, answer synthesis.
39. **Agentic tool loop (ReAct)** (AI) — ring state-machine Reason→Act→Observe; tool registry, function-call JSON arrows, stop condition (use §A.5c orbit).
40. **Orchestrator–worker multi-agent** (AI) — manager hub delegating to specialist sub-agents; per-worker tools, aggregation back-arrows, handoff labels.
41. **Decentralized / handoff multi-agent (A2A)** (AI) — peer agents passing control horizontally; shared blackboard, A2A protocol label, no hub.
42. **MCP architecture** (AI) — host/client ↔ MCP servers exposing tools/resources/prompts; transport (stdio/SSE) label, capability discovery.
43. **LLM gateway / router** (AI) — apps→gateway→multiple providers; routing fan-out, caching+rate-limit+cost band, fallback arrow, guardrail at edge.
44. **Eval harness** (AI) — system-under-test→eval pipeline→scorecards; LLM-as-judge, golden-set, metric panel (faithfulness/latency/cost), offline vs A/B.
45. **Agent observability / tracing** (AI) — agent loop + tracing side-rail; span/trace tree, Langfuse/Phoenix, per-step token+latency tags (§4).
46. **Voice-AI realtime pipeline** (AI) — mic→STT→LLM→TTS→speaker streaming; **band-arrows** Speech-In/Text-Out, **latency budgets** (§4), barge-in loop, transport clouds (§5). *(the reference picture)*
47. **LLMOps train & serve** (AI) — data→fine-tune→eval gate→registry→serve; GPU train node, model registry, vLLM serving, prod feedback loop.
48. **Guardrails / safety layer** (AI) — input-guard→LLM→output-guard; PII/jailbreak/toxicity filters, allow/block branches, human-in-the-loop escalation.

### SDLC / DevOps / CI-CD
49. **CI/CD pipeline** (DX) — left→right **chevron band-arrows** (§3) commit→build→test→scan→deploy; quality-gate diamonds, artifact-registry handoff.
50. **GitOps topology** (DX) — Git repo (source of truth)→controller→cluster sync; Argo/Flux reconcile loop, "desired vs actual", pull-based.
51. **Progressive delivery (canary/blue-green)** (DX) — traffic-splitter→stable + canary; **% traffic tags** (§4), metric-analysis gate, auto-rollback arrow.
52. **Internal developer platform (IDP)** (DX) — stacked planes: portal (Backstage)→orchestration→resource/observability; golden-path call-out, control vs resource plane.
53. **DORA metrics dashboard** (DX) — four-quadrant panel (deploy freq, lead time, change-fail, MTTR) + pipeline events feeding it.
54. **Branching strategy** (DX) — horizontal trunk + short branch stubs (trunk-based) or parallel lanes (GitFlow); release-tag markers.
55. **Environment promotion** (DX) — Dev→Staging→Prod swimlanes; approval-gate diamonds, same-artifact promotion arrow, config-per-env.
56. **Incident response / on-call** (DX) — role swimlanes (alerting/on-call/SRE/comms); alert→page→triage→mitigate→postmortem, severity branch, runbook links.
57. **Release / change-management** (DX) — team swimlanes (Dev/QA/Sec/Ops); cross-lane hand-offs, approval gates, change-ticket states.
58. **DevSecOps supply-chain** (DX) — CI/CD band with a security gate at each stage; SAST/DAST/SCA, SBOM, artifact-signing (cosign), SLSA provenance.

> Close cousins worth keeping distinct (different signature visuals): orchestrator-worker
> vs decentralized multi-agent; canary vs blue-green; naive vs agentic RAG. When the user
> is vague ("draw our AI system"), ask which archetype fits — or pick the closest and say so.

---

## 8. Worked recipe — the mixed-vendor realtime AI pipeline (the reference picture)

To reproduce the attached style (Twilio voice → STT → LLM → TTS, Multi-Tenant RAG zone):

1. **Banner** across the top (title + subtitle), as always.
2. **A left→right service spine**: caller glyph → **brand chip** Twilio (§2) → AWS **API
   Gateway / ALB / Fargate** stencil icons (cloud-architecture-stencils.md) → **brand
   chips** Deepgram (STT) and ElevenLabs (TTS) → **AWS Bedrock** + **brand chip** Qdrant
   inside the RAG zone. Three visual classes (provider icon / brand chip / logical lane),
   decoded in the legend.
3. **Transport clouds** (§5) between services that stream over the network, each with a
   dashed *Streaming WebSocket API* sublabel; animate the edges through them.
4. **The hero path** = the live media/audio path: thick orange + `flowAnimation=1` all the
   way round the loop. Control/identity edges (Secrets Manager, Systems Manager) dashed.
5. **Phase band-arrows** (§3) in the clear strip below the spine: a pale-yellow forward
   *Speech Input → Text Output* pair, a pale-pink return *Speech Response ← Text Response*
   pair in a strip beneath that.
6. **Latency tags** (§4): red `~500ms` / `~200ms` / `~100ms` budgets on the relevant hops
   and as a span bracket under the bands.
7. **The "Multi-Tenant RAG" nested zone** on the right (a §3 cloud-stencil zone container):
   S3 tenant data, Bedrock embeddings (Titan), Qdrant vector DB, Lambda tagging, DynamoDB
   tenant tags — components nested as children of the zone.
8. **Vertical context band** (§6) far right: *Transcript & Context*, `direction=south`.
9. **Legend** decoding the three icon classes, the line styles (media/control/identity),
   and the red = latency-budget convention. Then **validate** (§A.7) to `[OK]`.
