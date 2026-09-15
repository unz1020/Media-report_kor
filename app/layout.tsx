import type { Metadata } from "next";
import "./globals.css";
import "./report-ui.css";

export const metadata: Metadata = {
  title: "Media Report",
  description: "Unified advertising operations dashboard for agencies and clients."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
