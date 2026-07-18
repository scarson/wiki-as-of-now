import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const nextConfig: NextConfig = {
	// /privacy renders the authoritative policy markdown. The file is read HERE, at build
	// time in Node, and inlined via env — a runtime fs read 500s on the deployed worker
	// ("no such file or directory, readAll '/bundle/docs/policy/...'"): the workerd bundle's
	// virtual filesystem does not carry files outside the app tree, even when traced.
	env: {
		PRIVACY_POLICY_MD: readFileSync("docs/policy/privacy-policy.md", "utf8"),
	},
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
