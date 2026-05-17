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
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks(true);

  if (!detection) return null;

  const landmarks = detection.landmarks;

  const jaw = landmarks.getJawOutline();
  const left = Math.min(...jaw.map((p) => p.x));
  const right = Math.max(...jaw.map((p) => p.x));
  const top = Math.min(...landmarks.getLeftEye().map((p) => p.y));
  const bottom = Math.max(...jaw.map((p) => p.y));

  const padX = (right - left) * 0.35;
  const padTop = (bottom - top) * 0.55;
  const padBottom = (bottom - top) * 0.12;

  return {
    x: Math.max(0, left - padX),
    y: Math.max(0, top - padTop),
    width: right - left + padX * 2,
    height: bottom - top + padTop + padBottom,
  };
}
