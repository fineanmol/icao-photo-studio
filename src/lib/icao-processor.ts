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
 *  - face fills faceRatio of ICAO_HEIGHT vertically
 *  - face is horizontally centered
 *  - hair top sits at ~8% from the top of the output (ICAO standard framing)
 *  - chin sits at ~90% from the top, leaving ~10% below
 *
 * offsetX / offsetY let the user nudge in source pixels.
 */
export function computeCrop(
  imgW: number,
  imgH: number,
  face: FaceBox,
  settings: ICAOSettings,
): { sx: number; sy: number; sw: number; sh: number } {
  // Scale so face height maps to faceRatio of output height
  const targetFaceH = ICAO_HEIGHT * settings.faceRatio;
  const scale = targetFaceH / face.height;

  const sw = ICAO_WIDTH / scale;
  const sh = ICAO_HEIGHT / scale;

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

export async function processToICAO(
  imageSrc: string,
  face: FaceInput | null,
  settings: ICAOSettings,
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

  const crop = computeCrop(
    srcCanvas.width,
    srcCanvas.height,
    effectiveFace,
    settings,
  );

  const out = document.createElement("canvas");
  out.width = ICAO_WIDTH;
  out.height = ICAO_HEIGHT;
  const ctx = getCanvas2D(out, { willReadFrequently: true });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ICAO_WIDTH, ICAO_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(srcCanvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, ICAO_WIDTH, ICAO_HEIGHT);

  applyAdjustments(ctx, ICAO_WIDTH, ICAO_HEIGHT, settings);
  unsharpMask(ctx, ICAO_WIDTH, ICAO_HEIGHT, settings.sharpen);

  // ── Auto-correct lighting asymmetry ───────────────────────────────
  fixLightingAsymmetry(ctx, ICAO_WIDTH, ICAO_HEIGHT);

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
