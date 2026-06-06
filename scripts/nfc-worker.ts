// ABOUTME: One-shot Worker used by gen-nfc-golden to run normalizeForVerbatim on the workerd runtime.
// ABOUTME: Returns the NFC/whitespace-normalized POST body so the golden fixture captures workerd output.
import { normalizeForVerbatim } from "../src/research/normalize";

const handler = {
  async fetch(request: Request): Promise<Response> {
    const body = await request.text();
    return new Response(normalizeForVerbatim(body));
  },
};

export default handler;
