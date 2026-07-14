// ABOUTME: Global nav auth chip — reserved-width unknown state, browseModeLabel + Sign in when anonymous, label + sign-out when authenticated.
// ABOUTME: Sign-out POSTs /api/auth/logout then flips the shared auth state to anonymous (advisory UI; server 401 stays authoritative).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrowseAuthState } from "@/app/auth-state";
import { browseModeLabel } from "@/app/browse-mode";

export function NavAuthChip() {
  const { status, setAnonymous } = useBrowseAuthState();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reserve width so the nav doesn't shift when the fetch resolves (widest resolved
  // state is "Browsing as a guest" + Sign in).
  if (status === "unknown") {
    return <span className="ml-auto inline-block w-48" aria-hidden="true" />;
  }

  if (status === "anonymous") {
    return (
      <span className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-dust-gray">{browseModeLabel(status)}</span>
        <a href="/api/auth/google" className="text-iron-gall underline-offset-2 hover:underline">
          Sign in
        </a>
      </span>
    );
  }

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        setAnonymous();
        router.refresh();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-dust-gray">{browseModeLabel(status)}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-iron-gall underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {failed && (
        <span role="alert" className="text-oxidized-rust">
          Sign-out failed — retry
        </span>
      )}
    </div>
  );
}
