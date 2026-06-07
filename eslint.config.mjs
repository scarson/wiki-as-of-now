import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
	{
		ignores: [
			".next/**",
			".open-next/**",
			".wrangler/**",
			"out/**",
			"coverage/**",
			".claude/**",
			"cloudflare-env.d.ts",
			"next-env.d.ts",
		],
	},
	...coreWebVitals,
	...typescript,
	{
		rules: {
			// Unused vars are an error, except intentionally-unused names prefixed
			// with `_` (e.g. interface params a stub/handler must accept but ignore).
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		// Worker-bundled code must not import better-sqlite3 or local-db.
		// workerd has no native module support; those are test/local-only.
		// Intentionally excludes src/db/local-db.ts itself and test/** — those
		// legitimately depend on better-sqlite3.
		files: [
			"src/research/**",
			"src/queue/**",
			"src/db/client.ts",
			"src/db/research-packs.ts",
			"src/db/audit-log.ts",
			"workers/**",
		],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/local-db", "**/db/local-db", "better-sqlite3"],
							message:
								"Worker-bundled code must not import better-sqlite3 / local-db (workerd has no native modules). Use d1Executor from db/client; betterSqliteExecutor is test/local-only.",
						},
					],
				},
			],
		},
	},
];

export default eslintConfig;
