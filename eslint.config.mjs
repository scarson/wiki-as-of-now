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
		// Covers all db data-layer modules; the Node-only local-db adapter and
		// test/** are excluded and legitimately depend on better-sqlite3.
		files: [
			"src/research/**",
			"src/queue/**",
			"src/db/**/*.ts",
			"workers/**",
		],
		ignores: ["src/db/local-db.ts"],
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
