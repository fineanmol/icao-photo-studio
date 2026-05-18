import {
  FACE_RATIO_DEFAULT,
  ICAO_HEIGHT,
  ICAO_WIDTH,
} from "./icao-constants";
import { getCanvas2D } from "./canvas";
import type { FaceBox } from "./face-detection";

/** FaceBox extended with optional auto-correction hints from FaceAnalysis. */
type FaceInput = FaceBox & { rollDeg?: number };

export type ICAOSettings = {
  faceRatio: number;
  offsetX: number;
  offsetY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
};

/** All adjustments default to 0 = neutral (no change to source photo). */
export const defaultSettings: ICAOSettings = {
  faceRatio: FACE_RATIO_DEFAULT,
  offsetX: 0,
  offsetY: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Applies brightness, contrast, saturation adjustments.
 * All at 0 = identity (no pixel change).
 */
function applyAdjustments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  settings: ICAOSettings,
) {
  const { brightness, contrast, saturation } = settings;
  if (brightness === 0 && contrast === 0 && saturation === 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // Standard photo-editor contrast formula: cFactor of 1.0 = no change (at contrast=0)
  const cFactor =
    contrast === 0 ? 1 : (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100; // 1.0 at saturation=0

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // Contrast (pivot at 128)
    if (contrast !== 0) {
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;
    }

    // Brightness (simple offset)
    if (brightness !== 0) {
      r += brightness;
      g += brightness;
      b += brightness;
    }

    // Saturation
    if (saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;
    }

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(imageData, 0, 0);
}


function unsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
) {
  if (amount <= 0) return;
  const copy = document.createElement("canvas");
  copy.width = w;
  copy.height = h;
  const cctx = getCanvas2D(copy, { willReadFrequently: true });
  cctx.filter = "blur(1px)";
  cctx.drawImage(ctx.canvas, 0, 0);
  const orig = ctx.getImageData(0, 0, w, h);
  const blurred = cctx.getImageData(0, 0, w, h);
  const factor = amount / 100;
  for (let i = 0; i < orig.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      orig.data[i + c] = Math.min(
        255,
        Math.max(
          0,
          orig.data[i + c] +
            factor * (orig.data[i + c] - blurred.data[i + c]),
        ),
      );
    }
  }
  ctx.putImageData(orig, 0, 0);
}

/**
 * Computes source crop region so that:
 *  - face fills faceRatio of outH vertically
 *  - face is horizontally centered
 *  - hair top sits at ~8% from the top of the output frame
 *  - chin sits at ~90% from the top, leaving ~10% below
 *
 * offsetX / offsetY let the user nudge in source pixels.
 * outW / outH default to ICAO_WIDTH / ICAO_HEIGHT.
 */
export function computeCrop(
  imgW: number,
  imgH: number,
  face: FaceBox,
  settings: ICAOSettings,
  outW = ICAO_WIDTH,
  outH = ICAO_HEIGHT,
): { sx: number; sy: number; sw: number; sh: number } {
  // Scale so face height maps to faceRatio of output height
  const targetFaceH = outH * settings.faceRatio;
  const scale = targetFaceH / face.height;

  const sw = outW / scale;
  const sh = outH / scale;

  // Horizontal: center on face
  const faceCenterX = face.x + face.width / 2;
  let sx = faceCenterX - sw / 2 + settings.offsetX;

  // Vertical: place hair top (face.y) at 8% from top of output frame
  // → sy = face.y - sh * 0.08
  let sy = face.y - sh * 0.08 + settings.offsetY;

  // Clamp to image bounds
  sx = Math.max(0, Math.min(imgW - sw, sx));
  sy = Math.max(0, Math.min(imgH - sh, sy));

  // If the image is smaller than the desired crop, scale down without distortion
  if (sw > imgW || sh > imgH) {
    const safeScale = Math.min(imgW / sw, imgH / sh);
    const newSw = sw * safeScale;
    const newSh = sh * safeScale;
    return {
      sx: (imgW - newSw) / 2,
      sy: (imgH - newSh) / 2,
      sw: newSw,
      sh: newSh,
    };
  }

  return { sx, sy, sw, sh };
}

/**
 * Counter-rotates a source canvas by -rollDeg to level a tilted head.
 * Also transforms the face box centre into the new coordinate space.
 * Threshold: only applies when |rollDeg| > 1.5° (below that, cropping hides it).
 */
function correctRoll(
  srcCanvas: HTMLCanvasElement,
  face: FaceBox,
  rollDeg: number,
): { canvas: HTMLCanvasElement; face: FaceBox } {
  if (Math.abs(rollDeg) <= 1.5) return { canvas: srcCanvas, face };

  const rad = (-rollDeg * Math.PI) / 180; // negate to counter-rotate
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const newW = Math.ceil(srcW * cos + srcH * sin);
  const newH = Math.ceil(srcW * sin + srcH * cos);

  const dst = document.createElement("canvas");
  dst.width = newW;
  dst.height = newH;
  const dstCtx = getCanvas2D(dst);
  dstCtx.fillStyle = "#ffffff";
  dstCtx.fillRect(0, 0, newW, newH);
  dstCtx.save();
  dstCtx.translate(newW / 2, newH / 2);
  dstCtx.rotate(rad);
  dstCtx.drawImage(srcCanvas, -srcW / 2, -srcH / 2);
  dstCtx.restore();

  // Transform the face centre into the rotated coordinate space
  const fcx = face.x + face.width / 2 - srcW / 2;
  const fcy = face.y + face.height / 2 - srcH / 2;
  const newFcx = fcx * Math.cos(rad) - fcy * Math.sin(rad) + newW / 2;
  const newFcy = fcx * Math.sin(rad) + fcy * Math.cos(rad) + newH / 2;

  const adjustedFace: FaceBox = {
    x: newFcx - face.width / 2,
    y: newFcy - face.height / 2,
    width: face.width,
    height: face.height,
  };

  return { canvas: dst, face: adjustedFace };
}

/**
 * Automatically balances lighting across left and right halves of the face.
 * Measures luminance asymmetry in the face region (skipping white background),
 * then applies a smooth horizontal gradient boost to equalise both sides.
 * Only activates when asymmetry > 10 luminance units to avoid over-processing.
 */
function fixLightingAsymmetry(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const faceY0 = Math.floor(h * 0.10);
  const faceY1 = Math.floor(h * 0.80);
  const cx = w / 2;

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  let leftSum = 0, rightSum = 0, leftN = 0, rightN = 0;
  for (let y = faceY0; y < faceY1; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum < 230) { // ignore near-white background
        if (x < cx) { leftSum += lum; leftN++; }
        else { rightSum += lum; rightN++; }
      }
    }
  }

  if (leftN === 0 || rightN === 0) return;
  const diff = rightSum / rightN - leftSum / leftN; // + = right brighter
  if (Math.abs(diff) < 10) return;

  // Smooth horizontal gradient: t = -1 at left edge, +1 at right edge
  // Correction opposes the diff (boosts the darker side)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum >= 230) continue; // leave white background untouched
      const t = (x / w) * 2 - 1;         // -1 … +1
      const corr = -(diff / 2) * t;       // gentle half-correction
      d[i]     = Math.min(255, Math.max(0, d[i]     + corr));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + corr));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + corr));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/** Optional per-standard output overrides passed to processToICAO. */
export interface OutputConfig {
  width?: number;
  height?: number;
  /** CSS colour string for the background fill (default: #ffffff). */
  bgColor?: string;
}

/**
 * Removes red-eye from the eye zone of an already-rendered output canvas.
 * Uses approximate anatomical positions since we don't have landmark coords
 * in output-canvas space. Returns the number of pixels corrected.
 */
export function removeRedEye(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  faceRatio = 0.825,
): number {
  const faceH  = h * faceRatio;
  const faceTop = (h - faceH) / 2;

  // Eye zone: ~28–46% from top of face (between brows and lower eyelid)
  const eyeY0 = Math.floor(faceTop + faceH * 0.28);
  const eyeY1 = Math.floor(faceTop + faceH * 0.46);

  // Avoid the nose bridge (centre 10%)
  const leftX0 = Math.floor(w * 0.12), leftX1  = Math.floor(w * 0.44);
  const rightX0 = Math.floor(w * 0.56), rightX1 = Math.floor(w * 0.88);

  const id = ctx.getImageData(0, 0, w, h);
  const d  = id.data;
  let fixed = 0;

  for (let y = eyeY0; y < eyeY1; y++) {
    for (let x = 0; x < w; x++) {
      const inEye = (x >= leftX0 && x <= leftX1) || (x >= rightX0 && x <= rightX1);
      if (!inEye) continue;

      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];

      // Classic red-eye heuristic: very red, low green & blue
      if (r > 100 && r > g * 2.2 && r > b * 2.2) {
        const avg = Math.round((g + b) / 2);
        d[i]     = avg;   // reduce red channel
        d[i + 1] = Math.round(avg * 1.05); // slight green boost for natural look
        fixed++;
      }
    }
  }

  if (fixed > 0) ctx.putImageData(id, 0, 0);
  return fixed;
}

export async function processToICAO(
  imageSrc: string,
  face: FaceInput | null,
  settings: ICAOSettings,
  outputCfg: OutputConfig = {},
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageSrc);

  let srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  getCanvas2D(srcCanvas).drawImage(img, 0, 0);

  // Fallback face box
  const fallbackFace: FaceBox = {
    x: img.naturalWidth * 0.2,
    y: img.naturalHeight * 0.05,
    width: img.naturalWidth * 0.6,
    height: img.naturalHeight * 0.82,
  };

  let effectiveFace: FaceBox = face ?? fallbackFace;

  // ── Auto-correct head tilt (roll) ─────────────────────────────────
  if (face && typeof face.rollDeg === "number" && isFinite(face.rollDeg)) {
    const { canvas: rotated, face: rotFace } = correctRoll(
      srcCanvas,
      effectiveFace,
      face.rollDeg,
    );
    srcCanvas = rotated;
    effectiveFace = rotFace;
  }

  const outW = outputCfg.width  ?? ICAO_WIDTH;
  const outH = outputCfg.height ?? ICAO_HEIGHT;
  const bgColor = outputCfg.bgColor ?? "#ffffff";

  const crop = computeCrop(
    srcCanvas.width,
    srcCanvas.height,
    effectiveFace,
    settings,
    outW,
    outH,
  );

  const out = document.createElement("canvas");
  out.width  = outW;
  out.height = outH;
  const ctx = getCanvas2D(out, { willReadFrequently: true });

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(srcCanvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outW, outH);

  applyAdjustments(ctx, outW, outH, settings);
  unsharpMask(ctx, outW, outH, settings.sharpen);

  // ── Auto-correct lighting asymmetry ───────────────────────────────
  fixLightingAsymmetry(ctx, outW, outH);

  return out;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Binary-search the highest JPEG quality that keeps the blob under `maxBytes`.
 * Returns the blob and the quality that was used.
 * Falls back to quality=0.1 if even that exceeds the limit.
 */
export async function canvasToBlobUnder(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<{ blob: Blob; quality: number; sizeKB: number }> {
  let lo = 0.05;
  let hi = 0.95;
  let best: Blob | null = null;
  let bestQ = lo;

  // ~8 iterations → accuracy to within ~0.4% quality
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mid);
    if (blob.size <= maxBytes) {
      best = blob;
      bestQ = mid;
      lo = mid; // quality fits — try higher
    } else {
      hi = mid; // too large — lower quality
    }
  }

  if (!best) {
    // Even 0.1 is over the limit — just return the smallest we can make
    best = await canvasToBlob(canvas, 0.1);
    bestQ = 0.1;
  }

  return { blob: best, quality: bestQ, sizeKB: Math.round(best.size / 1024) };
}
