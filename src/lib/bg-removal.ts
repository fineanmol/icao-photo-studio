/**
 * Client-side background removal using @imgly/background-removal.
 * Runs 100% in the browser via ONNX/WASM — no server, no API key.
 * Returns a JPEG object-URL with a pure-white background.
 */

export type BgRemovalProgress = {
  phase: string;
  pct: number;
};

type RemoveFn = (
  image: Blob | string,
  config?: {
    model?: "isnet" | "isnet_fp16" | "isnet_quint8";
    output?: { format?: string; quality?: number };
    progress?: (key: string, current: number, total: number) => void;
    device?: "cpu" | "gpu";
  },
) => Promise<Blob>;

let _removeBackground: RemoveFn | null = null;

async function getRemoveFn(): Promise<RemoveFn> {
  if (_removeBackground) return _removeBackground;
  const mod = await import("@imgly/background-removal");
  _removeBackground = (mod.default ?? mod.removeBackground) as unknown as RemoveFn;
  return _removeBackground;
}

export async function removeImageBackground(
  imageSrc: string,
  onProgress?: (p: BgRemovalProgress) => void,
): Promise<string> {
  const removeBg = await getRemoveFn();

  onProgress?.({ phase: "Preparing…", pct: 0 });

  // Fetch as blob so the library can read it cross-origin safely
  const res = await fetch(imageSrc);
  const srcBlob = await res.blob();

  const resultBlob = await removeBg(srcBlob, {
    model: "isnet_fp16",         // good balance of speed vs quality
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      const phase = key.includes("fetch")
        ? "Downloading AI model…"
        : "Removing background…";
      onProgress?.({ phase, pct });
    },
  });

  onProgress?.({ phase: "Compositing…", pct: 99 });

  // Composite the alpha-channel result onto pure white
  const bitmap = await createImageBitmap(resultBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new Error("Compositing failed")),
      "image/jpeg",
      0.94,
    );
  });
}
