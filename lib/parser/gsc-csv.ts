/**
 * GSC CSV auto-detect parser.
 * Reads CSV content, detects report type from headers, parses into structured rows.
 */

export type GscReportType = "crawl_stats" | "crawl_errors" | "sitemap" | "canonical" | "404_urls" | "core_web_vitals";

export interface ParsedGscReport {
  type: GscReportType;
  label: string;
  rows: { date: string; data: Record<string, unknown> }[];
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
  if (!val) return new Date().toISOString().substring(0, 10);
  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
  // Try DD.MM.YYYY
  const dmy = val.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // Try DD/MM/YYYY
  const dmy2 = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`;
  return val;
}

function cleanNumber(val: string): number {
  if (!val || val === "—" || val === "-") return 0;
  // Remove non-breaking spaces, commas, etc.
  return parseFloat(val.replace(/[\s,\u00a0]/g, "")) || 0;
}

function detectType(headers: string[], firstRows: string[][]): GscReportType | null {
  const h = headers.map((s) => s.toLowerCase());
  const joined = h.join("|");

  // Crawl stats: Date, Crawl Requests, Download, Response
  if (joined.includes("crawl request") && joined.includes("download")) return "crawl_stats";

  // Crawl errors: Total Checked, Total Problematic
  if (joined.includes("total checked") || joined.includes("problematic")) return "crawl_errors";

  // Sitemap: Sitemap Total URLs, GSC Submitted
  if (joined.includes("sitemap") && joined.includes("submitted")) return "sitemap";

  // Canonical: URL, Indexing Verdict, Canonical
  if (joined.includes("canonical") && joined.includes("verdict")) return "canonical";

  // Core Web Vitals: look for LCP, CLS, INP
  if (joined.includes("lcp") || joined.includes("cls") || joined.includes("inp") || joined.includes("web vital")) return "core_web_vitals";

  // 404 URLs: exactly 2 columns, first is URL, second is Last Crawled
  if (headers.length === 2 && h[0].includes("url") && h[1].includes("crawl")) return "404_urls";

  // Also detect 404 by checking first data row
  if (headers.length === 2 && firstRows.length > 0 && firstRows[0][0]?.startsWith("http")) return "404_urls";

  return null;
}

export function parseGscCSV(csvContent: string): ParsedGscReport | null {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]);
  const dataLines = lines.slice(1).map(parseCSVLine);

  const type = detectType(headers, dataLines.slice(0, 3));
  if (!type) return null;

  const LABELS: Record<GscReportType, string> = {
    crawl_stats: "Crawl Stats",
    crawl_errors: "Crawl Errors",
    sitemap: "Sitemap Freshness",
    canonical: "Canonical Audit",
    "404_urls": "404 URLs",
    core_web_vitals: "Core Web Vitals",
  };

  const rows: { date: string; data: Record<string, unknown> }[] = [];

  switch (type) {
    case "crawl_stats": {
      // Date, Crawl Requests, Download (bytes), Avg Response (ms) [, 404 Requests]
      for (const cols of dataLines) {
        if (!cols[0] || cols[0].toLowerCase().includes("date")) continue;
        rows.push({
          date: parseDate(cols[0]),
          data: {
            crawlRequests: cleanNumber(cols[1]),
            downloadBytes: cleanNumber(cols[2]),
            avgResponseMs: cleanNumber(cols[3]),
            requests404: cols.length > 4 ? cleanNumber(cols[4]) : 0,
          },
        });
      }
      break;
    }
    case "crawl_errors": {
      for (const cols of dataLines) {
        if (!cols[0] || cols[0].toLowerCase().includes("date")) continue;
        rows.push({
          date: parseDate(cols[0]),
          data: {
            totalChecked: cleanNumber(cols[1]),
            totalProblematic: cleanNumber(cols[2]),
            newThisWeek: cleanNumber(cols[3]),
            newUrls: cols[4] || "",
          },
        });
      }
      break;
    }
    case "sitemap": {
      for (const cols of dataLines) {
        if (!cols[0] || cols[0].toLowerCase().includes("date")) continue;
        rows.push({
          date: parseDate(cols[0]),
          data: {
            sitemapTotalUrls: cleanNumber(cols[1]),
            gscSubmitted: cleanNumber(cols[2]),
            delta: cleanNumber(cols[3]),
          },
        });
      }
      break;
    }
    case "canonical": {
      for (const cols of dataLines) {
        if (!cols[0] || cols[0].toLowerCase().includes("date")) continue;
        rows.push({
          date: parseDate(cols[0]),
          data: {
            url: cols[1] || "",
            indexingVerdict: cols[2] || "",
            robotsState: cols[3] || "",
            canonicalDeclared: cols[4] || "",
            canonicalByGoogle: cols[5] || "",
            flag: cols[6] || "",
          },
        });
      }
      break;
    }
    case "404_urls": {
      for (const cols of dataLines) {
        if (!cols[0] || !cols[0].startsWith("http")) continue;
        rows.push({
          date: parseDate(cols[1] || ""),
          data: {
            url: cols[0],
            lastCrawled: cols[1] || "",
          },
        });
      }
      break;
    }
    case "core_web_vitals": {
      // CWV has a complex multi-section format, store each non-empty row
      for (const cols of dataLines) {
        if (!cols[0] && !cols[1]) continue;
        const entry: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          if (cols[i] && cols[i] !== "") entry[h || `col${i}`] = cols[i];
        });
        if (Object.keys(entry).length > 0) {
          rows.push({ date: new Date().toISOString().substring(0, 10), data: entry });
        }
      }
      break;
    }
  }

  return { type, label: LABELS[type], rows };
}
