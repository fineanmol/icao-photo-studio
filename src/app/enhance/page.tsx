import { Suspense } from "react";
import PortraitEnhancer from "@/components/PortraitEnhancer";

export const metadata = {
  title: "Portrait Enhancer — Skin Smoothing & Retouching | ICAO Photo Studio",
  description:
    "Free portrait retouching in your browser. Skin smoothing, teeth whitening, eye brightening — no upload, no data sent to servers.",
};

export default function EnhancePage() {
  return (
    <Suspense>
      <PortraitEnhancer />
    </Suspense>
  );
}
