// ABOUTME: Show-your-work view — renders a research pack's selected evidence, dropped dispositions, and query log (G6/G7).
// ABOUTME: Thin glue: resolves D1, calls getSurfaceablePack + toTransparencyView, renders in the dark archival system.
import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getSurfaceablePack } from "@/db/research-packs";
import { toTransparencyView } from "@/transparency/surface-pack";
import { EvidenceCard } from "@/app/worksheet/components/EvidenceCard";

export const dynamic = "force-dynamic";

/** Calm, archival degradation panel — a degraded read is a "recompute it" note, never a red alarm. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-dust-gray">{children}</p>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-hairline-gray pt-4 text-xs text-dust-gray">
      <Link href="/about" className="text-iron-gall underline-offset-2 hover:underline">
        About &amp; compliance
      </Link>
    </footer>
  );
}

export default async function TransparencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ claimKey?: string }>;
}) {
  const { id } = await params;
  const { claimKey } = await searchParams;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0 || !claimKey) {
    return <Notice>Invalid transparency request — a page id and claim key are required.</Notice>;
  }

  const { env } = getCloudflareContext();
  const read = await getSurfaceablePack(d1Executor(env.DB), claimKey, pageId);
  const view = toTransparencyView(read);

  if (view.kind === "unreadable") {
    return <Notice>This research pack could not be read and should be recomputed.</Notice>;
  }
  if (view.kind === "not_found") {
    return <Notice>No current research pack for this claim at the article&apos;s present revision.</Notice>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-2xl font-medium tracking-tight text-ink-white">How this was researched</h1>
        <p className="mt-2 text-sm text-dust-gray">
          Everything the AI assistant searched, selected, and dropped for this claim. The AI never writes article
          text — it points at sources a human must open and verify.
        </p>
        {/* G12 disclosure: the model + version that produced this pack, in Evidence Mono. */}
        <p className="mt-3 font-mono text-xs text-dust-gray">
          {view.providerName} · {view.modelVersion} · evaluated {view.evaluatedAt}
        </p>
      </header>

      <section aria-label="Selected evidence" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">Selected evidence</h2>
        {view.selected.length === 0 ? (
          <p className="text-sm text-dust-gray">No evidence was surfaced for this claim.</p>
        ) : (
          <ul className="space-y-4">
            {view.selected.map((c) => (
              <li key={c.url}>
                <EvidenceCard card={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dropped candidates — the full candidate set (G7). Evidence lane, never a red error (Two Lanes Rule). */}
      <section aria-label="Dropped candidates" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">
          Dropped candidates{" "}
          <span className="font-normal text-dust-gray">— {view.dropped.length}</span>
        </h2>
        {view.dropped.length === 0 ? (
          <p className="text-sm text-dust-gray">No candidates were dropped.</p>
        ) : (
          <ul className="space-y-2">
            {view.dropped.map((d) => (
              <li
                key={d.url}
                className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm"
              >
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-iron-gall underline underline-offset-2 break-all"
                >
                  {d.url}
                </a>
                <p className="mt-1 text-dust-gray">{d.reasonLabel}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The disposable navigation queries the LLM used (G9), shown to the human, never persisted into an edit. */}
      <section aria-label="Search queries" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">
          Search queries used{" "}
          <span className="font-normal text-dust-gray">— {view.queries.length}</span>
        </h2>
        {view.queries.length === 0 ? (
          <p className="text-sm text-dust-gray">No search queries were recorded.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-body-gray">
            {view.queries.map((q) => (
              <li key={q} className="rounded bg-shelf-gray px-3 py-2">
                {q}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Footer />
    </main>
  );
}
