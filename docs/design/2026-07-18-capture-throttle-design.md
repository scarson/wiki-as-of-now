<!-- ABOUTME: Design note for the anonymous-capture per-IP throttle (in-memory fixed window). -->
<!-- ABOUTME: Records the privacy-policy constraint that ruled out durable IP storage, and the rejected alternatives. -->

# Anonymous capture throttle — design

**Date:** 2026-07-18 · **Status:** Shipped with this design's PR · **Scope:** `POST /api/queue/capture`

## Problem

Anonymous capture triggers a live Wikimedia fetch (responsible-access guardrail G14 in
[the compliance contract](../policy/wikipedia-genai-compliance.md)) plus D1 writes, with no
gate or rate limit — the one alpha-polish finding deliberately deferred from the 2026-07-18
polish batch. The requirement (per the session handoff): a **modest per-IP throttle that
keeps anonymous capture open**.

## The constraint that shaped the design

The published privacy policy ([docs/policy/privacy-policy.md](../policy/privacy-policy.md))
promises: *"We don't associate anything with you when you browse anonymously"* and
*"Anonymous actions carry no personal identifier at all."* An IP address — even salted and
hashed — is an identifier derived from the visitor. Persisting one for anonymous requests
would break that promise unless the policy is first amended, and privacy-policy amendments
are a product decision reserved for Sam. The throttle therefore MUST NOT persist anything
IP-derived.

## Considered and ruled out

- **D1-persisted hashed-IP fixed window.** Strongest enforcement (survives isolate churn,
  spans colos) and fully testable — but requires storing an IP-derived key, which the
  privacy promise rules out without a policy amendment. Available as an upgrade path if Sam
  amends the policy.
- **Cloudflare Workers rate-limiting binding.** No durable storage (per-colo memory), but
  it is a beta `unsafe.bindings` API with unreliable emulation in the vitest workers pool —
  it cannot be exercised deterministically under TDD, and it adds per-env wrangler config
  for behavior we could not test. Revisit when the binding is GA with test support.
- **Auth-gating capture.** Eliminates the anonymous surface entirely — but that is a
  product-behavior change (who can use what), explicitly Sam's call; the standing default
  is "keep anonymous capture open."

## Chosen design: in-memory per-isolate fixed window

`src/abuse/capture-throttle.ts` — a pure module, TDD'd in the node pool with an injected
clock, wired into the route and exercised end-to-end in the workers pool:

- **Key:** `CF-Connecting-IP` (set by Cloudflare on every edge request; spoof-proof at the
  edge). Absent header (local dev, `next dev`, preview without edge) → throttle skipped.
- **Window:** fixed, default **10 requests / 60 s per IP**, overridable via
  `CAPTURE_THROTTLE_LIMIT` / `CAPTURE_THROTTLE_WINDOW_SECONDS` env vars (positive-integer
  validated at load, same shape as the quota config).
- **Placement:** first thing in the POST handler, before body parsing — malformed requests
  are abuse too, and the 429 path does zero work.
- **Refusal:** HTTP 429 with a `Retry-After` header (seconds to window end) and a JSON
  error the capture form already renders.
- **Memory bound:** at most `MAX_TRACKED_KEYS` (2000) tracked keys; expired windows are
  pruned on demand, and under live-key pressure the oldest key is evicted (per-key
  fail-open). A bounded throttle must never grow unbounded or start refusing everyone.

## Honest limits (accepted, by design)

State is per-isolate: it resets when an isolate recycles, and each isolate/colo enforces
its own budget. A single-source request loop — the realistic abuse at alpha scale — lands
on the same isolate and is braked; a deliberately distributed attacker bypasses it. That
is the "modest" trade-off. Escalation paths, in order of teeth: a zone-level WAF
rate-limiting rule (Cloudflare dashboard, no code), auth-gating capture (product call), or
the durable D1 throttle (requires the privacy-policy amendment).
