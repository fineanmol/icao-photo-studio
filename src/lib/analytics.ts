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

/** Call once per page – GA script handles this automatically, but useful for SPAs. */
export function trackPageView(url: string) {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return;
  gtag("config", id, { page_path: url });
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
export function trackDownload(product: string) {
  gtag("event", "file_download", { product });
}
