"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BgModel,
  type BgRemovalProgress,
  type BgRemovalResult,
  BG_MODEL_INFO,
  removeImageBackgroundFull,
} from "@/lib/bg-removal";
import { isSupportedImageFile, prepareImageFile, FILE_INPUT_ACCEPT } from "@/lib/image-loader";
import { applyWatermarkToUrl } from "@/lib/watermark";
import { BG_REMOVAL_PRICE_DISPLAY } from "@/lib/icao-constants";
import { openRazorpayCheckout } from "@/lib/razorpay-client";

/** Same key as PhotoStudio — paying once unlocks all tools forever. */
const STORAGE_KEY = "icao_lifetime_paid";
const DEV_DOWNLOAD = process.env.NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD === "true";

/* ── helpers ──────────────────────────────────────────────── */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── comparison slider ──────────────────────────────────────── */
function CompareSlider({
  before,
  after,
  width,
  height,
}: {
  before: string;
  after: string;
  width: number;
  height: number;
}) {
  const [split, setSplit] = useState(50);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSplit = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setSplit(pct);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      updateSplit(e.clientX);
    },
    [updateSplit],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      updateSplit(x);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [updateSplit]);

  const aspectRatio = width > 0 && height > 0 ? height / width : 1;
  const maxW = 700;

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl shadow-xl border border-slate-200 cursor-col-resize"
      style={{ maxWidth: maxW, aspectRatio: `${width}/${height}` }}
      onMouseDown={onMouseDown}
      onTouchStart={(e) => {
        dragging.current = true;
        updateSplit(e.touches[0].clientX);
      }}
    >
      {/* Background: checkerboard pattern to show transparency */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Before (original) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Original"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* After (removed BG — transparent PNG) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${split}%)` }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={after}
          alt="Background removed"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* Divider handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
        style={{ left: `${split}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg border border-slate-200">
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        Original
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        BG Removed
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────── */
export default function BgRemover() {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);

  const [model, setModel] = useState<BgModel>("balanced");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<BgRemovalProgress | null>(null);
  const [result, setResult] = useState<BgRemovalResult | null>(null);
  /** Watermarked preview URLs shown in the compare slider when not paid */
  const [previewPngUrl, setPreviewPngUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [paid, setPaid] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevSourceRef = useRef<string | null>(null);
  const previewPngRef = useRef<string | null>(null);

  /* ── payment check ─────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "1" || DEV_DOWNLOAD) {
      setPaid(true);
    }
  }, []);

  /* ── load image ────────────────────────────────────────────── */
  const loadFile = useCallback(async (file: File) => {
    if (!isSupportedImageFile(file)) {
      setError("Unsupported file type. Please upload a JPEG, PNG, HEIC, TIFF or WebP image.");
      return;
    }
    setError(null);
    setResult(null);
    setProgress(null);
    if (previewPngRef.current) { URL.revokeObjectURL(previewPngRef.current); previewPngRef.current = null; }
    setPreviewPngUrl(null);
    if (prevSourceRef.current) URL.revokeObjectURL(prevSourceRef.current);

    const prepared = await prepareImageFile(file);
    prevSourceRef.current = prepared.url;
    setSourceUrl(prepared.url);
    setFileName(file.name);
    setFileSize(file.size);
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) await loadFile(file);
    },
    [loadFile],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await loadFile(file);
    },
    [loadFile],
  );

  /* ── remove background ─────────────────────────────────────── */
  const handleRemove = useCallback(async () => {
    if (!sourceUrl) return;
    setProcessing(true);
    setResult(null);
    setError(null);
    if (previewPngRef.current) { URL.revokeObjectURL(previewPngRef.current); previewPngRef.current = null; }
    setPreviewPngUrl(null);
    try {
      const res = await removeImageBackgroundFull(sourceUrl, model, (p) => setProgress(p));
      setResult(res);
      // Create a watermarked preview for the comparison slider (shown to unpaid users)
      if (!paid && !DEV_DOWNLOAD) {
        const wm = await applyWatermarkToUrl(res.transparentPngUrl, {
          text: "PREVIEW ONLY",
          opacity: 0.4,
        });
        previewPngRef.current = wm;
        setPreviewPngUrl(wm);
      }
    } catch (e) {
      setError(`Background removal failed: ${(e as Error).message}`);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [sourceUrl, model, paid]);

  /* ── Razorpay checkout ─────────────────────────────────────── */
  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    setError(null);
    try {
      await openRazorpayCheckout({
        product: "bg_removal",
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
  }, []);

  /* ── clean up object URLs on unmount ───────────────────────── */
  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.whiteJpegUrl);
        URL.revokeObjectURL(result.transparentPngUrl);
      }
      if (previewPngRef.current) URL.revokeObjectURL(previewPngRef.current);
      if (prevSourceRef.current) URL.revokeObjectURL(prevSourceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── download helpers ──────────────────────────────────────── */
  const downloadFile = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };

  const baseName = fileName.replace(/\.[^.]+$/, "") || "photo";
  /** URL shown in comparison slider — watermarked preview until paid */
  const sliderAfterUrl =
    paid || DEV_DOWNLOAD
      ? result?.transparentPngUrl ?? null
      : (previewPngUrl ?? result?.transparentPngUrl ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Background Remover</h1>
        <p className="text-slate-500">
          AI-powered removal — runs entirely in your browser. No upload to any server.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 transition-colors ${
          dragging
            ? "border-sky-400 bg-sky-50"
            : sourceUrl
              ? "border-emerald-300 bg-emerald-50/50"
              : "border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-sky-50/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !sourceUrl && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          className="hidden"
          onChange={onFileChange}
        />
        {sourceUrl ? (
          <div className="flex w-full items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt="source"
              className="h-20 w-20 shrink-0 rounded-xl object-cover shadow"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{fileName}</p>
              <p className="text-sm text-slate-500">{formatBytes(fileSize)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100">
              <svg className="h-7 w-7 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-700">Drop your photo here</p>
              <p className="mt-1 text-sm text-slate-500">or <span className="text-sky-500 underline cursor-pointer">browse to upload</span></p>
              <p className="mt-2 text-xs text-slate-400">JPEG · PNG · HEIC · TIFF · WebP</p>
            </div>
          </>
        )}
      </div>

      {/* Model selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">AI Model</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(BG_MODEL_INFO) as BgModel[]).map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3.5 transition-colors ${
                model === key
                  ? "border-sky-400 bg-sky-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="model"
                value={key}
                checked={model === key}
                onChange={() => setModel(key)}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full border-2 ${
                    model === key ? "border-sky-500 bg-sky-500" : "border-slate-300 bg-white"
                  }`}
                />
                <span className="text-sm font-semibold text-slate-800">{BG_MODEL_INFO[key].label}</span>
                {key === "balanced" && (
                  <span className="ml-auto rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-600">
                    Rec.
                  </span>
                )}
              </span>
              <p className="pl-[18px] text-xs leading-snug text-slate-500">{BG_MODEL_INFO[key].description}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Action */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="mt-0.5 shrink-0">✕</span>
          <span>{error}</span>
        </div>
      )}

      <button
        disabled={!sourceUrl || processing}
        onClick={handleRemove}
        className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-3.5 text-sm font-bold text-white shadow-md transition hover:from-sky-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {progress ? `${progress.phase} ${progress.pct}%` : "Processing…"}
          </span>
        ) : (
          "✨ Remove Background"
        )}
      </button>

      {/* Progress bar */}
      {processing && progress && (
        <div className="overflow-hidden rounded-full bg-slate-100 h-1.5">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-violet-400 transition-all duration-300"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}

      {/* Result */}
      {result && sourceUrl && sliderAfterUrl && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm">✓</span>
            <h2 className="text-lg font-semibold text-slate-800">Background Removed</h2>
            {!paid && !DEV_DOWNLOAD && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Watermarked preview
              </span>
            )}
            {(paid || DEV_DOWNLOAD) && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Unlocked ✓
              </span>
            )}
          </div>

          {/* Compare slider */}
          <div className="flex justify-center">
            <CompareSlider
              before={sourceUrl}
              after={sliderAfterUrl}
              width={result.width}
              height={result.height}
            />
          </div>
          <p className="text-center text-xs text-slate-400">
            Drag the handle to compare before / after
            {!paid && !DEV_DOWNLOAD && " · preview is watermarked"}
          </p>

          {/* Download options */}
          {paid || DEV_DOWNLOAD ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => downloadFile(result.transparentPngUrl, `${baseName}_nobg.png`)}
                className="flex flex-col items-start gap-1 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="text-lg">🖼</span> PNG — Transparent
                </span>
                <span className="text-xs text-slate-500">
                  Alpha channel preserved. Best for design work, presentations, compositing.
                </span>
              </button>

              <button
                onClick={() => downloadFile(result.whiteJpegUrl, `${baseName}_white_bg.jpg`)}
                className="flex flex-col items-start gap-1 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="text-lg">📄</span> JPEG — White Background
                </span>
                <span className="text-xs text-slate-500">
                  Smaller file, white backdrop. Ideal for passport / ID photos.
                </span>
              </button>
            </div>
          ) : (
              <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-sky-50 p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔒</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">One-time unlock — use forever</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Pay <strong>{BG_REMOVAL_PRICE_DISPLAY}</strong> once and get lifetime access to both the Background Remover and the ICAO Passport Studio — unlimited downloads, no watermarks, ever.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => void startCheckout()}
                      disabled={checkoutLoading}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:from-violet-700 hover:to-sky-700 disabled:opacity-60"
                    >
                      {checkoutLoading ? "Opening payment…" : `Unlock forever — ${BG_REMOVAL_PRICE_DISPLAY}`}
                    </button>
                    <span className="text-xs text-slate-400">Secure · Razorpay</span>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs text-slate-500">
                    <li>✓ Transparent PNG + white JPEG</li>
                    <li>✓ ICAO Passport Studio — unlimited</li>
                    <li>✓ All future features included</li>
                    <li>✓ Lifetime access, pay just once</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Process another */}
          <button
            onClick={() => {
              setResult(null);
              setSourceUrl(null);
              setFileName("");
              setFileSize(0);
              if (previewPngRef.current) { URL.revokeObjectURL(previewPngRef.current); previewPngRef.current = null; }
              setPreviewPngUrl(null);
              if (prevSourceRef.current) {
                URL.revokeObjectURL(prevSourceRef.current);
                prevSourceRef.current = null;
              }
            }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Process another image
          </button>
        </div>
      )}
    </div>
  );
}
