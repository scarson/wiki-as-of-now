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
];

export default eslintConfig;
