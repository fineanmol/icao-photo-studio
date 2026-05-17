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

function isValidPt(p: Point): boolean {
  return isFinite(p.x) && isFinite(p.y);
}

function dist(a: Point, b: Point): number {
  if (!isValidPt(a) || !isValidPt(b)) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Returns {x:0, y:0} instead of NaN when pts is empty or has non-finite coords. */
function centroid(pts: Point[]): Point {
  const valid = pts.filter(isValidPt);
  if (valid.length === 0) return { x: 0, y: 0 };
  return {
    x: valid.reduce((s, p) => s + p.x, 0) / valid.length,
    y: valid.reduce((s, p) => s + p.y, 0) / valid.length,
  };
}

/**
 * Eye Aspect Ratio (EAR) from 6 eye landmarks.
 * Returns 0 on bad data rather than NaN.
 * Order: [outerCorner, upperOuter, upperInner, innerCorner, lowerInner, lowerOuter]
 */
function eyeAspectRatio(pts: Point[]): number {
  if (pts.length < 6 || !pts.every(isValidPt)) return 0;
  const v1 = dist(pts[1], pts[5]);
  const v2 = dist(pts[2], pts[4]);
  const h  = dist(pts[0], pts[3]);
  if (h === 0 || !isFinite(v1) || !isFinite(v2)) return 0;
  return (v1 + v2) / (2 * h);
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
  const leftEye = lm.getLeftEye() as Point[];
  const rightEye = lm.getRightEye() as Point[];
  const leftEAR = eyeAspectRatio(leftEye);
  const rightEAR = eyeAspectRatio(rightEye);

  /* ── head roll (angle between eye centres) ────────────────────── */
  const lEyeC = centroid(leftEye as Point[]);
  const rEyeC = centroid(rightEye as Point[]);
  // Guard: if centroids collapsed to origin (bad landmarks), roll = 0
  const eyeSpan = Math.abs(rEyeC.x - lEyeC.x);
  const rollDeg =
    eyeSpan > 1
      ? Math.atan2(rEyeC.y - lEyeC.y, rEyeC.x - lEyeC.x) * (180 / Math.PI)
      : 0;

  /* ── head yaw (nose tip offset vs eye midpoint) ──────────────── */
  // getNose() returns 9 points (landmarks 27-35).
  // Index 6 = landmark 33 = actual pronasale (nose tip).
  const nose = lm.getNose() as Point[];
  const noseTip: Point =
    nose.length >= 7 && isValidPt(nose[6])
      ? nose[6]
      : nose[Math.floor(nose.length / 2)] ?? { x: (lEyeC.x + rEyeC.x) / 2, y: 0 };
  const eyeMidX = (lEyeC.x + rEyeC.x) / 2;
  const yawOffset =
    eyeSpan > 1 && isValidPt(noseTip) ? (noseTip.x - eyeMidX) / eyeSpan : 0;

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
