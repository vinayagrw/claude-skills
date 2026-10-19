# Cloud-architecture diagrams with official provider stencils

The signature look in §A.0 (gradient lanes) is the default. But for **infra /
cloud-topology** diagrams — the kind a solutions architect pastes into an AWS/Azure
review — the expected idiom is different and just as deliberate: **official provider
service icons sitting inside named, dashed "zone" boxes**, connected by orthogonal
lines. Think "VPC diagram", "Azure landing zone", "reference architecture". This file
is the recipe for that style. Use it when the user gives you a cloud reference diagram
to match, names real services (Bedrock, EKS, Cognito, AKS, BigQuery…), or asks for an
"AWS/Azure/GCP architecture".

It composes with the house style: you still want a **banner**, **semantic zone colour**,
**one hero path**, a **legend**, and **flow animation** on the live edges. You're just
swapping gradient lanes for real service icons grouped into trust zones.

---

## 1. Two stencil systems (both ship inside draw.io)

| Provider | Mechanism | Style fragment |
|---|---|---|
| **AWS** | vector shapes `mxgraph.aws4.*` | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.<name>` |
| **Azure** | bundled SVGs under `img/lib/azure2/…` | `shape=image;image=img/lib/azure2/<cat>/<File>.svg` |
| **GCP** | bundled SVGs under `img/lib/gcp2/…` | `shape=image;image=img/lib/gcp2/<cat>/<File>.svg` |

AWS is shape-based (the modern AWS4 set); Azure/GCP are image-path based. A wrong
`resIcon`/image path renders as a **blank box** — the validator can't catch it (it's a
runtime stencil lookup, not structure). So **resolve every icon through the Icon Selection
Protocol** ([icon-selection.md](icon-selection.md)) *before* placing it:
`python scripts/find_icon.py "<name>"` confirms a real stencil (checked against the
machine-readable [scripts/stencil_index.json](../scripts/stencil_index.json)) or hands you
a deliberate fallback. When the fallback is a **branded product with no stencil** (Temporal,
Firecracker…), the protocol's first rung is its **official logo, fetched online and embedded
as a self-contained `data:` image node** — `python scripts/fetch_logo.py "<name>"`. Belt-and-
braces: (a) **always give the icon a text label**, so a missing glyph still reads; (b) embed
`data:` URIs, never external `image=http…` refs (they render blank offline / when moved). The
category names in §2 below are the same set the index carries — the script is the fast path.

---

## 2. The AWS resource-icon recipe

One consistent style for every AWS service icon — vary only `resIcon`, the label, and the
category `fillColor`:

```xml
<mxCell id="ic_bedrock" parent="z_found" vertex="1" value="Bedrock (models)"
  style="sketch=0;outlineConnect=0;fontColor=#1b2a4a;gradientColor=none;strokeColor=#ffffff;
         dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;
         fontSize=14;fontStyle=1;aspect=fixed;shape=mxgraph.aws4.resourceIcon;
         resIcon=mxgraph.aws4.bedrock;fillColor=#01A88D;">
  <mxGeometry x="40" y="60" width="80" height="80" as="geometry" />
</mxCell>
```

- **80×80 is the minimum icon size** (80–96 typical; 48×48 is too small). Captions 14–16px bold. Never shrink icons to avoid overlap — widen zones/spacing/page. The label sits **below** the fill
  (`verticalLabelPosition=bottom`) — so use a **dark** `fontColor`; it renders on the
  page/zone background, not on the dark icon. (The validator skips the contrast check for
  these for exactly this reason.)
- **Category colour** is carried by `fillColor`. Official-ish presets:

  | Category | fillColor | Example services |
  |---|---|---|
  | Compute | `#ED7100` | EKS, Fargate, Lambda, EC2 |
  | ML / AI | `#01A88D` | Bedrock, SageMaker |
  | Database | `#4D72F3` | RDS, Aurora, ElastiCache, DynamoDB |
  | Storage | `#7AA116` | S3, EFS |
  | Networking / Edge | `#8C4FFF` | CloudFront, Route 53, API Gateway, ELB, VPC |
  | Security / Identity | `#DD344C` | KMS, Secrets Mgr, IAM, Cognito, WAF, ACM |
  | Analytics | `#C925D1` | Redshift, Kinesis, MSK, OpenSearch |
  | Management | `#E7157B` | CloudWatch, CloudTrail |

### Curated known-good `mxgraph.aws4.*` resIcon names

> These are a quick-reference subset; the **authoritative, searchable** list (with
> aliases like `s3`→`simple_storage_service`) lives in
> [scripts/stencil_index.json](../scripts/stencil_index.json) — query it with
> `find_icon.py` per the Icon Selection Protocol rather than typing a name from memory.

Edge/networking: `route_53` · `cloudfront` · `api_gateway` · `elastic_load_balancing` ·
`waf` · `virtual_private_cloud` · `nat_gateway` · `internet_gateway`
Compute: `elastic_kubernetes_service` · `fargate` · `lambda` · `ec2`
ML/AI: `bedrock` · `sagemaker`
Data: `rds` · `aurora` · `elasticache` · `dynamodb` · `simple_storage_service` ·
`opensearch_service` · `redshift` · `managed_streaming_for_apache_kafka` · `kinesis`
Security: `key_management_service` · `secrets_manager` ·
`identity_and_access_management` · `cognito` · `certificate_manager`
Integration/Mgmt: `simple_queue_service` · `simple_notification_service` ·
`simple_email_service` · `step_functions` · `cloudwatch` · `cloudtrail`
People: `users` · `user`

> Newer services (e.g. `bedrock`) exist only in recent draw.io stencil sets; if one shows
> blank, the label still carries it. Azure equivalents live at
> `img/lib/azure2/<category>/<Name>.svg` (e.g. `…/compute/Kubernetes_Services.svg`,
> `…/identity/Azure_Active_Directory.svg`) — open the shape picker in draw.io to copy an
> exact path.

---

## 3. Named zones = nested containers (do this, don't flatten)

Trust zones (VPC, "Edge", "Data layer", a cloud account) are the backbone of this style.
Author them as **real containers** and make every icon/chip a **child** of its zone:

- the zone is `parent="1"` with **absolute** geometry;
- each component is `parent="<zone-id>"` with geometry **relative to the zone origin**.

Why nest rather than place everything at `parent="1"` with absolute coords:

1. **It's structurally honest** — "this service is *in* this VPC" is encoded, not implied.
2. **It stays editable** — drag the zone, its contents move; collapse it, it folds.
3. **Edges read correctly** — an arrow terminating at a child *inside* a zone is the
   target's container being entered, not a box being "crossed".

```xml
<!-- zone: absolute, parent=1 -->
<mxCell id="z_edge" parent="1" vertex="1" value="Edge / Delivery"
  style="rounded=1;html=1;dashed=1;dashPattern=6 4;strokeColor=#8C4FFF;fillColor=#f5f0ff;
         verticalAlign=top;align=left;spacingLeft=8;spacingTop=4;fontSize=17;fontStyle=1;fontColor=#6b3fd6;">
  <mxGeometry x="160" y="210" width="180" height="510" as="geometry" />
</mxCell>
<!-- child: geometry RELATIVE to z_edge's origin (so x=50 means 210 absolute) -->
<mxCell id="ic_cf" parent="z_edge" vertex="1" value="CloudFront"
  style="…;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;">
  <mxGeometry x="50" y="150" width="80" height="80" as="geometry" />
</mxCell>
```

**Centering note:** centering an 80px icon in a 180px zone puts it at `x=50`; other widths can land
legitimately off the 10px grid. The grid check is a soft hint; *centered* icons are an accepted
exception, so don't chase those specific warnings.

### Edge routing with nested zones
Same anti-overlap discipline as §A.4b, but two style-specific rules:
- Route the **hero path** between zones through the **gutters** between them, never across a
  zone's stacked icons. (A vertical hop up one side of an Edge zone will slice through the
  Route 53 / CloudFront / WAF icons — give it a waypoint in the clear gutter instead.)
- To reach a component *inside* a zone, enter from the nearest outside face along an empty
  margin; don't traverse the zone's other children.

---

## 4. Verify nested diagrams

`scripts/validate_drawio.py` is **nesting-aware**: it resolves each child's parent chain
to absolute coordinates before the overlap / edge-crossing pass, so a correctly nested
diagram validates `[OK]` (it does **not** false-flag children as colliding with their
ancestors). Run it as normal and fix any *real* warnings it surfaces — with the false
positives gone, an edge-crossing warning now means a genuine routing bug.

Quick standalone soundness check (containment + ids + edge refs), handy as a second pair
of eyes on a big nested file:

```python
import xml.etree.ElementTree as ET
root = ET.parse("file.drawio").getroot()          # raises if not well-formed
cells = {c.get("id"): c for c in root.iter("mxCell")}
def geo(c):
    g = c.find("mxGeometry")
    return [float(g.get(k, 0)) for k in ("x","y","width","height")] if g is not None and g.get("x") else None
ov = []
for i, c in cells.items():
    if c.get("vertex") == "1":
        par = c.get("parent"); g = geo(c)
        if par in cells and cells[par].get("vertex") == "1" and g:
            pg = geo(cells[par])
            if pg and (g[0] < 0 or g[1] < 0 or g[0]+g[2] > pg[2]+0.5 or g[1]+g[3] > pg[3]+0.5):
                ov.append((i, par))            # child overflows its parent → fix
print("overflow:", ov)
print("bad edges:", [(c.get("id"), k, c.get(k)) for c in cells.values()
                     if c.get("edge")=="1" for k in ("source","target")
                     if c.get(k) and c.get(k) not in cells])
```

---

## 6. The canonical AWS reference architecture (official group containers + multi-AZ grid)

The §3 dashed rounded-rect is fine for a logical "trust zone". But the picture a
solutions architect actually pastes into an AWS review — `AWS Cloud ▸ Region ▸ VPC ▸
Availability Zone ▸ Public/Private Subnet`, repeated across AZs, with shared services
floating above — uses draw.io's **official AWS group containers**, not generic boxes. Use
this idiom when the user hands you a VPC reference diagram, names AZs/subnets, or wants "an
AWS architecture diagram" (not just a few service icons).

### 6a. Group containers — the nesting hierarchy

Each level is a `shape=mxgraph.aws4.group` vertex with a corner `grpIcon` and the official
stroke colour. Nest them: Region is a child of AWS Cloud, VPC a child of Region, AZ a
child of VPC, subnet a child of AZ, service icons children of the subnet. (Geometry is
parent-relative — the validator resolves the chain.)

| Level | grpIcon | strokeColor | fill | note |
|---|---|---|---|---|
| AWS Cloud | `group_aws_cloud_alt` | `#232F3E` | none | label top-left, the AWS logo corner |
| Region | `group_region` | `#00A4A6` | none | usually `dashed=1` |
| VPC | `group_vpc` | `#248814` | none | green VPC mark |
| Availability Zone | *(none)* | `#00A4A6` | none | `dashed=1;dashPattern=1 4` dotted box, label only |
| Public subnet | `group_security_group`¹ | `#7AA116` | `#E9F3E6` | green tint |
| Private subnet | `group_security_group`¹ | `#147EBA`/`#00A4A6` | `#E6F2F8`/`#E1F0F7` | blue tint |

¹ subnet groups use the security-group/subnet corner glyph; if a `grpIcon` name renders
no corner icon it's harmless — the label still names the box. Open draw.io's AWS shape
panel to copy an exact `grpIcon` if you need the precise mark.

```xml
<!-- AWS Cloud (outermost), parent=1, absolute -->
<mxCell id="aws" parent="1" vertex="1" value="AWS Cloud"
  style="sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fillColor=none;
         strokeColor=#232F3E;verticalAlign=top;align=left;spacingLeft=30;fontColor=#232F3E;
         dashed=0;shape=mxgraph.aws4.group;grpIcon=mxgraph.aws4.group_aws_cloud_alt;">
  <mxGeometry x="80" y="40" width="1500" height="760" as="geometry" /></mxCell>
<!-- VPC nested inside a Region inside aws; child geometry is RELATIVE -->
<mxCell id="vpc" parent="region" vertex="1" value="VPC"
  style="sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fillColor=none;
         strokeColor=#248814;verticalAlign=top;align=left;spacingLeft=30;fontColor=#AAB7B8;
         dashed=0;shape=mxgraph.aws4.group;grpIcon=mxgraph.aws4.group_vpc;">
  <mxGeometry x="20" y="60" width="1380" height="640" as="geometry" /></mxCell>
<!-- Public subnet (child of an AZ) -->
<mxCell id="pub_a" parent="az_a" vertex="1" value="Public subnet"
  style="sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fillColor=#E9F3E6;
         strokeColor=#7AA116;verticalAlign=top;align=left;spacingLeft=30;fontColor=#248814;
         dashed=0;shape=mxgraph.aws4.group;grpIcon=mxgraph.aws4.group_security_group;">
  <mxGeometry x="20" y="40" width="180" height="150" as="geometry" /></mxCell>
```

### 6b. The multi-AZ grid

Stack the **AZ rows** (`us-east-1a/1b/1c`) as siblings inside the VPC, each the full VPC
width, each holding the same subnet columns — so the diagram reads "the same stack,
replicated across AZs for HA". Keep the columns vertically aligned across rows (same
relative x per subnet) — column alignment is what makes the grid legible. One row = a
single-AZ dev deployment; three rows = the multi-AZ production deployment.

### 6c. Plane backdrops — the Data-Plane / Control-Plane tints

The vertical **Data Plane** (yellow) and **Control Plane** (red) bands that run *down
across all the AZ rows*, tinting specific subnet columns, are the diagram's second
grouping axis. A cell has only one parent, so you can't nest a column-band and an AZ-row
as containers of the same subnet — the band is a **translucent backdrop** placed *behind*
the grid instead:

```xml
<mxCell id="data_plane" parent="vpc" vertex="1" value="Data Plane — SMB Tenant Workflow Tasks"
  style="rounded=0;html=1;fillColor=#fff2cc;strokeColor=#d6b656;opacity=25;verticalAlign=bottom;
         align=center;fontColor=#7a5c00;fontStyle=1;fontSize=12;"
  > <mxGeometry x="220" y="40" width="220" height="600" as="geometry" /></mxCell>
```

**The `opacity=25` is load-bearing, not cosmetic.** The §A.7 validator treats any vertex
with `opacity<=40` as an intentional backdrop and **exempts it from the partial-overlap
error and the edge-crossing warning** — so a plane band may cross the AZ-row containers
(which it must) without flagging. Without the low opacity it reads as a solid box and the
overlap with the AZ rows is (correctly) reported as a collision. So: **plane/zone tints
that deliberately span behind the grid must be authored at `opacity≤40`.** Put the band
*early* in the file (low z-order = behind) and label it at the bottom edge so the caption
clears the subnet labels at the top.

### 6d. The supporting furniture in these diagrams

- **Shared-services row** above the VPC (SQS, Secrets Manager, Systems Manager, S3, KMS,
  Certificate Manager) — plain `aws4.resourceIcon`s (§2) parented to the Region/AWS-Cloud,
  with dashed **control/identity** edges down into the subnets (credentials, parameters,
  schedule). These are the cross-cutting strip.
- **Icon + bulleted-list node** (the "Core Conductor: Engine Tasks / Sweeper / Decider /
  System Tasks / Event Processor" block): an `aws4` icon with an adjacent **left-aligned
  text box** listing the responsibilities — `align=left;verticalAlign=top` with `&lt;br&gt;`
  lines, or an HTML `&lt;ul&gt;`. Pair the icon and the list side by side; don't cram the
  list into the icon's own label.
- **Bracket annotations** — the curly braces marking "Single AZ for Initial Deployment" /
  "Multi AZ for HA Production": `shape=curlyBracket;direction=west;` (a thin tall vertex in
  the right margin) with a text label beside it.
- **Document shape** for artefacts like *JSON Workflows*: `shape=document;` (built-in,
  folded-page look). **Note/callout** for an explanatory aside: `shape=note;fillColor=#ffe6cc;
  strokeColor=#d79b00;` (the dog-eared sticky).
- **IGW + Internet**: the `internet_gateway` icon on the VPC boundary, a grey `shape=cloud`
  ("Internet") outside it, the public ingress edge animated through them.

---

## 7. Checklist for a provider-stencil diagram

- [ ] Banner header (title + subtitle), as always.
- [ ] Trust zones are **nested containers** (zone `parent=1`; components `parent=zone`).
- [ ] Real provider icons for managed services; **labelled chips** for logical/bespoke
      components that have no icon (registries, adapters, agents) — exactly like the
      reference mixing AWS icons with plain boxes.
- [ ] One **category colour per zone-or-icon-group**, decoded in a legend.
- [ ] One **hero path** (thick accent), routed through gutters, animated; secondary flows
      thinner; identity/bridge edges dashed.
- [ ] A **cross-cutting strip** (security/identity) and **side rails** (observability, a
      legacy-estate column) where the architecture has them.
- [ ] Every icon has a text label (survives a missing stencil).
- [ ] Validator `[OK]`; remaining warnings are only centered-icon off-grid hints.

## 8. Challenge the design — the adversarial self-review pass

The validator checks that the picture is well-formed; it says **nothing about whether the
architecture is right.** A diagram can be `[OK]`, beautiful, and still lie about the system.
So before delivering any architecture/system diagram, run a **design-challenge pass** — read
your own diagram as a skeptic whose job is to find what is WRONG or MISSING, not to admire it.

The cheapest, most honest way to do this is to **dispatch an independent reviewer subagent**
(self-review misses your own blind spots): *"You are a skeptical principal architect. Find
what is wrong or missing in this diagram vs. how <system> actually works. Cite cell ids, give
the correct version, rank by severity. Do not report styling nits."* Then **verify each
finding** before acting on it (a confident reviewer is still sometimes wrong), and incorporate
the real ones. These are the failure classes that pass a validator but wreck a design — every
one of them was caught this way in the Temporal/Firecracker reference:

- [ ] **Return paths exist, not just the forward hero path.** Every request has a response,
      every poll a completion, every write an ack. A one-directional diagram of a
      request/response system is incomplete. *(e.g. a Temporal worker must `report completion`
      back to the frontend, not only receive work.)*
- [ ] **No annotation contradicts an edge.** Re-read every note/label against every edge: if
      a note claims an isolation or trust boundary ("no egress", "private", "air-gapped"), no
      edge may cross it. *(A "microVM has no network egress" note beside an edge drawn straight
      from the microVM to S3 is a self-falsifying diagram — route it through the host + a VPC
      endpoint instead.)* This is the most embarrassing class; it reads as not understanding
      your own design.
- [ ] **Only components the system actually uses.** Delete aspirational or copy-pasted extras.
      Verify each node against how the product really works. *(Temporal uses a persistence DB +
      a visibility store — it has no Redis/ElastiCache; a cache icon there is just wrong.)*
- [ ] **Boundary crossings are mediated and realistic.** Private→managed-service access shows
      the real mechanism (VPC endpoint / NAT / PrivateLink), not a bare arrow; egress controls
      are explicit in a security diagram (which subnet has a NAT route, which pointedly does not).
- [ ] **Edges obey protocol & endpoint reality.** An edge's protocol must be one *both* ends
      actually speak, terminating at the real addressable endpoint. *(API Gateway can't proxy
      gRPC — gRPC ingress belongs on an ALB/NLB; workers poll the Temporal **frontend**, not a
      standalone "queue" box.)*
- [ ] **No orphan service nodes.** Every service icon carries at least one edge or is a
      deliberate badge/annotation. A drawn-but-unconnected service (an idle CloudWatch, a
      dangling load balancer) reads as "forgot to wire it" — connect it or cut it.
- [ ] **Claims in labels are backed by structure.** If a bracket says "Multi-AZ HA" or a label
      says "replicated", the replication / failover / cross-AZ edges that make the claim true
      must be drawn — a label is not an architecture.
- [ ] **Control-plane essentials are present** where they matter: authn on trust-boundary edges
      (mTLS/IAM), encryption (KMS), and telemetry — not just the happy data path.

Fold anything you learn here back into the diagram *and*, if it's a reusable rule, into this
section — the reference improves every time a design is challenged.
