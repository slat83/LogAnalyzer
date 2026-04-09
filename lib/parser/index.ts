import { inflate } from "pako";
import { ReservoirStats } from "./stats";
import { detectBot, isGooglebot } from "./bots";
import { classifyUrl, detectLanguage, extractCheckoutId, compileRules, type UrlRule } from "./classify";
import type { Summary, Cluster, DayCount, BotData } from "@/lib/types";

export interface ParseProgress {
  filesProcessed: number;
  totalFiles: number;
  linesProcessed: number;
  currentFile: string;
  status: "parsing" | "done" | "error";
  error?: string;
}

interface ClusterAcc {
  count: number;
  statuses: Record<string, number>;
  rtStats: ReservoirStats;
  byDay: Record<string, number>;
  uas: Record<string, number>;
}

interface BotAcc {
  requests: number;
  pages: Record<string, number>;
  byDay: Record<string, number>;
}

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// Zeller's congruence for day-of-week without Date object
function dayOfWeek(y: number, m: number, d: number): number {
  if (m < 3) { m += 12; y--; }
  const dow = (d + Math.floor(13 * (m + 1) / 5) + y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
  // Zeller: 0=Sat, 1=Sun, ..., 6=Fri → convert to Mon=0..Sun=6
  return (dow + 5) % 7;
}

function parseLine(line: string) {
  // Format: DD/Mon/YYYY:HH:MM:SS +0000 /path UA STATUS [RT]
  // Fields are space-separated but UA has spaces — parse from both ends

  const firstSpace = line.indexOf(" ");
  if (firstSpace === -1) return null;

  const dateStr = line.substring(0, firstSpace); // DD/Mon/YYYY:HH:MM:SS
  const rest1 = line.substring(firstSpace + 1);

  const secondSpace = rest1.indexOf(" ");
  if (secondSpace === -1) return null;

  // Skip timezone (+0000)
  const rest2 = rest1.substring(secondSpace + 1);

  const thirdSpace = rest2.indexOf(" ");
  if (thirdSpace === -1) return null;

  const url = rest2.substring(0, thirdSpace);
  const rest3 = rest2.substring(thirdSpace + 1);

  // Parse from the end: last field might be RT (decimal) or status (integer)
  let status: number;
  let rt: number | null = null;
  let ua: string;

  const lastSpace = rest3.lastIndexOf(" ");
  if (lastSpace === -1) return null;

  const lastField = rest3.substring(lastSpace + 1);

  if (/^\d+\.\d+$/.test(lastField)) {
    // Last field is response time
    rt = parseFloat(lastField);
    const beforeRt = rest3.substring(0, lastSpace);
    const penultSpace = beforeRt.lastIndexOf(" ");
    if (penultSpace === -1) return null;
    status = parseInt(beforeRt.substring(penultSpace + 1), 10);
    ua = beforeRt.substring(0, penultSpace);
  } else if (/^\d{3}$/.test(lastField)) {
    // Last field is status code
    status = parseInt(lastField, 10);
    ua = rest3.substring(0, lastSpace);
  } else {
    // Can't parse — last field is neither RT nor status (e.g., truncated UA)
    // Try to find a 3-digit status code somewhere near the end
    return null;
  }

  if (isNaN(status) || status < 100 || status > 599) return null;

  // Parse date: DD/Mon/YYYY:HH:MM:SS
  const day = dateStr.substring(0, 2);
  const mon = MONTH_MAP[dateStr.substring(3, 6)];
  const year = dateStr.substring(7, 11);
  const hour = parseInt(dateStr.substring(12, 14), 10);

  if (!mon) return null;

  const dateIso = `${year}-${mon}-${day}`;

  return { dateIso, year: parseInt(year), month: parseInt(mon), day: parseInt(day), hour, url, ua, status, rt };
}

export async function parseLogFiles(
  files: File[],
  customRules: { pattern: string; label: string }[],
  onProgress: (p: ParseProgress) => void
): Promise<Summary> {
  const rules = compileRules(customRules);

  // Accumulators
  const globalRt = new ReservoirStats(2000);
  const clusters = new Map<string, ClusterAcc>();
  const statusCodes: Record<string, number> = {};
  const requestsByDay: Record<string, number> = {};
  const bots: Record<string, BotAcc> = {};
  let botRequests = 0, humanRequests = 0;
  let botRtSum = 0, humanRtSum = 0;
  let botRtCount = 0, humanRtCount = 0;
  const urls = new Set<string>();
  let totalRequests = 0;
  let minDate = "9999-99-99", maxDate = "0000-00-00";

  // Error tracking
  const errors404: Record<string, { count: number; examples: string[] }> = {};
  const errors5xx: Record<string, number> = {};
  const slowPatterns: Record<string, { sum: number; count: number }> = {};

  // Redirect tracking
  let redirectTotal = 0;
  const redirectByStatus: Record<string, number> = {};
  const redirectByPattern: Record<string, { count: number; botCount: number; humanCount: number }> = {};

  // 410 tracking
  let gone410Total = 0, gone410Googlebot = 0;
  const gone410ByPattern: Record<string, { count: number; botCount: number; examples: string[] }> = {};

  // Crawl budget (Googlebot)
  let gbTotal = 0, gbUseful = 0, gbRedirects = 0, gb404 = 0, gb410 = 0, gbStatic = 0;

  // Checkout
  let checkoutTotal = 0;
  const checkoutVins = new Set<string>();
  const checkoutByStatus: Record<string, number> = {};
  const checkoutByDay: Record<string, { requests: number; success200: number }> = {};

  // Languages
  const languages: Record<string, { requests: number; ok200: number; err404: number; botCount: number }> = {};

  // Heatmap
  const heatRt: Record<string, { sum: number; count: number }> = {};
  const heatReq: Record<string, number> = {};
  const daysSet = new Set<string>();

  // Suspicious UAs
  const uaStats: Record<string, { count: number; errors: number }> = {};

  const STATIC_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|map|webp|avif)(\?|$)/i;

  // Yield to main thread so UI stays responsive
  const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));
  const CHUNK_SIZE = 50_000; // Process 50K lines, then yield

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    onProgress({ filesProcessed: fi, totalFiles: files.length, linesProcessed: totalRequests, currentFile: `Decompressing ${file.name}...`, status: "parsing" });
    await yieldToUI();

    // Read file as ArrayBuffer and decompress
    const buf = await file.arrayBuffer();
    let text: string;
    try {
      const decompressed = inflate(new Uint8Array(buf));
      text = new TextDecoder("utf-8").decode(decompressed);
    } catch {
      // Not gzipped, try as plain text
      text = new TextDecoder("utf-8").decode(buf);
    }

    const lines = text.split("\n");
    onProgress({ filesProcessed: fi, totalFiles: files.length, linesProcessed: totalRequests, currentFile: `Parsing ${file.name} (${lines.length.toLocaleString()} lines)...`, status: "parsing" });
    await yieldToUI();

    for (let li = 0; li < lines.length; li++) {
      // Yield every CHUNK_SIZE lines so the browser can update UI
      if (li > 0 && li % CHUNK_SIZE === 0) {
        onProgress({ filesProcessed: fi, totalFiles: files.length, linesProcessed: totalRequests, currentFile: `${file.name} — ${Math.round((li / lines.length) * 100)}%`, status: "parsing" });
        await yieldToUI();
      }

      const line = lines[li];
      if (!line.trim()) continue;
      const parsed = parseLine(line);
      if (!parsed) continue;

      const { dateIso, year, month, day, hour, url, ua, status, rt } = parsed;
      totalRequests++;

      if (urls.size < 100000) urls.add(url);
      if (dateIso < minDate) minDate = dateIso;
      if (dateIso > maxDate) maxDate = dateIso;

      // Status codes
      const sc = String(status);
      statusCodes[sc] = (statusCodes[sc] || 0) + 1;

      // Requests by day
      requestsByDay[dateIso] = (requestsByDay[dateIso] || 0) + 1;

      // Response time
      if (rt != null) {
        globalRt.add(rt);
      }

      // Bot detection
      const bot = detectBot(ua);
      const isBot = bot !== null;
      if (isBot) {
        botRequests++;
        if (rt != null) { botRtSum += rt; botRtCount++; }
        if (!bots[bot]) bots[bot] = { requests: 0, pages: {}, byDay: {} };
        bots[bot].requests++;
        bots[bot].byDay[dateIso] = (bots[bot].byDay[dateIso] || 0) + 1;
        if (Object.keys(bots[bot].pages).length < 100) {
          bots[bot].pages[url] = (bots[bot].pages[url] || 0) + 1;
        }
      } else {
        humanRequests++;
        if (rt != null) { humanRtSum += rt; humanRtCount++; }
      }

      // URL classification
      const cluster = classifyUrl(url, rules);

      // Cluster accumulation
      if (!clusters.has(cluster)) {
        clusters.set(cluster, { count: 0, statuses: {}, rtStats: new ReservoirStats(500), byDay: {}, uas: {} });
      }
      const ca = clusters.get(cluster)!;
      ca.count++;
      ca.statuses[sc] = (ca.statuses[sc] || 0) + 1;
      if (rt != null) ca.rtStats.add(rt);
      ca.byDay[dateIso] = (ca.byDay[dateIso] || 0) + 1;
      const shortUa = ua.length > 40 ? ua.substring(0, 40) : ua;
      if (Object.keys(ca.uas).length < 50) {
        ca.uas[shortUa] = (ca.uas[shortUa] || 0) + 1;
      }

      // Error tracking
      if (status === 404) {
        if (!errors404[cluster]) errors404[cluster] = { count: 0, examples: [] };
        errors404[cluster].count++;
        if (errors404[cluster].examples.length < 3) errors404[cluster].examples.push(url);
      }
      if (status >= 500 && status < 600) {
        errors5xx[cluster] = (errors5xx[cluster] || 0) + 1;
      }
      if (rt != null && rt > 1) {
        if (!slowPatterns[cluster]) slowPatterns[cluster] = { sum: 0, count: 0 };
        slowPatterns[cluster].sum += rt;
        slowPatterns[cluster].count++;
      }

      // Redirects
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        redirectTotal++;
        redirectByStatus[sc] = (redirectByStatus[sc] || 0) + 1;
        if (!redirectByPattern[cluster]) redirectByPattern[cluster] = { count: 0, botCount: 0, humanCount: 0 };
        redirectByPattern[cluster].count++;
        if (isBot) redirectByPattern[cluster].botCount++;
        else redirectByPattern[cluster].humanCount++;
      }

      // 410 Gone
      if (status === 410) {
        gone410Total++;
        if (isGooglebot(ua)) gone410Googlebot++;
        if (!gone410ByPattern[cluster]) gone410ByPattern[cluster] = { count: 0, botCount: 0, examples: [] };
        gone410ByPattern[cluster].count++;
        if (isBot) gone410ByPattern[cluster].botCount++;
        if (gone410ByPattern[cluster].examples.length < 5) gone410ByPattern[cluster].examples.push(url);
      }

      // Crawl budget (Googlebot)
      if (isGooglebot(ua)) {
        gbTotal++;
        if (status === 200 && !STATIC_EXT.test(url)) gbUseful++;
        else if (status === 301 || status === 302 || status === 307) gbRedirects++;
        else if (status === 404) gb404++;
        else if (status === 410) gb410++;
        else if (STATIC_EXT.test(url)) gbStatic++;
      }

      // Checkout
      const checkoutId = extractCheckoutId(url);
      if (checkoutId) {
        checkoutTotal++;
        if (checkoutVins.size < 100000) checkoutVins.add(checkoutId);
        checkoutByStatus[sc] = (checkoutByStatus[sc] || 0) + 1;
        if (!checkoutByDay[dateIso]) checkoutByDay[dateIso] = { requests: 0, success200: 0 };
        checkoutByDay[dateIso].requests++;
        if (status === 200) checkoutByDay[dateIso].success200++;
      }

      // Languages
      const lang = detectLanguage(url);
      if (!languages[lang]) languages[lang] = { requests: 0, ok200: 0, err404: 0, botCount: 0 };
      languages[lang].requests++;
      if (status === 200) languages[lang].ok200++;
      if (status === 404) languages[lang].err404++;
      if (isBot) languages[lang].botCount++;

      // Heatmap
      const dow = dayOfWeek(year, month, day);
      const dayLabel = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dow];
      daysSet.add(dayLabel);
      const key = `${dow}:${hour}`;
      heatReq[key] = (heatReq[key] || 0) + 1;
      if (rt != null) {
        if (!heatRt[key]) heatRt[key] = { sum: 0, count: 0 };
        heatRt[key].sum += rt;
        heatRt[key].count++;
      }

      // Suspicious UAs
      const uaKey = ua.length > 150 ? ua.substring(0, 150) : ua;
      if (Object.keys(uaStats).length < 5000 || uaStats[uaKey]) {
        if (!uaStats[uaKey]) uaStats[uaKey] = { count: 0, errors: 0 };
        uaStats[uaKey].count++;
        if (status >= 400) uaStats[uaKey].errors++;
      }
    }
  }

  onProgress({ filesProcessed: files.length, totalFiles: files.length, linesProcessed: totalRequests, currentFile: "", status: "done" });

  // Build Summary
  const rtStats = globalRt.getStats();

  // Top 200 clusters
  const sortedClusters = [...clusters.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 200);

  const clusterArr: Cluster[] = sortedClusters.map(([pattern, ca]) => {
    const crt = ca.rtStats.getStats();
    return {
      pattern,
      count: ca.count,
      statuses: ca.statuses,
      responseTime: { avg: crt.avg, p95: crt.p95 },
      byDay: Object.entries(ca.byDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
      topUAs: Object.entries(ca.uas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([u, c]) => ({ ua: u, count: c })),
    };
  });

  // Top 50 errors
  const err404 = Object.entries(errors404).sort((a, b) => b[1].count - a[1].count).slice(0, 50).map(([p, e]) => ({ pattern: p, count: e.count, examples: e.examples }));
  const err5xx = Object.entries(errors5xx).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([p, c]) => ({ pattern: p, count: c }));
  const slow = Object.entries(slowPatterns).filter(([, s]) => s.count > 10).sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count)).slice(0, 50).map(([p, s]) => ({ pattern: p, avgTime: Math.round((s.sum / s.count) * 1000) / 1000, count: s.count }));

  // Bots
  const botsOut: Record<string, BotData> = {};
  for (const [name, ba] of Object.entries(bots)) {
    const topPages = Object.entries(ba.pages).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([u, c]) => ({ url: u, count: c }));
    const byDay: DayCount[] = Object.entries(ba.byDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date));
    botsOut[name] = { requests: ba.requests, topPages, byDay };
  }

  // Heatmap
  const daysList = [...daysSet];
  const dowOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  daysList.sort((a, b) => dowOrder.indexOf(a) - dowOrder.indexOf(b));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const heatmapRt: number[][] = [];
  const heatmapReq: number[][] = [];
  for (let di = 0; di < daysList.length; di++) {
    const dow = dowOrder.indexOf(daysList[di]);
    const rtRow: number[] = [];
    const reqRow: number[] = [];
    for (let h = 0; h < 24; h++) {
      const k = `${dow}:${h}`;
      const req = heatReq[k] || 0;
      reqRow.push(req);
      const hr = heatRt[k];
      rtRow.push(hr && hr.count > 0 ? Math.round((hr.sum / hr.count) * 1000) / 1000 : 0);
    }
    heatmapRt.push(rtRow);
    heatmapReq.push(reqRow);
  }

  // Redirect patterns (top 100)
  const redirectPatterns = Object.entries(redirectByPattern)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 100)
    .map(([p, r]) => ({ pattern: p, count: r.count, botCount: r.botCount, humanCount: r.humanCount }));

  // 410 patterns (top 50)
  const gone410Patterns = Object.entries(gone410ByPattern)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([p, g]) => ({ pattern: p, count: g.count, botCount: g.botCount, examples: g.examples }));

  // Languages
  const langArr = Object.entries(languages)
    .sort((a, b) => b[1].requests - a[1].requests)
    .map(([l, d]) => ({
      lang: l,
      requests: d.requests,
      ok200: d.ok200,
      err404: d.err404,
      botPercent: d.requests > 0 ? Math.round((d.botCount / d.requests) * 10000) / 100 : 0,
    }));

  // Suspicious UAs
  const uaArr = Object.entries(uaStats).map(([u, s]) => ({
    ua: u, count: s.count, errorRate: s.count > 0 ? Math.round((s.errors / s.count) * 10000) / 100 : 0,
  }));
  const topUAs = uaArr.sort((a, b) => b.count - a.count).slice(0, 20);
  const highErrorUAs = uaArr.filter((u) => u.count > 1000 && u.errorRate > 50).sort((a, b) => b.errorRate - a.errorRate).slice(0, 20);

  // Checkout byDay
  const checkoutDays = Object.entries(checkoutByDay)
    .map(([d, v]) => ({ date: d, requests: v.requests, success200: v.success200 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 10000) / 100 : 0;

  const summary: Summary = {
    totalRequests,
    uniqueUrls: urls.size,
    dateRange: { from: minDate, to: maxDate },
    requestsByDay: Object.entries(requestsByDay).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
    statusCodes,
    responseTime: rtStats,
    clusters: clusterArr,
    errors: { "404": err404, "500": err5xx, slow },
    bots: botsOut,
    botVsHuman: {
      bot: { requests: botRequests, avgResponseTime: botRtCount > 0 ? Math.round((botRtSum / botRtCount) * 1000) / 1000 : 0 },
      human: { requests: humanRequests, avgResponseTime: humanRtCount > 0 ? Math.round((humanRtSum / humanRtCount) * 1000) / 1000 : 0 },
    },
    redirects: {
      total: redirectTotal,
      byStatus: redirectByStatus,
      byPattern: redirectPatterns,
    },
    gone410: {
      total: gone410Total,
      googlebotRequests: gone410Googlebot,
      byPattern: gone410Patterns,
    },
    crawlBudget: {
      totalGooglebot: gbTotal,
      useful: { count: gbUseful, percent: pct(gbUseful, gbTotal) },
      waste: {
        redirects: { count: gbRedirects, percent: pct(gbRedirects, gbTotal) },
        notFound404: { count: gb404, percent: pct(gb404, gbTotal) },
        gone410: { count: gb410, percent: pct(gb410, gbTotal) },
        static: { count: gbStatic, percent: pct(gbStatic, gbTotal) },
        total: { count: gbRedirects + gb404 + gb410 + gbStatic, percent: pct(gbRedirects + gb404 + gb410 + gbStatic, gbTotal) },
      },
    },
    checkoutFunnel: {
      totalRequests: checkoutTotal,
      uniqueVINs: checkoutVins.size,
      byStatus: checkoutByStatus,
      byDay: checkoutDays,
    },
    languages: langArr,
    heatmap: {
      responseTime: heatmapRt,
      requests: heatmapReq,
      hours,
      days: daysList,
    },
    suspicious: { topUAs, highErrorUAs },
  };

  return summary;
}
