import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import SiteNav from "@/components/SiteNav";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ICAO Passport Photo Studio | 630×810 Converter",
  description:
    "Convert photos to ICAO-compliant 630×810px passport format with white background, face framing, and compliance checks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen font-sans antialiased text-slate-900">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
