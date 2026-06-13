// ABOUTME: Root layout — global fonts, styles, and document metadata for the WikiAsOfNow app.
// ABOUTME: Wraps every page; sets the app title/description shown in the browser and to crawlers.
import type { Metadata } from "next";
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
			<body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} antialiased`}>{children}</body>
		</html>
	);
}
