import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ paid: false, error: "Missing session_id" }, { status: 400 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ paid: false, error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secret);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // Accept either product — both are valid paid sessions
  const validProducts = ["icao_photo", "bg_removal"];
  const paid =
    session.payment_status === "paid" &&
    validProducts.includes(session.metadata?.product ?? "");

  return NextResponse.json({ paid });
}
