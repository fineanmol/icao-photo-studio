import { ICAO_HEIGHT, ICAO_WIDTH } from "./icao-constants";
import { getCanvas2D } from "./canvas";

/** Watermark text applied client-side only (never on server). */
export const WATERMARK_TEXT = "PREVIEW — ICAO PHOTO";

export type WatermarkOptions = {
  text?: string;
  opacity?: number;
  angle?: number;
  lineSpacing?: number;
};

/**
 * Applies a diagonal preview watermark on a canvas copy.
 * Runs entirely in the browser — safe to call for unpaid previews.
 */
export function applyWatermark(
  source: HTMLCanvasElement,
  options: WatermarkOptions = {},
): HTMLCanvasElement {
  const {
    text = WATERMARK_TEXT,
    opacity = 0.35,
    angle = -0.35,
    lineSpacing = 70,
  } = options;

  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const ctx = getCanvas2D(copy);
  ctx.drawImage(source, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#1e3a5f";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.translate(copy.width / 2, copy.height / 2);
  ctx.rotate(angle);
  for (let y = -200; y <= 200; y += lineSpacing) {
    ctx.fillText(text, 0, y);
  }
  ctx.restore();

  return copy;
}

export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = 0.95,
): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Export failed"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Loads an image URL onto a canvas, applies a watermark, and returns a new
 * object-URL pointing at the watermarked version (JPEG). The format (PNG/JPEG)
 * of the source is preserved as JPEG for consistency.
 * Caller is responsible for revoking the returned URL when done.
 */
export async function applyWatermarkToUrl(
  imageUrl: string,
  options?: WatermarkOptions,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  getCanvas2D(canvas).drawImage(img, 0, 0);

  const watermarked = applyWatermark(canvas, options);

  return new Promise<string>((resolve, reject) => {
    watermarked.toBlob(
      (blob) =>
        blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Watermark export failed")),
      "image/jpeg",
      0.9,
    );
  });
}

/** Download the watermarked preview JPEG locally (for testing). */
export async function downloadWatermarkedPreview(
  source: HTMLCanvasElement,
  options?: WatermarkOptions,
): Promise<void> {
  const watermarked = applyWatermark(source, options);
  await downloadCanvas(
    watermarked,
    `icao-preview-watermarked-${ICAO_WIDTH}x${ICAO_HEIGHT}.jpg`,
  );
}
