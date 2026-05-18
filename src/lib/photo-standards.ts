/**
 * Photo document standards — sizes, face ratios, and background requirements
 * for passports, visas, and ID cards worldwide.
 *
 * widthPx / heightPx are the recommended digital file dimensions.
 * widthMm / heightMm are the physical print dimensions.
 * faceRatio = face height / output height (used by the processor).
 * bgColors = accepted background colors (first = default).
 */

export interface PhotoStandard {
  id: string;
  label: string;
  flag: string;
  category: "passport" | "visa" | "id";
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  faceRatioMin: number;
  faceRatioMax: number;
  faceRatioDefault: number;
  bgColors: BgColor[];
  notes?: string;
}

export type BgColor = {
  id: string;
  label: string;
  hex: string;
};

// ── Common background colour presets ────────────────────────────────────────

export const BG_WHITE:      BgColor = { id: "white",      label: "White",      hex: "#ffffff" };
export const BG_LIGHT_GREY: BgColor = { id: "light-grey", label: "Light grey", hex: "#e8e8e8" };
export const BG_LIGHT_BLUE: BgColor = { id: "light-blue", label: "Light blue", hex: "#c8dff0" };
export const BG_OFF_WHITE:  BgColor = { id: "off-white",  label: "Off-white",  hex: "#f5f1eb" };

// ── Standards ────────────────────────────────────────────────────────────────

export const PHOTO_STANDARDS: PhotoStandard[] = [
  // ── India ─────────────────────────────────────────────────────────────────
  {
    id: "in-passport",
    label: "Indian Passport",
    flag: "🇮🇳",
    category: "passport",
    widthPx: 630, heightPx: 810,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.75, faceRatioMax: 0.85, faceRatioDefault: 0.825,
    bgColors: [BG_WHITE, BG_OFF_WHITE],
    notes: "MEA India: 35×45 mm, white/off-white background, plain expression.",
  },
  {
    id: "in-pan",
    label: "PAN Card",
    flag: "🇮🇳",
    category: "id",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
    notes: "Same physical size as passport; lighter face-ratio requirement.",
  },
  {
    id: "in-driving-licence",
    label: "Indian Driving Licence",
    flag: "🇮🇳",
    category: "id",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
    notes: "Sarathi portal: 35×45 mm, white background.",
  },
  {
    id: "oci",
    label: "OCI Card",
    flag: "🇮🇳",
    category: "id",
    widthPx: 630, heightPx: 810,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.75, faceRatioMax: 0.85, faceRatioDefault: 0.825,
    bgColors: [BG_WHITE],
    notes: "Overseas Citizen of India — identical to Indian Passport spec.",
  },

  // ── ICAO / International ───────────────────────────────────────────────────
  {
    id: "icao",
    label: "ICAO Biometric",
    flag: "🌐",
    category: "passport",
    widthPx: 630, heightPx: 810,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.80, faceRatioMax: 0.85, faceRatioDefault: 0.825,
    bgColors: [BG_WHITE],
    notes: "ICAO 9303 standard used by most biometric passports worldwide.",
  },

  // ── Americas ───────────────────────────────────────────────────────────────
  {
    id: "us-passport",
    label: "US Passport",
    flag: "🇺🇸",
    category: "passport",
    widthPx: 600, heightPx: 600,
    widthMm: 51,  heightMm: 51,
    faceRatioMin: 0.50, faceRatioMax: 0.69, faceRatioDefault: 0.60,
    bgColors: [BG_WHITE],
    notes: "2×2 inch (51×51 mm). Face 1–1⅜ inch (50–69% of height).",
  },
  {
    id: "us-visa",
    label: "US Visa",
    flag: "🇺🇸",
    category: "visa",
    widthPx: 600, heightPx: 600,
    widthMm: 51,  heightMm: 51,
    faceRatioMin: 0.50, faceRatioMax: 0.69, faceRatioDefault: 0.60,
    bgColors: [BG_WHITE],
    notes: "Same spec as US passport. Square 2×2 inch print.",
  },
  {
    id: "ca-passport",
    label: "Canada Passport",
    flag: "🇨🇦",
    category: "passport",
    widthPx: 591, heightPx: 827,
    widthMm: 50,  heightMm: 70,
    faceRatioMin: 0.31, faceRatioMax: 0.36, faceRatioDefault: 0.34,
    bgColors: [BG_WHITE],
    notes: "50×70 mm; face (chin to crown) 31–36 mm, i.e. 44–51% of height.",
  },

  // ── Europe ─────────────────────────────────────────────────────────────────
  {
    id: "uk-passport",
    label: "UK Passport",
    flag: "🇬🇧",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_LIGHT_GREY, BG_WHITE],
    notes: "35×45 mm; plain cream/light-grey background preferred.",
  },
  {
    id: "schengen",
    label: "Schengen Visa",
    flag: "🇪🇺",
    category: "visa",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
    notes: "Standard EU/Schengen 35×45 mm biometric photo.",
  },
  {
    id: "de-id",
    label: "German ID",
    flag: "🇩🇪",
    category: "id",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_LIGHT_GREY, BG_WHITE],
    notes: "Personalausweis / Reisepass: 35×45 mm, light-grey background.",
  },

  // ── Asia-Pacific ───────────────────────────────────────────────────────────
  {
    id: "au-passport",
    label: "Australia Passport",
    flag: "🇦🇺",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.60, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
    notes: "35×45 mm; plain white or light background.",
  },
  {
    id: "nz-passport",
    label: "New Zealand",
    flag: "🇳🇿",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.60, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "cn-visa",
    label: "China Visa",
    flag: "🇨🇳",
    category: "visa",
    widthPx: 390, heightPx: 567,
    widthMm: 33,  heightMm: 48,
    faceRatioMin: 0.60, faceRatioMax: 0.70, faceRatioDefault: 0.65,
    bgColors: [BG_WHITE],
    notes: "33×48 mm; must print as 2 photos on a 4×6 cm sheet.",
  },
  {
    id: "jp-passport",
    label: "Japan Passport",
    flag: "🇯🇵",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "35×45 mm, plain white background, no shadows.",
  },

  // ── South & Southeast Asia ─────────────────────────────────────────────────
  {
    id: "pk-passport",
    label: "Pakistan Passport",
    flag: "🇵🇰",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "35×45 mm, white background.",
  },
  {
    id: "bd-passport",
    label: "Bangladesh Passport",
    flag: "🇧🇩",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "lk-passport",
    label: "Sri Lanka Passport",
    flag: "🇱🇰",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "np-passport",
    label: "Nepal Passport",
    flag: "🇳🇵",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "sg-passport",
    label: "Singapore Passport",
    flag: "🇸🇬",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.68, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
    notes: "35×45 mm; white or light-grey background.",
  },
  {
    id: "my-passport",
    label: "Malaysia Passport",
    flag: "🇲🇾",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.68, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "ph-passport",
    label: "Philippines Passport",
    flag: "🇵🇭",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "35×45 mm; white background, no eyeglasses.",
  },
  {
    id: "th-passport",
    label: "Thailand Passport",
    flag: "🇹🇭",
    category: "passport",
    widthPx: 472, heightPx: 590,
    widthMm: 40,  heightMm: 50,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "40×50 mm, white background.",
  },
  {
    id: "id-passport",
    label: "Indonesia Passport",
    flag: "🇮🇩",
    category: "passport",
    widthPx: 354, heightPx: 472,
    widthMm: 30,  heightMm: 40,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "3×4 cm, white background.",
  },
  {
    id: "vn-passport",
    label: "Vietnam Passport",
    flag: "🇻🇳",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "kr-passport",
    label: "South Korea Passport",
    flag: "🇰🇷",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.60, faceRatioMax: 0.80, faceRatioDefault: 0.70,
    bgColors: [BG_WHITE],
    notes: "35×45 mm, white background, no glasses.",
  },

  // ── Europe (additional) ────────────────────────────────────────────────────
  {
    id: "fr-passport",
    label: "France Passport",
    flag: "🇫🇷",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_LIGHT_GREY, BG_WHITE],
    notes: "35×45 mm; light-grey background preferred.",
  },
  {
    id: "it-passport",
    label: "Italy Passport",
    flag: "🇮🇹",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "es-passport",
    label: "Spain Passport",
    flag: "🇪🇸",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "nl-passport",
    label: "Netherlands Passport",
    flag: "🇳🇱",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "ru-passport",
    label: "Russia Passport",
    flag: "🇷🇺",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "35×45 mm, white background.",
  },
  {
    id: "tr-passport",
    label: "Turkey Passport",
    flag: "🇹🇷",
    category: "passport",
    widthPx: 590, heightPx: 708,
    widthMm: 50,  heightMm: 60,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "50×60 mm, white background.",
  },
  {
    id: "ch-passport",
    label: "Switzerland Passport",
    flag: "🇨🇭",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "ie-passport",
    label: "Ireland Passport",
    flag: "🇮🇪",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_LIGHT_GREY, BG_WHITE],
    notes: "35×45 mm; plain cream or light-grey background.",
  },

  // ── Middle East ────────────────────────────────────────────────────────────
  {
    id: "uae-visa",
    label: "UAE Visa",
    flag: "🇦🇪",
    category: "visa",
    widthPx: 508, heightPx: 650,
    widthMm: 43,  heightMm: 55,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "43×55 mm; white background, no head covering except religious.",
  },
  {
    id: "sa-visa",
    label: "Saudi Arabia Visa",
    flag: "🇸🇦",
    category: "visa",
    widthPx: 472, heightPx: 709,
    widthMm: 40,  heightMm: 60,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "40×60 mm, white background.",
  },
  {
    id: "eg-passport",
    label: "Egypt Passport",
    flag: "🇪🇬",
    category: "passport",
    widthPx: 472, heightPx: 709,
    widthMm: 40,  heightMm: 60,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "40×60 mm, white background.",
  },

  // ── Africa ─────────────────────────────────────────────────────────────────
  {
    id: "za-passport",
    label: "South Africa Passport",
    flag: "🇿🇦",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE, BG_LIGHT_GREY],
  },
  {
    id: "ng-passport",
    label: "Nigeria Passport",
    flag: "🇳🇬",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },
  {
    id: "ke-passport",
    label: "Kenya Passport",
    flag: "🇰🇪",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.70, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
  },

  // ── Latin America ──────────────────────────────────────────────────────────
  {
    id: "mx-passport",
    label: "Mexico Passport",
    flag: "🇲🇽",
    category: "passport",
    widthPx: 413, heightPx: 531,
    widthMm: 35,  heightMm: 45,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "35×45 mm, white background.",
  },
  {
    id: "br-passport",
    label: "Brazil Passport",
    flag: "🇧🇷",
    category: "passport",
    widthPx: 354, heightPx: 472,
    widthMm: 30,  heightMm: 40,
    faceRatioMin: 0.65, faceRatioMax: 0.80, faceRatioDefault: 0.75,
    bgColors: [BG_WHITE],
    notes: "3×4 cm, white background.",
  },
  {
    id: "ar-passport",
    label: "Argentina Passport",
    flag: "🇦🇷",
    category: "passport",
    widthPx: 472, heightPx: 472,
    widthMm: 40,  heightMm: 40,
    faceRatioMin: 0.60, faceRatioMax: 0.75, faceRatioDefault: 0.70,
    bgColors: [BG_WHITE],
    notes: "4×4 cm square, white background.",
  },
];

/** Lookup by ID. Falls back to ICAO standard. */
export function getStandard(id: string): PhotoStandard {
  return PHOTO_STANDARDS.find((s) => s.id === id) ?? PHOTO_STANDARDS[0];
}

/** Default standard — Indian Passport (best for our primary market). */
export const DEFAULT_STANDARD = PHOTO_STANDARDS[0]; // "in-passport"

const REGION_MAP: Record<string, string> = {
  "🇮🇳": "🇮🇳 India",
  "🌐": "🌐 International",
  "🇺🇸": "🌎 Americas",
  "🇨🇦": "🌎 Americas",
  "🇲🇽": "🌎 Americas",
  "🇧🇷": "🌎 Americas",
  "🇦🇷": "🌎 Americas",
  "🇬🇧": "🇪🇺 Europe",
  "🇪🇺": "🇪🇺 Europe",
  "🇩🇪": "🇪🇺 Europe",
  "🇫🇷": "🇪🇺 Europe",
  "🇮🇹": "🇪🇺 Europe",
  "🇪🇸": "🇪🇺 Europe",
  "🇳🇱": "🇪🇺 Europe",
  "🇨🇭": "🇪🇺 Europe",
  "🇮🇪": "🇪🇺 Europe",
  "🇷🇺": "🇪🇺 Europe",
  "🇹🇷": "🇪🇺 Europe",
  "🇦🇪": "🌍 Middle East & Africa",
  "🇸🇦": "🌍 Middle East & Africa",
  "🇪🇬": "🌍 Middle East & Africa",
  "🇿🇦": "🌍 Middle East & Africa",
  "🇳🇬": "🌍 Middle East & Africa",
  "🇰🇪": "🌍 Middle East & Africa",
  "🇵🇰": "🌏 South & SE Asia",
  "🇧🇩": "🌏 South & SE Asia",
  "🇱🇰": "🌏 South & SE Asia",
  "🇳🇵": "🌏 South & SE Asia",
  "🇸🇬": "🌏 South & SE Asia",
  "🇲🇾": "🌏 South & SE Asia",
  "🇵🇭": "🌏 South & SE Asia",
  "🇹🇭": "🌏 South & SE Asia",
  "🇮🇩": "🌏 South & SE Asia",
  "🇻🇳": "🌏 South & SE Asia",
  "🇦🇺": "🌏 Asia-Pacific",
  "🇳🇿": "🌏 Asia-Pacific",
  "🇨🇳": "🌏 Asia-Pacific",
  "🇯🇵": "🌏 Asia-Pacific",
  "🇰🇷": "🌏 Asia-Pacific",
};

/** Group standards by region for dropdown optgroups. */
export function groupedStandards(): Record<string, PhotoStandard[]> {
  const groups: Record<string, PhotoStandard[]> = {};
  for (const s of PHOTO_STANDARDS) {
    const key = REGION_MAP[s.flag] ?? "🌐 International";
    groups[key] ??= [];
    groups[key].push(s);
  }
  return groups;
}
