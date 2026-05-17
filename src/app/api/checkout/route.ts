import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PRICE_CENTS } from "@/lib/icao-constants";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local" },
      { status: 503 },
    );
  }

  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "ICAO Passport Photo — HD Download",
            description:
              "630×810px ICAO-compliant JPEG. One-time download for this session.",
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?canceled=1`,
    metadata: { product: "icao_photo_download" },
  });

  return NextResponse.json({ url: session.url });
}
