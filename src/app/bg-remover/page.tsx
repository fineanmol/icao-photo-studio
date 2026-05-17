import { Suspense } from "react";
import type { Metadata } from "next";
import BgRemover from "@/components/BgRemover";

export const metadata: Metadata = {
  title: "Background Remover — ICAO Photo Studio",
  description:
    "Remove backgrounds from photos instantly with AI — runs entirely in your browser. Download as transparent PNG or white-background JPEG.",
};

export default function BgRemoverPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <Suspense>
        <BgRemover />
      </Suspense>
    </main>
  );
}
