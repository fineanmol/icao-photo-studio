/**
 * Client-side portrait enhancement algorithms — no external dependencies.
 *
 * Skin detection uses the YCbCr color space which is more robust than
 * RGB for a wide range of skin tones under varying lighting conditions.
 *
 * All functions operate directly on ImageData for maximum performance.
 */

// ── Skin detection ───────────────────────────────────────────────────────────

/**
 * Returns true if an RGB pixel is likely skin-toned.
 * Uses MPEG YCbCr thresholds (Cb ∈ [77,127], Cr ∈ [133,173]) combined
 * with a basic luminance guard to exclude near-black and near-white pixels.
 */
function isSkin(r: number, g: number, b: number): boolean {
  const y  =  0.299  * r + 0.587  * g + 0.114  * b;
  const cb = -0.1687 * r - 0.3313 * g + 0.5    * b + 128;
  const cr =  0.5    * r - 0.4187 * g - 0.0813 * b + 128;
  return y > 30 && y < 230 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/** Build a per-pixel boolean skin mask (same length as pixel count). */
function buildSkinMask(data: Uint8ClampedArray, len: number): Uint8Array {
  const mask = new Uint8Array(len / 4);
  for (let i = 0; i < len; i += 4) {
    mask[i >> 2] = isSkin(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
  return mask;
}

// ── Box blur (fast approximation of Gaussian) ─────────────────────────────────

/** Single-pass horizontal box blur on one channel. */
function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = src[row] * (r + 1);
    for (let x = 0; x < r; x++) sum += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      sum += src[row + Math.min(x + r, w - 1)] - src[row + Math.max(x - r - 1, 0)];
      dst[row + x] = sum * inv;
    }
  }
}

/** Single-pass vertical box blur on one channel. */
function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let sum = src[Math.min(0, h - 1) * w + x] * (r + 1);
    for (let y = 0; y < r; y++) sum += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      sum += src[Math.min(y + r, h - 1) * w + x] - src[Math.max(y - r - 1, 0) * w + x];
      dst[y * w + x] = sum * inv;
    }
  }
}

/**
 * Apply a two-pass (H+V) box blur to a Float32 channel array in-place.
 * Multiple passes approximate a Gaussian.
 */
function boxBlurChannel(channel: Float32Array, w: number, h: number, radius: number, passes = 2): Float32Array {
  let src = channel;
  let tmp = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    blurH(src, tmp, w, h, radius);
    blurV(tmp, src, w, h, radius);
  }
  return src;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SkinSmoothOptions {
  /** 0–1: how much smoothing to apply to skin regions. Default 0.65. */
  strength?: number;
  /**
   * Blur radius in pixels. Larger = smoother but slower.
   * Auto-scales with image width if not provided.
   */
  radius?: number;
}

/**
 * Apply selective skin smoothing to a canvas context.
 * Detects skin pixels via YCbCr and blends a blurred copy
 * back only over those regions at the given strength.
 *
 * @returns Number of skin pixels affected.
 */
export function applySkinSmooth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: SkinSmoothOptions = {},
): number {
  const strength = Math.max(0, Math.min(1, options.strength ?? 0.65));
  const radius   = options.radius ?? Math.max(2, Math.round(w / 120));

  const id   = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  const n    = w * h;

  // Extract channels as floats
  const rCh = new Float32Array(n);
  const gCh = new Float32Array(n);
  const bCh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rCh[i] = data[i * 4];
    gCh[i] = data[i * 4 + 1];
    bCh[i] = data[i * 4 + 2];
  }

  // Blurred copies
  const rBlur = boxBlurChannel(rCh.slice(), w, h, radius);
  const gBlur = boxBlurChannel(gCh.slice(), w, h, radius);
  const bBlur = boxBlurChannel(bCh.slice(), w, h, radius);

  // Build skin mask
  const mask = buildSkinMask(data, data.length);

  let skinPixels = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    skinPixels++;
    const s = strength;
    data[i * 4]     = Math.round(rCh[i] * (1 - s) + rBlur[i] * s);
    data[i * 4 + 1] = Math.round(gCh[i] * (1 - s) + gBlur[i] * s);
    data[i * 4 + 2] = Math.round(bCh[i] * (1 - s) + bBlur[i] * s);
  }

  ctx.putImageData(id, 0, 0);
  return skinPixels;
}

export interface TeethWhitenOptions {
  /** 0–1 strength. Default 0.5. */
  strength?: number;
}

/**
 * Brighten near-white pixels in the lower-centre of the face (teeth zone).
 * Works by finding bright pixels (luminance > 160) in the mouth region
 * and boosting them toward pure white.
 */
export function applyTeethWhiten(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: TeethWhitenOptions = {},
): void {
  const strength = Math.max(0, Math.min(1, options.strength ?? 0.5));
  if (strength === 0) return;

  // Mouth zone: roughly y 58–72%, x 30–70% of frame
  const x0 = Math.floor(w * 0.28), x1 = Math.floor(w * 0.72);
  const y0 = Math.floor(h * 0.58), y1 = Math.floor(h * 0.72);

  const id   = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = id.data;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < 150) continue; // only touch bright pixels (likely teeth)
    data[i]     = Math.min(255, Math.round(data[i]     + (255 - data[i])     * strength * 0.6));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] + (255 - data[i + 1]) * strength * 0.6));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] + (255 - data[i + 2]) * strength * 0.4));
  }

  ctx.putImageData(id, x0, y0);
}

export interface EyeBrightenOptions {
  /** 0–1 strength. Default 0.4. */
  strength?: number;
}

/**
 * Boost the brightness of the sclera (whites of the eyes) by detecting
 * bright, low-saturation pixels in the eye zones and pushing them whiter.
 */
export function applyEyeBrighten(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: EyeBrightenOptions = {},
): void {
  const strength = Math.max(0, Math.min(1, options.strength ?? 0.4));
  if (strength === 0) return;

  // Eye zone: y 28–46%, left x 12–44%, right x 56–88%
  const zones = [
    { x0: Math.floor(w * 0.12), x1: Math.floor(w * 0.44), y0: Math.floor(h * 0.28), y1: Math.floor(h * 0.46) },
    { x0: Math.floor(w * 0.56), x1: Math.floor(w * 0.88), y0: Math.floor(h * 0.28), y1: Math.floor(h * 0.46) },
  ];

  for (const z of zones) {
    const id   = ctx.getImageData(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    const data = id.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Only whiten bright, low-saturation pixels (sclera)
      if (lum < 140 || sat > 40) continue;
      data[i]     = Math.min(255, Math.round(r + (255 - r) * strength * 0.5));
      data[i + 1] = Math.min(255, Math.round(g + (255 - g) * strength * 0.5));
      data[i + 2] = Math.min(255, Math.round(b + (255 - b) * strength * 0.5));
    }

    ctx.putImageData(id, z.x0, z.y0);
  }
}

/**
 * Apply a gentle vignette to focus attention on the face.
 * Darkens the corners/edges smoothly.
 *
 * @param intensity 0–1, default 0.35
 */
export function applyVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity = 0.35,
): void {
  if (intensity <= 0) return;
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  const gradient = ctx.createRadialGradient(cx, cy, maxDist * 0.4, cx, cy, maxDist);
  gradient.addColorStop(0,   `rgba(0,0,0,0)`);
  gradient.addColorStop(1,   `rgba(0,0,0,${intensity})`);

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
