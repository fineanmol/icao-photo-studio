import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json({ paid: false, error: "Razorpay not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ paid: false, error: "Missing payment fields" }, { status: 400 });
  }

  // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const paid = expected === razorpay_signature;

  return NextResponse.json({ paid });
}
