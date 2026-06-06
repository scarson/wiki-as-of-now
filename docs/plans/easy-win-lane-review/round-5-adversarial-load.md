<!-- ABOUTME: Round-5 adversarial/load review of the easy-win lane design — abuse, scale, DoS, ReDoS, timing. -->
<!-- ABOUTME: Stands in for the cross-provider round; paranoid "malicious actor / high load" lens. Read-only review. -->

# Easy-win lane v1 — Round 5: adversarial / load review

**Reviewer lens:** what a malicious actor or high load does to the lane. This round stands in
for the cross-provider round and brings the paranoid perspective: fetch fan-out abuse, G14
rate-limit/blocking risk, unbounded table growth, ReDoS over attacker-controlled wikitext at
fan-out scale, edit-timing manipulation, anonymous/hosted-instance abuse, and Cloudflare Worker
subrequest/CPU limits.

**Scope reviewed:** `docs/design/2026-06-06-easy-win-lane-design.md`,
`src/safelane/wikitext-signals.ts`, `src/ingest/wikimedia.ts`, `src/ingest/lookup.ts`,
`src/safelane/eligibility.ts`, `src/db/audit-log.ts`, `src/db/articles.ts`,
`src/app/api/articles/lookup/route.ts`, the compliance doc (responsible-access / untrusted-content
guardrails).

**Bottom line:** the design's *correctness* story (re-fetch-and-re-gate, fail-closed-per-page) is
sound, but it is written for a single-user happy path and **has no defenses against fan-out scale or
abuse**. The two most serious findings are an **unbounded, uncapped, fully-serial fetch fan-out** with
no cap/concurrency-limit/cache (L1) and a **measured super-linear-constant ReDoS-ish CPU cost on the
advisory wikitext scan** that the fan-out multiplies (L2). Both are amplified by the hosted public
instance the compliance doc's hosted-instance section already flags. Several findings are design-doc
omissions, not yet code bugs — but the design is the artifact under review and these MUST be resolved
before the plan is written, because retrofitting a cap/cache after the lane ships changes its
compliance posture (the design itself says a cache "would require new compliance sign-off").

---

## Findings

### L1 — Unbounded, uncapped lane-read fetch fan-out (G14 responsible-access risk) — **HIGH**

**Attack / load scenario.** `getEasyWinLane` Stage 1 selects *every* page whose current snapshot is
recorded `easy_win`, and Stage 2 does **one live `fetchArticle` per pre-filtered page, per lane read**
(design §4, §5). There is **no per-read fetch cap, no pagination, no concurrency bound, and no cache /
TTL on the freshness re-check** — the design explicitly defers all of these (§1 non-goals; open
question #2 is left *unanswered*; §5 calls a cache "out of scope"). The bound on fan-out is "the
pre-filter keeps the set small" (§5, §10) — which is a property of *today's tiny single-user corpus*,
not an enforced limit. As the looked-up corpus grows (the whole point of the tool is throughput across
many articles), one `GET /api/easy-win` becomes a burst of N sequential Wikimedia fetches where N =
the entire easy-win corpus.

**Why this violates the responsible-access guardrail.** G14 requires being "a good API citizen…
respect for rate limits and maxlag, bulk/dump endpoints over live crawling for batch work, and
caching to avoid redundant load." A single endpoint hit that live-crawls the entire easy-win corpus on
*every* call is precisely the "live crawling for batch work" the guardrail says to avoid, and the
"caching to avoid redundant load" clause is the one the design waives. Two readers (or one reader who
refreshes, or a monitoring healthcheck, or a public visitor hammering refresh) multiply N. There is no
`maxlag`-style self-throttle between the per-page fetches; `maxlag=5` is sent on each request but
maxlag only sheds load when *Wikimedia* is already lagging — it does not bound *our* request rate.

**Impact.** At modest corpus sizes (hundreds–thousands of easy-win pages) a single lane read issues
hundreds–thousands of requests under the **shared** `DEFAULT_USER_AGENT`
(`WikiAsOfNow/0.1 (+…github…)`, `wikimedia.ts:41`). Wikimedia's infrastructure (and the UA policy)
treats a single UA issuing burst sequential article fetches as a misbehaving bot; the realistic
consequence is rate-limiting or an outright UA/IP block — which takes down the tool's core lookup path
too, since `lookupAndPersist` uses the same UA. The compliance doc's hosted-instance section already
names exactly this risk: "A shared User-Agent means one abuser could tarnish the tool's standing with
Wikimedia."

**Recommended mitigation.**
1. **Cap N per read (hard).** Surface at most K pages per lane read (e.g. K=20–50, the detector's
   top-scored pages), with explicit pagination/continuation for the rest. This is a *correctness*
   bound, not just perf — open question #2 must be answered "yes, cap" in the design before the plan.
2. **Serialize with a small inter-fetch delay or a low concurrency ceiling (≤2–3),** so a lane read is
   a polite trickle, not a burst. (Stage 2 is currently implied-serial, which is good for politeness
   but means latency = N × RTT; a cap makes serial acceptable.)
3. **Reconsider the no-cache stance under load.** The design rejects caching to avoid the durable
   fail-OPEN (correctly — see L7). But a *short* freshness-recheck TTL (e.g. 30–60s) bounded well under
   the BLP-category-lag concern, applied only to de-dup *concurrent/rapid repeat* reads, would honor
   G14's "caching to avoid redundant load" without reintroducing a *durable* fail-OPEN. This is a real
   tension to put to Sam, not a thing to silently waive — flag it as needing compliance sign-off either
   way (capping is the safer v1 answer; a micro-TTL is the G14-optimal one).

**Adequately defended:** per-fetch politeness primitives already exist — descriptive UA, `maxlag=5`,
one article per call, no enumeration/talk-page fetch (`wikimedia.ts:90-104`). The gap is purely the
*aggregate volume* across the fan-out, which none of those primitives bound.

---

### L2 — ReDoS-ish CPU cost on the advisory wikitext scan, multiplied by fan-out (G15) — **HIGH**

**Attack / load scenario.** Stage 2 re-runs `evaluateEligibility` → `scanWikitextSignals` over the
**live, attacker-controllable** wikitext of each pre-filtered page (G15: fetched content is untrusted).
The two `matchAll` regexes in `wikitext-signals.ts` are length-capped per *match* (`{1,255}`,
`{1,100}?`) — the author's stated ReDoS guard (comment lines 24-25) — but the cap bounds a single
match, **not the whole-string scan cost over a pathological run of match *starts*.** I measured the
actual scan:

| Input (≈ Wikipedia's 2 MB wikitext ceiling) | scan time |
|---|---|
| `"{{ "` repeated to ~2 MB | **~870 ms** |
| `"{"` repeated to ~2 MB | **~1090 ms** |
| `"{{ "` repeated to ~6 MB | ~2580 ms |
| unclosed `<!--` + 4 MB | ~7 ms (fine) |
| `[[category:` + 2 MB run | ~3 ms (fine) |

Scaling is ~linear in length but with a **large constant** (~0.5 s of CPU per MB of brace-spam). An
attacker who can edit *any* article that is (or that they can get) in the easy-win corpus fills it with
`{{ {{ {{ …` (valid-looking template-open noise — survives the `strip()` pass, isn't inside a
comment/nowiki) up to the 2 MB article limit, costing **~1 s of Worker CPU per page on the scan alone.**

**Impact (the fan-out multiplier).** This is the load finding, not just a single-page one. Combined
with L1's uncapped fan-out, **one lane read = N × ~1 s of CPU** if several corpus pages are poisoned.
Cloudflare Workers enforce a CPU-time limit per invocation (default 30 s wall on the paid plan, far
less CPU on the free tier; the *bundled* model gives ~30 s CPU but it is still a hard ceiling). A
handful of poisoned pages in the fan-out blows the CPU budget → the lane read is **killed mid-fan-out**
(partial/empty result, a self-inflicted DoS of the endpoint) and burns paid CPU. On a public hosted
instance an anonymous attacker poisons one article, then repeatedly hits `GET /api/easy-win` → cheap
amplified DoS of the tool's own Worker.

**Why the existing guard is insufficient.** The per-match length cap was reasoned about ("can't
trigger quadratic scanning on a long unclosed run", line 24) but the measured cost comes from the
**number of match-start positions** the engine evaluates across a 2 MB string of `{`/`{{ `, each
triggering the lazy `{1,100}?` + alternation lookahead. The reasoning addressed the wrong axis. This is
the kind of "last 1%" CPU edge the project's own rules say not to hand-wave.

**Recommended mitigation.**
1. **Bound the scan input size.** Cap wikitext length before scanning (e.g. truncate to a generous
   limit, or skip the advisory scan and fail-closed to `human_only` for pages above a size threshold —
   fail-closed is the compliant direction). A 2 MB article is already an outlier for the easy-win lane's
   "high-volume, low-complexity temporal fixes" target.
2. **Pre-count / short-circuit pathological brace density** before the full `matchAll`, or replace the
   lazy quantifier with a possessive/atomic construction (JS lacks native atomic groups; emulate with
   a tempered character class or cap the number of `{{` starts considered).
3. **Add an explicit ReDoS/pathological-input test** over attacker-shaped wikitext (`{{ `×N, `{`×N) to
   `wikitext-signals` tests with a CPU-time assertion — the project's testing-pitfalls already mandate
   adversarial-input coverage; this regex has none for the brace path at scale.
4. **Defense in depth:** with L1's cap in place, the blast radius shrinks to K×1 s; both fixes are
   needed (cap bounds N, scan-bound bounds per-page cost).

**Adequately defended:** the `strip()` of comments/nowiki and the category regex are fast even on
pathological input (measured ms). The vulnerability is specifically the template-name regex over a
high-density brace run.

---

### L3 — Edit-timing TOCTOU: attacker flips eligibility between pre-filter and re-validate — **MEDIUM (mostly defended, one real gap)**

**Attack scenario.** An attacker who knows a specific article is in the lane (e.g. they watch the
public instance, or it's a well-known page) edits it to manipulate the window between Stage 1 (DB
pre-filter, reads the *stored* `easy_win` verdict) and Stage 2 (live re-fetch + re-gate). Two
directions:
- **easy_win → contentious (fail-OPEN attempt):** attacker adds a BLP category or dispute template
  *after* a benign lookup recorded `easy_win` but the page is still in the pre-filter set. **Defended:**
  Stage 2 re-fetches live categorylinks + re-scans live wikitext and demotes before surfacing — this is
  the core design intent and it holds. The freshness fail-closed (15 min window, `eligibility.ts:7,25`)
  additionally excludes *any* just-edited page, so a fresh poisoning edit lands the page in
  `recently_edited` → `human_only` regardless. Good.
- **Surface a *stale candidate* on a now-contentious claim:** the subtler one. Stage 2 gates the
  *article*, but the *candidates* surfaced are the **stored** `stale_candidates` from the prior
  revision (design §4: "include the page's `stale_candidates`"). The check is "live revisionId still
  equals the stored `revision_id`" → if equal, candidates are surfaced. That equality check is sound
  for the *unchanged-revision* case. **Gap:** the design's open question #3 ("should demotion remove
  candidates?") is left "leaning leave + exclude" — fine — but there's no stated handling of the
  **categorylinks-changed-but-revision-unchanged** case for *candidate* content: a BLP category added
  to an unchanged revision (the exact job-queue-lag case the design is built around) correctly demotes
  the *article* (article excluded), so the candidates don't surface either. So this is actually covered
  by article-level exclusion. The residual is only the **named, signed-off** fail-OPEN residuals from
  the gate (category-lag beyond 15 min, etc.) — not new.

**Impact.** Low for the fail-OPEN direction (well defended by re-fetch + freshness). The genuine
residual: an attacker can **force exclusion** (DoS the *usefulness* of the lane) by making trivial edits
to keep target pages perpetually inside the 15-min freshness window or perpetually revision-drifted —
cheap griefing that keeps legitimate easy-win pages out of the lane. Low severity (it removes pages, it
never surfaces a bad one — fail-closed direction), but worth a note.

**Recommended mitigation.** Document the timing model explicitly in §5: the pre-filter→re-validate
window is *not* a security boundary because Stage 2 is authoritative; state that the only attacker
power across the window is *exclusion* (fail-closed), never *inclusion*. Add a test asserting a
category-added-to-unchanged-revision page is excluded (the design lists a BLP-on-re-fetch test — make
sure it covers the *same-revision* variant, not only the revision-moved variant).

**Adequately defended:** the re-fetch-authoritative design is exactly the right TOCTOU posture; the
fail direction is closed. No new fail-OPEN beyond the four signed-off residuals.

---

### L4 — Anonymous / hosted-instance abuse of `GET /api/easy-win` — **HIGH (compliance-flagged, undesigned)**

**Attack scenario.** The compliance doc's hosted-instance section states a public, anonymous instance
exists and that "anonymous mode is scoped to low-risk browsing and demonstration," with "per-user rate
budgets, abuse controls, and an admin kill-switch for the research layer… in scope." The lookup route
(`lookup/route.ts`) has **no auth, no quota, no rate limit** today, and the lane design §1 explicitly
defers "No auth/quotas." But unlike a single-article lookup (one fetch), the lane endpoint is a
**fan-out amplifier** (L1): an anonymous caller spends one cheap HTTP request and triggers N upstream
Wikimedia fetches + N wikitext scans + N audit/verdict writes. This is a textbook amplification DoS
vector against *both* Wikimedia (L1) and the tool's own Worker/D1 (L2, L5).

**Impact.** On the public instance, an anonymous attacker turns `GET /api/easy-win` into a force
multiplier for every other finding here. The compliance doc treats the easy-win *queue* as the
sensitive surface (it's the BLP-floor-protected path) and says anonymous mode is "low-risk browsing" —
a fan-out crawl trigger is **not** low-risk browsing. Shipping the lane as an unauthenticated GET on a
public instance contradicts the hosted-instance commitments.

**Recommended mitigation.**
1. The design MUST state the access model for the lane on a hosted instance. At minimum: the lane
   endpoint is gated (auth or a strict per-IP rate budget) before the public instance serves it, OR the
   lane is single-user-only in v1 and not exposed on the anonymous instance. The non-goal "No
   auth/quotas this slice" is acceptable *only* if paired with "and therefore the lane is not exposed on
   the anonymous/public instance in v1" — make that pairing explicit, because the compliance doc forbids
   leaving it implicit.
2. Tie into the planned per-user rate budgets / kill-switch the compliance doc already promises rather
   than inventing a new mechanism.

**Adequately defended:** nothing yet — this is a design omission the compliance doc pre-flags.

---

### L5 — Unbounded `eligibility_verdicts` and audit-log growth from re-validation — **MEDIUM**

**Load scenario.** Two append-mostly growth paths:
- **`eligibility_verdicts`:** the table keeps history "per revision × gate_version" (design §2: a new
  revision or gate-version bump adds a row; only same-(page,rev,gate) upserts). For an article edited
  frequently (active pages get many revisions/day), every lookup at a new revision adds a row, and a
  gate-version bump adds a row *per page*. An attacker who can edit a watched article can inflate its
  revision count arbitrarily, and each lookup mints a new verdict row. Over time the table grows
  unbounded with no retention/compaction policy stated. The Stage-1 pre-filter join is on
  `revision_id = articles.revision_id` (current only), so historical rows are **dead weight for the
  query** — they're never read by the lane, only accumulate.
- **Audit log:** §7 adds an `article.eligibility.revalidated` event **per Stage-2 page per lane read.**
  With L1's uncapped fan-out and L4's anonymous trigger, every lane read writes N audit rows; repeated
  reads write N rows *each time* (re-validation isn't deduped). The audit log is append-only by
  invariant (correctly — G13), so it can *only* grow; a public instance hammering the lane inflates it
  fastest. D1 has a database-size ceiling (10 GB) and per-write cost.

**Impact.** D1 storage growth and degrading query performance; on the hosted instance an attacker
controls the growth rate cheaply (edit-to-mint-verdicts; hammer-lane-to-mint-audit-rows). Not a
correctness break — the audit log *should* be append-only — but an unbounded-growth vector with no
stated bound is a scale liability, and the append-only invariant means it can't be trimmed naively
(retention needs a compliance-aware design, not a `DELETE`).

**Recommended mitigation.**
1. **`eligibility_verdicts`:** decide a retention/compaction story now (the table is new in this
   slice). Options to put to Sam: keep only the latest verdict per `(page, gate_version)` (drop
   superseded-revision rows — history then lives only in the append-only audit log, which is the proper
   home for history anyway), or add an index supporting the Stage-1 join and accept growth with a
   documented ceiling. Don't ship an unbounded table with no plan.
2. **Audit growth:** bound it via L1's fetch cap (fewer re-validations per read) and L4's rate limit
   (fewer reads). Do **not** weaken the append-only invariant. Document expected per-read audit-row
   count = K (the cap) so growth is predictable, and note that audit retention/archival is a separate
   compliance-gated concern (out of scope here, but the *unbounded* property must be acknowledged).

**Adequately defended:** the upsert idempotency on same-(page,rev,gate) (design §2) correctly prevents
re-lookup churn from duplicating rows; the audit log's append-only invariant is correct and preserved.

---

### L6 — D1 write fan-out is non-transactional under the per-read re-validation burst — **LOW/MEDIUM**

**Scenario.** Stage 2 per page does: live fetch → re-gate → (on demotion) **refresh the persisted
verdict** + **audit the demotion** (design §4, §7). `insertCandidates`/audit/verdict writes go through
the minimal `SqlExecutor` as **separate non-atomic statements** (see `articles.ts:67-73` note: "delete +
inserts are sequential statements, not a single atomic transaction"). Under the fan-out, a lane read
issues a burst of interleaved verdict-upserts + audit-appends across N pages. If the Worker is killed
mid-fan-out (L2 CPU-kill, or upstream timeout), some pages' verdicts are refreshed and audited and
others aren't — a **partially-applied lane read**. Two concurrent lane reads (L4) interleave their
verdict refreshes on overlapping pages with last-writer-wins.

**Impact.** No corruption (each write is independently valid; the verdict table self-heals on the next
read per design §4), but: (a) an audit event can be written for a demotion whose verdict refresh didn't
land (or vice-versa) if the kill lands between the two appends → the audit trail and verdict table
momentarily disagree, which matters for a *foundational* audit log; (b) concurrent reads can write
verdict rows out of order. Low because the design's self-healing pre-filter tolerates stale verdicts and
the audit log is the source of truth — but the *atomicity gap between the verdict refresh and its audit
event* is worth closing for a foundational-audit-log project.

**Recommended mitigation.** Order writes so the **audit append is last** (audit-after-effect), so a
mid-fan-out kill never leaves an audited-but-unapplied state — at worst an applied-but-unaudited one,
which the next read re-audits. Consider D1 `batch()` for the (verdict-refresh, audit) pair per page to
make them atomic (the `articles.ts` note already anticipates batching as "an extension we don't need
yet" — the lane is where it starts being needed). Flag for Sam; don't silently rely on self-healing.

**Adequately defended:** the per-page replace + self-healing pre-filter design means no *durable*
corruption results; this is about trail consistency, not data loss.

---

### L7 — (Confirming) the no-cache decision is correct; don't let load pressure reverse it — **NOTE**

The design's refusal to cache the verdict for surfacing (§1, §5, §10 "Considered and ruled out") is the
right call: a revision-guarded cache reintroduces the BLP-category-lag durable fail-OPEN beyond the
signed-off residuals. **The adversarial concern is the reverse pressure:** L1/L2/L5 create strong
*performance* incentives to "just cache the re-check," and a future agent under load pressure might do
exactly that. Mitigation is procedural: the design already says a cache "would require new compliance
sign-off" — keep that sentence load-bearing, and prefer the **fetch-cap** (L1) and **scan-bound** (L2)
mitigations, which reduce load *without* touching the authoritative re-fetch. A micro-TTL dedup of
*concurrent* reads (L1 option 3) is the only cache-shaped change that's arguably compliant, and only
because its TTL is far below the lag window and it never authorizes a *surfacing* from stale data — put
it to Sam explicitly if pursued.

---

## Severity summary

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| L1 | Uncapped/unbounded serial fetch fan-out → G14 rate-limit/block | **HIGH** | undesigned (open Q#2 unanswered) |
| L2 | Brace-density CPU cost on advisory scan, ×N by fan-out → Worker DoS | **HIGH** | code edge (guard addresses wrong axis) |
| L3 | Edit-timing TOCTOU across pre-filter→re-validate | MEDIUM | mostly defended; doc the model + add same-revision test |
| L4 | Anonymous hosted-instance abuse of GET = amplification | **HIGH** | undesigned; compliance-flagged |
| L5 | Unbounded `eligibility_verdicts` + audit growth | MEDIUM | undesigned retention story |
| L6 | Non-atomic verdict-refresh + audit under fan-out kill | LOW/MED | self-healing softens; order audit last |
| L7 | No-cache decision correct; resist load-driven reversal | NOTE | confirming / procedural |

## What is adequately defended (credit where due)

- **Per-fetch politeness primitives** (descriptive UA, `maxlag=5`, one article per call, no enumeration
  or talk-page fetch) are correct and present (`wikimedia.ts`).
- **Re-fetch-authoritative TOCTOU posture** — the lane never surfaces from a cached verdict; the live
  re-gate + 15-min freshness fail-closed close the fail-OPEN *inclusion* direction (the only attacker
  power across the window is *exclusion*).
- **Append-only audit invariant** preserved (verdict table is the mutable upsert-history; audit stays
  append-only) — the right split.
- **Verdict upsert idempotency** on same-(page,rev,gate) prevents re-lookup duplication.
- **`strip()` + category regex** are fast even on pathological input — the ReDoS surface is narrowly the
  template-name brace regex, not the whole scan.
- **No-cache-for-surfacing decision** is the compliance-correct choice and is well-reasoned in §10.

## Top 3 the plan MUST resolve before implementation

1. **Answer open question #2 with a hard cap (L1)** + low concurrency/serial trickle, and state the
   hosted-instance access model (L4) — these are compliance (G14 + hosted-instance) decisions, not
   perf tuning, and retrofitting changes the lane's compliance posture.
2. **Bound the wikitext scan input + add adversarial brace-density tests (L2)** — fail-closed to
   `human_only` above a size threshold is the compliant direction.
3. **Decide `eligibility_verdicts` retention now (L5)** while the table is still new — keep latest per
   `(page, gate_version)` and let the append-only audit log own history.
