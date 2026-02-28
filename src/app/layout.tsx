import "./globals.css";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AuthBootstrap } from "@/components/AuthBootstrap";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChooseAMovie",
  description: "Create a group, share a link, and rate movies together.",
  verification: {
    google: "NkT29ROai7BiN8x8nWiszWLsu75KMPdGPa0roB8lfTg",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.className}>
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
