import { Suspense } from "react";
import type { Metadata } from "next";
import PhotoStudio from "@/components/PhotoStudio";

export const metadata: Metadata = {
  title: "ICAO Passport Photo Studio — Convert & Download",
  description:
    "Convert your photo to ICAO-compliant 630×810px format with AI compliance checks. Auto head-tilt correction, background removal, instant download.",
};

export default function StudioPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-sky-50/40">
      <Suspense>
        <PhotoStudio />
      </Suspense>
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>
          Automated checks assist compliance with ICAO guidelines; final acceptance is at the
          issuing authority&apos;s discretion.
        </p>
      </footer>
    </main>
  );
}
