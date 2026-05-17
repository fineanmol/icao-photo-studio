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

function laplacianVariance(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -4 * gray[i] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i - w] +
        gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function estimateFaceRatio(face: FaceBox, cropH: number): number {
  return face.height / cropH;
}

export function validateICAO(
  canvas: HTMLCanvasElement,
  face: FaceBox | null,
  cropFaceHeight?: number,
): ValidationItem[] {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getCanvas2D(canvas, { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;

  const items: ValidationItem[] = [];

  items.push({
    id: "dimensions",
    label: "630 × 810 pixels",
    status: w === ICAO_WIDTH && h === ICAO_HEIGHT ? "pass" : "fail",
    message:
      w === ICAO_WIDTH && h === ICAO_HEIGHT
        ? "Output size matches ICAO requirement."
        : `Current size: ${w}×${h}px.`,
  });

  let bgSum = 0;
  let bgN = 0;
  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    bgSum += data[i] + data[i + 1] + data[i + 2];
    bgN += 3;
  };
  for (let x = 0; x < w; x += 14) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += 14) {
    sample(0, y);
    sample(w - 1, y);
  }
  const bgAvg = bgSum / bgN;
  items.push({
    id: "background",
    label: "White background",
    status: bgAvg >= 248 ? "pass" : bgAvg >= 235 ? "warn" : "fail",
    message:
      bgAvg >= 248
        ? "Border pixels are near pure white."
        : "Increase background whitening or retake with a plain white backdrop.",
  });

  if (face && cropFaceHeight) {
    const ratio = estimateFaceRatio(face, cropFaceHeight);
    const inRange = ratio >= FACE_RATIO_MIN && ratio <= FACE_RATIO_MAX;
    items.push({
      id: "face-ratio",
      label: "Face 80–85% of frame",
      status: inRange ? "pass" : ratio > 0.75 && ratio < 0.9 ? "warn" : "fail",
      message: inRange
        ? `Estimated face coverage ~${Math.round(ratio * 100)}%.`
        : `Estimated ~${Math.round(ratio * 100)}%. Adjust face scale slider.`,
    });
  } else {
    items.push({
      id: "face-ratio",
      label: "Face 80–85% of frame",
      status: "warn",
      message: "Auto face detection unavailable — verify framing manually.",
    });
  }

  let lumSum = 0;
  const cx = Math.floor(w * 0.25);
  const cy = Math.floor(h * 0.2);
  const cw = Math.floor(w * 0.5);
  const ch = Math.floor(h * 0.55);
  for (let y = cy; y < cy + ch; y += 2) {
    for (let x = cx; x < cx + cw; x += 2) {
      const i = (y * w + x) * 4;
      lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  const lum = lumSum / ((cw * ch) / 4);
  items.push({
    id: "brightness",
    label: "Brightness & contrast",
    status: lum >= 70 && lum <= 200 ? "pass" : "warn",
    message:
      lum >= 70 && lum <= 200
        ? "Exposure looks balanced for facial region."
        : "Adjust brightness/contrast sliders if face looks too dark or bright.",
  });

  const sharpness = laplacianVariance(ctx, w, h);
  items.push({
    id: "sharpness",
    label: "Not blurred",
    status: sharpness > 80 ? "pass" : sharpness > 40 ? "warn" : "fail",
    message:
      sharpness > 80
        ? "Image appears adequately sharp."
        : "Photo may be soft — use a sharper source or increase sharpen.",
  });

  const manualChecks: Omit<ValidationItem, "status">[] = [
    {
      id: "pose",
      label: "Front view, eyes open",
      message: "Confirm direct gaze, eyes visible, mouth closed.",
    },
    {
      id: "lighting",
      label: "Uniform lighting",
      message: "No shadows on face, no red eye, no glasses glare.",
    },
    {
      id: "attire",
      label: "Head coverings",
      message: "Only religious coverings allowed; face fully visible.",
    },
  ];

  for (const check of manualChecks) {
    items.push({ ...check, status: "manual" });
  }

  return items;
}
