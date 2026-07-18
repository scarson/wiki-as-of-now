// ABOUTME: Global nav auth chip — reserved-width unknown state, browseModeLabel + Sign in when anonymous, label +
// ABOUTME: sign-out + delete-account confirm when authenticated. One op state so the two actions never overlap.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrowseAuthState } from "@/app/auth-state";
import { browseModeLabel } from "@/app/browse-mode";

export function NavAuthChip() {
  const { status, setAnonymous } = useBrowseAuthState();
  const router = useRouter();
  // One in-flight operation at a time: sign-out and delete share the lock so the
  // UI never shows conflicting labels ("Signing out…" during a delete).
  const [op, setOp] = useState<"idle" | "signout" | "delete">("idle");
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Reserve width so the nav doesn't shift when the fetch resolves (widest resolved
  // state is the authenticated row: label + Sign out + Delete account).
  if (status === "unknown") {
    return <span className="ml-auto inline-block w-64" aria-hidden="true" />;
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
    setOp("signout");
    setSignOutFailed(false);
    setDeleteFailed(false);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        setAnonymous();
        router.refresh();
      } else {
        setSignOutFailed(true);
      }
    } catch {
      setSignOutFailed(true);
    } finally {
      setOp("idle");
    }
  }

  async function deleteAccount() {
    setOp("delete");
    setDeleteFailed(false);
    setSignOutFailed(false);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        setAnonymous();
        router.refresh();
      } else {
        setDeleteFailed(true);
      }
    } catch {
      setDeleteFailed(true);
    } finally {
      setOp("idle");
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-dust-gray">{browseModeLabel(status)}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={op !== "idle"}
        className="text-iron-gall underline-offset-2 hover:underline disabled:opacity-50"
      >
        {op === "signout" ? "Signing out…" : "Sign out"}
      </button>
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setDeleteFailed(false);
          }}
          disabled={op !== "idle"}
          className="text-oxidized-rust underline-offset-2 hover:underline disabled:opacity-50"
        >
          Delete account
        </button>
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-dust-gray">Permanently delete your account?</span>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={op !== "idle"}
            className="text-oxidized-rust underline-offset-2 hover:underline disabled:opacity-50"
          >
            {op === "delete" ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setDeleteFailed(false);
            }}
            disabled={op === "delete"}
            className="text-iron-gall underline-offset-2 hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </span>
      )}
      {signOutFailed && (
        <span role="alert" className="text-oxidized-rust">
          Sign-out failed — retry
        </span>
      )}
      {deleteFailed && (
        <span role="alert" className="text-oxidized-rust">
          Delete failed — retry
        </span>
      )}
    </div>
  );
}
