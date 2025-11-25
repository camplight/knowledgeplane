import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "./providers";

export const metadata: Metadata = {
  title: "KnowledgePlane",
  description: "Shared Team Memory for AI Agents",
};

// Force all routes to be dynamic - webapp is fully dynamic
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}

