<!-- ABOUTME: Design note for the anonymous-capture per-IP rate limit (Workers Rate Limiting binding). -->
<!-- ABOUTME: Records the privacy constraint, the rejected alternatives, and the same-day correction that replaced the in-memory limiter. -->

# Anonymous capture rate limit — design

**Date:** 2026-07-18 (corrected same day — see the correction log) · **Scope:** `POST /api/queue/capture`

## Problem

Anonymous capture triggers a live Wikimedia fetch (responsible-access guardrail G14 in
[the compliance contract](../policy/wikipedia-genai-compliance.md)) plus D1 writes, with no
gate or rate limit. The requirement (per the session handoff): a **modest per-IP limit that
keeps anonymous capture open**.

## The constraint that shaped the design

The published privacy policy ([docs/policy/privacy-policy.md](../policy/privacy-policy.md))
promises: *"We don't associate anything with you when you browse anonymously"* and
*"Anonymous actions carry no personal identifier at all."* An IP address — even salted and
hashed — is an identifier derived from the visitor. Persisting one for anonymous requests
would break that promise unless the policy is first amended, and privacy-policy amendments
are a product decision reserved for Sam. The limiter therefore MUST NOT durably persist
anything IP-derived.

## Chosen design: the Workers Rate Limiting binding

`CAPTURE_RATE_LIMITER` (`ratelimits` in `wrangler.jsonc`, wrangler ≥ 4.36): **10 requests /
60 s per `CF-Connecting-IP`**, per Cloudflare location, no durable storage — counters live
in Cloudflare's transient per-colo rate-limit infrastructure (the same backing as WAF rate
rules), which satisfies the privacy constraint exactly as isolate memory did, with strictly
stronger enforcement (shared across isolates within a colo).

Route wiring (`src/app/api/queue/capture/route.ts`):

- **Gate order:** cross-origin refusal FIRST (a hostile page must never charge a visitor's
  budget from their browser), then `limit({ key: ip })`, then body parsing — malformed
  requests are abuse too, and the 429 path does zero work.
- **Refusal:** 429 with `Retry-After: 60` — `limit()` reports only success/failure, so the
  window length is the honest upper bound.
- **Fail-open** when the binding or the header is absent (local dev / `next dev` / preview).
  Cloudflare sets `CF-Connecting-IP` on every edge request, and both deployed envs declare
  the binding — a config test enforces it, at 10/60, with **distinct `namespace_id`s**
  (prod `1001`, dev `1002`): a shared id shares counters across Workers on the account,
  which would couple dev and prod for the same key.
- **Testing posture:** tests cover *our wiring* — key choice, gate ordering, 429 shaping,
  fail-open — against a deterministic fake of the binding's `limit()` surface. Cloudflare's
  counter mechanics are their contract, like D1's atomicity; we don't test them.

Known, accepted caveats: enforcement is per-colo (a globally distributed attacker gets one
budget per location — fine at alpha scale; a zone-level WAF rate rule remains the no-code
escalation); the binding is permissive/eventually-consistent by design; Cloudflare's docs
note IP keys can over-limit users behind shared IPs — an anonymous endpoint has no better
actor identifier, and at alpha scale (users = Sam + Claude) this is acceptable.

## Considered and ruled out

- **D1-persisted hashed-IP fixed window.** Strongest enforcement (durable, cross-colo) —
  but requires storing an IP-derived key, which the privacy promise rules out without a
  policy amendment. Available if Sam ever amends the policy.
- **Auth-gating capture.** Eliminates the anonymous surface entirely — a product-behavior
  change (who can use what), explicitly Sam's call; the standing default is "keep anonymous
  capture open."
- **Custom in-memory per-isolate limiter.** Shipped first (PR #47) and replaced the same
  day — see the correction log below. Weaker than the binding (per-isolate state; the
  post-release smoke saw requests split across isolates, each with its own budget) and ~90
  lines of custom code the binding makes unnecessary.

## Correction log

- **2026-07-18 (same day as the original).** The first version of this note rejected the
  Rate Limiting binding as "a beta `unsafe.bindings` API with unreliable emulation" that
  "cannot be exercised deterministically under TDD," and shipped a custom in-memory
  per-isolate limiter instead (PR #47). Sam challenged both claims on review; both were
  wrong. (1) The API had graduated from `unsafe.bindings` to the first-class `ratelimits`
  config key (wrangler ≥ 4.36; this repo pins ^4.98) — the claim was stale training-data
  memory asserted without checking current docs. (2) The TDD objection conflated "can't
  test Cloudflare's enforcement" with "can't test our integration" — the correct posture
  (test our wiring against a fake `limit()` surface; trust the platform's counters like we
  trust D1's atomicity) was available all along. With both objections gone the binding
  dominates: stronger enforcement, same privacy posture, less code. The in-memory module
  was removed with Sam's explicit approval.
