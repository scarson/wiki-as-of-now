// ABOUTME: Ad-hoc capture page — wraps the CaptureForm client component in the dark-archival page shell.
// ABOUTME: Drop a Wikipedia title or URL into the queue (reuses lookupAndPersist via /api/queue/capture).
import { Suspense } from "react";
import Link from "next/link";
import { CaptureForm } from "./CaptureForm";

export default function CapturePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink-white">Capture an article</h1>
        <p className="mt-2 text-sm text-dust-gray">
          Paste a Wikipedia article title or a <span className="font-mono">/wiki/</span> URL to detect its
          time-bound claims and add them to the queue. Detection is fully deterministic — no AI writes or judges
          anything here.
        </p>
        <nav className="mt-3 text-sm">
          <Link href="/queue" className="text-iron-gall underline-offset-2 hover:underline">
            ← Back to the easy-win lane
          </Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-sm text-dust-gray">Loading…</p>}>
        <CaptureForm />
      </Suspense>
    </main>
  );
}
