/** ICAO-compliant output per Guidelines for ICAO.pdf */
export const ICAO_WIDTH = 630;
export const ICAO_HEIGHT = 810;
export const ICAO_ASPECT = ICAO_WIDTH / ICAO_HEIGHT;

export const FACE_RATIO_MIN = 0.8;
export const FACE_RATIO_MAX = 0.85;
export const FACE_RATIO_DEFAULT = 0.825;

export const BACKGROUND_RGB = { r: 255, g: 255, b: 255 } as const;

/**
 * One-time lifetime access — unlocks both ICAO converter and BG remover.
 * Razorpay amounts are in paise (1 INR = 100 paise).
 */
export const PRICE_DISPLAY = "₹29";
export const PRICE_PAISE = 2900;

/** BG remover uses the same lifetime price as the studio. */
export const BG_REMOVAL_PRICE_DISPLAY = "₹29";
export const BG_REMOVAL_PRICE_PAISE = 2900;

export const GUIDELINES = [
  {
    id: "dimensions",
    label: "630 × 810 pixels",
    detail: "Exact output dimensions required.",
  },
  {
    id: "face-ratio",
    label: "Face 80–85% of frame",
    detail: "Head and top of shoulders; full face from hair to chin.",
  },
  {
    id: "background",
    label: "Pure white background",
    detail: "Uniform white, no gradients or shadows in background.",
  },
  {
    id: "color",
    label: "Color photograph",
    detail: "Natural skin tones with appropriate brightness and contrast.",
  },
  {
    id: "pose",
    label: "Front view, eyes open",
    detail: "Looking at camera, mouth closed, head centered and not tilted.",
  },
  {
    id: "lighting",
    label: "Uniform lighting",
    detail: "No shadows on face, no flash reflections, no red eye.",
  },
  {
    id: "quality",
    label: "Sharp & unaltered",
    detail: "Not blurred; minimal automated correction only.",
  },
] as const;
