/**
 * Google Analytics 4 event helpers.
 * All calls are no-ops if GA_ID is not set or the gtag script hasn't loaded.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
  window.gtag?.(...args);
}

const GA_ID = "G-7WPJFRP44Q";

/** Call once per page – GA script handles this automatically, but useful for SPAs. */
export function trackPageView(url: string) {
  gtag("config", GA_ID, { page_path: url });
}

/** User uploaded a photo – top of funnel. */
export function trackPhotoUploaded(format: string) {
  gtag("event", "photo_uploaded", { format });
}

/** User clicked the payment button – intent signal. */
export function trackBeginCheckout(product: string, value: number) {
  gtag("event", "begin_checkout", {
    currency: "INR",
    value,
    items: [{ item_id: product, item_name: product, price: value, quantity: 1 }],
  });
}

/** Payment verified and access unlocked – primary conversion event. */
export function trackPurchase(product: string, value: number) {
  gtag("event", "purchase", {
    transaction_id: `${product}_${Date.now()}`,
    currency: "INR",
    value,
    items: [{ item_id: product, item_name: product, price: value, quantity: 1 }],
  });
}

/** User downloaded their file. */
export function trackDownload(product: string, exportMode?: string) {
  gtag("event", "file_download", { product, export_mode: exportMode ?? "print" });
}

/** User changed document standard (e.g. "us-passport", "schengen"). */
export function trackStandardSelected(standardId: string, standardLabel: string) {
  gtag("event", "standard_selected", { standard_id: standardId, standard_label: standardLabel });
}

/** User changed the background colour after AI removal. */
export function trackBgColorChanged(colorId: string) {
  gtag("event", "bg_color_changed", { color_id: colorId });
}

/** Red-eye removal was applied. */
export function trackRedEyeFixed(pixelsFixed: number) {
  gtag("event", "red_eye_fixed", { pixels_fixed: pixelsFixed });
}

/** User toggled the export size mode. */
export function trackExportModeChanged(mode: "print" | "portal") {
  gtag("event", "export_mode_changed", { mode });
}
