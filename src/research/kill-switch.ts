// ABOUTME: Admin research kill-switch — an env flag that disables enqueue (app worker) AND the consumer (research worker).
// ABOUTME: Default is ENABLED; only an explicit truthy RESEARCH_KILL_SWITCH disables. No DB, no imports (ESLint guard, CC-5).
export class ResearchDisabledError extends Error {
  constructor(message = "research is disabled by the kill-switch") {
    super(message);
    this.name = "ResearchDisabledError";
  }
}

const TRUTHY = new Set(["1", "true", "on", "yes"]);

interface KillSwitchEnv {
  RESEARCH_KILL_SWITCH?: string;
}

/** True when research is disabled. Default off (research enabled); only an explicit truthy value turns it on. */
export function isResearchKillSwitchOn(env: KillSwitchEnv): boolean {
  const raw = env.RESEARCH_KILL_SWITCH;
  return raw !== undefined && TRUTHY.has(raw.trim().toLowerCase());
}
