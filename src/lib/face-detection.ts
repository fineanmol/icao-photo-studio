export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const faceapi = await import("face-api.js");
  const MODEL_URL = "/models";
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement,
): Promise<FaceBox | null> {
  await loadFaceModels();
  const faceapi = await import("face-api.js");
  const detection = await faceapi
    .detectSingleFace(
      image,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }),
    )
    .withFaceLandmarks(true);

  if (!detection) return null;

  const lm = detection.landmarks;

  // Horizontal bounds: use full jaw outline width + ears margin
  const jaw = lm.getJawOutline();
  const jawLeft = Math.min(...jaw.map((p) => p.x));
  const jawRight = Math.max(...jaw.map((p) => p.x));
  const jawWidth = jawRight - jawLeft;

  // Chin: lowest jaw point
  const chin = Math.max(...jaw.map((p) => p.y));

  // Use eyebrows as the topmost reliable reference point
  const leftBrow = lm.getLeftEyeBrow();
  const rightBrow = lm.getRightEyeBrow();
  const browTop = Math.min(
    ...leftBrow.map((p) => p.y),
    ...rightBrow.map((p) => p.y),
  );

  // Estimate hair top: from eyebrow top, hair line is roughly 40% of the
  // chin-to-brow span above the brows. Add 15% buffer for the crown.
  const chinToBrow = chin - browTop;
  const hairTop = browTop - chinToBrow * 0.55;

  // Small chin margin
  const chinBottom = chin + chinToBrow * 0.08;

  // Horizontal: add ear/cheek margin beyond jaw edges
  const padX = jawWidth * 0.18;

  return {
    x: Math.max(0, jawLeft - padX),
    y: Math.max(0, hairTop),
    width: jawWidth + padX * 2,
    height: chinBottom - Math.max(0, hairTop),
  };
}
