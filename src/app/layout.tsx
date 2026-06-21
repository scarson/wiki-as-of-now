// ABOUTME: Root layout — global fonts, styles, and document metadata for the WikiAsOfNow app.
// ABOUTME: Wraps every page; sets the app title/description shown in the browser and to crawlers.
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

// Scholarly serif for display moments and claim sentences under review
// (DESIGN.md §3 — serif display over humanist sans, weight 500–600).
const sourceSerif = Source_Serif_4({
	variable: "--font-source-serif",
	weight: ["400", "500", "600"],
	style: ["normal", "italic"],
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "WikiAsOfNow",
	description: "Find stale time-bound claims in Wikipedia articles with a deterministic detector.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} antialiased`}>
				{/* Global nav — the only cross-page entry point into the easy-win lane and About.
				    Iron-gall links per the Two Lanes Rule; the global :focus-visible ring (globals.css)
				    makes every link keyboard-reachable. */}
				<nav className="border-b border-hairline-gray bg-shelf-gray">
					<div className="mx-auto flex max-w-3xl items-baseline gap-6 px-6 py-3">
						<Link href="/" className="font-serif text-sm font-medium text-ink-white underline-offset-2 hover:underline">
							WikiAsOfNow
						</Link>
						<div className="flex gap-5 text-sm">
							<Link href="/queue" className="text-iron-gall underline-offset-2 hover:underline">
								Easy-win lane
							</Link>
							<Link href="/about" className="text-iron-gall underline-offset-2 hover:underline">
								About
							</Link>
						</div>
					</div>
				</nav>
				{children}
			</body>
		</html>
	);
}
