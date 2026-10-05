import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drama Studio",
  description: "Script to finished AI short-drama episode: shot breakdown, character references, keyframes, AI video, voices and export.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
