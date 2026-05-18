/**
 * Print-layout utility — opens a new window with an A4 sheet of 4×5 ICAO
 * passport photos (35 mm × 45 mm each) and crop marks, then triggers the
 * browser print dialog. Users can save as PDF or send to a printer directly.
 *
 * No external dependencies — relies on the browser's native print engine so
 * physical dimensions are always exact.
 */

const PHOTO_W_MM = 35; // ICAO standard width
const PHOTO_H_MM = 45; // ICAO standard height
const COLS = 4;
const ROWS = 5;
const GAP_MM = 3; // gap between photos (space for crop marks)
const MARK_MM = 2; // length of each crop-mark arm

/** Build the full HTML document string for the print sheet. */
function buildPrintHtml(dataUrl: string): string {
  // Generate the grid cells
  const cells = Array.from({ length: COLS * ROWS })
    .map(
      () => `
        <div class="cell">
          <div class="marks tl"></div>
          <div class="marks tr"></div>
          <div class="marks bl"></div>
          <div class="marks br"></div>
          <img src="${dataUrl}" alt="ICAO passport photo" />
        </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>ICAO Passport Photo — Print Sheet</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 210mm;
    background: #fff;
    font-family: Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8mm 0 6mm;
  }

  .header {
    font-size: 7.5pt;
    color: #555;
    text-align: center;
    margin-bottom: 5mm;
    line-height: 1.6;
  }
  .header strong { color: #111; }

  .grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, ${PHOTO_W_MM}mm);
    grid-template-rows: repeat(${ROWS}, ${PHOTO_H_MM}mm);
    gap: ${GAP_MM}mm;
  }

  .cell {
    position: relative;
    width: ${PHOTO_W_MM}mm;
    height: ${PHOTO_H_MM}mm;
  }

  .cell img {
    display: block;
    width: ${PHOTO_W_MM}mm;
    height: ${PHOTO_H_MM}mm;
    object-fit: cover;
  }

  /* Crop marks — four L-shaped corners */
  .marks {
    position: absolute;
    width: ${MARK_MM}mm;
    height: ${MARK_MM}mm;
    pointer-events: none;
  }
  .marks::before, .marks::after {
    content: '';
    position: absolute;
    background: #aaa;
  }

  /* Top-left */
  .tl { top: -${GAP_MM / 2 + 0.5}mm; left: -${GAP_MM / 2 + 0.5}mm; }
  .tl::before { top: 0; left: 0; width: 1px; height: ${MARK_MM}mm; }
  .tl::after  { top: 0; left: 0; height: 1px; width: ${MARK_MM}mm; }

  /* Top-right */
  .tr { top: -${GAP_MM / 2 + 0.5}mm; right: -${GAP_MM / 2 + 0.5}mm; }
  .tr::before { top: 0; right: 0; width: 1px; height: ${MARK_MM}mm; }
  .tr::after  { top: 0; right: 0; height: 1px; width: ${MARK_MM}mm; }

  /* Bottom-left */
  .bl { bottom: -${GAP_MM / 2 + 0.5}mm; left: -${GAP_MM / 2 + 0.5}mm; }
  .bl::before { bottom: 0; left: 0; width: 1px; height: ${MARK_MM}mm; }
  .bl::after  { bottom: 0; left: 0; height: 1px; width: ${MARK_MM}mm; }

  /* Bottom-right */
  .br { bottom: -${GAP_MM / 2 + 0.5}mm; right: -${GAP_MM / 2 + 0.5}mm; }
  .br::before { bottom: 0; right: 0; width: 1px; height: ${MARK_MM}mm; }
  .br::after  { bottom: 0; right: 0; height: 1px; width: ${MARK_MM}mm; }

  .footer {
    margin-top: 5mm;
    font-size: 6.5pt;
    color: #888;
    text-align: center;
    line-height: 1.7;
  }

  /* Hide UI chrome when printing */
  @media print {
    .no-print { display: none !important; }
  }

  /* Print button shown on screen only */
  .print-btn {
    display: block;
    margin: 6mm auto 4mm;
    padding: 3mm 8mm;
    background: #1e3a8a;
    color: #fff;
    border: none;
    border-radius: 4mm;
    font-size: 10pt;
    font-weight: bold;
    cursor: pointer;
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="header no-print">
    <strong>ICAO Passport Photo Print Sheet</strong><br/>
    ${COLS} × ${ROWS} = ${COLS * ROWS} photos &nbsp;·&nbsp; Each photo: ${PHOTO_W_MM} mm × ${PHOTO_H_MM} mm &nbsp;·&nbsp; A4 paper
  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>

  <div class="grid">
    ${cells}
  </div>

  <div class="footer">
    <span class="no-print">⚠️ </span>
    <strong>Print at 100% scale — do NOT scale to fit / shrink to margins.</strong>
    Cut along the crop marks after printing. Each photo is ${PHOTO_W_MM} mm × ${PHOTO_H_MM} mm (ICAO 9303 compliant).
  </div>
</div>
</body>
</html>`;
}

/**
 * Opens a new browser window with a print-ready A4 sheet of 20 ICAO passport
 * photos and immediately opens the print dialog.
 *
 * @param canvas - The processed ICAO photo canvas (630 × 810 px recommended)
 */
export function printPassportSheet(canvas: HTMLCanvasElement): void {
  // High-quality JPEG data URL (no watermark — only called for paid/dev users)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.97);

  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }

  win.document.open();
  win.document.write(buildPrintHtml(dataUrl));
  win.document.close();

  // Auto-open print dialog once the images have loaded
  win.addEventListener("load", () => {
    // Small delay to let the browser fully render before printing
    setTimeout(() => win.print(), 400);
  });
}
