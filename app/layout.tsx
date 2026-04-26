import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PersonaForge — Clone yourself, deploy on-chain",
  description:
    "Upload yourself. Deploy a face-and-voice clone that takes meetings and votes in your DAOs. Built for the 2026 BETA Hackathon.",
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
