import {
  BACKGROUND_RGB,
  FACE_RATIO_DEFAULT,
  ICAO_HEIGHT,
  ICAO_WIDTH,
} from "./icao-constants";
import { getCanvas2D } from "./canvas";
import type { FaceBox } from "./face-detection";

export type ICAOSettings = {
  faceRatio: number;
  offsetX: number;
  offsetY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  backgroundStrength: number;
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
  backgroundStrength: 0,
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

/**
 * Luminance-only background whitening.
 * Blends near-white pixels toward pure white.
 * Safe: does NOT modify dark pixels (face/hair) or force any area to white.
 * strength=0 → skip entirely. strength=100 → whiten pixels above lum ~195.
 */
function whitenBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
) {
  if (strength <= 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // threshold: at strength 100 → lum 195; at strength 50 → lum 227
  const threshold = 255 - (strength / 100) * 60;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum > threshold) {
      // Smooth blend: 0 at threshold, 1 at lum=255
      const blend = (lum - threshold) / (255 - threshold);
      d[i] = Math.round(r + (BACKGROUND_RGB.r - r) * blend);
      d[i + 1] = Math.round(g + (BACKGROUND_RGB.g - g) * blend);
      d[i + 2] = Math.round(b + (BACKGROUND_RGB.b - b) * blend);
    }
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

export async function processToICAO(
  imageSrc: string,
  face: FaceBox | null,
  settings: ICAOSettings,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageSrc);
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = getCanvas2D(srcCanvas);
  srcCtx.drawImage(img, 0, 0);

  // Fallback face box: assume face occupies central portrait region
  const fallbackFace: FaceBox = {
    x: img.naturalWidth * 0.2,
    y: img.naturalHeight * 0.05,
    width: img.naturalWidth * 0.6,
    height: img.naturalHeight * 0.82,
  };

  const crop = computeCrop(
    img.naturalWidth,
    img.naturalHeight,
    face ?? fallbackFace,
    settings,
  );

  const out = document.createElement("canvas");
  out.width = ICAO_WIDTH;
  out.height = ICAO_HEIGHT;
  const ctx = getCanvas2D(out, { willReadFrequently: true });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ICAO_WIDTH, ICAO_HEIGHT);

  // Use high-quality downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    srcCanvas,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    ICAO_WIDTH,
    ICAO_HEIGHT,
  );

  applyAdjustments(ctx, ICAO_WIDTH, ICAO_HEIGHT, settings);
  whitenBackground(ctx, ICAO_WIDTH, ICAO_HEIGHT, settings.backgroundStrength);
  unsharpMask(ctx, ICAO_WIDTH, ICAO_HEIGHT, settings.sharpen);

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
