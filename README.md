# ICAO Passport Photo Studio

Single-page commercial web app that converts portraits to **ICAO-compliant 630×810px** passport photos (per your Guidelines for ICAO.pdf).

## Features

- Exact **630 × 810** pixel output
- **White background** whitening
- **Face auto-detection** with manual framing (80–85% face scale)
- Adjustments: position, brightness, contrast, saturation, sharpen
- **Compliance checklist** (automated + manual ICAO items)
- **Stripe Checkout** for paid downloads (watermarked preview until paid)
- **Browser-only processing** — images never leave the client
- **Formats:** JPG, PNG, WebP, **HEIC/HEIF**, GIF, BMP, AVIF, TIFF (HEIF/TIFF converted locally)
- **Local watermark** — preview overlay + test download (see below)

## Quick start

```bash
npm install
npm run models   # face-api weights (also runs on postinstall)
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test the watermark (local)

1. Upload and process any photo.
2. In the sidebar, open **Watermark (local)**.
3. Toggle **Show watermark on preview** to compare with/without overlay.
4. Click **Download watermarked JPEG (test)** — saves the exact preview customers see before payment.

Or open: [http://localhost:3000/?testWatermark=1](http://localhost:3000/?testWatermark=1)

For local testing without Stripe, set in `.env.local`:

```
NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD=true
```

## Stripe (production)

1. Create a [Stripe](https://stripe.com) account.
2. Add to `.env.local`:

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD=false
```

3. Deploy (Vercel recommended). Set the same env vars in the dashboard.

Price is **$4.99** per download (`PRICE_CENTS` in `src/lib/icao-constants.ts`).

## Deploy

```bash
npm run build
npm start
```

## ICAO reference

Requirements are implemented from `Guidelines for ICAO.pdf` in this repo (630×810, white background, face 80–85%, front view, etc.). Final acceptance remains with the passport office.
