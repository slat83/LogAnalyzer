const STATIC_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|map|webp|avif)(\?|$)/i;
const LANG_PREFIX = /^\/(es|fr|ru|pl|ar|de|pt|it|nl|uk|ja|ko|zh|tr|vi)\//;

export interface UrlRule {
  pattern: string;
  label: string;
  re: RegExp;
}

export function compileRules(rules: { pattern: string; label: string }[]): UrlRule[] {
  return rules.map((r) => ({ ...r, re: new RegExp(r.pattern, "i") }));
}

export function classifyUrl(url: string, customRules: UrlRule[]): string {
  if (STATIC_EXT.test(url)) return "static";

  let path = url.split("?")[0];
  let lang = "";

  const langMatch = path.match(LANG_PREFIX);
  if (langMatch) {
    lang = langMatch[1] + ":";
    path = path.slice(langMatch[0].length - 1);
  }

  // Custom rules (user-defined, tested in priority order)
  for (const rule of customRules) {
    if (rule.re.test(path)) return lang + rule.label;
  }

  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "api") {
    return lang + "api:" + (segments[1] || "root");
  }

  if (segments.includes("checkout")) {
    return lang + "checkout";
  }

  // Default: first 2 segments
  const key = "/" + segments.slice(0, 2).join("/");
  return lang + (key || "/");
}

/** Extract language code from URL path prefix. Returns 'en' if no prefix. */
export function detectLanguage(url: string): string {
  const match = url.match(LANG_PREFIX);
  return match ? match[1] : "en";
}

/** Extract checkout identifier from URL (last path segment after /checkout/). */
export function extractCheckoutId(url: string): string | null {
  const match = url.match(/\/checkout\/([a-z0-9]+)/i);
  return match ? match[1].toLowerCase() : null;
}
