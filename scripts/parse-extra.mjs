import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = '/home/vlubc/.openclaw/workspace/epicvin-logs';
const SUMMARY_PATH = './public/data/summary.json';

// Load existing summary
const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));

// New metrics
const redirects = { total: 0, byStatus: {}, byPattern: {} };
const gone410 = { total: 0, googlebotRequests: 0, byPattern: {} };
const crawlBudget = { totalGooglebot: 0, useful: 0, waste: { redirects: 0, notFound404: 0, gone410: 0, static: 0 } };
const checkoutFunnel = { total: 0, uniqueVINs: new Set(), byStatus: {}, byDay: {} };
const languages = {};
const heatmap = { responseTime: {}, requests: {} };
const suspicious = {};

function classifyUrl(url) {
  if (url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ico|map|webp|ttf|eot)(\?|$)/i)) return 'static';
  const langMatch = url.match(/^\/(es|fr|ru|pl|ar)\//);
  const lang = langMatch ? langMatch[1] : 'en';
  const cleanUrl = langMatch ? url.replace(/^\/(es|fr|ru|pl|ar)/, '') : url;
  
  if (cleanUrl.match(/^\/vin-decoder\/[^/]+\/[^/]+/)) return { pattern: 'vin-decoder-model', lang };
  if (cleanUrl.match(/^\/vin-decoder\/[^/]+$/)) return { pattern: 'vin-decoder-brand', lang };
  if (cleanUrl.match(/^\/license-plate-lookup\/[^/]+/)) return { pattern: 'lp-state', lang };
  if (cleanUrl.match(/^\/vin-check-by-state\/[^/]+/)) return { pattern: 'vin-check-state', lang };
  if (cleanUrl.match(/^\/check-vin-number.*\/checkout\//)) return { pattern: 'checkout', lang };
  if (cleanUrl.startsWith('/api/')) return { pattern: 'api', lang };
  return { pattern: 'other', lang };
}

function isBot(ua) {
  return /googlebot|bingbot|ahrefsbot|semrushbot|dotbot|yandexbot|baiduspider|mj12bot|petalbot|bytespider|gptbot|claudebot|applebot/i.test(ua);
}
function isGooglebot(ua) { return /googlebot/i.test(ua); }

const LINE_RE = /^(\d{2}\/\w{3}\/\d{4}):(\d{2}):(\d{2}):(\d{2}) \+\d{4} (\S+) (.+?) (\d{3}) ([\d.]+)$/;

async function processFile(filepath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filepath).pipe(createGunzip());
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;
    
    rl.on('line', (line) => {
      count++;
      const m = LINE_RE.exec(line);
      if (!m) return;
      
      const [, datePart, hour, , , url, ua, statusStr, timeStr] = m;
      const status = parseInt(statusStr);
      const respTime = parseFloat(timeStr);
      const bot = isBot(ua);
      const googlebot = isGooglebot(ua);
      const dayStr = datePart.replace(/\//g, '-');
      const hourNum = parseInt(hour);
      const dayOfWeek = new Date(datePart.split('/').reverse().join('-')).getDay();
      
      const classified = classifyUrl(url);
      const isStatic = classified === 'static';
      const lang = isStatic ? 'static' : (classified.lang || 'en');
      const pattern = isStatic ? 'static' : (classified.pattern || 'other');
      
      // Redirects
      if (status === 301 || status === 302 || status === 307) {
        redirects.total++;
        redirects.byStatus[status] = (redirects.byStatus[status] || 0) + 1;
        const key = pattern;
        if (!redirects.byPattern[key]) redirects.byPattern[key] = { count: 0, botCount: 0, humanCount: 0 };
        redirects.byPattern[key].count++;
        if (bot) redirects.byPattern[key].botCount++; else redirects.byPattern[key].humanCount++;
      }
      
      // 410 Gone
      if (status === 410) {
        gone410.total++;
        if (googlebot) gone410.googlebotRequests++;
        const key = pattern;
        if (!gone410.byPattern[key]) gone410.byPattern[key] = { count: 0, botCount: 0, examples: new Set() };
        gone410.byPattern[key].count++;
        if (bot) gone410.byPattern[key].botCount++;
        if (gone410.byPattern[key].examples.size < 3) gone410.byPattern[key].examples.add(url);
      }
      
      // Crawl budget (Googlebot only)
      if (googlebot) {
        crawlBudget.totalGooglebot++;
        if (status === 200 && !isStatic) crawlBudget.useful++;
        else if (status === 301 || status === 302 || status === 307) crawlBudget.waste.redirects++;
        else if (status === 404) crawlBudget.waste.notFound404++;
        else if (status === 410) crawlBudget.waste.gone410++;
        else if (isStatic) crawlBudget.waste.static++;
      }
      
      // Checkout
      if (pattern === 'checkout') {
        checkoutFunnel.total++;
        checkoutFunnel.byStatus[status] = (checkoutFunnel.byStatus[status] || 0) + 1;
        if (!checkoutFunnel.byDay[dayStr]) checkoutFunnel.byDay[dayStr] = { requests: 0, success200: 0 };
        checkoutFunnel.byDay[dayStr].requests++;
        if (status === 200) checkoutFunnel.byDay[dayStr].success200++;
        // Extract VIN (last path segment)
        const vinMatch = url.match(/\/([A-Za-z0-9]{17})$/i);
        if (vinMatch && checkoutFunnel.uniqueVINs.size < 100000) checkoutFunnel.uniqueVINs.add(vinMatch[1].toUpperCase());
      }
      
      // Languages
      if (!isStatic) {
        if (!languages[lang]) languages[lang] = { requests: 0, ok200: 0, err404: 0, botCount: 0 };
        languages[lang].requests++;
        if (status === 200) languages[lang].ok200++;
        if (status === 404) languages[lang].err404++;
        if (bot) languages[lang].botCount++;
      }
      
      // Heatmap
      const hmKey = `${dayOfWeek}-${hourNum}`;
      if (!heatmap.responseTime[hmKey]) heatmap.responseTime[hmKey] = { sum: 0, count: 0 };
      heatmap.responseTime[hmKey].sum += respTime;
      heatmap.responseTime[hmKey].count++;
      
      // Suspicious UAs
      const shortUA = ua.substring(0, 100);
      if (!suspicious[shortUA]) suspicious[shortUA] = { count: 0, errors: 0 };
      suspicious[shortUA].count++;
      if (status >= 400) suspicious[shortUA].errors++;
    });
    
    rl.on('close', () => { console.log(`  ${count} lines`); resolve(); });
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

async function main() {
  const files = readdirSync(LOGS_DIR).filter(f => f.endsWith('.gz')).sort();
  console.log(`Processing ${files.length} files for extra metrics...`);
  
  for (const f of files) {
    console.log(`  ${f}...`);
    await processFile(join(LOGS_DIR, f));
  }
  
  // Build final objects
  summary.redirects = {
    total: redirects.total,
    byStatus: redirects.byStatus,
    byPattern: Object.entries(redirects.byPattern)
      .map(([p, d]) => ({ pattern: p, ...d }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  };
  
  summary.gone410 = {
    total: gone410.total,
    googlebotRequests: gone410.googlebotRequests,
    byPattern: Object.entries(gone410.byPattern)
      .map(([p, d]) => ({ pattern: p, count: d.count, botCount: d.botCount, examples: [...d.examples] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  };
  
  const totalWaste = crawlBudget.waste.redirects + crawlBudget.waste.notFound404 + crawlBudget.waste.gone410 + crawlBudget.waste.static;
  summary.crawlBudget = {
    totalGooglebot: crawlBudget.totalGooglebot,
    useful: { count: crawlBudget.useful, percent: crawlBudget.totalGooglebot ? +(crawlBudget.useful / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 },
    waste: {
      redirects: { count: crawlBudget.waste.redirects, percent: crawlBudget.totalGooglebot ? +(crawlBudget.waste.redirects / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 },
      notFound404: { count: crawlBudget.waste.notFound404, percent: crawlBudget.totalGooglebot ? +(crawlBudget.waste.notFound404 / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 },
      gone410: { count: crawlBudget.waste.gone410, percent: crawlBudget.totalGooglebot ? +(crawlBudget.waste.gone410 / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 },
      static: { count: crawlBudget.waste.static, percent: crawlBudget.totalGooglebot ? +(crawlBudget.waste.static / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 },
      total: { count: totalWaste, percent: crawlBudget.totalGooglebot ? +(totalWaste / crawlBudget.totalGooglebot * 100).toFixed(1) : 0 }
    }
  };
  
  summary.checkoutFunnel = {
    totalRequests: checkoutFunnel.total,
    uniqueVINs: checkoutFunnel.uniqueVINs.size,
    byStatus: checkoutFunnel.byStatus,
    byDay: Object.entries(checkoutFunnel.byDay).map(([d, v]) => ({ date: d, ...v })).sort((a, b) => a.date.localeCompare(b.date))
  };
  
  summary.languages = Object.entries(languages)
    .map(([lang, d]) => ({ lang, ...d, botPercent: d.requests ? +(d.botCount / d.requests * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.requests - a.requests);
  
  // Heatmap: 7 days x 24 hours
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hmRT = [];
  const hmReq = [];
  for (let d = 0; d < 7; d++) {
    const rtRow = [];
    const reqRow = [];
    for (let h = 0; h < 24; h++) {
      const key = `${d}-${h}`;
      const data = heatmap.responseTime[key];
      rtRow.push(data ? +(data.sum / data.count).toFixed(3) : 0);
      reqRow.push(data ? data.count : 0);
    }
    hmRT.push(rtRow);
    hmReq.push(reqRow);
  }
  summary.heatmap = { responseTime: hmRT, requests: hmReq, hours: Array.from({length:24}, (_,i) => i), days };
  
  // Suspicious
  const topUAs = Object.entries(suspicious)
    .map(([ua, d]) => ({ ua, count: d.count, errorRate: +(d.errors / d.count * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const highErrorUAs = Object.entries(suspicious)
    .filter(([, d]) => d.count > 1000 && d.errors / d.count > 0.5)
    .map(([ua, d]) => ({ ua, count: d.count, errorRate: +(d.errors / d.count * 100).toFixed(1) }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 20);
  summary.suspicious = { topUAs, highErrorUAs };
  
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary));
  const size = (readFileSync(SUMMARY_PATH).length / 1024 / 1024).toFixed(2);
  console.log(`Done! summary.json = ${size} MB`);
}

main().catch(console.error);
