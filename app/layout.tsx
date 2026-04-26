import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ImpactLens — accessibility-first grant evaluation",
  description:
    "Every builder deserves a fair shot. No voice required. No fakers rewarded. Multimodal pitches, GitHub-grounded scoring, on-chain EAS attestation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
