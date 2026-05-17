import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  BG_REMOVAL_PRICE_CENTS,
  PRICE_CENTS,
} from "@/lib/icao-constants";

type Product = "icao_photo" | "bg_removal";

const PRODUCTS: Record<
  Product,
  { name: string; description: string; amount: number }
> = {
  icao_photo: {
    name: "ICAO Passport Photo — HD Download",
    description: "630×810px ICAO-compliant JPEG. One-time download for this session.",
    amount: PRICE_CENTS,
  },
  bg_removal: {
    name: "Background Removal — Clean Download",
    description:
      "Download your background-removed image as transparent PNG or white JPEG. One-time download for this session.",
    amount: BG_REMOVAL_PRICE_CENTS,
  },
};

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({})) as { product?: string };
  const productKey: Product =
    body.product === "bg_removal" ? "bg_removal" : "icao_photo";
  const product = PRODUCTS[productKey];

  const stripe = new Stripe(secret);
  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const returnBase =
    productKey === "bg_removal" ? `${origin}/bg-remover` : `${origin}/`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: product.description,
          },
          unit_amount: product.amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${returnBase}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnBase}?canceled=1`,
    metadata: { product: productKey },
  });

  return NextResponse.json({ url: session.url });
}
