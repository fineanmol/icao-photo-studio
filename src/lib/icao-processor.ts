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

export const defaultSettings: ICAOSettings = {
  faceRatio: FACE_RATIO_DEFAULT,
  offsetX: 0,
  offsetY: 0,
  brightness: 0,
  contrast: 8,
  saturation: 0,
  backgroundStrength: 85,
  sharpen: 15,
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
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    r = cFactor * (r - 128) + 128 + brightness;
    g = cFactor * (g - 128) + 128 + brightness;
    b = cFactor * (b - 128) + 128 + brightness;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(imageData, 0, 0);
}

function whitenBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const threshold = 255 - (strength / 100) * 55;

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    bgR += d[i];
    bgG += d[i + 1];
    bgB += d[i + 2];
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;

  const dist = (r: number, g: number, b: number) =>
    Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const edge =
        Math.min(x, y, w - 1 - x, h - 1 - y) < Math.min(w, h) * 0.08;
      if (lum > threshold || dist(r, g, b) < 42 || edge) {
        const blend = edge ? 1 : Math.min(1, (lum - threshold + 30) / 80);
        d[i] = r + (BACKGROUND_RGB.r - r) * blend;
        d[i + 1] = g + (BACKGROUND_RGB.g - g) * blend;
        d[i + 2] = b + (BACKGROUND_RGB.b - b) * blend;
      }
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
        Math.max(0, orig.data[i + c] + factor * (orig.data[i + c] - blurred.data[i + c])),
      );
    }
  }
  ctx.putImageData(orig, 0, 0);
}

export function computeCrop(
  imgW: number,
  imgH: number,
  face: FaceBox,
  settings: ICAOSettings,
): { sx: number; sy: number; sw: number; sh: number } {
  const targetFaceH = ICAO_HEIGHT * settings.faceRatio;
  const scale = targetFaceH / face.height;
  const sw = ICAO_WIDTH / scale;
  const sh = ICAO_HEIGHT / scale;

  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height * 0.48;

  let sx = faceCenterX - sw / 2 + settings.offsetX;
  let sy = faceCenterY - sh * 0.42 + settings.offsetY;

  sx = Math.max(0, Math.min(imgW - sw, sx));
  sy = Math.max(0, Math.min(imgH - sh, sy));

  if (sw > imgW) {
    const ratio = imgW / sw;
    return { sx: 0, sy: sy * ratio, sw: imgW, sh: sh * ratio };
  }
  if (sh > imgH) {
    const ratio = imgH / sh;
    return { sx: sx * ratio, sy: 0, sw: sw * ratio, sh: imgH };
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

  const fallbackFace: FaceBox = {
    x: img.naturalWidth * 0.25,
    y: img.naturalHeight * 0.12,
    width: img.naturalWidth * 0.5,
    height: img.naturalHeight * 0.65,
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
