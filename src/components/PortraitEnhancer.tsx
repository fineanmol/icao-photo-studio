"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FILE_INPUT_ACCEPT, prepareImageFile, SUPPORTED_FORMATS_LABEL } from "@/lib/image-loader";
import {
  applySkinSmooth,
  applyTeethWhiten,
  applyEyeBrighten,
  applyVignette,
} from "@/lib/skin-smooth";
import { canvasToBlob } from "@/lib/icao-processor";
import { openRazorpayCheckout } from "@/lib/razorpay-client";
import { PRICE_DISPLAY } from "@/lib/icao-constants";
import { trackPhotoUploaded, trackDownload } from "@/lib/analytics";

const STORAGE_KEY = "icao_lifetime_paid";
const IS_DEV = process.env.NODE_ENV === "development";

type EnhanceSettings = {
  skinSmooth:    number; // 0–100
  teethWhiten:   number; // 0–100
  eyeBrighten:   number; // 0–100
  vignette:      number; // 0–100
};

const DEFAULT_SETTINGS: EnhanceSettings = {
  skinSmooth:  0,
  teethWhiten: 0,
  eyeBrighten: 0,
  vignette:    0,
};

// ─── helpers ───────────────────────────────────────────────────────────────

function Slider({
  label, sublabel, icon, value, onChange, disabled,
}: {
  label: string; sublabel: string; icon: string;
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{icon} {label}</p>
          <p className="text-xs text-slate-500">{sublabel}</p>
        </div>
        <span className="text-sm font-bold text-indigo-700 tabular-nums w-8 text-right">{value}</span>
      </div>
      <input
        type="range" min={0} max={100} step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-indigo-700 disabled:opacity-40"
      />
    </div>
  );
}

// ─── component ─────────────────────────────────────────────────────────────

export default function PortraitEnhancer() {
  const searchParams = useSearchParams();

  const [sourceUrl,  setSourceUrl]  = useState<string | null>(null);
  const [settings,   setSettings]   = useState<EnhanceSettings>(DEFAULT_SETTINGS);
  const [processing, setProcessing] = useState(false);
  const [paid,       setPaid]       = useState(IS_DEV);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState("photo");

  const fileRef    = useRef<HTMLInputElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const origImgRef = useRef<HTMLImageElement | null>(null);
  const revokeRef  = useRef<(() => void) | null>(null);

  // Payment check
  useEffect(() => {
    if (IS_DEV || localStorage.getItem(STORAGE_KEY) === "1") setPaid(true);
    if (searchParams.get("success") === "1") setPaid(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── render settings onto canvas ────────────────────────────────────────
  const applySettings = useCallback((img: HTMLImageElement, s: EnhanceSettings) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    const w = canvas.width, h = canvas.height;

    if (s.skinSmooth  > 0) applySkinSmooth(ctx, w, h, { strength: s.skinSmooth / 100 });
    if (s.teethWhiten > 0) applyTeethWhiten(ctx, w, h, { strength: s.teethWhiten / 100 });
    if (s.eyeBrighten > 0) applyEyeBrighten(ctx, w, h, { strength: s.eyeBrighten / 100 });
    if (s.vignette    > 0) applyVignette(ctx, w, h, s.vignette / 200); // scale to 0–0.5
  }, []);

  // Re-render whenever settings or source change
  useEffect(() => {
    const img = origImgRef.current;
    if (!img || !sourceUrl) return;
    setProcessing(true);
    // Use requestAnimationFrame to avoid blocking the UI
    requestAnimationFrame(() => {
      applySettings(img, settings);
      setProcessing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, sourceUrl]);

  // ── file load ───────────────────────────────────────────────────────────
  const onFile = async (file: File) => {
    setError(null);
    setSettings(DEFAULT_SETTINGS);
    try {
      revokeRef.current?.();
      const prepared = await prepareImageFile(file);
      revokeRef.current = prepared.revoke;
      setSourceUrl(prepared.url);
      setOriginalFileName(file.name.replace(/\.[^/.]+$/, "") || "photo");
      trackPhotoUploaded(file.type || "unknown");

      const img = new Image();
      img.onload = () => {
        origImgRef.current = img;
        applySettings(img, DEFAULT_SETTINGS);
      };
      img.src = prepared.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load image.");
    }
  };

  // ── download ────────────────────────────────────────────────────────────
  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    trackDownload("portrait_enhance");
    const blob = await canvasToBlob(canvas, 0.95);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${originalFileName}-enhanced.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── checkout ────────────────────────────────────────────────────────────
  const startCheckout = async () => {
    if (IS_DEV) { setPaid(true); return; }
    setCheckoutLoading(true);
    setError(null);
    try {
      await openRazorpayCheckout({
        product: "portrait_enhance",
        onSuccess: () => {
          setPaid(true);
          localStorage.setItem(STORAGE_KEY, "1");
          setCheckoutLoading(false);
        },
        onDismiss: () => setCheckoutLoading(false),
        onError:   (e) => { setError(e); setCheckoutLoading(false); },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setCheckoutLoading(false);
    }
  };

  const hasAnyEffect = Object.values(settings).some((v) => v > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
          AI-free · 100% browser
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Portrait Enhancer
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Skin smoothing, teeth whitening, eye brightening and vignette —
          all processed locally in your browser.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">

        {/* ── Left: before/after preview ──────────────────────────── */}
        <section className="space-y-5">
          {!sourceUrl ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
              className="flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white p-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/50"
            >
              <span className="text-6xl">🪄</span>
              <span className="mt-5 text-xl font-semibold text-slate-800">Drop your portrait here</span>
              <span className="mt-2 max-w-md text-slate-500">or click to browse · {SUPPORTED_FORMATS_LABEL}</span>
              <span className="mt-6 rounded-full bg-indigo-800 px-6 py-2.5 text-sm font-medium text-white">
                Upload photo
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {processing && (
                    <span className="text-xs text-slate-400 animate-pulse">Applying…</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
                >
                  ↩ Change photo
                </button>
              </div>

              {/* Before / After */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Original</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sourceUrl} alt="Original" className="h-auto w-full object-contain" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-indigo-600">Enhanced</p>
                  <div className="relative overflow-hidden rounded-lg border border-indigo-100 bg-slate-50">
                    <canvas
                      ref={canvasRef}
                      className="h-auto w-full"
                      style={{ display: sourceUrl ? "block" : "none" }}
                    />
                    {processing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <svg className="h-7 w-7 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Download row */}
              <div className="mt-3">
                {paid ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void download()}
                      disabled={!hasAnyEffect || processing}
                      className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ↓ Download Enhanced JPEG
                    </button>
                    {!hasAnyEffect && (
                      <p className="text-center text-xs text-slate-400">Adjust at least one slider to enable download</p>
                    )}
                    <p className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                      <span>🔒</span> EXIF metadata stripped on export
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void startCheckout()}
                      disabled={checkoutLoading}
                      className="w-full rounded-xl bg-indigo-800 px-5 py-3 font-semibold text-white shadow hover:bg-indigo-900 disabled:opacity-50"
                    >
                      {checkoutLoading ? "Redirecting…" : `Unlock download — ${PRICE_DISPLAY}`}
                    </button>
                    <p className="text-center text-xs text-slate-400">
                      Preview is free · One-time payment unlocks all tools forever
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
          )}
        </section>

        {/* ── Right: enhancement sliders ──────────────────────────── */}
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Enhancements</h2>
              {hasAnyEffect && (
                <button
                  type="button"
                  onClick={() => setSettings(DEFAULT_SETTINGS)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Reset all
                </button>
              )}
            </div>

            <div className="space-y-5">
              <Slider
                icon="✨" label="Skin Smoothing" sublabel="Blurs skin tones, preserves edges"
                value={settings.skinSmooth}
                onChange={(v) => setSettings((s) => ({ ...s, skinSmooth: v }))}
                disabled={!sourceUrl}
              />
              <Slider
                icon="😁" label="Teeth Whitening" sublabel="Brightens the mouth zone"
                value={settings.teethWhiten}
                onChange={(v) => setSettings((s) => ({ ...s, teethWhiten: v }))}
                disabled={!sourceUrl}
              />
              <Slider
                icon="👁" label="Eye Brightening" sublabel="Whitens the sclera (eye whites)"
                value={settings.eyeBrighten}
                onChange={(v) => setSettings((s) => ({ ...s, eyeBrighten: v }))}
                disabled={!sourceUrl}
              />
              <Slider
                icon="🌑" label="Vignette" sublabel="Subtle darkening toward edges"
                value={settings.vignette}
                onChange={(v) => setSettings((s) => ({ ...s, vignette: v }))}
                disabled={!sourceUrl}
              />
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-indigo-800">Tips</p>
            <ul className="space-y-1 text-xs list-disc list-inside text-slate-500">
              <li>Skin smoothing works best on well-lit, front-facing portraits</li>
              <li>Keep values modest (30–50) for a natural look</li>
              <li>Use this tool before the Passport Studio for best results</li>
              <li>All processing happens in your browser — photo never leaves your device</li>
            </ul>
          </div>

          {/* Cross-sell */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Other tools</p>
            <div className="space-y-2">
              <a href="/studio" className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                <span>🛂</span> Passport Studio
              </a>
              <a href="/bg-remover" className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                <span>✂️</span> Background Remover
              </a>
            </div>
          </div>
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
