import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisionQuery",
  description: "Natural-language search for video surveillance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
