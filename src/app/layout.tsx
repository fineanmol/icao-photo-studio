import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
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
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen font-sans antialiased text-slate-900">
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
