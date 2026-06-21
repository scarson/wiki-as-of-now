// ABOUTME: Minimal abuse-report form (client) — posts a category code + optional claim key to /api/abuse-report.
// ABOUTME: Codes-only by construction: there is no free-text field, so no reporter prose can be sent or persisted (G13).
"use client";

import { useState } from "react";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "machine_text", label: "Machine-written article text" },
  { value: "unverified_citation", label: "Unverified or fabricated citation" },
  { value: "other", label: "Other compliance concern" },
];

const HEX64 = /^[0-9a-f]{64}$/;

export function AbuseReportForm({ issueTrackerUrl }: { issueTrackerUrl: string }) {
  const [category, setCategory] = useState("machine_text");
  const [claimKey, setClaimKey] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const key = claimKey.trim();
    if (key.length > 0 && !HEX64.test(key)) {
      setStatus("error");
      setMessage("Claim key, if given, must be 64-character lowercase hex.");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/abuse-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, ...(key.length > 0 ? { claimKey: key } : {}) }),
      });
      const body = (await res.json()) as { error?: string; reportAt?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
        return;
      }
      setStatus("done");
      setMessage("Report recorded. For details, please also open an issue on the public tracker.");
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-dust-gray">
        Flag a suspected compliance violation. This records a category only — no free text is stored. For
        details, please open an issue on the{" "}
        <a href={issueTrackerUrl} className="text-iron-gall underline-offset-2 hover:underline">
          public issue tracker
        </a>
        .
      </p>
      <label className="block text-sm text-body-gray">
        Category
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 block w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value} className="bg-archive-black">
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-body-gray">
        Claim key <span className="text-dust-gray">(optional, 64-char hex)</span>
        <input
          type="text"
          value={claimKey}
          onChange={(e) => setClaimKey(e.target.value)}
          placeholder="e.g. 3f9a…"
          className="mt-1 block w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 font-mono text-xs text-body-gray outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md bg-ledger-olive px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
      >
        {status === "sending" ? "Recording…" : "Report"}
      </button>
      {message && (
        <p
          role={status === "error" ? "alert" : "status"}
          className="text-sm text-dust-gray"
        >
          {message}
        </p>
      )}
    </form>
  );
}
