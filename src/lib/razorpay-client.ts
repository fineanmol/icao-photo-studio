/**
 * Client-side Razorpay helpers.
 * Lazily loads the Razorpay checkout script and opens the payment modal.
 * No page redirect — the modal appears in-place, making UX smoother.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export type RazorpayPaymentResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number | string;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  handler: (response: RazorpayPaymentResult) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  close: () => void;
};

/** Injects the Razorpay checkout.js script once, resolves when ready. */
function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("SSR")); return; }
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay script"));
    document.body.appendChild(script);
  });
}

export type OpenCheckoutOptions = {
  product: "icao_photo" | "bg_removal";
  /** Called with the verified result — server signature check already done. */
  onSuccess: () => void;
  onDismiss?: () => void;
  onError?: (msg: string) => void;
};

/**
 * Full payment flow:
 * 1. POST /api/checkout  → get Razorpay order details
 * 2. Load Razorpay script
 * 3. Open modal
 * 4. On payment: POST /api/verify → confirm signature
 * 5. Call onSuccess / onError
 */
export async function openRazorpayCheckout(opts: OpenCheckoutOptions): Promise<void> {
  const { product, onSuccess, onDismiss, onError } = opts;

  // Step 1 — create order on our server
  const orderRes = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product }),
  });

  if (!orderRes.ok) {
    const d = await orderRes.json().catch(() => ({})) as { error?: string };
    onError?.(d.error ?? "Could not create payment order. Please try again.");
    return;
  }

  const orderData = await orderRes.json() as {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    productName: string;
    productDescription: string;
  };

  // Step 2 — load Razorpay JS
  await loadScript();

  // Step 3 — open modal
  const rzp = new window.Razorpay({
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    name: "ICAO Photo Studio",
    description: orderData.productDescription,
    order_id: orderData.orderId,
    theme: { color: "#0ea5e9" },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
    handler: async (response) => {
      // Step 4 — verify signature server-side
      try {
        const verifyRes = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        });
        const result = await verifyRes.json() as { paid: boolean; error?: string };
        if (result.paid) {
          onSuccess();
        } else {
          onError?.(result.error ?? "Payment could not be verified. Contact support.");
        }
      } catch {
        onError?.("Network error during verification. Please contact support.");
      }
    },
  });

  rzp.open();
}
