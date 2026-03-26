import { createReadStream } from 'fs';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { join } from 'path';

const LOGS_DIR = '/home/vlubc/.openclaw/workspace/epicvin-logs/';
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

  const segments = path.split('/').filter(Boolean);

  // API routes
  if (segments[0] === 'api') {
    return lang + 'api:' + (segments[1] || 'root');
  }

  // checkout
  if (segments.includes('checkout') || (segments[0] === 'check-vin-number-and-get-the-vehicle-history-report' && segments[1] === 'checkout')) {
    return lang + 'checkout';
  }

  // vin-decoder patterns
  if (segments[0] === 'vin-decoder') {
    if (segments.length >= 3) return lang + 'vin-decoder-model';
    if (segments.length === 2) return lang + 'vin-decoder-brand';
    return lang + 'vin-decoder';
  }

  // license-plate-lookup
  if (segments[0] === 'license-plate-lookup') {
    return lang + 'lp-state';
  }

  // vin-check-by-state
  if (segments[0] === 'vin-check-by-state') {
    return lang + 'vin-check-state';
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

function shortenUA(ua) {
  // Extract browser/bot name briefly
  if (!ua) return 'unknown';
  const m = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|CriOS|Googlebot|Bingbot|Ahrefsbot|SemrushBot|curl|python|Go-http|Telegraf)[\/\s]?[\d.]*/i);
  if (m) return m[0].slice(0, 40);
  return ua.slice(0, 40);
}

// Parse log line - format: date timezone URL user_agent status_code response_time
const LINE_REGEX = /^(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}) ([+-]\d{4}) (\S+) (.+?) (\d{3})\s*([\d.]*)\s*$/;

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseDate(dateStr) {
  // 16/Mar/2026:00:00:49
  const d = dateStr.slice(0, 2);
  const m = dateStr.slice(3, 6);
  const y = dateStr.slice(7, 11);
  return `${y}-${String(MONTHS[m] + 1).padStart(2, '0')}-${d}`;
}

async function main() {
  console.log('Scanning log files...');
  const files = (await readdir(LOGS_DIR)).filter(f => f.endsWith('.gz')).sort();
  console.log(`Found ${files.length} gz files`);

  // Aggregation state
  let totalRequests = 0;
  const uniqueUrls = new Set();
  let maxUrls = 100000; // cap to avoid OOM
  const requestsByDay = {};
  const statusCodes = {};
  const globalRT = new ReservoirStats(2000);

  // Clusters
  const clusters = {};
  // Errors
  const errors404 = {};
  const errors500 = {};
  // Bots
  const bots = {};
  for (const bp of BOT_PATTERNS) bots[bp.name] = { requests: 0, topPages: {}, byDay: {} };
  bots.other = { requests: 0, topPages: {}, byDay: {} };

  let botRequests = 0, humanRequests = 0;
  let botRTSum = 0, humanRTSum = 0;

  let minDate = 'Z', maxDate = '';
  let lineCount = 0;
  let parseErrors = 0;

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

        // Date range
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;

        // Unique URLs (capped)
        if (uniqueUrls.size < maxUrls) uniqueUrls.add(url);

        // By day
        requestsByDay[date] = (requestsByDay[date] || 0) + 1;

        // Status codes
        statusCodes[status] = (statusCodes[status] || 0) + 1;

        // Response time
        if (rt > 0) globalRT.add(rt);

        // Cluster
        const cluster = classifyUrl(url);
        if (!clusters[cluster]) {
          clusters[cluster] = {
            count: 0,
            statuses: {},
            rt: new ReservoirStats(500),
            byDay: {},
            uas: {},
          };
        }
        const c = clusters[cluster];
        c.count++;
        c.statuses[status] = (c.statuses[status] || 0) + 1;
        if (rt > 0) c.rt.add(rt);
        c.byDay[date] = (c.byDay[date] || 0) + 1;

        // Top UAs per cluster (limited)
        const shortUA = shortenUA(ua);
        if (Object.keys(c.uas).length < 50) {
          c.uas[shortUA] = (c.uas[shortUA] || 0) + 1;
        } else if (c.uas[shortUA]) {
          c.uas[shortUA]++;
        }

        // Errors
        if (status === '404') {
          errors404[cluster] = errors404[cluster] || { count: 0, examples: new Set() };
          errors404[cluster].count++;
          if (errors404[cluster].examples.size < 3) errors404[cluster].examples.add(url);
        }
        if (status === '500' || status === '502' || status === '503') {
          errors500[cluster] = errors500[cluster] || { count: 0 };
          errors500[cluster].count++;
        }

        // Bot detection
        const bot = detectBot(ua);
        if (bot) {
          botRequests++;
          botRTSum += rt;
          const b = bots[bot] || bots.other;
          b.requests++;
          b.byDay[date] = (b.byDay[date] || 0) + 1;
          // Top pages (limited)
          if (Object.keys(b.topPages).length < 100) {
            b.topPages[url] = (b.topPages[url] || 0) + 1;
          } else if (b.topPages[url]) {
            b.topPages[url]++;
          }
        } else {
          humanRequests++;
          humanRTSum += rt;
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });

    console.log(`  Lines processed: ${lineCount.toLocaleString()}`);
  }

  console.log(`\nTotal lines: ${lineCount.toLocaleString()}, parse errors: ${parseErrors}`);
  console.log(`Total valid requests: ${totalRequests.toLocaleString()}`);

  // Build summary JSON
  const clusterArray = Object.entries(clusters)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 200) // top 200 clusters
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
        pattern,
        count: c.count,
        statuses: c.statuses,
        responseTime: { avg: rtStats.avg, p95: rtStats.p95 },
        byDay,
        topUAs,
      };
    });

  // Errors
  const err404 = Object.entries(errors404)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, e]) => ({ pattern, count: e.count, examples: [...e.examples] }));

  const err500 = Object.entries(errors500)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, e]) => ({ pattern, count: e.count }));

  // Slow clusters (avg > 1s)
  const slow = Object.entries(clusters)
    .map(([pattern, c]) => {
      const stats = c.rt.getStats();
      return { pattern, avgTime: stats.avg, count: c.rt.count };
    })
    .filter(s => s.avgTime > 1 && s.count > 10)
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 50);

  // Bots
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
    errors: {
      '404': err404,
      '500': err500,
      slow,
    },
    bots: botsOut,
    botVsHuman: {
      bot: { requests: botRequests, avgResponseTime: botRequests > 0 ? +(botRTSum / botRequests).toFixed(3) : 0 },
      human: { requests: humanRequests, avgResponseTime: humanRequests > 0 ? +(humanRTSum / humanRequests).toFixed(3) : 0 },
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
