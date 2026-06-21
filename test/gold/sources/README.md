<!-- ABOUTME: Explains test/gold/sources/ — committed url-to-markdown snapshots that ground each answer record's verbatim quote. -->
<!-- ABOUTME: Naming, the contentHashSha256 contract, and the never-hand-edit rule that keeps the integrity gate meaningful. -->

# Ground-truth snapshots — evidence trail

These files are committed `url-to-markdown` transcriptions (faithful body markdown
+ YAML frontmatter) of the sources that resolve each stale claim's current state.
They exist so every answer record in [`../answers.json`](../answers.json) can be
verified offline and deterministically: the record's `verbatimQuote` is asserted
byte-present on the snapshot body, and the snapshot body hash is re-checked, by the
integrity harness ([`../answers-integrity.test.ts`](../answers-integrity.test.ts)).

## Naming

`<YYYY-MM-DD>-<slug>.md` — the date is the fetch date, the slug is derived from the
source title/URL.

## The `contentHashSha256` contract

Each `EvidenceRef.contentHashSha256` in `answers.json` is the source's
`metadata.content_hash_sha256` as reported by `url-to-markdown`'s `--json`
envelope: a SHA-256 of the markdown **body, excluding the YAML frontmatter block**
(see [`.claude/skills/url-to-markdown/SKILL.md`](../../.claude/skills/url-to-markdown/SKILL.md)).
The integrity test recomputes it with `hashSnapshotBody` (in
[`../answer-record.ts`](../answer-record.ts)) and asserts it matches the recorded
value, so a snapshot that drifts from its record fails the suite.

## Never hand-edit a snapshot

Snapshots are machine transcriptions, not editable prose. Editing one breaks
**both** gates: the `verbatimQuote` byte-presence check (the edited text no longer
contains the exact span) and the body-hash check (the body no longer hashes to the
recorded value). If a source changed, re-run `url-to-markdown` and update the
record's hash + quote together; do not patch the file by hand.
