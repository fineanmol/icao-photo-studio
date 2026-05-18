import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICAO Passport Photo Converter — AI-Powered, ₹29 Lifetime",
  description:
    "Convert any photo to ICAO-compliant format in seconds. AI checks 10 compliance rules automatically — head tilt, eyes, expression, lighting, background. ₹29 once, use forever.",
};

/* ── static data ──────────────────────────────────────────────────────── */
const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Upload your photo",
    desc: "JPEG, PNG, HEIC, TIFF, WebP — any format, any device. Your photo never leaves your browser.",
    icon: "📷",
  },
  {
    step: "2",
    title: "AI processes it",
    desc: "Face detection, auto head-tilt correction, lighting balance, 630×810px crop — all automatic.",
    icon: "🤖",
  },
  {
    step: "3",
    title: "Check compliance & download",
    desc: "10 ICAO rules checked in real-time. Pay ₹29 once, download unlimited photos forever.",
    icon: "✅",
  },
];

const FEATURES = [
  { icon: "👁", title: "Eyes open check", desc: "Eye Aspect Ratio measured from 68 facial landmarks" },
  { icon: "😐", title: "Neutral expression", desc: "AI expression model — detects smiling, surprised, sad" },
  { icon: "📐", title: "Head pose detection", desc: "Roll angle + yaw offset measured and auto-corrected" },
  { icon: "💡", title: "Lighting balance", desc: "Left-vs-right face asymmetry detected and corrected" },
  { icon: "⬜", title: "Background removal", desc: "3 AI models — fast, balanced, best quality" },
  { icon: "📏", title: "ICAO dimensions", desc: "Exact 630×810px output, face fills 80–85% of frame" },
  { icon: "🔒", title: "100% browser-based", desc: "No upload, no server — your photos stay on your device" },
  { icon: "🖼", title: "All formats supported", desc: "HEIC from iPhone, TIFF, PNG, JPEG, WebP all accepted" },
];

const FAQ = [
  {
    q: "What is ICAO photo format?",
    a: "ICAO (International Civil Aviation Organization) sets the global standard for passport photos — 630×810px, white background, face covering 80–85% of the frame, head level, eyes open, neutral expression. Most countries' passports and visas require ICAO-compliant photos.",
  },
  {
    q: "Will my photo definitely pass at the passport office?",
    a: "Our tool automates 9 of the 10 ICAO checks and auto-corrects common issues. The final acceptance is always at the issuing authority's discretion, but a photo that passes all 10 checks is very unlikely to be rejected.",
  },
  {
    q: "Is my photo uploaded anywhere?",
    a: "No. Everything — face detection, AI processing, background removal — runs entirely in your browser using WebAssembly. Your photo is never sent to any server.",
  },
  {
    q: "What does 'lifetime access' mean?",
    a: "Pay ₹29 once and you can use both the ICAO Studio and Background Remover unlimited times, forever, with no watermarks. Access is stored in your browser — no account needed.",
  },
  {
    q: "What if I clear my browser or switch devices?",
    a: "Access is stored locally in your browser. If you clear storage or switch devices, you'd need to pay again (₹29). We're working on account-based access for a future update.",
  },
  {
    q: "Do you support iPhone photos (HEIC)?",
    a: "Yes — HEIC, HEIF, TIFF, PNG, JPEG, WebP are all supported and converted automatically.",
  },
];

/* ── components ───────────────────────────────────────────────────────── */
function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4 pb-20 pt-16 text-center sm:px-6">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-sky-100/50 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-1.5 text-sm font-medium text-sky-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            AI-powered · 100% browser · No upload
          </div>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Passport Photo,{" "}
            <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent">
              ICAO-Ready
            </span>{" "}
            in Seconds
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
            Upload any photo. AI detects your face, auto-corrects head tilt and
            lighting, removes the background, and checks all 10 ICAO compliance
            rules — automatically.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/studio"
              className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-violet-700 hover:shadow-sky-300"
            >
              Convert my photo →
            </Link>
            <Link
              href="/bg-remover"
              className="rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Remove background
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-400">
            Free preview · ₹29 one-time to download · No subscription ever
          </p>
        </div>

        {/* Stats bar */}
        <div className="relative mx-auto mt-16 flex max-w-lg flex-wrap justify-center gap-8 rounded-2xl border border-slate-100 bg-white px-8 py-6 shadow-sm">
          <StatBadge value="10" label="ICAO rules checked" />
          <div className="hidden h-10 w-px self-center bg-slate-100 sm:block" />
          <StatBadge value="9/10" label="Automated by AI" />
          <div className="hidden h-10 w-px self-center bg-slate-100 sm:block" />
          <StatBadge value="₹29" label="Lifetime, one-time" />
          <div className="hidden h-10 w-px self-center bg-slate-100 sm:block" />
          <StatBadge value="0" label="Servers see your photo" />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
            <p className="mt-3 text-slate-500">Three steps, under 30 seconds</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="relative rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-2xl">
                  {item.icon}
                </div>
                <div className="absolute right-5 top-5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {item.step}
                </div>
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">What the AI checks & fixes</h2>
            <p className="mt-3 text-slate-500">
              Most tools just crop. Ours analyses and corrects.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold text-slate-900">Simple, honest pricing</h2>
          <p className="mt-3 text-slate-500">No subscription. No per-download fees. Just ₹29 once.</p>

          <div className="mt-10 rounded-3xl border-2 border-sky-200 bg-gradient-to-b from-sky-50 to-white p-8 shadow-lg shadow-sky-100">
            <div className="flex items-end justify-center gap-2">
              <span className="text-5xl font-extrabold text-slate-900">₹29</span>
              <span className="mb-1.5 text-lg text-slate-500">/ lifetime</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">One-time payment · No account needed</p>

            <ul className="mt-6 space-y-3 text-left text-sm text-slate-700">
              {[
                "Unlimited ICAO passport photo conversions",
                "Unlimited AI background removals",
                "10 automated compliance checks",
                "Auto head-tilt & lighting correction",
                "Download as JPEG, PNG, or transparent PNG",
                "All future features included",
                "No watermarks, ever",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/studio"
              className="mt-8 block w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 py-3.5 text-center text-sm font-bold text-white shadow-md transition hover:from-sky-600 hover:to-violet-700"
            >
              Get lifetime access — ₹29
            </Link>
            <p className="mt-3 text-xs text-slate-400">
              Try free first · Pay only when you download
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-10 text-center text-3xl font-bold text-slate-900">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-900">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl bg-gradient-to-br from-sky-500 to-violet-600 px-8 py-14 text-center shadow-2xl shadow-sky-200">
          <h2 className="text-3xl font-bold text-white">
            Your ICAO photo is 30 seconds away
          </h2>
          <p className="mt-4 text-sky-100">
            Free to try. ₹29 to download. Works on any device, no app needed.
          </p>
          <Link
            href="/studio"
            className="mt-8 inline-block rounded-2xl bg-white px-10 py-4 text-base font-bold text-sky-600 shadow-lg transition hover:bg-sky-50"
          >
            Convert my photo now →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-400 sm:px-6">
        <div className="mx-auto max-w-5xl flex flex-wrap justify-center gap-6 mb-6">
          <Link href="/studio" className="hover:text-slate-600">Passport Studio</Link>
          <Link href="/bg-remover" className="hover:text-slate-600">Background Remover</Link>
        </div>
        <p>
          AI compliance checks are indicative. Final acceptance is at the issuing authority&apos;s discretion.
        </p>
        <p className="mt-1">© {new Date().getFullYear()} ICAO Photo Studio</p>
      </footer>
    </div>
  );
}
