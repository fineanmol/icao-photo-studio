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
  return (
    <html lang="en" className={dmSans.variable}>
      <head>
        {/* Google Tag Manager */}
        <Script id="gtm-head" strategy="beforeInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PVKLCHK2');`}
        </Script>
        {/* Google Analytics 4 — G-7WPJFRP44Q */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-7WPJFRP44Q"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-7WPJFRP44Q');`}
        </Script>
      </head>
      <body className="min-h-screen font-sans antialiased text-slate-900">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-PVKLCHK2"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
