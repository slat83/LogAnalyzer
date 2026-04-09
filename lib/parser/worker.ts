/**
 * Log parser Web Worker.
 * Runs decompression + parsing entirely off the main thread.
 * Communicates via postMessage for progress and results.
 */

import { inflate } from "pako";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkerInput {
  type: "parse";
  fileBuffers: ArrayBuffer[];
  fileNames: string[];
  customRules: { pattern: string; label: string }[];
}

interface ProgressMsg {
  type: "progress";
  filesProcessed: number;
  totalFiles: number;
  linesProcessed: number;
  currentFile: string;
}

// ── Reservoir Stats ──────────────────────────────────────────────────────────

class ReservoirStats {
  private reservoir: number[] = [];
  private maxSize: number;
  count = 0;
  sum = 0;
  constructor(maxSize = 2000) { this.maxSize = maxSize; }
  add(val: number) {
    this.count++;
    this.sum += val;
    if (this.reservoir.length < this.maxSize) this.reservoir.push(val);
    else { const j = Math.floor(Math.random() * this.count); if (j < this.maxSize) this.reservoir[j] = val; }
  }
  getStats() {
    if (this.count === 0) return { avg: 0, median: 0, p95: 0, p99: 0 };
    const s = this.reservoir.slice().sort((a, b) => a - b);
    const n = s.length;
    return { avg: Math.round((this.sum / this.count) * 1000) / 1000, median: s[Math.floor(n * 0.5)], p95: s[Math.floor(n * 0.95)], p99: s[Math.floor(n * 0.99)] };
  }
}

// ── Bot Detection ────────────────────────────────────────────────────────────

const BOT_PATTERNS = [
  { name: "googlebot", re: /googlebot/i }, { name: "bingbot", re: /bingbot|msnbot/i },
  { name: "ahrefsbot", re: /ahrefsbot/i }, { name: "semrushbot", re: /semrushbot/i },
  { name: "yandexbot", re: /yandexbot/i }, { name: "baiduspider", re: /baiduspider/i },
  { name: "facebookbot", re: /facebookexternalhit|meta-externalagent|facebookcatalog/i },
  { name: "applebot", re: /applebot/i }, { name: "gptbot", re: /gptbot/i },
  { name: "claudebot", re: /claudebot|anthropic/i }, { name: "telegraf", re: /telegraf/i },
  { name: "petalbot", re: /petalbot/i }, { name: "bytespider", re: /bytespider/i },
  { name: "mj12bot", re: /mj12bot/i }, { name: "dotbot", re: /dotbot/i },
  { name: "duckduckbot", re: /duckduckbot/i }, { name: "twitterbot", re: /twitterbot/i },
];
const GENERIC_BOT = /bot|crawl|spider|scraper|fetch|monitor|check|curl|wget|python|java\/|go-http|http-client|libwww|apache|selenide/i;

function detectBot(ua: string): string | null {
  for (const b of BOT_PATTERNS) if (b.re.test(ua)) return b.name;
  return GENERIC_BOT.test(ua) ? "other" : null;
}

// ── URL Classification ───────────────────────────────────────────────────────

const STATIC_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|map|webp|avif)(\?|$)/i;
const LANG_PREFIX = /^\/(es|fr|ru|pl|ar|de|pt|it|nl|uk|ja|ko|zh|tr|vi)\//;

interface CompiledRule { re: RegExp; label: string }

function classifyUrl(url: string, rules: CompiledRule[]): string {
  if (STATIC_EXT.test(url)) return "static";
  let path = url.split("?")[0], lang = "";
  const lm = path.match(LANG_PREFIX);
  if (lm) { lang = lm[1] + ":"; path = path.slice(lm[0].length - 1); }
  for (const r of rules) if (r.re.test(path)) return lang + r.label;
  const segs = path.split("/").filter(Boolean);
  if (segs[0] === "api") return lang + "api:" + (segs[1] || "root");
  if (segs.includes("checkout")) return lang + "checkout";
  return lang + ("/" + segs.slice(0, 2).join("/") || "/");
}

function detectLanguage(url: string): string {
  const m = url.match(LANG_PREFIX);
  return m ? m[1] : "en";
}

// ── Line Parser ──────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseLine(line: string) {
  const i1 = line.indexOf(" ");
  if (i1 === -1) return null;
  const dateStr = line.substring(0, i1);
  const r1 = line.substring(i1 + 1);
  const i2 = r1.indexOf(" ");
  if (i2 === -1) return null;
  const r2 = r1.substring(i2 + 1);
  const i3 = r2.indexOf(" ");
  if (i3 === -1) return null;
  const url = r2.substring(0, i3);
  const r3 = r2.substring(i3 + 1);

  let status: number, rt: number | null = null, ua: string;
  const ls = r3.lastIndexOf(" ");
  if (ls === -1) return null;
  const last = r3.substring(ls + 1);

  if (/^\d+\.\d+$/.test(last)) {
    rt = parseFloat(last);
    const before = r3.substring(0, ls);
    const ps = before.lastIndexOf(" ");
    if (ps === -1) return null;
    status = parseInt(before.substring(ps + 1), 10);
    ua = before.substring(0, ps);
  } else if (/^\d{3}$/.test(last)) {
    status = parseInt(last, 10);
    ua = r3.substring(0, ls);
  } else return null;

  if (isNaN(status) || status < 100 || status > 599) return null;
  const mon = MONTH_MAP[dateStr.substring(3, 6)];
  if (!mon) return null;
  const day = dateStr.substring(0, 2);
  const year = dateStr.substring(7, 11);
  const hour = parseInt(dateStr.substring(12, 14), 10);
  const dateIso = `${year}-${mon}-${day}`;
  return { dateIso, year: +year, month: +mon, day: +day, hour, url, ua, status, rt };
}

// ── Day of Week (Zeller) ─────────────────────────────────────────────────────

function dayOfWeek(y: number, m: number, d: number): number {
  if (m < 3) { m += 12; y--; }
  return ((d + Math.floor(13 * (m + 1) / 5) + y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7 + 5) % 7;
}

// ── Main Parse Function ──────────────────────────────────────────────────────

function parseAll(fileBuffers: ArrayBuffer[], fileNames: string[], customRules: { pattern: string; label: string }[]) {
  const rules: CompiledRule[] = customRules.map(r => ({ re: new RegExp(r.pattern, "i"), label: r.label }));

  const globalRt = new ReservoirStats(2000);
  const clusters = new Map<string, { count: number; statuses: Record<string, number>; rtStats: ReservoirStats; byDay: Record<string, number>; uas: Record<string, number> }>();
  const statusCodes: Record<string, number> = {};
  const requestsByDay: Record<string, number> = {};
  const bots: Record<string, { requests: number; pages: Record<string, number>; byDay: Record<string, number> }> = {};
  let botReqs = 0, humanReqs = 0, botRtSum = 0, humanRtSum = 0, botRtCnt = 0, humanRtCnt = 0;
  const urls = new Set<string>();
  let total = 0, minDate = "9999-99-99", maxDate = "0000-00-00";

  const e404: Record<string, { count: number; examples: string[] }> = {};
  const e5xx: Record<string, number> = {};
  const slow: Record<string, { sum: number; count: number }> = {};

  let redirTotal = 0;
  const redirByStatus: Record<string, number> = {};
  const redirByPattern: Record<string, { count: number; botCount: number; humanCount: number }> = {};

  let g410Total = 0, g410Gb = 0;
  const g410ByPattern: Record<string, { count: number; botCount: number; examples: string[] }> = {};

  let gbTotal = 0, gbUseful = 0, gbRedirs = 0, gb404 = 0, gb410 = 0, gbStatic = 0;

  let coTotal = 0;
  const coVins = new Set<string>();
  const coByStatus: Record<string, number> = {};
  const coByDay: Record<string, { requests: number; success200: number }> = {};

  const langs: Record<string, { requests: number; ok200: number; err404: number; botCount: number }> = {};

  const heatRt: Record<string, { sum: number; count: number }> = {};
  const heatReq: Record<string, number> = {};
  const daysSet = new Set<string>();

  const uaStats: Record<string, { count: number; errors: number }> = {};

  const PROGRESS_INTERVAL = 100_000;

  for (let fi = 0; fi < fileBuffers.length; fi++) {
    self.postMessage({ type: "progress", filesProcessed: fi, totalFiles: fileBuffers.length, linesProcessed: total, currentFile: `Decompressing ${fileNames[fi]}...` } as ProgressMsg);

    let text: string;
    try {
      const dec = inflate(new Uint8Array(fileBuffers[fi]));
      text = new TextDecoder("utf-8").decode(dec);
    } catch {
      text = new TextDecoder("utf-8").decode(fileBuffers[fi]);
    }

    // Split by newline using indexOf for less memory pressure than .split()
    let pos = 0;
    let lineCount = 0;
    const len = text.length;

    self.postMessage({ type: "progress", filesProcessed: fi, totalFiles: fileBuffers.length, linesProcessed: total, currentFile: `Parsing ${fileNames[fi]}...` } as ProgressMsg);

    while (pos < len) {
      const nl = text.indexOf("\n", pos);
      const end = nl === -1 ? len : nl;
      const line = text.substring(pos, end);
      pos = end + 1;
      lineCount++;

      if (lineCount % PROGRESS_INTERVAL === 0) {
        self.postMessage({ type: "progress", filesProcessed: fi, totalFiles: fileBuffers.length, linesProcessed: total, currentFile: `${fileNames[fi]} — ${lineCount.toLocaleString()} lines` } as ProgressMsg);
      }

      if (!line) continue;
      const p = parseLine(line);
      if (!p) continue;

      const { dateIso, year, month, day, hour, url, ua, status, rt } = p;
      total++;

      if (urls.size < 100000) urls.add(url);
      if (dateIso < minDate) minDate = dateIso;
      if (dateIso > maxDate) maxDate = dateIso;

      const sc = String(status);
      statusCodes[sc] = (statusCodes[sc] || 0) + 1;
      requestsByDay[dateIso] = (requestsByDay[dateIso] || 0) + 1;
      if (rt != null) globalRt.add(rt);

      const bot = detectBot(ua);
      const isBot = bot !== null;
      if (isBot) {
        botReqs++;
        if (rt != null) { botRtSum += rt; botRtCnt++; }
        if (!bots[bot]) bots[bot] = { requests: 0, pages: {}, byDay: {} };
        bots[bot].requests++;
        bots[bot].byDay[dateIso] = (bots[bot].byDay[dateIso] || 0) + 1;
        if (Object.keys(bots[bot].pages).length < 100) bots[bot].pages[url] = (bots[bot].pages[url] || 0) + 1;
      } else {
        humanReqs++;
        if (rt != null) { humanRtSum += rt; humanRtCnt++; }
      }

      const cluster = classifyUrl(url, rules);
      if (!clusters.has(cluster)) clusters.set(cluster, { count: 0, statuses: {}, rtStats: new ReservoirStats(500), byDay: {}, uas: {} });
      const ca = clusters.get(cluster)!;
      ca.count++;
      ca.statuses[sc] = (ca.statuses[sc] || 0) + 1;
      if (rt != null) ca.rtStats.add(rt);
      ca.byDay[dateIso] = (ca.byDay[dateIso] || 0) + 1;
      const shortUa = ua.length > 40 ? ua.substring(0, 40) : ua;
      if (Object.keys(ca.uas).length < 50) ca.uas[shortUa] = (ca.uas[shortUa] || 0) + 1;

      // Errors
      if (status === 404) {
        if (!e404[cluster]) e404[cluster] = { count: 0, examples: [] };
        e404[cluster].count++;
        if (e404[cluster].examples.length < 3) e404[cluster].examples.push(url);
      }
      if (status >= 500) e5xx[cluster] = (e5xx[cluster] || 0) + 1;
      if (rt != null && rt > 1) {
        if (!slow[cluster]) slow[cluster] = { sum: 0, count: 0 };
        slow[cluster].sum += rt; slow[cluster].count++;
      }

      // Redirects
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        redirTotal++;
        redirByStatus[sc] = (redirByStatus[sc] || 0) + 1;
        if (!redirByPattern[cluster]) redirByPattern[cluster] = { count: 0, botCount: 0, humanCount: 0 };
        redirByPattern[cluster].count++;
        if (isBot) redirByPattern[cluster].botCount++; else redirByPattern[cluster].humanCount++;
      }

      // 410
      if (status === 410) {
        g410Total++;
        if (/googlebot/i.test(ua)) g410Gb++;
        if (!g410ByPattern[cluster]) g410ByPattern[cluster] = { count: 0, botCount: 0, examples: [] };
        g410ByPattern[cluster].count++;
        if (isBot) g410ByPattern[cluster].botCount++;
        if (g410ByPattern[cluster].examples.length < 5) g410ByPattern[cluster].examples.push(url);
      }

      // Crawl budget
      if (/googlebot/i.test(ua)) {
        gbTotal++;
        if (status === 200 && !STATIC_EXT.test(url)) gbUseful++;
        else if (status === 301 || status === 302 || status === 307) gbRedirs++;
        else if (status === 404) gb404++;
        else if (status === 410) gb410++;
        else if (STATIC_EXT.test(url)) gbStatic++;
      }

      // Checkout
      const coMatch = url.match(/\/checkout\/([a-z0-9]+)/i);
      if (coMatch) {
        coTotal++;
        const vin = coMatch[1].toLowerCase();
        if (coVins.size < 100000) coVins.add(vin);
        coByStatus[sc] = (coByStatus[sc] || 0) + 1;
        if (!coByDay[dateIso]) coByDay[dateIso] = { requests: 0, success200: 0 };
        coByDay[dateIso].requests++;
        if (status === 200) coByDay[dateIso].success200++;
      }

      // Languages
      const lang = detectLanguage(url);
      if (!langs[lang]) langs[lang] = { requests: 0, ok200: 0, err404: 0, botCount: 0 };
      langs[lang].requests++;
      if (status === 200) langs[lang].ok200++;
      if (status === 404) langs[lang].err404++;
      if (isBot) langs[lang].botCount++;

      // Heatmap
      const dow = dayOfWeek(year, month, day);
      daysSet.add(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dow]);
      const hk = `${dow}:${hour}`;
      heatReq[hk] = (heatReq[hk] || 0) + 1;
      if (rt != null) { if (!heatRt[hk]) heatRt[hk] = { sum: 0, count: 0 }; heatRt[hk].sum += rt; heatRt[hk].count++; }

      // Suspicious UAs
      const uaKey = ua.length > 150 ? ua.substring(0, 150) : ua;
      if (Object.keys(uaStats).length < 5000 || uaStats[uaKey]) {
        if (!uaStats[uaKey]) uaStats[uaKey] = { count: 0, errors: 0 };
        uaStats[uaKey].count++;
        if (status >= 400) uaStats[uaKey].errors++;
      }
    }

    // Release memory for this file's text
    text = "";
  }

  // ── Build Summary ────────────────────────────────────────────────────────

  self.postMessage({ type: "progress", filesProcessed: fileBuffers.length, totalFiles: fileBuffers.length, linesProcessed: total, currentFile: "Building summary..." } as ProgressMsg);

  const rtStats = globalRt.getStats();
  const pct = (n: number, t: number) => t > 0 ? Math.round((n / t) * 10000) / 100 : 0;

  const sortedClusters = [...clusters.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 200);
  const clusterArr = sortedClusters.map(([pattern, ca]) => {
    const crt = ca.rtStats.getStats();
    return {
      pattern, count: ca.count, statuses: ca.statuses,
      responseTime: { avg: crt.avg, p95: crt.p95 },
      byDay: Object.entries(ca.byDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
      topUAs: Object.entries(ca.uas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([u, c]) => ({ ua: u, count: c })),
    };
  });

  const err404 = Object.entries(e404).sort((a, b) => b[1].count - a[1].count).slice(0, 50).map(([p, e]) => ({ pattern: p, count: e.count, examples: e.examples }));
  const err5xx = Object.entries(e5xx).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([p, c]) => ({ pattern: p, count: c }));
  const errSlow = Object.entries(slow).filter(([, s]) => s.count > 10).sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count)).slice(0, 50).map(([p, s]) => ({ pattern: p, avgTime: Math.round((s.sum / s.count) * 1000) / 1000, count: s.count }));

  const botsOut: Record<string, { requests: number; topPages: { url: string; count: number }[]; byDay: { date: string; count: number }[] }> = {};
  for (const [name, ba] of Object.entries(bots)) {
    botsOut[name] = {
      requests: ba.requests,
      topPages: Object.entries(ba.pages).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([u, c]) => ({ url: u, count: c })),
      byDay: Object.entries(ba.byDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  const dowOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daysList = [...daysSet].sort((a, b) => dowOrder.indexOf(a) - dowOrder.indexOf(b));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hRt: number[][] = [], hReq: number[][] = [];
  for (const d of daysList) {
    const dow = dowOrder.indexOf(d);
    const rtRow: number[] = [], reqRow: number[] = [];
    for (let h = 0; h < 24; h++) {
      const k = `${dow}:${h}`;
      reqRow.push(heatReq[k] || 0);
      const hr = heatRt[k];
      rtRow.push(hr && hr.count > 0 ? Math.round((hr.sum / hr.count) * 1000) / 1000 : 0);
    }
    hRt.push(rtRow); hReq.push(reqRow);
  }

  const uaArr = Object.entries(uaStats).map(([u, s]) => ({ ua: u, count: s.count, errorRate: s.count > 0 ? Math.round((s.errors / s.count) * 10000) / 100 : 0 }));

  const gbWasteTotal = gbRedirs + gb404 + gb410 + gbStatic;

  const summary = {
    totalRequests: total,
    uniqueUrls: urls.size,
    dateRange: { from: minDate, to: maxDate },
    requestsByDay: Object.entries(requestsByDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
    statusCodes,
    responseTime: rtStats,
    clusters: clusterArr,
    errors: { "404": err404, "500": err5xx, slow: errSlow },
    bots: botsOut,
    botVsHuman: {
      bot: { requests: botReqs, avgResponseTime: botRtCnt > 0 ? Math.round((botRtSum / botRtCnt) * 1000) / 1000 : 0 },
      human: { requests: humanReqs, avgResponseTime: humanRtCnt > 0 ? Math.round((humanRtSum / humanRtCnt) * 1000) / 1000 : 0 },
    },
    redirects: {
      total: redirTotal, byStatus: redirByStatus,
      byPattern: Object.entries(redirByPattern).sort((a, b) => b[1].count - a[1].count).slice(0, 100).map(([p, r]) => ({ pattern: p, count: r.count, botCount: r.botCount, humanCount: r.humanCount })),
    },
    gone410: {
      total: g410Total, googlebotRequests: g410Gb,
      byPattern: Object.entries(g410ByPattern).sort((a, b) => b[1].count - a[1].count).slice(0, 50).map(([p, g]) => ({ pattern: p, count: g.count, botCount: g.botCount, examples: g.examples })),
    },
    crawlBudget: {
      totalGooglebot: gbTotal,
      useful: { count: gbUseful, percent: pct(gbUseful, gbTotal) },
      waste: {
        redirects: { count: gbRedirs, percent: pct(gbRedirs, gbTotal) },
        notFound404: { count: gb404, percent: pct(gb404, gbTotal) },
        gone410: { count: gb410, percent: pct(gb410, gbTotal) },
        static: { count: gbStatic, percent: pct(gbStatic, gbTotal) },
        total: { count: gbWasteTotal, percent: pct(gbWasteTotal, gbTotal) },
      },
    },
    checkoutFunnel: {
      totalRequests: coTotal, uniqueVINs: coVins.size, byStatus: coByStatus,
      byDay: Object.entries(coByDay).map(([d, v]) => ({ date: d, requests: v.requests, success200: v.success200 })).sort((a, b) => a.date.localeCompare(b.date)),
    },
    languages: Object.entries(langs).sort((a, b) => b[1].requests - a[1].requests).map(([l, d]) => ({
      lang: l, requests: d.requests, ok200: d.ok200, err404: d.err404,
      botPercent: d.requests > 0 ? Math.round((d.botCount / d.requests) * 10000) / 100 : 0,
    })),
    heatmap: { responseTime: hRt, requests: hReq, hours, days: daysList },
    suspicious: {
      topUAs: [...uaArr].sort((a, b) => b.count - a.count).slice(0, 20),
      highErrorUAs: uaArr.filter(u => u.count > 1000 && u.errorRate > 50).sort((a, b) => b.errorRate - a.errorRate).slice(0, 20),
    },
  };

  self.postMessage({ type: "done", summary });
}

// ── Worker Entry ─────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  if (e.data.type === "parse") {
    try {
      parseAll(e.data.fileBuffers, e.data.fileNames, e.data.customRules);
    } catch (err) {
      self.postMessage({ type: "error", error: (err as Error).message });
    }
  }
};
