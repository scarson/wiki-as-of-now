// ABOUTME: The per-source G5 gate — "I opened and read this source" checkbox + Confirm that POSTs /api/sources/open.
// ABOUTME: The unlock fires ONLY after the audit commit returns { unlocked: true }; the checkbox alone does nothing (G5).
"use client";

import { useState } from "react";

interface SourceOpenGateProps {
  claimKey: string;
  sourceRevisionId: number;
  url: string;
  opened: boolean;
  onOpened: (url: string) => void;
}

export function SourceOpenGate({ claimKey, sourceRevisionId, url, opened, onOpened }: SourceOpenGateProps) {
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<"idle" | "confirming" | "error">("idle");

  async function confirm() {
    setStatus("confirming");
    try {
      const res = await fetch("/api/sources/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimKey, sourceRevisionId, url }),
      });
      const body = (await res.json()) as { unlocked?: boolean };
      if (res.ok && body.unlocked === true) {
        onOpened(url);
        setStatus("idle");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (opened) {
    return (
      <p className="mt-2 font-mono text-xs text-ledger-olive-bright" role="status">
        ✓ source opened and logged
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-body-gray">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="accent-[var(--ledger-olive)]"
        />
        I opened and read this source
      </label>
      <button
        type="button"
        onClick={confirm}
        disabled={!checked || status === "confirming"}
        className="rounded-md bg-ledger-olive px-3 py-1.5 text-sm font-medium text-ink-white transition disabled:opacity-50"
      >
        {status === "confirming" ? "Confirming…" : "Confirm"}
      </button>
      {status === "error" && (
        <span role="alert" className="text-xs text-dust-gray">
          could not record — try again
        </span>
      )}
    </div>
  );
}
