export function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtBrl(v: number) {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function roundMoney(v: number) {
  return Math.round(Number(v || 0) * 100) / 100;
}

export function safeFilePart(s: string, max = 24) {
  return String(s || "empresa")
    .slice(0, max)
    .replace(/[\\/:*?"<>|]/g, "");
}

export function exportFileName(parts: (string | undefined)[], ext: string) {
  const safeDate = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  const bits = [...parts, safeDate]
    .map((p) =>
      String(p || "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, "_")
        .slice(0, 40),
    )
    .filter(Boolean);
  return `${bits.join("_")}.${ext}`;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

export type JsPdfDoc = {
  internal: { pageSize: { getHeight: () => number } };
  setFont: (n: string, s: string) => void;
  setFontSize: (n: number) => void;
  setTextColor: (...n: number[]) => void;
  text: (t: string, x: number, y: number) => void;
  addPage: () => void;
  autoTable: (opts: Record<string, unknown>) => void;
  lastAutoTable?: { finalY: number };
  save: (name: string) => void;
};

export type JsPdfNs = {
  jsPDF: new (opts: { orientation: string; unit: string; format: string }) => JsPdfDoc;
};

export type XlsxNs = {
  utils: {
    book_new: () => unknown;
    aoa_to_sheet: (rows: (string | number)[][]) => { "!cols"?: { wch: number }[] };
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  writeFile: (wb: unknown, name: string) => void;
};

declare global {
  interface Window {
    jspdf?: JsPdfNs;
    XLSX?: XlsxNs;
  }
}

export async function loadPdfLibs() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  const Ctor = window.jspdf?.jsPDF as (JsPdfNs["jsPDF"] & { prototype?: { autoTable?: unknown } }) | undefined;
  if (!Ctor) throw new Error("Biblioteca jsPDF nao carregada.");
  if (typeof Ctor.prototype?.autoTable !== "function") {
    throw new Error("Biblioteca jspdf-autotable nao carregada.");
  }
}

export async function loadXlsxLib() {
  await loadScript("https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js");
  if (!window.XLSX) throw new Error("Biblioteca XLSX nao carregada.");
}

export async function newPdf(orientation: "portrait" | "landscape" = "portrait") {
  await loadPdfLibs();
  const { jsPDF } = window.jspdf as JsPdfNs;
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

export async function getXlsx() {
  await loadXlsxLib();
  return window.XLSX as XlsxNs;
}

export function autoColWidths(aoa: (string | number)[][], maxWch = 50) {
  const widths: number[] = [];
  for (const row of aoa) {
    row.forEach((cell, c) => {
      const len = String(cell ?? "").length + 2;
      widths[c] = Math.min(Math.max(widths[c] || 10, len), maxWch);
    });
  }
  return widths.map((wch) => ({ wch }));
}

export function appendSheet(XLSX: XlsxNs, wb: unknown, name: string, aoa: (string | number)[][], maxWch = 50) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = autoColWidths(aoa, maxWch);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}
