-- Adds the claim's contiguous section passage (claim + up to one adjacent sentence per side)
-- to stale_candidates, captured deterministically at detection time for the research layer.
-- Nullable: rows detected before this migration carry NULL until their page is re-detected.
ALTER TABLE stale_candidates ADD COLUMN surrounding_text TEXT;
