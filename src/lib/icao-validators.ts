import {
  FACE_RATIO_MAX,
  FACE_RATIO_MIN,
  ICAO_HEIGHT,
  ICAO_WIDTH,
} from "./icao-constants";
import { getCanvas2D } from "./canvas";
import type { FaceBox } from "./face-detection";

export type ValidationItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "manual";
  message: string;
};

/**
 * Compute Laplacian variance over only the central face region of the canvas.
 * Sampling the full image dilutes sharpness because the white background has
 * zero Laplacian response.
 */
function faceRegionSharpness(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): number {
  // Approximate face region: central 60% width, middle 60% height
  const x0 = Math.floor(w * 0.2);
  const y0 = Math.floor(h * 0.12);
  const x1 = Math.floor(w * 0.8);
  const y1 = Math.floor(h * 0.78);

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = y0 + 1; y < y1 - 1; y++) {
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const idx = (y * w + x) * 4;
      const gray =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      const lap =
        -4 * gray +
        (0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2]) +
        (0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6]) +
        (0.299 * data[idx - w * 4] + 0.587 * data[idx - w * 4 + 1] + 0.114 * data[idx - w * 4 + 2]) +
        (0.299 * data[idx + w * 4] + 0.587 * data[idx + w * 4 + 1] + 0.114 * data[idx + w * 4 + 2]);

      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Percentage of near-white border pixels (> lum 240). */
function backgroundWhitePercent(data: Uint8ClampedArray, w: number, h: number): number {
  let whiteCount = 0;
  let total = 0;

  const check = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum >= 240) whiteCount++;
    total++;
  };

  const step = 8;
  for (let x = 0; x < w; x += step) {
    check(x, 0);
    check(x, h - 1);
  }
  for (let y = step; y < h - step; y += step) {
    check(0, y);
    check(w - 1, y);
  }

  return total > 0 ? (whiteCount / total) * 100 : 0;
}

/** Average luminance of the central face area (avoid background region). */
function faceLuminance(data: Uint8ClampedArray, w: number, h: number): number {
  let sum = 0;
  let n = 0;
  const x0 = Math.floor(w * 0.2);
  const x1 = Math.floor(w * 0.8);
  const y0 = Math.floor(h * 0.12);
  const y1 = Math.floor(h * 0.78);

  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * w + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
  }
  return n > 0 ? sum / n : 128;
}

export function validateICAO(
  canvas: HTMLCanvasElement,
  face: FaceBox | null,
  /** Face height in OUTPUT pixels (face.height × output_scale) */
  faceOutputHeight?: number,
  bgRemoved = false,
): ValidationItem[] {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getCanvas2D(canvas, { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;

  const items: ValidationItem[] = [];

  // 1. Dimensions
  const dimsOk = w === ICAO_WIDTH && h === ICAO_HEIGHT;
  items.push({
    id: "dimensions",
    label: "630 × 810 pixels",
    status: dimsOk ? "pass" : "fail",
    message: dimsOk
      ? "Output dimensions match ICAO requirement."
      : `Current size is ${w}×${h}px — must be 630×810.`,
  });

  // 2. White background
  const bgPct = backgroundWhitePercent(data, w, h);
  const bgStatus = bgPct >= 95 ? "pass" : bgPct >= 75 ? "warn" : "fail";
  items.push({
    id: "background",
    label: "White background",
    status: bgStatus,
    message:
      bgStatus === "pass"
        ? bgRemoved
          ? "Background removed and replaced with pure white ✓"
          : "Border region is near pure white."
        : bgPct >= 75
          ? "Background appears light but may not be pure white. Use 'Remove Background' for best results."
          : "Background is not white. Use the 'Remove Background' button or retake with a plain white backdrop.",
  });

  // 3. Face ratio
  if (faceOutputHeight && faceOutputHeight > 0) {
    const ratio = faceOutputHeight / ICAO_HEIGHT;
    const inRange = ratio >= FACE_RATIO_MIN && ratio <= FACE_RATIO_MAX;
    const near = ratio >= 0.72 && ratio <= 0.92;
    items.push({
      id: "face-ratio",
      label: "Face 80–85% of frame",
      status: inRange ? "pass" : near ? "warn" : "fail",
      message: inRange
        ? `Face fills ~${Math.round(ratio * 100)}% of frame height — within ICAO range.`
        : `Face fills ~${Math.round(ratio * 100)}%. Adjust the face scale slider to bring it to 80–85%.`,
    });
  } else {
    items.push({
      id: "face-ratio",
      label: "Face 80–85% of frame",
      status: face ? "warn" : "fail",
      message: face
        ? "Face detected — verify framing looks correct in the preview."
        : "No face detected. Upload a clear front-facing portrait.",
    });
  }

  // 4. Brightness & exposure
  const lum = faceLuminance(data, w, h);
  const lumOk = lum >= 85 && lum <= 210;
  items.push({
    id: "brightness",
    label: "Brightness & contrast",
    status: lumOk ? "pass" : "warn",
    message: lumOk
      ? `Face region average luminance ${Math.round(lum)} — well exposed.`
      : lum < 85
        ? `Face looks too dark (avg luminance ${Math.round(lum)}). Increase brightness.`
        : `Face looks overexposed (avg luminance ${Math.round(lum)}). Decrease brightness.`,
  });

  // 5. Sharpness — measured only in face region, not over the whole canvas
  const sharpness = faceRegionSharpness(data, w, h);
  const sharpOk = sharpness > 60;
  const sharpWarn = sharpness > 30;
  items.push({
    id: "sharpness",
    label: "Photo is sharp",
    status: sharpOk ? "pass" : sharpWarn ? "warn" : "fail",
    message: sharpOk
      ? "Image appears sharp and in focus."
      : sharpWarn
        ? "Image may be slightly soft. Try increasing the Sharpen slider."
        : "Photo looks blurred. Use a sharper source image.",
  });

  // 6–8. Manual checks
  items.push({
    id: "pose",
    label: "Front-facing, eyes open",
    status: "manual",
    message: "Verify: direct gaze at camera, both eyes clearly visible, mouth closed.",
  });
  items.push({
    id: "lighting",
    label: "Uniform lighting, no shadows",
    status: "manual",
    message: "Verify: no harsh shadows on face, no red-eye, no reflections from glasses.",
  });
  items.push({
    id: "attire",
    label: "Head coverings / glasses",
    status: "manual",
    message: "No glasses. Head coverings only for religious reasons — full face must be visible.",
  });

  return items;
}
