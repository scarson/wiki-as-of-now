// ABOUTME: /privacy — renders the authoritative docs/policy/privacy-policy.md at build (force-static) via markdown-to-jsx.
// ABOUTME: Single source of truth is the markdown file; this route only presents it (prerendered, no runtime fs read).
import { readFile } from "node:fs/promises";
import path from "node:path";
import Markdown from "markdown-to-jsx";

export const dynamic = "force-static";

export default async function PrivacyPage() {
  const md = await readFile(path.join(process.cwd(), "docs/policy/privacy-policy.md"), "utf8");
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
