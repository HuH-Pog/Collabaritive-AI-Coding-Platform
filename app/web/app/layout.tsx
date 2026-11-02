import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeTogether — Real-time Collaborative Coding Platform",
  description:
    "Write, run, and discuss code in real-time. Collaborative editor powered by Yjs and Monaco with role permissions and integrated room chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body>{children}</body>
    </html>
  );
}
