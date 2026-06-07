// ABOUTME: Regenerates the workerd NFC golden fixture by running NFC_CORPUS through normalizeForVerbatim
// ABOUTME: on the workerd runtime (via wrangler unstable_dev). Run: pnpm gen:nfc-golden
import { unstable_dev } from "wrangler";
import { writeFileSync } from "node:fs";
import { NFC_CORPUS } from "../test/fixtures/nfc-corpus.ts";

const worker = await unstable_dev("scripts/nfc-worker.ts", {
  config: "scripts/wrangler-nfc-worker.json",
  experimental: { disableExperimentalWarning: true },
});
try {
  const out: { input: string; output: string }[] = [];
  for (const input of NFC_CORPUS) {
    const res = await worker.fetch("http://x/", { method: "POST", body: input });
    out.push({ input, output: await res.text() });
  }
  writeFileSync("test/fixtures/nfc-golden-workerd.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${out.length} golden cases`);
} finally {
  await worker.stop();
}
