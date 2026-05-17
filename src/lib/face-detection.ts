/** Extended face analysis returned by detectFace(). */
export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceExpressions = {
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
};

export type FaceAnalysis = FaceBox & {
  /** Eye Aspect Ratio — 0 (closed) to ~0.4 (wide open). >0.20 = open. */
  leftEAR: number;
  rightEAR: number;
  /** Head roll angle in degrees. 0 = level, positive = tilted right. */
  rollDeg: number;
  /** Normalized yaw offset. 0 = frontal, ±1 = fully turned. */
  yawOffset: number;
  /** Expression probabilities from faceExpressionNet. Null if model unavailable. */
  expressions: FaceExpressions | null;
};

let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const faceapi = await import("face-api.js");
  const MODEL_URL = "/models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

/* ── geometry helpers ──────────────────────────────────────────────── */

type Point = { x: number; y: number };

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(pts: Point[]): Point {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

/**
 * Eye Aspect Ratio (EAR) from 6 eye landmarks.
 * Order expected: [outerCorner, upperOuter, upperInner, innerCorner, lowerInner, lowerOuter]
 */
function eyeAspectRatio(pts: Point[]): number {
  if (pts.length < 6) return 0;
  const v1 = dist(pts[1], pts[5]);
  const v2 = dist(pts[2], pts[4]);
  const h = dist(pts[0], pts[3]);
  return h > 0 ? (v1 + v2) / (2 * h) : 0;
}

/* ── main export ───────────────────────────────────────────────────── */

export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement,
): Promise<FaceAnalysis | null> {
  await loadFaceModels();
  const faceapi = await import("face-api.js");

  const detection = await faceapi
    .detectSingleFace(
      image,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }),
    )
    .withFaceLandmarks(true)
    .withFaceExpressions();

  if (!detection) return null;

  const lm = detection.landmarks;

  /* ── bounding box (hair + chin) ──────────────────────────────── */
  const jaw = lm.getJawOutline();
  const jawLeft = Math.min(...jaw.map((p) => p.x));
  const jawRight = Math.max(...jaw.map((p) => p.x));
  const jawWidth = jawRight - jawLeft;
  const chin = Math.max(...jaw.map((p) => p.y));

  const leftBrow = lm.getLeftEyeBrow();
  const rightBrow = lm.getRightEyeBrow();
  const browTop = Math.min(...leftBrow.map((p) => p.y), ...rightBrow.map((p) => p.y));

  const chinToBrow = chin - browTop;
  const hairTop = browTop - chinToBrow * 0.55;
  const chinBottom = chin + chinToBrow * 0.08;
  const padX = jawWidth * 0.18;

  /* ── eye openness (EAR) ──────────────────────────────────────── */
  const leftEye = lm.getLeftEye();
  const rightEye = lm.getRightEye();
  const leftEAR = eyeAspectRatio(leftEye);
  const rightEAR = eyeAspectRatio(rightEye);

  /* ── head roll (angle between eye centres) ────────────────────── */
  const lEyeC = centroid(leftEye);
  const rEyeC = centroid(rightEye);
  const rollDeg = Math.atan2(rEyeC.y - lEyeC.y, rEyeC.x - lEyeC.x) * (180 / Math.PI);

  /* ── head yaw (nose offset vs eye midpoint) ──────────────────── */
  const nose = lm.getNose();
  const noseTip = nose[nose.length - 1]; // bottom of nose bridge
  const eyeMidX = (lEyeC.x + rEyeC.x) / 2;
  const eyeSpan = Math.abs(rEyeC.x - lEyeC.x);
  const yawOffset = eyeSpan > 0 ? (noseTip.x - eyeMidX) / eyeSpan : 0;

  /* ── expressions ─────────────────────────────────────────────── */
  const rawExpr = detection.expressions as unknown as Record<string, number> | undefined;
  const expressions: FaceExpressions | null = rawExpr
    ? {
        neutral: rawExpr["neutral"] ?? 0,
        happy: rawExpr["happy"] ?? 0,
        sad: rawExpr["sad"] ?? 0,
        angry: rawExpr["angry"] ?? 0,
        fearful: rawExpr["fearful"] ?? 0,
        disgusted: rawExpr["disgusted"] ?? 0,
        surprised: rawExpr["surprised"] ?? 0,
      }
    : null;

  return {
    x: Math.max(0, jawLeft - padX),
    y: Math.max(0, hairTop),
    width: jawWidth + padX * 2,
    height: chinBottom - Math.max(0, hairTop),
    leftEAR,
    rightEAR,
    rollDeg,
    yawOffset,
    expressions,
  };
}
