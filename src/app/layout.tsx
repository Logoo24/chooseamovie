import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ChooseAMovie",
  description: "Create a group, share a link, and rate movies together.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
