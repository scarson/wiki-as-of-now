// ABOUTME: /privacy — renders the authoritative docs/policy/privacy-policy.md (inlined at build via next.config
// ABOUTME: env) with markdown-to-jsx. Single source of truth is the markdown file; no runtime filesystem read.
import Markdown from "markdown-to-jsx";

export const dynamic = "force-static";

export default function PrivacyPage() {
  // Inlined at build by next.config.ts (env.PRIVACY_POLICY_MD ← docs/policy/privacy-policy.md).
  // A runtime fs read is not an option: the deployed worker's bundle has no /docs filesystem.
  const md = process.env.PRIVACY_POLICY_MD;
  if (!md) throw new Error("PRIVACY_POLICY_MD missing — next.config.ts must inline docs/policy/privacy-policy.md");
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-body-gray">
      <Markdown options={{ overrides: {
        h1: { props: { className: "font-serif text-3xl font-medium tracking-tight text-ink-white mb-2" } },
        h2: { props: { className: "font-serif text-lg font-medium text-ink-white mt-8 mb-3" } },
        p:  { props: { className: "mt-3 text-dust-gray" } },
        ul: { props: { className: "mt-2 list-disc space-y-1 pl-5 text-dust-gray" } },
        a:  { props: { className: "text-iron-gall underline-offset-2 hover:underline" } },
      } }}>{md}</Markdown>
    </main>
  );
}
