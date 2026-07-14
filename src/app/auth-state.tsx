// ABOUTME: Client auth-state context — one fetch of /api/auth/state on mount, tri-state unknown→anonymous|authenticated.
// ABOUTME: The single client-side source of auth truth for the nav chip, home banner, and queue gate (advisory; server 401 is authoritative).
"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BrowseAuthState } from "@/app/browse-mode";

export type BrowseAuthStatus = "unknown" | BrowseAuthState;

interface AuthStateValue {
  status: BrowseAuthStatus;
  /** Flip to anonymous immediately after a successful sign-out (no refetch needed). */
  setAnonymous: () => void;
}

const AuthStateContext = createContext<AuthStateValue>({ status: "unknown", setAnonymous: () => {} });

export function useBrowseAuthState(): AuthStateValue {
  return useContext(AuthStateContext);
}

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BrowseAuthStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/state", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ authenticated?: boolean }>) : { authenticated: false }))
      .then((b) => {
        if (!cancelled) setStatus(b.authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAnonymous = useCallback(() => setStatus("anonymous"), []);

  return <AuthStateContext.Provider value={{ status, setAnonymous }}>{children}</AuthStateContext.Provider>;
}
