/**
 * GSC ZIP/CSV parser.
 * Handles Google Search Console exports (zip files with Russian/English CSV files).
 * Detects report type from filename, parses all CSVs within each zip.
 */

export type GscReportType = "crawl_stats" | "crawl_errors" | "sitemap" | "canonical" | "404_urls" | "core_web_vitals" | "performance" | "coverage" | "crawl_by_response";

export interface ParsedGscReport {
  type: GscReportType;
  label: string;
  sections: { name: string; rows: { date: string; data: Record<string, unknown> }[] }[];
  totalRows: number;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseDate(val: string): string {
  const today = new Date().toISOString().substring(0, 10);
  if (!val) return today;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
  // DD.MM.YYYY, HH:MM
  const dmy = val.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const dmy2 = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`;
  // Fallback: return today instead of raw unvalidated string
  return today;
}

function cleanNumber(val: string): number {
  if (!val || val === "—" || val === "-") return 0;
  // Handle European decimal comma: "1,5" → "1.5", then strip thousands separators
  let clean = val.replace(/[\s\u00a0%]/g, "");
  // If comma is decimal separator (e.g., "3,6" not "3,600")
  clean = clean.replace(/(\d),(\d{1,2})$/g, "$1.$2");
  // Strip remaining commas (thousands separator)
  clean = clean.replace(/,/g, "");
  return parseFloat(clean) || 0;
}

function detectTypeFromFilename(filename: string): GscReportType | null {
  const f = filename.toLowerCase();
  if (f.includes("performance") || f.includes("search")) return "performance";
  if (f.includes("core-web-vitals") || f.includes("cwv")) return "core_web_vitals";
  if (f.includes("coverage")) return "coverage";
  if (f.includes("crawl-stats-by-response") || f.includes("by-response")) return "crawl_by_response";
  if (f.includes("crawl-stats") || f.includes("crawl_stats")) return "crawl_stats";
  if (f.includes("sitemap")) return "sitemap";
  if (f.includes("canonical")) return "canonical";
  return null;
}

function detectTypeFromHeaders(headers: string[]): GscReportType | null {
  const h = headers.map((s) => s.toLowerCase());
  const joined = h.join("|");
  if (joined.match(/клики|clicks|показы|impressions|ctr|позиция|position/)) return "performance";
  if (joined.match(/запросов на сканирование|crawl request|скачивание|download/)) return "crawl_stats";
  if (joined.match(/не проиндексировано|not indexed|проиндексированные/)) return "coverage";
  if (joined.match(/низкая скорость|poor|нужно увеличить|needs improvement|хорошо|good/)) return "core_web_vitals";
  if (joined.match(/sitemap|карта сайта/)) return "sitemap";
  if (joined.match(/canonical|каноническ/)) return "canonical";
  return null;
}

function parseSingleCSV(csvName: string, content: string, reportType: GscReportType): { name: string; rows: { date: string; data: Record<string, unknown> }[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { name: csvName, rows: [] };

  const headers = parseCSVLine(lines[0]);
  const dataLines = lines.slice(1).map(parseCSVLine);
  const rows: { date: string; data: Record<string, unknown> }[] = [];

  for (const cols of dataLines) {
    if (!cols[0] || cols.every((c) => !c)) continue;

    const entry: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (cols[i] !== undefined && cols[i] !== "") {
        entry[h] = cols[i];
      }
    });

    // Try to extract date from first column
    let date = new Date().toISOString().substring(0, 10);
    const firstCol = cols[0] || "";
    if (/\d{4}-\d{2}-\d{2}/.test(firstCol) || /\d{2}\.\d{2}\.\d{4}/.test(firstCol)) {
      date = parseDate(firstCol);
    }

    rows.push({ date, data: entry });
  }

  return { name: csvName, rows };
}

const LABELS: Record<GscReportType, string> = {
  performance: "Performance on Search",
  core_web_vitals: "Core Web Vitals",
  coverage: "Index Coverage",
  crawl_stats: "Crawl Stats",
  crawl_by_response: "Crawl Stats (By Response)",
  crawl_errors: "Crawl Errors",
  sitemap: "Sitemap",
  canonical: "Canonical Audit",
  "404_urls": "404 URLs",
};

/** Parse a single CSV file (not zipped). */
export function parseGscCSV(csvContent: string, filename?: string): ParsedGscReport | null {
  const type = (filename ? detectTypeFromFilename(filename) : null) ||
    detectTypeFromHeaders(parseCSVLine(csvContent.split("\n")[0] || ""));
  if (!type) return null;

  const section = parseSingleCSV(filename || "data.csv", csvContent, type);
  return { type, label: LABELS[type], sections: [section], totalRows: section.rows.length };
}

/** Parse a ZIP file containing multiple CSVs. Returns a single report with multiple sections. */
export async function parseGscZip(file: File): Promise<ParsedGscReport | null> {
  const type = detectTypeFromFilename(file.name);
  if (!type) {
    console.warn("Could not detect report type from filename:", file.name);
    return null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(arrayBuffer);

  // First pass: read all CSVs and detect device from metadata
  const csvContents: { name: string; content: string }[] = [];
  let devicePrefix = "";

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith(".csv")) continue;
    const bytes = await entry.async("uint8array");
    let content: string;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      content = new TextDecoder("utf-8").decode(bytes.slice(3));
    } else {
      content = new TextDecoder("utf-8").decode(bytes);
    }
    csvContents.push({ name, content });

    // Detect device type from metadata CSV (Метаданные / Metadata)
    if (name.toLowerCase().includes("метаданн") || name.toLowerCase().includes("metadata")) {
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes("мобильн") || lower.includes("mobile")) { devicePrefix = "mobile:"; break; }
        if (lower.includes("пк") || lower.includes("desktop") || lower.includes("компьютер")) { devicePrefix = "desktop:"; break; }
      }
    }
  }

  const sections: { name: string; rows: { date: string; data: Record<string, unknown> }[] }[] = [];
  let totalRows = 0;
  let label = LABELS[type];
  if (devicePrefix) {
    label += devicePrefix === "mobile:" ? " (Mobile)" : " (Desktop)";
  }

  for (const { name, content } of csvContents) {
    const sectionName = devicePrefix + name.replace(/\.csv$/, "");
    const section = parseSingleCSV(sectionName, content, type);
    sections.push(section);
    totalRows += section.rows.length;
  }

  return { type, label, sections, totalRows };
}
