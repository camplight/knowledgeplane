import type { Metadata } from "next";
import { DM_Serif_Display, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "./providers";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KnowledgePlane",
  description: "Shared Workspace Memory for AI Agents",
};

// Force all routes to be dynamic - webapp is fully dynamic
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className={`${dmSerif.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}

