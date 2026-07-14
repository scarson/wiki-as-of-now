// ABOUTME: Public About/compliance page — renders the human-authored aboutContent() constants (G1).
// ABOUTME: No model prose: server-renders static content from the compliance contract; links the canonical doc + repo.
import Link from "next/link";
import { aboutContent } from "@/about/compliance-content";
import { AbuseReportForm } from "./AbuseReportForm";

export const dynamic = "force-static";

export default function AboutPage() {
  const c = aboutContent();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink-white">About WikiAsOfNow</h1>
        <p className="mt-3 text-sm leading-relaxed text-body-gray">{c.intro}</p>
      </header>

      <section aria-label="What the tool does" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">What the tool does</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-body-gray">
          {c.willDo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="What the tool will never do" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">What the tool will never do</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-body-gray">
          {c.willNeverDo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="The guardrails" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">The guardrails</h2>
        <p className="mb-3 text-sm text-dust-gray">
          These are the project&apos;s binding invariants, written to keep the tool inside Wikipedia&apos;s
          generative-AI guideline{" "}
          <a href={c.wikipediaPolicyUrl} className="text-iron-gall underline-offset-2 hover:underline">
            {c.wikipediaPolicyTitle}
          </a>
          . The authoritative text lives in the{" "}
          <a
            href={`${c.repoUrl}/blob/main/${c.complianceContractPath}`}
            className="text-iron-gall underline-offset-2 hover:underline"
          >
            compliance contract
          </a>
          ; the summaries below are orientation only.
        </p>
        <dl className="space-y-3">
          {c.guardrails.map((g) => (
            <div key={g.id} className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3">
              <dt className="text-sm font-medium text-ink-white">
                {g.name} <span className="font-mono text-xs text-dust-gray">({g.id})</span>
              </dt>
              <dd className="mt-1 text-sm text-dust-gray">{g.summary}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Report a concern" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">Report a concern</h2>
        <AbuseReportForm issueTrackerUrl={c.abuseReportUrl} />
      </section>

      <section aria-label="Feedback and community" className="mb-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">Feedback &amp; community</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-body-gray">
          <li>
            General feedback and questions:{" "}
            <a
              href={`${c.repoUrl}/discussions`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-iron-gall underline-offset-2 hover:underline"
            >
              GitHub Discussions
            </a>
          </li>
          <li>
            Bug reports:{" "}
            <a
              href={`${c.repoUrl}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-iron-gall underline-offset-2 hover:underline"
            >
              GitHub Issues
            </a>
          </li>
        </ul>
      </section>

      <footer className="mt-12 border-t border-hairline-gray pt-4 text-xs text-dust-gray">
        <p>
          Open source:{" "}
          <a href={c.repoUrl} className="text-iron-gall underline-offset-2 hover:underline">
            {c.repoUrl}
          </a>
        </p>
        <p className="mt-1">
          <Link href="/" className="text-iron-gall underline-offset-2 hover:underline">
            Back to search
          </Link>
        </p>
      </footer>
    </main>
  );
}
