import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MIRA — your AI career mentor",
  description:
    "Multi-agent Intelligence for Resume Analysis. Paste a resume + JD, get a personalized study plan.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
