"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GUIDELINES,
  ICAO_HEIGHT,
  ICAO_WIDTH,
  PRICE_DISPLAY,
} from "@/lib/icao-constants";
import { detectFace, loadFaceModels } from "@/lib/face-detection";
import type { FaceAnalysis } from "@/lib/face-detection";
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
import type { BgRemovalProgress } from "@/lib/bg-removal";
import { openRazorpayCheckout } from "@/lib/razorpay-client";

const STORAGE_KEY = "icao_photo_paid";
const DEV_DOWNLOAD = process.env.NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD === "true";

// ─── small helpers ──────────────────────────────────────────────────────────

function statusColor(s: ValidationItem["status"]) {
  if (s === "pass") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (s === "warn") return "text-amber-800 bg-amber-50 border-amber-200";
  if (s === "fail") return "text-red-800 bg-red-50 border-red-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}

function StatusIcon({ status }: { status: ValidationItem["status"] }) {
  if (status === "pass") return <span aria-hidden>✓</span>;
  if (status === "fail") return <span aria-hidden>✕</span>;
  if (status === "warn") return <span aria-hidden>⚠</span>;
  return <span aria-hidden className="opacity-50">○</span>;
}

function fmt(v: number, suffix = "") {
  return `${v > 0 ? "+" : ""}${v}${suffix}`;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function PhotoStudio() {
  const searchParams = useSearchParams();

  // ── state ────────────────────────────────────────────────────────────────
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
  const [bgRemoving, setBgRemoving] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgRemovalProgress | null>(null);
  const [bgRemoved, setBgRemoved] = useState(false);

  // ── refs ─────────────────────────────────────────────────────────────────
  const faceRef = useRef<FaceAnalysis | null>(null);
  const modelsReadyRef = useRef(false);
  const processGenRef = useRef(0);
  const sourceUrlRef = useRef<string | null>(null);
  const settingsRef = useRef<ICAOSettings>(settings);
  const revokeSourceRef = useRef<(() => void) | null>(null);
  const originalSourceUrlRef = useRef<string | null>(null); // for bg restore
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sourceUrlRef.current = sourceUrl; }, [sourceUrl]);

  // ── load face models ─────────────────────────────────────────────────────
  useEffect(() => {
    loadFaceModels()
      .then(() => {
        modelsReadyRef.current = true;
        if (sourceUrlRef.current && !faceRef.current) {
          void doProcess(sourceUrlRef.current, settingsRef.current);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── payment check ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1" || DEV_DOWNLOAD) setPaid(true);
    if (searchParams.get("testWatermark") === "1") {
      setShowWatermarkTools(true);
      setWatermarkOn(true);
    }
  // searchParams is stable from useSearchParams — safe dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── core process (stable, empty deps, reads from refs / passed args) ──────
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

        // Face detection — once per photo, cached in ref
        if (modelsReadyRef.current && !faceRef.current) {
          const det = await detectFace(img);
          if (gen !== processGenRef.current) return;
          if (det) faceRef.current = det;
        }

        const out = await processToICAO(url, faceRef.current, currentSettings);
        if (gen !== processGenRef.current) return;

        setFinalCanvas(out);

        // Build validation — need face height in output pixels
        // fallback box used only for crop math when face detection not yet available
        const fallback = {
          x: img.naturalWidth * 0.2,
          y: img.naturalHeight * 0.05,
          width: img.naturalWidth * 0.6,
          height: img.naturalHeight * 0.82,
        };
        const f = faceRef.current ?? fallback;
        const crop = computeCrop(img.naturalWidth, img.naturalHeight, f, currentSettings);
        // faceOutputHeight: face.height in source × scale = face height in ICAO output pixels
        const faceOutputHeight = f.height * (ICAO_HEIGHT / crop.sh);
        setValidations(
          validateICAO(out, faceRef.current, faceOutputHeight, bgRemovedRef.current),
        );
      } catch {
        if (gen === processGenRef.current)
          setError("Could not process this image. Try a different photo.");
      } finally {
        if (gen === processGenRef.current) setProcessing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // We need bgRemoved in doProcess but without making it a dep — use a ref
  const bgRemovedRef = useRef(false);
  useEffect(() => { bgRemovedRef.current = bgRemoved; }, [bgRemoved]);

  // Debounced trigger on sourceUrl / settings change
  useEffect(() => {
    if (!sourceUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doProcess(sourceUrl, settings), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [sourceUrl, settings, doProcess]);

  // ── file handling ─────────────────────────────────────────────────────────
  const onFile = async (file: File) => {
    setError(null);
    setConvertNote(null);
    setLoadingImage(true);
    setFinalCanvas(null);
    setValidations([]);
    setBgRemoved(false);
    setBgProgress(null);
    try {
      revokeSourceRef.current?.();
      revokeSourceRef.current = null;
      originalSourceUrlRef.current = null;
      faceRef.current = null;

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

  // ── background removal ────────────────────────────────────────────────────
  const handleRemoveBg = async () => {
    if (!sourceUrl || bgRemoving) return;
    setBgRemoving(true);
    setBgProgress({ phase: "Starting…", pct: 0 });
    setError(null);
    try {
      // Lazy-load the heavy library only when needed
      const { removeImageBackground } = await import("@/lib/bg-removal");

      // Save original so user can revert
      if (!originalSourceUrlRef.current) {
        originalSourceUrlRef.current = sourceUrl;
      }

      const whiteUrl = await removeImageBackground(sourceUrl, (p) => {
        setBgProgress(p);
      });

      // Reset face — background change may affect detection
      faceRef.current = null;
      setBgRemoved(true);
      setBgRemovedRef(true);
      setSourceUrl(whiteUrl);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Background removal failed: ${e.message}`
          : "Background removal failed. Please try again.",
      );
    } finally {
      setBgRemoving(false);
      setBgProgress(null);
    }
  };

  // helper to keep bgRemovedRef in sync imperatively during removal
  const setBgRemovedRef = (v: boolean) => { bgRemovedRef.current = v; };

  const handleRestoreBg = () => {
    const orig = originalSourceUrlRef.current;
    if (!orig) return;
    faceRef.current = null;
    setBgRemoved(false);
    setBgRemovedRef(false);
    setSourceUrl(orig);
    originalSourceUrlRef.current = null;
  };

  // ── download / payment ────────────────────────────────────────────────────
  const download = async () => {
    if (!finalCanvas) return;
    const blob = await canvasToBlob(finalCanvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icao-passport-photo-${ICAO_WIDTH}x${ICAO_HEIGHT}.jpg`;
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
      await openRazorpayCheckout({
        product: "icao_photo",
        onSuccess: () => {
          setPaid(true);
          sessionStorage.setItem(STORAGE_KEY, "1");
          setCheckoutLoading(false);
        },
        onDismiss: () => setCheckoutLoading(false),
        onError: (msg) => {
          setError(msg);
          setCheckoutLoading(false);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be started.");
      setCheckoutLoading(false);
    }
  };

  // ── canvas preview ────────────────────────────────────────────────────────
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

  // ── settings ──────────────────────────────────────────────────────────────
  const update = <K extends keyof ICAOSettings>(k: K, v: ICAOSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const resetAdjustments = () =>
    setSettings({
      ...defaultSettings,
      faceRatio: settings.faceRatio,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
    });

  // ── overall loading label ─────────────────────────────────────────────────
  const overlayLabel = bgRemoving
    ? bgProgress
      ? `${bgProgress.phase} ${bgProgress.pct}%`
      : "Removing background…"
    : loadingImage
      ? "Loading…"
      : "Processing…";

  const busy = processing || loadingImage || bgRemoving;

  // ── render ────────────────────────────────────────────────────────────────
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
          Auto face detection · AI background removal · compliance check ·
          {" "}{ICAO_WIDTH}×{ICAO_HEIGHT} px JPEG.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">

        {/* ── LEFT: preview ── */}
        <section className="space-y-5">
          {!sourceUrl ? (
            /* Drop zone */
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
              {/* Header */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    {ICAO_WIDTH}×{ICAO_HEIGHT} px
                  </span>
                  {showWatermark && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Watermarked
                    </span>
                  )}
                  {bgRemoved && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      BG Removed ✓
                    </span>
                  )}
                </div>
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

              {/* Canvas */}
              <div className="relative mx-auto max-w-[315px]">
                <canvas
                  ref={previewRef}
                  width={ICAO_WIDTH}
                  height={ICAO_HEIGHT}
                  className="h-auto w-full rounded-lg border border-slate-100 shadow-inner"
                  style={{ aspectRatio: `${ICAO_WIDTH}/${ICAO_HEIGHT}` }}
                />
                {busy && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85">
                    <svg
                      className="h-9 w-9 animate-spin text-sky-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">{overlayLabel}</span>
                    {bgRemoving && bgProgress && (
                      <div className="w-44 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-1.5 rounded-full bg-sky-500 transition-all duration-300"
                          style={{ width: `${bgProgress.pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* BG removal row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!bgRemoved ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveBg()}
                    disabled={bgRemoving || processing}
                    className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                  >
                    <span>✨</span> Remove Background
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRestoreBg}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    ↩ Restore original
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { faceRef.current = null; if (sourceUrl) void doProcess(sourceUrl, settings); }}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Re-detect face
                </button>
                <a
                  href="/bg-remover"
                  className="ml-auto rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
                >
                  Dedicated BG Remover →
                </a>
              </div>

              {/* Download / pay row */}
              <div className="mt-2 flex flex-wrap gap-3">
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
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Compliance check</h2>
                <ComplianceSummary items={validations} />
              </div>
              <ul className="mt-4 space-y-2">
                {validations.map((v) => (
                  <li
                    key={v.id}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${statusColor(v.status)}`}
                  >
                    <span className="mt-0.5 w-4 shrink-0 font-bold text-base leading-none">
                      <StatusIcon status={v.status} />
                    </span>
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="mt-0.5 text-xs opacity-90">{v.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                ○ = verify manually · automated checks are indicative only
              </p>
            </div>
          )}
        </section>

        {/* ── RIGHT: settings sidebar ── */}
        <aside className="space-y-5">
          {/* Adjustments */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Adjustments</h2>
                <p className="text-xs text-slate-400">0 on every slider = no change.</p>
              </div>
              <button
                type="button"
                onClick={resetAdjustments}
                className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 space-y-5">
              <fieldset>
                <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Framing
                </legend>
                <div className="space-y-4">
                  <Slider
                    label="Face scale"
                    hint={`${Math.round(settings.faceRatio * 100)}%`}
                    hintOk={settings.faceRatio >= 0.8 && settings.faceRatio <= 0.85}
                    hintSuffix=" · ICAO: 80–85%"
                    min={72} max={90} step={1}
                    value={Math.round(settings.faceRatio * 100)}
                    onChange={(v) => update("faceRatio", v / 100)}
                  />
                  <Slider
                    label="Shift horizontal"
                    hint={fmt(settings.offsetX, "px")}
                    min={-150} max={150} step={5}
                    value={settings.offsetX}
                    onChange={(v) => update("offsetX", v)}
                  />
                  <Slider
                    label="Shift vertical"
                    hint={fmt(settings.offsetY, "px")}
                    min={-150} max={150} step={5}
                    value={settings.offsetY}
                    onChange={(v) => update("offsetY", v)}
                  />
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Colour &amp; quality
                </legend>
                <div className="space-y-4">
                  <Slider label="Brightness" hint={fmt(settings.brightness)} min={-60} max={60} step={5} value={settings.brightness} onChange={(v) => update("brightness", v)} />
                  <Slider label="Contrast" hint={fmt(settings.contrast)} min={-40} max={40} step={5} value={settings.contrast} onChange={(v) => update("contrast", v)} />
                  <Slider label="Saturation" hint={fmt(settings.saturation)} min={-50} max={50} step={5} value={settings.saturation} onChange={(v) => update("saturation", v)} />
                  <Slider label="Sharpen" hint={String(settings.sharpen)} min={0} max={50} step={5} value={settings.sharpen} onChange={(v) => update("sharpen", v)} />
                </div>
              </fieldset>
            </div>
          </div>

          {/* BG removal info card */}
          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-start gap-2">
              <span className="text-xl">✨</span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  AI Background Removal
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Runs entirely in your browser — no upload, no API key.
                  Uses the <em>IS-Net FP16</em> neural network to cut out the subject
                  and fill the background with pure ICAO-compliant white.
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  First run downloads ~45 MB model (cached after that).
                </p>
              </div>
            </div>
          </div>

          {/* Watermark tools */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Watermark (local)</h2>
              <button
                type="button"
                onClick={() => setShowWatermarkTools((v) => !v)}
                className="text-xs font-medium text-sky-700"
              >
                {showWatermarkTools ? "Hide" : "Show"}
              </button>
            </div>
            {showWatermarkTools && (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs text-slate-500">
                  &quot;{WATERMARK_TEXT}&quot; — browser-side only, never stored.
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
                  onClick={() => void (async () => {
                    if (finalCanvas) await downloadWatermarkedPreview(finalCanvas);
                  })()}
                  disabled={!finalCanvas}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                >
                  Download watermarked test
                </button>
                <p className="text-xs text-slate-400">
                  URL flag: <code className="rounded bg-white/80 px-1 font-mono">?testWatermark=1</code>
                </p>
              </div>
            )}
          </div>

          {/* ICAO requirements */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              ICAO 9303 Requirements
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-700">
              {GUIDELINES.map((g) => (
                <li key={g.id} className="flex gap-2">
                  <span className="shrink-0 text-sky-500">•</span>
                  <span><strong>{g.label}</strong> — {g.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Commercial badge */}
          <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white">
            <p className="text-sm font-semibold">One-time · {PRICE_DISPLAY}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Pay once per photo for a watermark-free {ICAO_WIDTH}×{ICAO_HEIGHT} JPEG.
              All processing stays on your device.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── ComplianceSummary badge ─────────────────────────────────────────────────

function ComplianceSummary({ items }: { items: ValidationItem[] }) {
  const auto = items.filter((i) => i.status !== "manual");
  const passes = auto.filter((i) => i.status === "pass").length;
  const fails = auto.filter((i) => i.status === "fail").length;
  const warns = auto.filter((i) => i.status === "warn").length;

  const color =
    fails > 0
      ? "bg-red-100 text-red-700"
      : warns > 0
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-700";

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {fails > 0
        ? `${fails} issue${fails > 1 ? "s" : ""}`
        : warns > 0
          ? `${warns} warning${warns > 1 ? "s" : ""}`
          : `${passes}/${auto.length} passed`}
    </span>
  );
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({
  label,
  hint,
  hintOk,
  hintSuffix,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  hintOk?: boolean;
  hintSuffix?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const hintColor =
    hintOk === undefined
      ? "text-slate-400"
      : hintOk
        ? "text-emerald-600"
        : "text-amber-600";

  return (
    <label className="block select-none">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint !== undefined && (
          <span className={`tabular-nums ${hintColor}`}>
            {hint}
            {hintSuffix && <span className="text-slate-400">{hintSuffix}</span>}
          </span>
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
