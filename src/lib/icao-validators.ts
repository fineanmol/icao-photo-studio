import {
  FACE_RATIO_MAX,
  FACE_RATIO_MIN,
  ICAO_HEIGHT,
  ICAO_WIDTH,
} from "./icao-constants";
import { getCanvas2D } from "./canvas";
import type { FaceAnalysis } from "./face-detection";

export type ValidationItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "manual";
  message: string;
};

/* ── pixel helpers ─────────────────────────────────────────────────── */

/**
 * Compute Laplacian variance over only the central face region of the canvas.
 */
function faceRegionSharpness(data: Uint8ClampedArray, w: number, h: number): number {
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
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
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
  for (let x = 0; x < w; x += step) { check(x, 0); check(x, h - 1); }
  for (let y = step; y < h - step; y += step) { check(0, y); check(w - 1, y); }

  return total > 0 ? (whiteCount / total) * 100 : 0;
}

/** Average luminance of the central face area. */
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

/**
 * Lighting symmetry: compare average luminance of the left half vs right half
 * of the central face column. Returns the absolute difference (0 = perfect).
 */
function lightingAsymmetry(data: Uint8ClampedArray, w: number, h: number): number {
  const cx = Math.floor(w / 2);
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.floor(h * 0.75);
  const x0 = Math.floor(w * 0.1);
  const x1 = Math.floor(w * 0.9);

  let leftSum = 0, rightSum = 0;
  let leftN = 0, rightN = 0;

  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (x < cx) { leftSum += lum; leftN++; }
      else { rightSum += lum; rightN++; }
    }
  }
  const leftAvg = leftN > 0 ? leftSum / leftN : 128;
  const rightAvg = rightN > 0 ? rightSum / rightN : 128;
  return Math.abs(leftAvg - rightAvg);
}

/* ── main validator ────────────────────────────────────────────────── */

export function validateICAO(
  canvas: HTMLCanvasElement,
  face: FaceAnalysis | null,
  /** Face height in OUTPUT pixels (face.height × output_scale) */
  faceOutputHeight?: number,
  bgRemoved = false,
): ValidationItem[] {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getCanvas2D(canvas, { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;

  const items: ValidationItem[] = [];

  /* 1. Dimensions ─────────────────────────────────────────────────── */
  const dimsOk = w === ICAO_WIDTH && h === ICAO_HEIGHT;
  items.push({
    id: "dimensions",
    label: "630 × 810 pixels",
    status: dimsOk ? "pass" : "fail",
    message: dimsOk
      ? "Output dimensions match ICAO requirement."
      : `Current size is ${w}×${h}px — must be 630×810.`,
  });

  /* 2. White background ───────────────────────────────────────────── */
  if (bgRemoved) {
    items.push({
      id: "background",
      label: "White background",
      status: "pass",
      message: "AI background removed and replaced with pure white ✓",
    });
  } else {
    const bgPct = backgroundWhitePercent(data, w, h);
    const bgStatus = bgPct >= 95 ? "pass" : bgPct >= 75 ? "warn" : "fail";
    items.push({
      id: "background",
      label: "White background",
      status: bgStatus,
      message:
        bgStatus === "pass"
          ? "Border region is near pure white."
          : bgPct >= 75
            ? "Background looks light but may not be pure white. Use '✨ Remove Background' for best results."
            : "Background is not white. Use the '✨ Remove Background' button or retake with a plain white backdrop.",
    });
  }

  /* 3. Face ratio ─────────────────────────────────────────────────── */
  if (faceOutputHeight && faceOutputHeight > 0) {
    const ratio = faceOutputHeight / ICAO_HEIGHT;
    const inRange = ratio >= FACE_RATIO_MIN && ratio <= FACE_RATIO_MAX;
    const near = ratio >= 0.72 && ratio <= 0.92;
    items.push({
      id: "face-ratio",
      label: "Face fills 80–85% of frame",
      status: inRange ? "pass" : near ? "warn" : "fail",
      message: inRange
        ? `Face fills ~${Math.round(ratio * 100)}% of frame height — within ICAO range.`
        : `Face fills ~${Math.round(ratio * 100)}%. Adjust the face scale slider to reach 80–85%.`,
    });
  } else {
    items.push({
      id: "face-ratio",
      label: "Face fills 80–85% of frame",
      status: face ? "warn" : "fail",
      message: face
        ? "Face detected — verify framing looks correct in the preview."
        : "No face detected. Upload a clear front-facing portrait.",
    });
  }

  /* 4. Brightness & exposure ──────────────────────────────────────── */
  const lum = faceLuminance(data, w, h);
  const lumOk = lum >= 85 && lum <= 210;
  items.push({
    id: "brightness",
    label: "Brightness & exposure",
    status: lumOk ? "pass" : "warn",
    message: lumOk
      ? `Face region luminance ${Math.round(lum)} — well exposed.`
      : lum < 85
        ? `Face looks too dark (luminance ${Math.round(lum)}). Increase brightness.`
        : `Face looks overexposed (luminance ${Math.round(lum)}). Decrease brightness.`,
  });

  /* 5. Sharpness ──────────────────────────────────────────────────── */
  const sharpness = faceRegionSharpness(data, w, h);
  items.push({
    id: "sharpness",
    label: "Photo is sharp",
    status: sharpness > 60 ? "pass" : sharpness > 30 ? "warn" : "fail",
    message:
      sharpness > 60
        ? "Image appears sharp and in focus."
        : sharpness > 30
          ? "Image may be slightly soft. Try increasing the Sharpen slider."
          : "Photo looks blurred. Use a sharper source image.",
  });

  /* 6. Eyes open (Eye Aspect Ratio) ──────────────────────────────── */
  if (face) {
    const lEAR = isFinite(face.leftEAR) ? face.leftEAR : 0;
    const rEAR = isFinite(face.rightEAR) ? face.rightEAR : 0;
    const ear = (lEAR + rEAR) / 2;
    const bothOpen = lEAR > 0.18 && rEAR > 0.18;
    const onePartial = lEAR > 0.13 || rEAR > 0.13;
    items.push({
      id: "eyes-open",
      label: "Eyes open",
      status: bothOpen ? "pass" : onePartial ? "warn" : "fail",
      message: bothOpen
        ? `Both eyes open (L ${lEAR.toFixed(2)} / R ${rEAR.toFixed(2)}).`
        : onePartial
          ? `Eye openness low (L ${lEAR.toFixed(2)} / R ${rEAR.toFixed(2)}). Make sure eyes are fully open.`
          : `Eyes appear closed (EAR ${ear.toFixed(2)}). Look directly at the camera with eyes open.`,
    });
  } else {
    items.push({
      id: "eyes-open",
      label: "Eyes open",
      status: "fail",
      message: "No face detected — cannot check eye openness.",
    });
  }

  /* 7. Neutral expression ─────────────────────────────────────────── */
  if (face?.expressions) {
    const expr = face.expressions;
    const neutral = expr.neutral;
    const isNeutral = neutral >= 0.45;
    const isNearNeutral = neutral >= 0.25;
    const dominant = Object.entries(expr).sort(([, a], [, b]) => b - a)[0][0];
    items.push({
      id: "expression",
      label: "Neutral expression",
      status: isNeutral ? "pass" : isNearNeutral ? "warn" : "fail",
      message: isNeutral
        ? `Expression is neutral (confidence ${Math.round(neutral * 100)}%).`
        : isNearNeutral
          ? `Expression is mostly neutral but shows ${dominant} (${Math.round(neutral * 100)}% neutral). Relax your face.`
          : `Expression detected as "${dominant}". ICAO requires a neutral, relaxed expression with mouth closed.`,
    });
  } else if (face) {
    items.push({
      id: "expression",
      label: "Neutral expression",
      status: "manual",
      message: "Expression model loading — verify face shows a neutral, relaxed expression.",
    });
  } else {
    items.push({
      id: "expression",
      label: "Neutral expression",
      status: "fail",
      message: "No face detected — cannot check expression.",
    });
  }

  /* 8. Head alignment (roll + yaw) ────────────────────────────────── */
  if (face) {
    const roll = isFinite(face.rollDeg) ? Math.abs(face.rollDeg) : 0;
    const yaw  = isFinite(face.yawOffset) ? Math.abs(face.yawOffset) : 0;
    const rollOk   = roll < 5;
    const rollWarn = roll < 10;
    const yawOk    = yaw < 0.12;
    const yawWarn  = yaw < 0.22;
    const poseOk   = rollOk && yawOk;
    const poseWarn = rollWarn && yawWarn;

    let msg: string;
    if (poseOk) {
      msg = `Head is level and front-facing (tilt ${roll.toFixed(1)}°, offset ${Math.round(yaw * 100)}%).`;
    } else {
      const issues: string[] = [];
      if (!rollOk) issues.push(`head tilted ${roll.toFixed(1)}°`);
      if (!yawOk)  issues.push(`face turned ${Math.round(yaw * 100)}% off-axis`);
      msg = issues.join(", ") + ". Look straight at the camera with head level.";
      msg = msg.charAt(0).toUpperCase() + msg.slice(1);
    }

    items.push({
      id: "head-pose",
      label: "Head level & front-facing",
      status: poseOk ? "pass" : poseWarn ? "warn" : "fail",
      message: msg,
    });
  } else {
    items.push({
      id: "head-pose",
      label: "Head level & front-facing",
      status: "fail",
      message: "No face detected — cannot check head alignment.",
    });
  }

  /* 9. Lighting symmetry (shadow check) ───────────────────────────── */
  const asymmetry = lightingAsymmetry(data, w, h);
  items.push({
    id: "lighting",
    label: "Even lighting, no harsh shadows",
    status: asymmetry < 15 ? "pass" : asymmetry < 30 ? "warn" : "fail",
    message:
      asymmetry < 15
        ? `Lighting is even across both sides of the face (diff ${Math.round(asymmetry)}).`
        : asymmetry < 30
          ? `Mild lighting asymmetry detected (diff ${Math.round(asymmetry)}). Ensure light is even on both sides.`
          : `Strong shadow on one side of the face (diff ${Math.round(asymmetry)}). Use diffuse frontal lighting.`,
  });

  /* 10. Glasses / accessories — still manual (no model available) ─── */
  items.push({
    id: "attire",
    label: "No glasses / head coverings",
    status: "manual",
    message:
      "Verify: no glasses or tinted lenses. Head coverings only if religious — full face must remain visible.",
  });

  return items;
}
