import { createReadStream } from 'fs';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { join } from 'path';

const LOGS_DIR = process.env.LOGS_DIR || './logs/';
const OUTPUT_DIR = join(import.meta.dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'summary.json');

// Reservoir sampling for approximate percentiles
class ReservoirStats {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.reservoir = [];
    this.count = 0;
    this.sum = 0;
  }
  add(val) {
    this.count++;
    this.sum += val;
    if (this.reservoir.length < this.maxSize) {
      this.reservoir.push(val);
    } else {
      const j = Math.floor(Math.random() * this.count);
      if (j < this.maxSize) {
        this.reservoir[j] = val;
      }
    }
  }
  getStats() {
    if (this.reservoir.length === 0) return { avg: 0, median: 0, p95: 0, p99: 0 };
    const sorted = [...this.reservoir].sort((a, b) => a - b);
    const len = sorted.length;
    return {
      avg: +(this.sum / this.count).toFixed(3),
      median: +sorted[Math.floor(len * 0.5)].toFixed(3),
      p95: +sorted[Math.floor(len * 0.95)].toFixed(3),
      p99: +sorted[Math.floor(len * 0.99)].toFixed(3),
    };
  }
}

// Bot detection
const BOT_PATTERNS = [
  { name: 'googlebot', pattern: /googlebot/i },
  { name: 'bingbot', pattern: /bingbot/i },
  { name: 'ahrefsbot', pattern: /ahrefsbot/i },
  { name: 'semrushbot', pattern: /semrushbot/i },
  { name: 'yandexbot', pattern: /yandex/i },
  { name: 'baiduspider', pattern: /baiduspider/i },
  { name: 'duckduckbot', pattern: /duckduckbot/i },
  { name: 'facebookexternalhit', pattern: /facebookexternalhit/i },
  { name: 'twitterbot', pattern: /twitterbot/i },
  { name: 'applebot', pattern: /applebot/i },
  { name: 'mj12bot', pattern: /mj12bot/i },
  { name: 'dotbot', pattern: /dotbot/i },
  { name: 'petalbot', pattern: /petalbot/i },
  { name: 'bytespider', pattern: /bytespider/i },
  { name: 'gptbot', pattern: /gptbot/i },
  { name: 'claudebot', pattern: /claudebot|anthropic/i },
  { name: 'telegraf', pattern: /telegraf/i },
];

const GENERIC_BOT = /bot|crawl|spider|scraper|fetch|monitor|check|curl|wget|python|java\/|go-http|http-client|libwww|apache/i;

const STATIC_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|map|webp|avif)(\?|$)/i;
const LANG_PREFIX = /^\/(es|fr|ru|pl|ar|de|pt|it|nl|uk|ja|ko|zh|tr|vi)\//;
const LANG_PREFIXES_SET = new Set(['es','fr','ru','pl','ar','de','pt','it','nl','uk','ja','ko','zh','tr','vi']);

// Custom URL classification rules — loaded from patterns.json if it exists
// Each rule: { pattern: "regex", label: "cluster-name" }
// Rules are tested in order; first match wins. Fallback: first 2 path segments.
let CUSTOM_RULES = [];
try {
  const rulesPath = join(import.meta.dirname, '..', 'patterns.json');
  const { readFileSync: readSync } = await import('fs');
  const raw = readSync(rulesPath, 'utf8');
  CUSTOM_RULES = JSON.parse(raw).map(r => ({ ...r, re: new RegExp(r.pattern, 'i') }));
  console.log(`  Loaded ${CUSTOM_RULES.length} custom URL classification rules`);
} catch { /* no custom rules — use defaults */ }

// Checkout URL pattern (generic — matches any path containing /checkout/)
const CHECKOUT_RE = /\/checkout\/([a-z0-9]+)/i;

function classifyUrl(url) {
  // Static assets
  if (STATIC_EXT.test(url)) return 'static';

  let path = url.split('?')[0];
  let lang = '';

  // Language prefix
  const langMatch = path.match(LANG_PREFIX);
  if (langMatch) {
    lang = langMatch[1] + ':';
    path = path.slice(langMatch[0].length - 1); // keep leading /
  }

  // Custom rules (user-defined patterns)
  for (const rule of CUSTOM_RULES) {
    if (rule.re.test(path)) return lang + rule.label;
  }

  const segments = path.split('/').filter(Boolean);

  // API routes
  if (segments[0] === 'api') {
    return lang + 'api:' + (segments[1] || 'root');
  }

  // Checkout (generic)
  if (segments.includes('checkout')) {
    return lang + 'checkout';
  }

  // Default: first 2 segments
  const key = '/' + segments.slice(0, 2).join('/');
  return lang + (key || '/');
}

function detectBot(ua) {
  for (const { name, pattern } of BOT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  if (GENERIC_BOT.test(ua)) return 'other';
  return null;
}

function isBot(ua) {
  return detectBot(ua) !== null;
}

function isGooglebot(ua) {
  return /googlebot/i.test(ua);
}

function shortenUA(ua) {
  if (!ua) return 'unknown';
  const m = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|CriOS|Googlebot|Bingbot|Ahrefsbot|SemrushBot|curl|python|Go-http|Telegraf)[\/\s]?[\d.]*/i);
  if (m) return m[0].slice(0, 40);
  return ua.slice(0, 40);
}

// Parse log line
const LINE_REGEX = /^(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}) ([+-]\d{4}) (\S+) (.+?) (\d{3})\s*([\d.]*)\s*$/;

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(dateStr) {
  const d = dateStr.slice(0, 2);
  const m = dateStr.slice(3, 6);
  const y = dateStr.slice(7, 11);
  return `${y}-${String(MONTHS[m] + 1).padStart(2, '0')}-${d}`;
}

function parseHour(dateStr) {
  // dateStr: 16/Mar/2026:14:23:49
  return parseInt(dateStr.slice(12, 14), 10);
}

// Zeller's formula to avoid Date object creation
function parseDayOfWeek(dateStr) {
  let d = parseInt(dateStr.slice(0, 2), 10);
  let m = MONTHS[dateStr.slice(3, 6)] + 1; // 1-12
  let y = parseInt(dateStr.slice(7, 11), 10);
  if (m < 3) { m += 12; y--; }
  const dow = (d + Math.floor(13 * (m + 1) / 5) + y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
  // Zeller: 0=Sat, 1=Sun, 2=Mon, ...6=Fri → convert to JS: 0=Sun
  return (dow + 6) % 7; // 0=Sun, 1=Mon, ...6=Sat
}

function getLangFromUrl(url) {
  const path = url.split('?')[0];
  const langMatch = path.match(LANG_PREFIX);
  if (langMatch) return langMatch[1];
  return 'en';
}

async function main() {
  console.log('Scanning log files...');
  const files = (await readdir(LOGS_DIR)).filter(f => f.endsWith('.gz')).sort();
  console.log(`Found ${files.length} gz files`);

  // ===== ORIGINAL aggregation state =====
  let totalRequests = 0;
  const uniqueUrls = new Set();
  let maxUrls = 100000;
  const requestsByDay = {};
  const statusCodes = {};
  const globalRT = new ReservoirStats(2000);

  const clusters = {};
  const errors404 = {};
  const errors500 = {};
  const bots = {};
  for (const bp of BOT_PATTERNS) bots[bp.name] = { requests: 0, topPages: {}, byDay: {} };
  bots.other = { requests: 0, topPages: {}, byDay: {} };

  let botRequests = 0, humanRequests = 0;
  let botRTSum = 0, humanRTSum = 0;

  let minDate = 'Z', maxDate = '';
  let lineCount = 0;
  let parseErrors = 0;

  // ===== NEW aggregation state =====

  // A. Redirect Analysis
  const redirectByPattern = {};  // pattern -> { count, botCount, humanCount }
  const redirectByStatus = { '301': 0, '302': 0, '307': 0 };

  // B. 410 Gone
  const gone410ByPattern = {};   // pattern -> { count, botCount, examples: Set }
  let gone410GooglebotCount = 0;
  let gone410Total = 0;

  // C. Crawl Budget (Googlebot)
  let googlebotTotal = 0;
  let googlebotUseful = 0;      // 200 on non-static
  let googlebotRedirects = 0;
  let googlebot404 = 0;
  let googlebot410 = 0;
  let googlebotStatic = 0;

  // D. Checkout Funnel
  let checkoutTotal = 0;
  const checkoutByStatus = {};
  const checkoutByDay = {};      // date -> { requests, success200 }
  const checkoutVINs = new Set();
  let maxVINs = 100000;

  // E. Language Split
  const langStats = {};          // lang -> { requests, ok200, err404, botCount }

  // F. Heatmap: [dayOfWeek 0-6][hour 0-23] -> { rtSum, rtCount, reqCount }
  const heatmap = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ rtSum: 0, rtCount: 0, reqCount: 0 }))
  );
  const dowCache = {}; // date string -> day of week

  // G. Suspicious: UA tracking
  const uaStats = {};            // full UA -> { count, errorCount }
  let maxUAs = 5000;

  for (const file of files) {
    const filePath = join(LOGS_DIR, file);
    console.log(`Processing ${file}...`);

    await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath)
        .pipe(createGunzip())
        .on('error', reject);

      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        lineCount++;
        const match = line.match(LINE_REGEX);
        if (!match) {
          parseErrors++;
          return;
        }

        const [, dateStr, , url, ua, statusStr, rtStr] = match;
        const date = parseDate(dateStr);
        const status = statusStr;
        const rt = (rtStr && rtStr.length > 0) ? parseFloat(rtStr) : 0;

        totalRequests++;

        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;

        if (uniqueUrls.size < maxUrls) uniqueUrls.add(url);

        requestsByDay[date] = (requestsByDay[date] || 0) + 1;
        statusCodes[status] = (statusCodes[status] || 0) + 1;

        if (rt > 0) globalRT.add(rt);

        const cluster = classifyUrl(url);
        if (!clusters[cluster]) {
          clusters[cluster] = {
            count: 0, statuses: {}, rt: new ReservoirStats(500), byDay: {}, uas: {},
          };
        }
        const c = clusters[cluster];
        c.count++;
        c.statuses[status] = (c.statuses[status] || 0) + 1;
        if (rt > 0) c.rt.add(rt);
        c.byDay[date] = (c.byDay[date] || 0) + 1;

        const shortUA = shortenUA(ua);
        if (Object.keys(c.uas).length < 50) {
          c.uas[shortUA] = (c.uas[shortUA] || 0) + 1;
        } else if (c.uas[shortUA]) {
          c.uas[shortUA]++;
        }

        if (status === '404') {
          errors404[cluster] = errors404[cluster] || { count: 0, examples: new Set() };
          errors404[cluster].count++;
          if (errors404[cluster].examples.size < 3) errors404[cluster].examples.add(url);
        }
        if (status === '500' || status === '502' || status === '503') {
          errors500[cluster] = errors500[cluster] || { count: 0 };
          errors500[cluster].count++;
        }

        const botName = detectBot(ua);
        const isBotReq = botName !== null;

        if (isBotReq) {
          botRequests++;
          botRTSum += rt;
          const b = bots[botName] || bots.other;
          b.requests++;
          b.byDay[date] = (b.byDay[date] || 0) + 1;
          if (Object.keys(b.topPages).length < 100) {
            b.topPages[url] = (b.topPages[url] || 0) + 1;
          } else if (b.topPages[url]) {
            b.topPages[url]++;
          }
        } else {
          humanRequests++;
          humanRTSum += rt;
        }

        // ===== NEW METRICS =====

        // A. Redirect Analysis
        if (status === '301' || status === '302' || status === '307') {
          redirectByStatus[status] = (redirectByStatus[status] || 0) + 1;
          if (!redirectByPattern[cluster]) {
            redirectByPattern[cluster] = { count: 0, botCount: 0, humanCount: 0 };
          }
          redirectByPattern[cluster].count++;
          if (isBotReq) redirectByPattern[cluster].botCount++;
          else redirectByPattern[cluster].humanCount++;
        }

        // B. 410 Gone
        if (status === '410') {
          gone410Total++;
          if (!gone410ByPattern[cluster]) {
            gone410ByPattern[cluster] = { count: 0, botCount: 0, examples: new Set() };
          }
          gone410ByPattern[cluster].count++;
          if (isBotReq) gone410ByPattern[cluster].botCount++;
          if (gone410ByPattern[cluster].examples.size < 5) gone410ByPattern[cluster].examples.add(url);
          if (isGooglebot(ua)) gone410GooglebotCount++;
        }

        // C. Crawl Budget (Googlebot only)
        if (isGooglebot(ua)) {
          googlebotTotal++;
          const isStaticUrl = STATIC_EXT.test(url);
          if (isStaticUrl) {
            googlebotStatic++;
          } else if (status === '200') {
            googlebotUseful++;
          }
          if (status === '301' || status === '302' || status === '307') googlebotRedirects++;
          if (status === '404') googlebot404++;
          if (status === '410') googlebot410++;
        }

        // D. Checkout Funnel
        const checkoutMatch = url.match(CHECKOUT_RE);
        if (checkoutMatch) {
          checkoutTotal++;
          checkoutByStatus[status] = (checkoutByStatus[status] || 0) + 1;
          if (!checkoutByDay[date]) checkoutByDay[date] = { requests: 0, success200: 0 };
          checkoutByDay[date].requests++;
          if (status === '200') checkoutByDay[date].success200++;
          const vin = checkoutMatch[1].toLowerCase();
          if (checkoutVINs.size < maxVINs) checkoutVINs.add(vin);
        }

        // E. Language Split
        const lang = getLangFromUrl(url);
        if (!langStats[lang]) langStats[lang] = { requests: 0, ok200: 0, err404: 0, botCount: 0 };
        langStats[lang].requests++;
        if (status === '200') langStats[lang].ok200++;
        if (status === '404') langStats[lang].err404++;
        if (isBotReq) langStats[lang].botCount++;

        // F. Heatmap
        const hour = parseHour(dateStr);
        const dateKey = dateStr.slice(0, 11);
        let dow = dowCache[dateKey];
        if (dow === undefined) { dow = parseDayOfWeek(dateStr); dowCache[dateKey] = dow; }
        const cell = heatmap[dow][hour];
        cell.reqCount++;
        if (rt > 0) {
          cell.rtSum += rt;
          cell.rtCount++;
        }

        // G. Suspicious: UA tracking (simplified - no burst detection)
        const uaKey = ua.slice(0, 150); // truncate for memory
        if (Object.keys(uaStats).length < maxUAs || uaStats[uaKey]) {
          if (!uaStats[uaKey]) uaStats[uaKey] = { count: 0, errorCount: 0 };
          uaStats[uaKey].count++;
          if (status !== '200') uaStats[uaKey].errorCount++;
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });

    console.log(`  Lines processed: ${lineCount.toLocaleString()}`);
  }

  console.log(`\nTotal lines: ${lineCount.toLocaleString()}, parse errors: ${parseErrors}`);
  console.log(`Total valid requests: ${totalRequests.toLocaleString()}`);

  // ===== Build ORIGINAL summary parts =====

  const clusterArray = Object.entries(clusters)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 200)
    .map(([pattern, c]) => {
      const topUAs = Object.entries(c.uas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ua, count]) => ({ ua, count }));
      const byDay = Object.entries(c.byDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));
      const rtStats = c.rt.getStats();
      return {
        pattern, count: c.count, statuses: c.statuses,
        responseTime: { avg: rtStats.avg, p95: rtStats.p95 },
        byDay, topUAs,
      };
    });

  const err404 = Object.entries(errors404)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, e]) => ({ pattern, count: e.count, examples: [...e.examples] }));

  const err500 = Object.entries(errors500)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, e]) => ({ pattern, count: e.count }));

  const slow = Object.entries(clusters)
    .map(([pattern, c]) => {
      const stats = c.rt.getStats();
      return { pattern, avgTime: stats.avg, count: c.rt.count };
    })
    .filter(s => s.avgTime > 1 && s.count > 10)
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 50);

  const botsOut = {};
  for (const [name, b] of Object.entries(bots)) {
    if (b.requests === 0) continue;
    const topPages = Object.entries(b.topPages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ url, count }));
    const byDay = Object.entries(b.byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
    botsOut[name] = { requests: b.requests, topPages, byDay };
  }

  // ===== Build NEW summary parts =====

  // A. Redirects
  const totalRedirects = Object.values(redirectByStatus).reduce((a, b) => a + b, 0);
  const redirectPatterns = Object.entries(redirectByPattern)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([pattern, d]) => ({ pattern, count: d.count, botCount: d.botCount, humanCount: d.humanCount }));

  // B. 410 Gone
  const gone410Patterns = Object.entries(gone410ByPattern)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([pattern, d]) => ({ pattern, count: d.count, examples: [...d.examples].slice(0, 5), botCount: d.botCount }));

  // C. Crawl Budget
  const wasteRedirects = googlebotRedirects;
  const wasteNotFound = googlebot404;
  const wasteGone = googlebot410;
  const wasteStatic = googlebotStatic;
  const wasteTotal = wasteRedirects + wasteNotFound + wasteGone + wasteStatic;
  const pct = (n) => googlebotTotal > 0 ? +((n / googlebotTotal) * 100).toFixed(1) : 0;

  // D. Checkout
  const checkoutByDayArr = Object.entries(checkoutByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({ date, requests: d.requests, success200: d.success200 }));

  // E. Languages
  const languagesArr = Object.entries(langStats)
    .sort((a, b) => b[1].requests - a[1].requests)
    .map(([lang, s]) => ({
      lang,
      requests: s.requests,
      ok200: s.ok200,
      err404: s.err404,
      botPercent: s.requests > 0 ? +((s.botCount / s.requests) * 100).toFixed(1) : 0,
    }));

  // F. Heatmap
  // Reorder: Mon=0, Tue=1 ... Sun=6 (JS Date has Sun=0)
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const heatmapRT = dayOrder.map(d =>
    Array.from({ length: 24 }, (_, h) => {
      const cell = heatmap[d][h];
      return cell.rtCount > 0 ? +((cell.rtSum / cell.rtCount).toFixed(3)) : 0;
    })
  );
  const heatmapReqs = dayOrder.map(d =>
    Array.from({ length: 24 }, (_, h) => heatmap[d][h].reqCount)
  );

  // G. Suspicious
  const uaEntries = Object.entries(uaStats)
    .map(([ua, s]) => ({
      ua,
      count: s.count,
      errorRate: s.count > 0 ? +((s.errorCount / s.count) * 100).toFixed(1) : 0,
    }));

  const topUAs = [...uaEntries]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const highErrorUAs = uaEntries
    .filter(u => u.count > 1000 && u.errorRate > 50)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 20);

  // ===== Final summary =====
  const summary = {
    totalRequests,
    uniqueUrls: uniqueUrls.size,
    dateRange: { from: minDate, to: maxDate },
    requestsByDay: Object.entries(requestsByDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
    statusCodes,
    responseTime: globalRT.getStats(),
    clusters: clusterArray,
    errors: { '404': err404, '500': err500, slow },
    bots: botsOut,
    botVsHuman: {
      bot: { requests: botRequests, avgResponseTime: botRequests > 0 ? +(botRTSum / botRequests).toFixed(3) : 0 },
      human: { requests: humanRequests, avgResponseTime: humanRequests > 0 ? +(humanRTSum / humanRequests).toFixed(3) : 0 },
    },
    // NEW SECTIONS
    redirects: {
      total: totalRedirects,
      byPattern: redirectPatterns,
      byStatus: redirectByStatus,
    },
    gone410: {
      total: gone410Total,
      googlebotRequests: gone410GooglebotCount,
      byPattern: gone410Patterns,
    },
    crawlBudget: {
      totalGooglebot: googlebotTotal,
      useful: { count: googlebotUseful, percent: pct(googlebotUseful) },
      waste: {
        redirects: { count: wasteRedirects, percent: pct(wasteRedirects) },
        notFound404: { count: wasteNotFound, percent: pct(wasteNotFound) },
        gone410: { count: wasteGone, percent: pct(wasteGone) },
        static: { count: wasteStatic, percent: pct(wasteStatic) },
        total: { count: wasteTotal, percent: pct(wasteTotal) },
      },
    },
    checkoutFunnel: {
      totalRequests: checkoutTotal,
      uniqueVINs: checkoutVINs.size,
      byStatus: checkoutByStatus,
      byDay: checkoutByDayArr,
    },
    languages: languagesArr,
    heatmap: {
      responseTime: heatmapRT,
      requests: heatmapReqs,
      hours: Array.from({ length: 24 }, (_, i) => i),
      days: dayLabels,
    },
    suspicious: {
      topUAs,
      highErrorUAs,
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const json = JSON.stringify(summary, null, 2);
  await writeFile(OUTPUT_FILE, json);
  console.log(`\nSummary written to ${OUTPUT_FILE}`);
  console.log(`File size: ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
