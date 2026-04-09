const BOT_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "googlebot", pattern: /googlebot/i },
  { name: "bingbot", pattern: /bingbot|msnbot/i },
  { name: "ahrefsbot", pattern: /ahrefsbot/i },
  { name: "semrushbot", pattern: /semrushbot/i },
  { name: "yandexbot", pattern: /yandexbot/i },
  { name: "baiduspider", pattern: /baiduspider/i },
  { name: "duckduckbot", pattern: /duckduckbot/i },
  { name: "facebookbot", pattern: /facebookexternalhit|meta-externalagent|facebookcatalog/i },
  { name: "twitterbot", pattern: /twitterbot/i },
  { name: "applebot", pattern: /applebot/i },
  { name: "mj12bot", pattern: /mj12bot/i },
  { name: "dotbot", pattern: /dotbot/i },
  { name: "petalbot", pattern: /petalbot/i },
  { name: "bytespider", pattern: /bytespider/i },
  { name: "gptbot", pattern: /gptbot/i },
  { name: "claudebot", pattern: /claudebot|anthropic/i },
  { name: "telegraf", pattern: /telegraf/i },
];

const GENERIC_BOT =
  /bot|crawl|spider|scraper|fetch|monitor|check|curl|wget|python|java\/|go-http|http-client|libwww|apache|selenide/i;

export function detectBot(ua: string): string | null {
  for (const { name, pattern } of BOT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  if (GENERIC_BOT.test(ua)) return "other";
  return null;
}

export function isGooglebot(ua: string): boolean {
  return /googlebot/i.test(ua);
}
