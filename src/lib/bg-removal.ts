/**
 * Client-side background removal using @imgly/background-removal.
 * Runs 100% in the browser via ONNX/WASM — no server, no API key.
 */

export type BgModel = "fast" | "balanced" | "quality";

export const BG_MODEL_INFO: Record<BgModel, { label: string; description: string }> = {
  fast: { label: "Fast", description: "Quick removal, slightly less precise on fine hair" },
  balanced: { label: "Balanced", description: "Great quality with reasonable speed (recommended)" },
  quality: { label: "Best Quality", description: "Finest detail — hair strands, see-through fabric" },
};

const MODEL_ID: Record<BgModel, "isnet_quint8" | "isnet_fp16" | "isnet"> = {
  fast: "isnet_quint8",
  balanced: "isnet_fp16",
  quality: "isnet",
};

export type BgRemovalProgress = {
  phase: string;
  pct: number;
};

type RemoveFn = (
  image: Blob | string,
  config?: {
    model?: "isnet" | "isnet_fp16" | "isnet_quint8";
    output?: { format?: string; quality?: number };
    progress?: (key: string, current: number, total: number) => void;
    device?: "cpu" | "gpu";
  },
) => Promise<Blob>;

let _removeBackground: RemoveFn | null = null;

async function getRemoveFn(): Promise<RemoveFn> {
  if (_removeBackground) return _removeBackground;
  const mod = await import("@imgly/background-removal");
  _removeBackground = (mod.default ?? mod.removeBackground) as unknown as RemoveFn;
  return _removeBackground;
}

export type BgRemovalResult = {
  /** Object-URL of the white-background JPEG (for ICAO studio) */
  whiteJpegUrl: string;
  /** Object-URL of the transparent PNG (for the dedicated remover page) */
  transparentPngUrl: string;
  /** Width of the result image */
  width: number;
  /** Height of the result image */
  height: number;
};

/**
 * Remove background from an image and return both a white-JPEG and transparent PNG.
 * @param imageSrc  Object-URL or data-URL of the source image
 * @param model     "fast" | "balanced" | "quality"  (default: "balanced")
 * @param onProgress  optional progress callback
 */
export async function removeImageBackground(
  imageSrc: string,
  modelOrProgress?: BgModel | ((p: BgRemovalProgress) => void),
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<string>;

export async function removeImageBackground(
  imageSrc: string,
  model: BgModel,
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<string>;

export async function removeImageBackground(
  imageSrc: string,
  modelOrProgress?: BgModel | ((p: BgRemovalProgress) => void),
  onProgressArg?: (p: BgRemovalProgress) => void,
): Promise<string> {
  let model: BgModel = "balanced";
  let onProgress: ((p: BgRemovalProgress) => void) | undefined;

  if (typeof modelOrProgress === "function") {
    onProgress = modelOrProgress;
  } else if (typeof modelOrProgress === "string") {
    model = modelOrProgress;
    onProgress = onProgressArg;
  }

  const removeBg = await getRemoveFn();
  onProgress?.({ phase: "Preparing…", pct: 0 });

  const res = await fetch(imageSrc);
  const srcBlob = await res.blob();

  const resultBlob = await removeBg(srcBlob, {
    model: MODEL_ID[model],
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      const phase = key.includes("fetch") ? "Downloading AI model…" : "Removing background…";
      onProgress?.({ phase, pct });
    },
  });

  onProgress?.({ phase: "Compositing…", pct: 99 });

  // Composite the alpha-channel result onto pure white
  const bitmap = await createImageBitmap(resultBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new Error("Compositing failed")),
      "image/jpeg",
      0.96,
    );
  });
}

/**
 * Full removal returning both white-JPEG and transparent-PNG URLs.
 * Used by the dedicated /bg-remover page.
 */
export async function removeImageBackgroundFull(
  imageSrc: string,
  model: BgModel = "balanced",
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<BgRemovalResult> {
  const removeBg = await getRemoveFn();
  onProgress?.({ phase: "Preparing…", pct: 0 });

  const res = await fetch(imageSrc);
  const srcBlob = await res.blob();

  const resultBlob = await removeBg(srcBlob, {
    model: MODEL_ID[model],
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      const phase = key.includes("fetch") ? "Downloading AI model…" : "Removing background…";
      onProgress?.({ phase, pct });
    },
  });

  onProgress?.({ phase: "Finalising…", pct: 98 });

  const bitmap = await createImageBitmap(resultBlob);
  const w = bitmap.width;
  const h = bitmap.height;

  // Transparent PNG
  const pngCanvas = document.createElement("canvas");
  pngCanvas.width = w;
  pngCanvas.height = h;
  pngCanvas.getContext("2d")!.drawImage(bitmap, 0, 0);

  // White JPEG
  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = w;
  jpegCanvas.height = h;
  const jCtx = jpegCanvas.getContext("2d")!;
  jCtx.fillStyle = "#ffffff";
  jCtx.fillRect(0, 0, w, h);
  jCtx.drawImage(bitmap, 0, 0);

  bitmap.close();

  const [transparentPngUrl, whiteJpegUrl] = await Promise.all([
    new Promise<string>((res, rej) =>
      pngCanvas.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej()), "image/png"),
    ),
    new Promise<string>((res, rej) =>
      jpegCanvas.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej()), "image/jpeg", 0.96),
    ),
  ]);

  return { whiteJpegUrl, transparentPngUrl, width: w, height: h };
}
