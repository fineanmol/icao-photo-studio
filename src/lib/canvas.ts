export type Canvas2DOptions = {
  /** Set true when calling getImageData repeatedly (filters, validation). */
  willReadFrequently?: boolean;
};

export function getCanvas2D(
  canvas: HTMLCanvasElement,
  options: Canvas2DOptions = {},
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", {
    willReadFrequently: options.willReadFrequently ?? false,
  });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
}
