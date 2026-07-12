import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
// Dev-only: this helper starts a wrangler dev session to expose bindings locally; in production the
// worker entrypoint supplies the context instead. It must NOT run during `next build` — the AI binding
// is `remote: true` (no local emulation), so the session would try remote mode and fail without a
// logged-in Cloudflare account ("You must be logged in to use wrangler dev in remote mode"), which is
// the state in CI. `next dev` sets NODE_ENV=development; `next build`/`next start` set production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") {
	void initOpenNextCloudflareForDev();
}
