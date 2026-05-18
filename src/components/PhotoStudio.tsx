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
  canvasToBlobUnder,
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
import {
  trackPhotoUploaded, trackDownload,
  trackStandardSelected, trackBgColorChanged,
  trackRedEyeFixed, trackExportModeChanged,
} from "@/lib/analytics";
import { printPassportSheet } from "@/lib/print-layout";
import {
  PHOTO_STANDARDS, DEFAULT_STANDARD, groupedStandards,
  type PhotoStandard, type BgColor,
} from "@/lib/photo-standards";
import { removeRedEye, type OutputConfig } from "@/lib/icao-processor";

/** Shared key — paying once unlocks all tools forever across sessions. */
const STORAGE_KEY = "icao_lifetime_paid";
const DEV_DOWNLOAD = process.env.NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD === "true";
/** Watermarks are a dev-only aid for testing; production always shows the clean image. */
const IS_DEV = process.env.NODE_ENV === "development";

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
  /** Frozen on file-load; never overwritten by BG removal — used for the "Original" panel. */
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<ICAOSettings>(defaultSettings);
  const [finalCanvas, setFinalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  // In development, start as paid so every flow is testable without Razorpay
  const [paid, setPaid] = useState(IS_DEV);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watermarkOn, setWatermarkOn] = useState(true);
  const [showWatermarkTools, setShowWatermarkTools] = useState(DEV_DOWNLOAD);
  const [originalFileName, setOriginalFileName] = useState<string>("photo");
  /** "print" = full quality (~0.95) | "portal" = binary-search to ≤200 KB */
  const [exportMode, setExportMode] = useState<"print" | "portal">("print");
  /** Active document standard */
  const [standard, setStandard] = useState<PhotoStandard>(DEFAULT_STANDARD);
  /** Active background colour (used after AI BG removal) */
  const [bgColor, setBgColor] = useState<BgColor>(DEFAULT_STANDARD.bgColors[0]);
  /** Transparent PNG URL stored after BG removal for re-compositing */
  const transparentPngRef = useRef<string | null>(null);
  /** Whether red-eye removal was applied this session */
  const [redEyeFixed, setRedEyeFixed] = useState(false);
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
    if (IS_DEV || localStorage.getItem(STORAGE_KEY) === "1") setPaid(true);
    if (searchParams.get("testWatermark") === "1") {
      setShowWatermarkTools(true);
      setWatermarkOn(true);
    }
  // searchParams is stable from useSearchParams — safe dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs to read latest standard/bgColor inside stable doProcess callback
  const standardRef  = useRef<PhotoStandard>(DEFAULT_STANDARD);
  const bgColorRef   = useRef<BgColor>(DEFAULT_STANDARD.bgColors[0]);
  useEffect(() => { standardRef.current = standard; }, [standard]);
  useEffect(() => { bgColorRef.current  = bgColor;  }, [bgColor]);

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

        const std = standardRef.current;
        const outCfg: OutputConfig = {
          width:   std.widthPx,
          height:  std.heightPx,
          bgColor: bgColorRef.current.hex,
        };

        const out = await processToICAO(url, faceRef.current, currentSettings, outCfg);
        if (gen !== processGenRef.current) return;

        setFinalCanvas(out);
        setRedEyeFixed(false);

        // Build validation — need face height in output pixels
        const fallback = {
          x: img.naturalWidth * 0.2,
          y: img.naturalHeight * 0.05,
          width: img.naturalWidth * 0.6,
          height: img.naturalHeight * 0.82,
        };
        const f = faceRef.current ?? fallback;
        const crop = computeCrop(img.naturalWidth, img.naturalHeight, f, currentSettings, std.widthPx, std.heightPx);
        const faceOutputHeight = f.height * (std.heightPx / crop.sh);
        setValidations(
          validateICAO(out, faceRef.current, faceOutputHeight, bgRemovedRef.current, {
            widthPx:      std.widthPx,
            heightPx:     std.heightPx,
            faceRatioMin: std.faceRatioMin,
            faceRatioMax: std.faceRatioMax,
            label:        std.label,
            bgColorHex:   bgColorRef.current.hex,
          }),
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
    setOriginalUrl(null); // will be set once prepared.url is ready
    try {
      revokeSourceRef.current?.();
      revokeSourceRef.current = null;
      originalSourceUrlRef.current = null;
      faceRef.current = null;

      const prepared = await prepareImageFile(file);
      revokeSourceRef.current = prepared.revoke;
      setSourceUrl(prepared.url);
      setOriginalUrl(prepared.url);   // frozen — never changes after this
      // Strip extension for use in download filenames
      setOriginalFileName(file.name.replace(/\.[^/.]+$/, "") || "photo");
      trackPhotoUploaded(prepared.convertedFrom ?? (file.type || "unknown"));
      if (prepared.convertedFrom) {
        setConvertNote(`Converted from ${prepared.convertedFrom} in your browser.`);
      }
      setPaid(false);
      setWatermarkOn(true);
      localStorage.removeItem(STORAGE_KEY);
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
      const { removeImageBackgroundFull } = await import("@/lib/bg-removal");

      // Save original so user can revert
      if (!originalSourceUrlRef.current) {
        originalSourceUrlRef.current = sourceUrl;
      }

      const { whiteJpegUrl, transparentPngUrl } = await removeImageBackgroundFull(
        sourceUrl,
        "balanced",
        (p: BgRemovalProgress) => setBgProgress(p),
      );

      // Store transparent PNG so we can re-composite on colour change
      transparentPngRef.current = transparentPngUrl;

      // Composite with the currently selected bg colour
      let compositeUrl = whiteJpegUrl;
      if (bgColorRef.current.hex !== "#ffffff") {
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = transparentPngUrl; });
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = bgColorRef.current.hex;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        compositeUrl = c.toDataURL("image/jpeg", 0.95);
      }

      // Reset face — background change may affect detection
      faceRef.current = null;
      setBgRemoved(true);
      setBgRemovedRef(true);
      setSourceUrl(compositeUrl);
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
    transparentPngRef.current = null;
    setSourceUrl(orig);
    originalSourceUrlRef.current = null;
  };

  /** Switch to a different document standard and reprocess. */
  const handleStandardChange = (s: PhotoStandard) => {
    setStandard(s);
    setBgColor(s.bgColors[0]);
    trackStandardSelected(s.id, s.label);
    if (sourceUrl) {
      faceRef.current = null;
      void doProcess(sourceUrl, settings);
    }
  };

  /** Recomposite the transparent PNG with a new background color, then reprocess. */
  const handleBgColorChange = async (color: BgColor) => {
    setBgColor(color);
    trackBgColorChanged(color.id);
    const pngUrl = transparentPngRef.current;
    if (!pngUrl) {
      // No transparent PNG — just retrigger with color applied via OutputConfig
      if (sourceUrl) void doProcess(sourceUrl, settings);
      return;
    }
    // Composite transparent PNG onto the new background colour
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = pngUrl; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = color.hex;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const compositeUrl = c.toDataURL("image/jpeg", 0.95);
    faceRef.current = null;
    setSourceUrl(compositeUrl);
  };

  /** Apply red-eye removal to the current finalCanvas. */
  const handleFixRedEye = () => {
    if (!finalCanvas) return;
    const ctx = finalCanvas.getContext("2d");
    if (!ctx) return;
    const fixed = removeRedEye(ctx, finalCanvas.width, finalCanvas.height, standard.faceRatioDefault);
    trackRedEyeFixed(fixed);
    setRedEyeFixed(true);
    // Redraw preview
    const el = previewRef.current;
    if (el) {
      const pCtx = el.getContext("2d");
      pCtx?.drawImage(finalCanvas, 0, 0, el.width, el.height);
    }
  };

  // ── download / payment ────────────────────────────────────────────────────
  const download = async (mode: "print" | "portal" = exportMode) => {
    if (!finalCanvas) return;
    trackDownload("icao_photo", mode);

    let blob: Blob;
    let suffix = "";
    if (mode === "portal") {
      const result = await canvasToBlobUnder(finalCanvas, 200 * 1024);
      blob = result.blob;
      suffix = `-portal-${result.sizeKB}kb`;
    } else {
      blob = await canvasToBlob(finalCanvas, 0.95);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${originalFileName}-icao-${ICAO_WIDTH}x${ICAO_HEIGHT}${suffix}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startCheckout = async () => {
    if (!finalCanvas) return;
    if (IS_DEV) {
      setPaid(true);
      return;
    }
    setCheckoutLoading(true);
    setError(null);
    try {
      await openRazorpayCheckout({
        product: "icao_photo",
        onSuccess: () => {
          setPaid(true);
          localStorage.setItem(STORAGE_KEY, "1");
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
  const showWatermark = IS_DEV && !paid && watermarkOn;

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
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
          ICAO 9303 Compliant
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Passport Photo Studio
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Auto face detection · AI background removal · compliance check ·{" "}
          {standard.widthPx}×{standard.heightPx} px · {standard.widthMm}×{standard.heightMm} mm
        </p>
      </header>

      {/* ── Document Standard Selector ─────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label htmlFor="std-select" className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">
          Document type
        </label>
        <div className="relative flex-1 min-w-[220px]">
          <select
            id="std-select"
            value={standard.id}
            onChange={(e) => {
              const s = PHOTO_STANDARDS.find((x) => x.id === e.target.value);
              if (s) handleStandardChange(s);
            }}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            {Object.entries(groupedStandards()).map(([group, standards]) => (
              <optgroup key={group} label={group}>
                {standards.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.flag} {s.label} — {s.widthMm}×{s.heightMm} mm ({s.widthPx}×{s.heightPx} px)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
        </div>
        {/* Selected standard meta */}
        <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
          <span className="text-base">{standard.flag}</span>
          <span className="font-medium text-slate-700">{standard.widthMm}×{standard.heightMm} mm</span>
          <span>·</span>
          <span>{standard.widthPx}×{standard.heightPx} px</span>
          {standard.notes && (
            <span title={standard.notes} className="cursor-help text-slate-400">ⓘ</span>
          )}
        </div>
      </div>

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
              className="flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white p-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/50"
            >
              <span className="text-6xl">📷</span>
              <span className="mt-5 text-xl font-semibold text-slate-800">
                Drop your photo here
              </span>
              <span className="mt-2 max-w-md text-slate-500">
                or click to browse · {SUPPORTED_FORMATS_LABEL}
              </span>
              <span className="mt-6 rounded-full bg-indigo-800 px-6 py-2.5 text-sm font-medium text-white">
                Upload photo
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* Header */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {showWatermark && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Watermarked preview
                    </span>
                  )}
                  {bgRemoved && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      BG Removed ✓
                    </span>
                  )}
                  {convertNote && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      {convertNote}
                    </span>
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

              {/* Before / After side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                {/* LEFT — Original */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Original
                  </p>
                  <div
                    className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
                    style={{ aspectRatio: `${ICAO_WIDTH}/${ICAO_HEIGHT}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={originalUrl ?? sourceUrl ?? ""}
                      alt="Original photo"
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>

                {/* RIGHT — Processed ICAO */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {standard.flag} {standard.label} · {standard.widthPx}×{standard.heightPx}
                  </p>
                  <div
                    className="relative overflow-hidden rounded-lg border border-indigo-100"
                    style={{ aspectRatio: `${ICAO_WIDTH}/${ICAO_HEIGHT}` }}
                  >
                    <canvas
                      ref={previewRef}
                      width={ICAO_WIDTH}
                      height={ICAO_HEIGHT}
                      className="h-full w-full"
                    />
                    {busy && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85">
                        <svg
                          className="h-8 w-8 animate-spin text-indigo-600"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        <span className="text-xs font-medium text-slate-600">{overlayLabel}</span>
                        {bgRemoving && bgProgress && (
                          <div className="w-32 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-1.5 rounded-full bg-indigo-500 transition-all duration-300"
                              style={{ width: `${bgProgress.pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BG removal + color row */}
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!bgRemoved ? (
                    <button
                      type="button"
                      onClick={() => void handleRemoveBg()}
                      disabled={bgRemoving || processing}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      <span>✨</span> Remove Background
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRestoreBg}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      ↩ Restore BG
                    </button>
                  )}
                  {/* Red-eye fix */}
                  <button
                    type="button"
                    onClick={handleFixRedEye}
                    disabled={!finalCanvas || busy}
                    title="Detect and neutralise red-eye in the eye regions"
                    className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50
                      ${redEyeFixed ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    👁 {redEyeFixed ? "Red-eye fixed ✓" : "Fix red-eye"}
                  </button>
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
                    className="ml-auto rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Dedicated BG Remover →
                  </a>
                </div>

                {/* Background colour picker — shown after BG removal */}
                {bgRemoved && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-500">Background:</span>
                    {standard.bgColors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void handleBgColorChange(c)}
                        title={c.label}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition
                          ${bgColor.id === c.id ? "border-indigo-500 ring-1 ring-indigo-400" : "border-slate-300 hover:border-indigo-300"}`}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-slate-300 shadow-sm"
                          style={{ background: c.hex }}
                        />
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Export size toggle + download / pay row */}
              {paid ? (
                <div className="mt-3 space-y-2.5">
                  {/* Size mode toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Export&nbsp;as:</span>
                    <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => { setExportMode("print"); trackExportModeChanged("print"); }}
                        className={`px-3 py-1.5 transition ${exportMode === "print" ? "bg-indigo-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        Print quality
                      </button>
                      <button
                        type="button"
                        onClick={() => { setExportMode("portal"); trackExportModeChanged("portal"); }}
                        className={`px-3 py-1.5 transition border-l border-slate-200 ${exportMode === "portal" ? "bg-indigo-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        Portal &lt;200 KB
                      </button>
                    </div>
                    <span className="ml-auto text-[11px] text-slate-400">
                      {exportMode === "portal" ? "Auto-optimised for govt portals" : "Best for printing"}
                    </span>
                  </div>

                  {/* EXIF strip notice */}
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span>🔒</span> EXIF metadata stripped · GPS &amp; device info removed on export
                  </p>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void download()}
                      disabled={!finalCanvas}
                      className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ↓ Download JPEG
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (finalCanvas) printPassportSheet(finalCanvas, originalFileName); }}
                      disabled={!finalCanvas}
                      title="Opens a print-ready A4 sheet with crop marks"
                      className="flex-1 rounded-xl border-2 border-indigo-800 bg-white px-5 py-3 font-semibold text-indigo-800 shadow hover:bg-indigo-50 disabled:opacity-50"
                    >
                      🖨 Print / PDF
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    disabled={!finalCanvas || checkoutLoading}
                    className="w-full rounded-xl bg-indigo-800 px-5 py-3 font-semibold text-white shadow hover:bg-indigo-900 disabled:opacity-50"
                  >
                    {checkoutLoading ? "Redirecting…" : `Unlock forever — ${PRICE_DISPLAY}`}
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    Download JPEG (print quality or &lt;200 KB) · Print A4 sheet · Lifetime access
                  </p>
                </div>
              )}
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
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
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
                className="text-xs font-medium text-indigo-700"
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
                    className="h-4 w-4 accent-indigo-800"
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
                  <span className="shrink-0 text-indigo-400">•</span>
                  <span><strong>{g.label}</strong> — {g.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Commercial badge */}
          <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white">
            <p className="text-sm font-semibold">Lifetime access · {PRICE_DISPLAY} once</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Pay once, use forever — unlimited ICAO photos and background removals. No subscription, no per-download fees. All processing stays on your device.
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
