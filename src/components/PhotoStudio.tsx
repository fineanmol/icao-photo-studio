"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GUIDELINES,
  ICAO_WIDTH,
  PRICE_DISPLAY,
} from "@/lib/icao-constants";
import { detectFace, loadFaceModels } from "@/lib/face-detection";
import type { FaceBox } from "@/lib/face-detection";
import {
  canvasToBlob,
  computeCrop,
  defaultSettings,
  processToICAO,
  type ICAOSettings,
} from "@/lib/icao-processor";
import {
  FILE_INPUT_ACCEPT,
  prepareImageFile,
  SUPPORTED_FORMATS_LABEL,
} from "@/lib/image-loader";
import { validateICAO, type ValidationItem } from "@/lib/icao-validators";
import {
  applyWatermark,
  downloadWatermarkedPreview,
  WATERMARK_TEXT,
} from "@/lib/watermark";

const STORAGE_KEY = "icao_photo_paid";
const DEV_DOWNLOAD = process.env.NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD === "true";

// ─── helpers ────────────────────────────────────────────────────────────────

function statusColor(s: ValidationItem["status"]) {
  if (s === "pass") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (s === "warn") return "text-amber-800 bg-amber-50 border-amber-200";
  if (s === "fail") return "text-red-800 bg-red-50 border-red-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}

function StatusIcon({ status }: { status: ValidationItem["status"] }) {
  if (status === "pass") return <span aria-hidden>✓</span>;
  if (status === "fail") return <span aria-hidden>✕</span>;
  if (status === "warn") return <span aria-hidden>!</span>;
  return <span aria-hidden>○</span>;
}

function formatSliderValue(value: number, prefix = "", suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${prefix}${sign}${value}${suffix}`;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function PhotoStudio() {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<ICAOSettings>(defaultSettings);
  const [finalCanvas, setFinalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watermarkOn, setWatermarkOn] = useState(true);
  const [showWatermarkTools, setShowWatermarkTools] = useState(DEV_DOWNLOAD);

  // Refs that don't cause re-renders when updated
  const faceRef = useRef<FaceBox | null>(null);
  const modelsReadyRef = useRef(false);
  const processGenRef = useRef(0);
  const sourceUrlRef = useRef<string | null>(null);
  const settingsRef = useRef<ICAOSettings>(settings);
  const revokeSourceRef = useRef<(() => void) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Keep refs in sync with state without causing extra effects
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);

  // ── face model loading ───────────────────────────────────────────────────

  useEffect(() => {
    loadFaceModels()
      .then(() => {
        modelsReadyRef.current = true;
        // If a photo was already loaded before models finished, re-run detection
        if (sourceUrlRef.current && !faceRef.current) {
          void doProcess(sourceUrlRef.current, settingsRef.current);
        }
      })
      .catch(() => {
        // Models unavailable — processing still works with fallback crop
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── payment state ────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") setPaid(true);

    const params = new URLSearchParams(window.location.search);
    if (params.get("testWatermark") === "1") {
      setShowWatermarkTools(true);
      setWatermarkOn(true);
    }

    const sessionId = params.get("session_id");
    if (params.get("paid") === "1" && sessionId) {
      fetch(`/api/verify?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.paid) {
            setPaid(true);
            sessionStorage.setItem(STORAGE_KEY, "1");
            window.history.replaceState({}, "", "/");
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── core processing ──────────────────────────────────────────────────────

  /**
   * Stable callback (empty deps) — reads all values from refs or passed args.
   * Face detection runs only if models are ready AND no face has been cached yet.
   * Subsequent calls (settings changes) skip detection and go straight to render.
   */
  const doProcess = useCallback(
    async (url: string, currentSettings: ICAOSettings) => {
      const gen = ++processGenRef.current;
      setProcessing(true);
      setError(null);

      try {
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = rej;
          img.src = url;
        });
        if (gen !== processGenRef.current) return;

        // Detect face once per photo (cached in ref, not state)
        if (modelsReadyRef.current && !faceRef.current) {
          const detected = await detectFace(img);
          if (gen !== processGenRef.current) return;
          if (detected) faceRef.current = detected;
        }

        const out = await processToICAO(url, faceRef.current, currentSettings);
        if (gen !== processGenRef.current) return;

        setFinalCanvas(out);

        // Validation uses the detected face for face-ratio estimate
        const fallback: FaceBox = {
          x: img.naturalWidth * 0.2,
          y: img.naturalHeight * 0.05,
          width: img.naturalWidth * 0.6,
          height: img.naturalHeight * 0.82,
        };
        const f = faceRef.current ?? fallback;
        const crop = computeCrop(img.naturalWidth, img.naturalHeight, f, currentSettings);
        setValidations(
          validateICAO(out, faceRef.current, f.height * (ICAO_WIDTH / crop.sw)),
        );
      } catch {
        if (gen === processGenRef.current) {
          setError("Could not process this image. Try another photo.");
        }
      } finally {
        if (gen === processGenRef.current) setProcessing(false);
      }
    },
    [], // stable — reads from refs, receives args
  );

  // Debounced trigger: fires on sourceUrl OR settings change
  useEffect(() => {
    if (!sourceUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doProcess(sourceUrl, settings);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceUrl, settings, doProcess]);

  // ── file handling ────────────────────────────────────────────────────────

  const onFile = async (file: File) => {
    setError(null);
    setConvertNote(null);
    setLoadingImage(true);
    setFinalCanvas(null);
    setValidations([]);
    try {
      revokeSourceRef.current?.();
      revokeSourceRef.current = null;
      faceRef.current = null; // reset face for new photo

      const prepared = await prepareImageFile(file);
      revokeSourceRef.current = prepared.revoke;
      setSourceUrl(prepared.url);
      if (prepared.convertedFrom) {
        setConvertNote(`Converted from ${prepared.convertedFrom} in your browser.`);
      }
      setPaid(false);
      setWatermarkOn(true);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not open this file. Supported: ${SUPPORTED_FORMATS_LABEL}.`,
      );
    } finally {
      setLoadingImage(false);
    }
  };

  // ── download / payment ───────────────────────────────────────────────────

  const download = async () => {
    if (!finalCanvas) return;
    const blob = await canvasToBlob(finalCanvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icao-passport-photo-${ICAO_WIDTH}x810.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startCheckout = async () => {
    if (!finalCanvas) return;
    if (DEV_DOWNLOAD) {
      setPaid(true);
      sessionStorage.setItem(STORAGE_KEY, "1");
      return;
    }
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be started.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ── canvas preview ───────────────────────────────────────────────────────

  const showWatermark = !paid && watermarkOn;

  useEffect(() => {
    const el = previewRef.current;
    if (!el || !finalCanvas) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    const frame = showWatermark ? applyWatermark(finalCanvas) : finalCanvas;
    ctx.drawImage(frame, 0, 0, el.width, el.height);
  }, [finalCanvas, showWatermark]);

  const downloadWatermarkedTest = async () => {
    if (!finalCanvas) return;
    await downloadWatermarkedPreview(finalCanvas);
  };

  // ── settings helpers ─────────────────────────────────────────────────────

  const update = <K extends keyof ICAOSettings>(key: K, value: ICAOSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const resetAdjustments = () =>
    setSettings({
      ...defaultSettings,
      faceRatio: settings.faceRatio, // preserve face scale
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
    });

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
          ICAO 9303 Compliant
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Passport Photo Studio
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Convert any portrait to {ICAO_WIDTH}×810 px — auto face detection, white
          background, compliance check. Ready for passport applications.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* ── Left column ── */}
        <section className="space-y-6">
          {!sourceUrl ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void onFile(f);
              }}
              className="flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-gradient-to-b from-sky-50/80 to-white p-10 text-center transition hover:border-sky-400 hover:bg-sky-50/50"
            >
              <span className="text-6xl">📷</span>
              <span className="mt-5 text-xl font-semibold text-slate-800">
                Drop your photo here
              </span>
              <span className="mt-2 max-w-md text-slate-500">
                or click to browse · {SUPPORTED_FORMATS_LABEL}
              </span>
              <span className="mt-6 rounded-full bg-sky-600 px-6 py-2.5 text-sm font-medium text-white">
                Upload photo
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* Header row */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-500">
                  Preview · {ICAO_WIDTH}×810 px
                  {showWatermark && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Watermarked
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm font-medium text-sky-700 hover:text-sky-900"
                >
                  Change photo
                </button>
              </div>

              {convertNote && (
                <p className="mb-2 text-xs text-sky-700">{convertNote}</p>
              )}

              {/* Canvas preview */}
              <div className="relative mx-auto max-w-[315px]">
                <canvas
                  ref={previewRef}
                  width={ICAO_WIDTH}
                  height={810}
                  className="h-auto w-full rounded-lg border border-slate-100 shadow-inner"
                  style={{ aspectRatio: `${ICAO_WIDTH}/810` }}
                />
                {(processing || loadingImage) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/80">
                    <svg
                      className="h-8 w-8 animate-spin text-sky-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">
                      {loadingImage ? "Loading…" : "Processing…"}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-3">
                {paid ? (
                  <button
                    type="button"
                    onClick={() => void download()}
                    disabled={!finalCanvas}
                    className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ↓ Download ICAO JPEG
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    disabled={!finalCanvas || checkoutLoading}
                    className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-50"
                  >
                    {checkoutLoading
                      ? "Redirecting…"
                      : DEV_DOWNLOAD
                        ? "Unlock download (dev)"
                        : `Download — ${PRICE_DISPLAY}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    faceRef.current = null;
                    if (sourceUrl) void doProcess(sourceUrl, settings);
                  }}
                  disabled={processing}
                  className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Re-detect
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {/* Compliance panel */}
          {validations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Compliance check</h2>
              <ul className="mt-4 space-y-2">
                {validations.map((v) => (
                  <li
                    key={v.id}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${statusColor(v.status)}`}
                  >
                    <span className="mt-0.5 w-4 shrink-0 font-bold">
                      <StatusIcon status={v.status} />
                    </span>
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="mt-0.5 opacity-90">{v.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── Right sidebar ── */}
        <aside className="space-y-5">
          {/* Adjustments panel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Adjustments</h2>
                <p className="text-xs text-slate-500">All sliders start at 0 = no change.</p>
              </div>
              <button
                type="button"
                onClick={resetAdjustments}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="border-b border-slate-100 pb-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Framing
                </p>
                <div className="space-y-4">
                  <Slider
                    label="Face scale"
                    hint={`${Math.round(settings.faceRatio * 100)}% · ICAO: 80–85%`}
                    hintColor={
                      settings.faceRatio >= 0.8 && settings.faceRatio <= 0.85
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }
                    min={74}
                    max={90}
                    step={1}
                    value={Math.round(settings.faceRatio * 100)}
                    onChange={(v) => update("faceRatio", v / 100)}
                  />
                  <Slider
                    label="Shift horizontal"
                    hint={formatSliderValue(settings.offsetX, "", "px")}
                    min={-120}
                    max={120}
                    step={4}
                    value={settings.offsetX}
                    onChange={(v) => update("offsetX", v)}
                  />
                  <Slider
                    label="Shift vertical"
                    hint={formatSliderValue(settings.offsetY, "", "px")}
                    min={-120}
                    max={120}
                    step={4}
                    value={settings.offsetY}
                    onChange={(v) => update("offsetY", v)}
                  />
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Color &amp; quality
                </p>
                <div className="space-y-4">
                  <Slider
                    label="Brightness"
                    hint={formatSliderValue(settings.brightness)}
                    min={-60}
                    max={60}
                    step={5}
                    value={settings.brightness}
                    onChange={(v) => update("brightness", v)}
                  />
                  <Slider
                    label="Contrast"
                    hint={formatSliderValue(settings.contrast)}
                    min={-40}
                    max={40}
                    step={5}
                    value={settings.contrast}
                    onChange={(v) => update("contrast", v)}
                  />
                  <Slider
                    label="Saturation"
                    hint={formatSliderValue(settings.saturation)}
                    min={-50}
                    max={50}
                    step={5}
                    value={settings.saturation}
                    onChange={(v) => update("saturation", v)}
                  />
                  <Slider
                    label="Sharpen"
                    hint={String(settings.sharpen)}
                    min={0}
                    max={50}
                    step={5}
                    value={settings.sharpen}
                    onChange={(v) => update("sharpen", v)}
                  />
                  <Slider
                    label="BG whiten (near-white only)"
                    hint={`${settings.backgroundStrength}%`}
                    min={0}
                    max={100}
                    step={5}
                    value={settings.backgroundStrength}
                    onChange={(v) => update("backgroundStrength", v)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Watermark tools */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Watermark (local)</h2>
              <button
                type="button"
                onClick={() => setShowWatermarkTools((v) => !v)}
                className="text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                {showWatermarkTools ? "Hide" : "Show"}
              </button>
            </div>
            {showWatermarkTools && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  Text: &quot;{WATERMARK_TEXT}&quot; — applied in browser only.
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={watermarkOn}
                    disabled={paid}
                    onChange={(e) => setWatermarkOn(e.target.checked)}
                    className="h-4 w-4 accent-sky-600"
                  />
                  Show on preview
                </label>
                <button
                  type="button"
                  onClick={() => void downloadWatermarkedTest()}
                  disabled={!finalCanvas}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                >
                  Download watermarked (test)
                </button>
                <p className="text-xs text-slate-400">
                  URL flag: <code className="rounded bg-white/80 px-1">?testWatermark=1</code>
                </p>
              </div>
            )}
          </div>

          {/* ICAO requirements */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ICAO requirements
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {GUIDELINES.map((g) => (
                <li key={g.id} className="flex gap-2">
                  <span className="text-sky-500 shrink-0">•</span>
                  <span>
                    <strong>{g.label}</strong> — {g.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Commercial badge */}
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="font-semibold text-sm">One-time payment · {PRICE_DISPLAY}</p>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
              Pay once for a watermark-free {ICAO_WIDTH}×810 JPEG.
              Photos never leave your device — all processing is local.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({
  label,
  hint,
  hintColor = "text-slate-400",
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  hintColor?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block select-none">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint !== undefined && (
          <span className={`tabular-nums ${hintColor}`}>{hint}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-2 w-full cursor-pointer accent-sky-600"
      />
    </label>
  );
}
