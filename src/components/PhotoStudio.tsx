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
const DEV_DOWNLOAD =
  process.env.NEXT_PUBLIC_ALLOW_DEV_DOWNLOAD === "true";

function statusColor(status: ValidationItem["status"]) {
  switch (status) {
    case "pass":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "warn":
      return "text-amber-800 bg-amber-50 border-amber-200";
    case "fail":
      return "text-red-800 bg-red-50 border-red-200";
    default:
      return "text-slate-600 bg-slate-50 border-slate-200";
  }
}

function StatusIcon({ status }: { status: ValidationItem["status"] }) {
  if (status === "pass") return <span aria-hidden>✓</span>;
  if (status === "fail") return <span aria-hidden>✕</span>;
  if (status === "warn") return <span aria-hidden>!</span>;
  return <span aria-hidden>○</span>;
}

export default function PhotoStudio() {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [face, setFace] = useState<FaceBox | null>(null);
  const [settings, setSettings] = useState<ICAOSettings>(defaultSettings);
  const [finalCanvas, setFinalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [paid, setPaid] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watermarkOn, setWatermarkOn] = useState(true);
  const [showWatermarkTools, setShowWatermarkTools] = useState(DEV_DOWNLOAD);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const revokeSourceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadFaceModels()
      .then(() => setModelsReady(true))
      .catch(() => setModelsReady(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") setPaid(true);

    const params = new URLSearchParams(window.location.search);
    if (params.get("testWatermark") === "1") {
      setShowWatermarkTools(true);
      setWatermarkOn(true);
    }

    const sessionId = params.get("session_id");
    const paidParam = params.get("paid");
    if (paidParam === "1" && sessionId) {
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

  const runProcess = useCallback(async () => {
    if (!sourceUrl) return;
    setProcessing(true);
    setError(null);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = sourceUrl;
      });

      let detected = face;
      if (modelsReady) {
        detected = await detectFace(img);
        if (detected) setFace(detected);
      }

      const out = await processToICAO(sourceUrl, detected, settings);
      setFinalCanvas(out);

      const fallback: FaceBox = {
        x: img.naturalWidth * 0.25,
        y: img.naturalHeight * 0.12,
        width: img.naturalWidth * 0.5,
        height: img.naturalHeight * 0.65,
      };
      const f = detected ?? fallback;
      const crop = computeCrop(img.naturalWidth, img.naturalHeight, f, settings);
      setValidations(validateICAO(out, detected, f.height * (ICAO_WIDTH / crop.sw)));
    } catch {
      setError("Could not process this image. Try another JPG or PNG.");
    } finally {
      setProcessing(false);
    }
  }, [sourceUrl, face, settings, modelsReady]);

  useEffect(() => {
    if (!sourceUrl) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runProcess();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceUrl, settings, runProcess]);

  const onFile = async (file: File) => {
    setError(null);
    setConvertNote(null);
    setLoadingImage(true);
    try {
      revokeSourceRef.current?.();
      revokeSourceRef.current = null;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);

      const prepared = await prepareImageFile(file);
      revokeSourceRef.current = prepared.revoke;
      setSourceUrl(prepared.url);
      if (prepared.convertedFrom) {
        setConvertNote(`Converted ${prepared.convertedFrom} locally for editing.`);
      }
      setFace(null);
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

  const download = async () => {
    const canvas = finalCanvas;
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
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

  const update = <K extends keyof ICAOSettings>(key: K, value: ICAOSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const previewRef = useRef<HTMLCanvasElement>(null);
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
          Convert any portrait to {ICAO_WIDTH}×810px with white background, correct face
          framing, and automated compliance checks — ready for passport applications.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
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
              className="flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-gradient-to-b from-sky-50/80 to-white p-10 transition hover:border-sky-400 hover:bg-sky-50/50"
            >
              <span className="text-5xl">📷</span>
              <span className="mt-4 text-xl font-semibold text-slate-800">
                Drop your photo here
              </span>
              <span className="mt-2 max-w-md text-center text-slate-500">
                or click to browse · {SUPPORTED_FORMATS_LABEL}
              </span>
              <span className="mt-6 rounded-full bg-sky-600 px-6 py-2.5 text-sm font-medium text-white">
                Upload photo
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-500">
                  Preview · {ICAO_WIDTH}×810px
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
              <div className="relative mx-auto max-w-[315px]">
                <canvas
                  ref={previewRef}
                  width={ICAO_WIDTH}
                  height={810}
                  className="h-auto w-full rounded-lg border border-slate-100 shadow-inner"
                  style={{ aspectRatio: `${ICAO_WIDTH}/810` }}
                />
                {(processing || loadingImage) && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                    <span className="text-sm font-medium text-slate-700">
                      {loadingImage ? "Loading image…" : "Processing…"}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {paid ? (
                  <button
                    type="button"
                    onClick={() => void download()}
                    disabled={!finalCanvas}
                    className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Download ICAO JPEG
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
                  onClick={() => void runProcess()}
                  className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Re-process
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
            }}
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {validations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Compliance check</h2>
              <ul className="mt-4 space-y-2">
                {validations.map((v) => (
                  <li
                    key={v.id}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${statusColor(v.status)}`}
                  >
                    <span className="mt-0.5 font-bold">
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

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">ICAO adjustments</h2>
            <p className="mt-1 text-sm text-slate-500">
              Fine-tune framing and quality. Output is always {ICAO_WIDTH}×810px.
            </p>
            <div className="mt-5 space-y-5">
              <Slider
                label="Face scale (80–85%)"
                min={78}
                max={88}
                value={Math.round(settings.faceRatio * 100)}
                onChange={(v) => update("faceRatio", v / 100)}
                hint={`${Math.round(settings.faceRatio * 100)}% of frame height`}
              />
              <Slider
                label="Horizontal position"
                min={-80}
                max={80}
                value={settings.offsetX}
                onChange={(v) => update("offsetX", v)}
              />
              <Slider
                label="Vertical position"
                min={-80}
                max={80}
                value={settings.offsetY}
                onChange={(v) => update("offsetY", v)}
              />
              <Slider
                label="Background whitening"
                min={50}
                max={100}
                value={settings.backgroundStrength}
                onChange={(v) => update("backgroundStrength", v)}
              />
              <Slider
                label="Brightness"
                min={-40}
                max={40}
                value={settings.brightness}
                onChange={(v) => update("brightness", v)}
              />
              <Slider
                label="Contrast"
                min={-20}
                max={40}
                value={settings.contrast}
                onChange={(v) => update("contrast", v)}
              />
              <Slider
                label="Saturation"
                min={-30}
                max={30}
                value={settings.saturation}
                onChange={(v) => update("saturation", v)}
              />
              <Slider
                label="Sharpen"
                min={0}
                max={40}
                value={settings.sharpen}
                onChange={(v) => update("sharpen", v)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Watermark (local)
              </h2>
              <button
                type="button"
                onClick={() => setShowWatermarkTools((v) => !v)}
                className="text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                {showWatermarkTools ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Applied in your browser only — text: &quot;{WATERMARK_TEXT}&quot;
            </p>
            {showWatermarkTools && (
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={watermarkOn}
                    disabled={paid}
                    onChange={(e) => setWatermarkOn(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                  />
                  Show watermark on preview
                </label>
                <button
                  type="button"
                  onClick={() => void downloadWatermarkedTest()}
                  disabled={!finalCanvas}
                  className="w-full rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                >
                  Download watermarked JPEG (test)
                </button>
                <p className="text-xs text-slate-500">
                  Open with{" "}
                  <code className="rounded bg-white px-1">?testWatermark=1</code> to
                  expand this panel on load.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              ICAO requirements
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {GUIDELINES.map((g) => (
                <li key={g.id} className="flex gap-2">
                  <span className="text-sky-600">•</span>
                  <span>
                    <strong>{g.label}</strong> — {g.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <p className="font-semibold">Commercial license</p>
            <p className="mt-2 text-sm text-slate-300">
              Pay once per photo for watermark-free {ICAO_WIDTH}×810 JPEG download.
              Processing runs in your browser — photos are not uploaded to our servers.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer accent-sky-600"
      />
    </label>
  );
}