import { getCanvas2D } from "./canvas";

const HEIF_EXTENSIONS = new Set(["heic", "heif", "hif"]);
const RASTER_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
  "tif",
  "tiff",
]);

function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export const SUPPORTED_FORMATS_LABEL =
  "JPG, PNG, WebP, HEIC/HEIF, GIF, BMP, AVIF, TIFF";

export function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = extension(file.name);
  return HEIF_EXTENSIONS.has(ext) || RASTER_EXTENSIONS.has(ext);
}

function isHeif(file: File, ext: string): boolean {
  return (
    HEIF_EXTENSIONS.has(ext) ||
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.type === "image/heic-sequence"
  );
}

function isTiff(file: File, ext: string): boolean {
  return ext === "tif" || ext === "tiff" || file.type === "image/tiff";
}

async function heifToJpegUrl(file: File): Promise<string> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  return URL.createObjectURL(blob);
}

async function tiffToPngUrl(file: File): Promise<string> {
  const UTIF = await import("utif");
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("TIFF has no image data");
  const page = ifds[0];
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = getCanvas2D(canvas, { willReadFrequently: true });
  const imageData = new ImageData(
    new Uint8ClampedArray(rgba),
    page.width,
    page.height,
  );
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("TIFF export failed"))), "image/png");
  });
  return URL.createObjectURL(blob);
}

export type PreparedImage = {
  url: string;
  revoke: () => void;
  convertedFrom?: string;
};

/**
 * Decodes uploaded files into a URL the browser can draw on canvas.
 * HEIF/HEIC and TIFF are converted locally before processing.
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  const ext = extension(file.name);

  if (isHeif(file, ext)) {
    const url = await heifToJpegUrl(file);
    return {
      url,
      revoke: () => URL.revokeObjectURL(url),
      convertedFrom: "HEIF/HEIC",
    };
  }

  if (isTiff(file, ext)) {
    const url = await tiffToPngUrl(file);
    return {
      url,
      revoke: () => URL.revokeObjectURL(url),
      convertedFrom: "TIFF",
    };
  }

  if (!isSupportedImageFile(file)) {
    throw new Error(`Unsupported format. Use ${SUPPORTED_FORMATS_LABEL}.`);
  }

  const url = URL.createObjectURL(file);
  return {
    url,
    revoke: () => URL.revokeObjectURL(url),
  };
}

/** File input accept list (includes HEIF where OS allows). */
export const FILE_INPUT_ACCEPT =
  "image/*,.heic,.heif,.hif,image/heic,image/heif";
