import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import {
  BG_REMOVAL_PRICE_PAISE,
  PRICE_PAISE,
} from "@/lib/icao-constants";

type Product = "icao_photo" | "bg_removal";

const PRODUCTS: Record<Product, { name: string; description: string; amount: number }> = {
  icao_photo: {
    name: "ICAO Photo Studio — Lifetime Access",
    description: "Unlimited ICAO passport photos + background removals. Pay once, use forever. No watermarks.",
    amount: PRICE_PAISE,
  },
  bg_removal: {
    name: "ICAO Photo Studio — Lifetime Access",
    description: "Unlimited background removals + ICAO passport photos. Pay once, use forever. No watermarks.",
    amount: BG_REMOVAL_PRICE_PAISE,
  },
};

export async function POST(req: NextRequest) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return NextResponse.json(
      { error: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({})) as { product?: string };
  const productKey: Product =
    body.product === "bg_removal" ? "bg_removal" : "icao_photo";
  const product = PRODUCTS[productKey];

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const order = await razorpay.orders.create({
    amount: product.amount,
    currency: "INR",
    receipt: `${productKey}_${Date.now()}`,
    notes: { product: productKey },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,           // sent to client so it can open the modal
    productName: product.name,
    productDescription: product.description,
  });
}
