/**
 * Print-layout utility — opens a polished print-preview window with:
 *  • Interactive copy-count selector (1 / 2 / 4 / 6 / 8 / 12 / 16 / 20)
 *  • A4 paper preview on a gray desk background
 *  • L-shaped crop marks around every photo
 *  • Auto-triggers window.print() for immediate PDF / printer access
 *
 * Zero external dependencies — physical dimensions are handled by the
 * browser's native print engine via @page { size: A4 } + mm units.
 */

const PHOTO_W_MM = 35;   // ICAO standard width
const PHOTO_H_MM = 45;   // ICAO standard height
const GAP_MM     = 4;    // space between photos (crop-mark gutter)
const MARK_MM    = 2.5;  // length of each crop-mark arm

/** Count → optimal column count for that many photos on A4 */
const LAYOUTS: Record<number, number> = {
  1: 1, 2: 2, 4: 2, 6: 3, 8: 4, 9: 3, 12: 4, 16: 4, 20: 4,
};

/** Available count presets */
const PRESETS = [1, 2, 4, 6, 8, 12, 16, 20];

function buildPrintHtml(dataUrl: string, originalName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Print — ${originalName} — ICAO Passport Photo</title>
<style>
/* ─── Reset ───────────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ─── Screen layout ───────────────────────────────────────────────── */
:root{
  --navy:#1e3a8a;
  --saffron:#f59e0b;
  --paper:#ffffff;
  --desk:#e2e8f0;
  --mark:#bbb;
}
body{
  font-family:system-ui,-apple-system,sans-serif;
  background:var(--desk);
  min-height:100vh;
}

/* Toolbar */
#toolbar{
  position:fixed;top:0;left:0;right:0;
  height:56px;
  background:var(--navy);
  color:#fff;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;gap:12px;
  box-shadow:0 2px 12px rgba(0,0,0,.25);
  z-index:100;
}
#toolbar-title{
  font-size:13px;font-weight:700;white-space:nowrap;
  display:flex;align-items:center;gap:8px;
}
#toolbar-title svg{opacity:.8}
#qty-row{
  display:flex;align-items:center;gap:6px;flex-wrap:wrap;
}
#qty-row span{font-size:12px;opacity:.75;white-space:nowrap}
.qty-chip{
  padding:4px 10px;border-radius:999px;border:1.5px solid rgba(255,255,255,.35);
  background:transparent;color:#fff;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .15s;
}
.qty-chip:hover{border-color:#fff;background:rgba(255,255,255,.12)}
.qty-chip.active{background:var(--saffron);border-color:var(--saffron);color:var(--navy)}
#print-btn{
  white-space:nowrap;
  padding:8px 18px;border-radius:8px;border:none;
  background:var(--saffron);color:var(--navy);
  font-size:13px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;gap:6px;
  transition:opacity .15s;
}
#print-btn:hover{opacity:.9}

/* Desk / canvas area */
#desk{
  padding:76px 24px 48px;
  display:flex;flex-direction:column;align-items:center;gap:16px;
  min-height:100vh;
}

/* The simulated paper sheet */
#paper{
  background:white;
  box-shadow:0 8px 40px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);
  border-radius:2px;
  padding:12mm;
  display:inline-flex;
  flex-direction:column;
  align-items:center;
  gap:10mm;
  /* Scale to fit viewport — JS will adjust transform */
  transform-origin:top center;
}

/* Photo grid */
#grid{
  display:grid;
  /* cols & gap set by JS */
}

/* Individual photo cell */
.cell{
  position:relative;
  width:${PHOTO_W_MM}mm;
  height:${PHOTO_H_MM}mm;
}
.cell img{
  display:block;
  width:100%;height:100%;
  object-fit:cover;
}

/* Crop-mark corners */
.cm{position:absolute;pointer-events:none}
.cm::before,.cm::after{content:'';position:absolute;background:var(--mark)}

/* TL */
.tl{top:-${GAP_MM/2}mm;left:-${GAP_MM/2}mm}
.tl::before{top:0;left:0;width:.4mm;height:${MARK_MM}mm}
.tl::after {top:0;left:0;height:.4mm;width:${MARK_MM}mm}
/* TR */
.tr{top:-${GAP_MM/2}mm;right:-${GAP_MM/2}mm}
.tr::before{top:0;right:0;width:.4mm;height:${MARK_MM}mm}
.tr::after {top:0;right:0;height:.4mm;width:${MARK_MM}mm}
/* BL */
.bl{bottom:-${GAP_MM/2}mm;left:-${GAP_MM/2}mm}
.bl::before{bottom:0;left:0;width:.4mm;height:${MARK_MM}mm}
.bl::after {bottom:0;left:0;height:.4mm;width:${MARK_MM}mm}
/* BR */
.br{bottom:-${GAP_MM/2}mm;right:-${GAP_MM/2}mm}
.br::before{bottom:0;right:0;width:.4mm;height:${MARK_MM}mm}
.br::after {bottom:0;right:0;height:.4mm;width:${MARK_MM}mm}

/* Paper caption */
#paper-caption{
  font-size:6.5pt;color:#999;text-align:center;line-height:1.7;
}
#paper-caption strong{color:#555}

/* Screen info footer */
#screen-footer{
  font-size:12px;color:#64748b;text-align:center;
  display:flex;flex-direction:column;gap:4px;
  padding-bottom:16px;
}
#screen-footer strong{color:#334155}

/* ─── Print styles ────────────────────────────────────────────────── */
@media print{
  @page{size:A4 portrait;margin:10mm}
  body{background:#fff}
  #toolbar,#screen-footer{display:none!important}
  #desk{padding:0;background:white;display:block}
  #paper{
    box-shadow:none;border-radius:0;
    padding:0;margin:0;
    transform:none!important;
  }
  /* Ensure grid uses mm measurements */
  #grid{gap:${GAP_MM}mm}
  .cell{width:${PHOTO_W_MM}mm;height:${PHOTO_H_MM}mm}
  #paper-caption{margin-top:4mm}
}
</style>
</head>
<body>

<!-- ── Toolbar ─────────────────────────────────────────────────────── -->
<div id="toolbar">
  <div id="toolbar-title">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M6 9V2h12v7"/><rect x="6" y="18" width="12" height="4" rx="1"/>
      <path d="M6 14H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-2"/>
      <circle cx="18" cy="15" r="1" fill="currentColor"/>
    </svg>
    ICAO Print Sheet
  </div>

  <div id="qty-row">
    <span>Copies:</span>
    ${PRESETS.map(n => `<button class="qty-chip${n === 20 ? " active" : ""}" data-n="${n}" onclick="setCount(${n})">${n}</button>`).join("")}
  </div>

  <button id="print-btn" onclick="window.print()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M6 9V2h12v7"/><rect x="6" y="18" width="12" height="4" rx="1"/>
      <path d="M6 14H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-2"/>
    </svg>
    Print / Save PDF
  </button>
</div>

<!-- ── Desk area ───────────────────────────────────────────────────── -->
<div id="desk">
  <div id="paper">
    <div id="grid"></div>
    <div id="paper-caption">
      <strong>Print at 100% — do NOT "scale to fit" or "fit to margins"</strong><br/>
      Cut along crop marks · Each photo: ${PHOTO_W_MM} mm × ${PHOTO_H_MM} mm · ICAO 9303
    </div>
  </div>

  <div id="screen-footer">
    <strong id="footer-label">4 × 5 = 20 photos on A4</strong>
    <span>Original file: ${originalName}</span>
  </div>
</div>

<script>
const IMG_SRC = ${JSON.stringify(dataUrl)};
const LAYOUTS = ${JSON.stringify(LAYOUTS)};
const PHOTO_W = ${PHOTO_W_MM};
const PHOTO_H = ${PHOTO_H_MM};
const GAP     = ${GAP_MM};

let currentCount = 20;

function colsFor(n){
  return LAYOUTS[n] ?? 4;
}

function buildCell(){
  return \`<div class="cell">
    <div class="cm tl"></div>
    <div class="cm tr"></div>
    <div class="cm bl"></div>
    <div class="cm br"></div>
    <img src="\${IMG_SRC}" alt="ICAO passport photo"/>
  </div>\`;
}

function setCount(n){
  currentCount = n;
  const cols = colsFor(n);
  const rows = Math.ceil(n / cols);

  // Update grid CSS
  const grid = document.getElementById('grid');
  grid.style.gridTemplateColumns = \`repeat(\${cols}, \${PHOTO_W}mm)\`;
  grid.style.gridTemplateRows    = \`repeat(\${rows}, \${PHOTO_H}mm)\`;
  grid.style.gap = \`\${GAP}mm\`;
  grid.innerHTML = Array.from({length: n}).map(buildCell).join('');

  // Update chips
  document.querySelectorAll('.qty-chip').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.n) === n);
  });

  // Update footer
  const lbl = document.getElementById('footer-label');
  if(lbl) lbl.textContent = cols + ' × ' + rows + ' = ' + n + ' photo' + (n===1?'':'s') + ' on A4';

  scalePaper();
}

function scalePaper(){
  const paper = document.getElementById('paper');
  const desk  = document.getElementById('desk');
  if(!paper || !desk) return;

  // A4 width at 96dpi = 210mm * 96/25.4 ≈ 793px
  // We allow some padding on each side
  const available = Math.min(desk.clientWidth - 48, 760);
  const a4px = 793; // A4 width in CSS px at 96dpi
  const scale = Math.min(1, available / a4px);
  paper.style.transform = \`scale(\${scale})\`;
  // Compensate for collapsed height after scale
  paper.style.marginBottom = \`-\${paper.scrollHeight * (1 - scale)}px\`;
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  setCount(20);
});
window.addEventListener('resize', scalePaper);
</script>
</body>
</html>`;
}

/**
 * Opens a print-preview window for the ICAO passport photo sheet.
 *
 * @param canvas        The processed ICAO canvas (630 × 810 px)
 * @param originalName  Original filename stem (no extension) for the title
 */
export function printPassportSheet(
  canvas: HTMLCanvasElement,
  originalName = "photo",
): void {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.97);
  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }
  win.document.open();
  win.document.write(buildPrintHtml(dataUrl, originalName));
  win.document.close();

  win.addEventListener("load", () => {
    setTimeout(() => win.print(), 500);
  });
}
