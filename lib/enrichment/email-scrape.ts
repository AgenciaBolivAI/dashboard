import "server-only";

/**
 * Free website → business-email finder. Given a business website (AIMA already
 * captures it from Google Maps), fetch the homepage + a few common contact pages
 * and extract the best public email — no third-party API, no cost.
 *
 * Deliberately conservative: short timeouts, capped pages/bytes, strict junk
 * filtering, and a ranking that prefers a real business email on the site's own
 * domain. Never throws. Limitations (v1): doesn't render JS or de-obfuscate
 * "info [at] domain" text — those simply yield nothing.
 */

const CONTACT_PATHS = ["", "/contact", "/contact-us", "/contacto", "/contactenos", "/about", "/nosotros"];
const FETCH_TIMEOUT_MS = 6000;
const MAX_PAGES = 3;
const MAX_BYTES = 600_000;
const UA = "Mozilla/5.0 (compatible; BolivAI-LeadEnrich/1.0; +https://bolivai.com)";

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}/gi;

// Social / link-in-bio hosts are not scrapable for an email.
const SOCIAL_RE = /(instagram|facebook|fb\.com|fb\.me|linktr|beacons|wa\.me|whatsapp|t\.me|telegram|tiktok|twitter|x\.com|youtube|youtu\.be|linkedin|pinterest|yelp\.|google\.com\/maps|goo\.gl|maps\.app)/i;

const JUNK_DOMAINS = new Set([
  "example.com", "email.com", "domain.com", "yourdomain.com", "test.com",
  "sentry.io", "sentry.wixpress.com", "wixpress.com", "wix.com", "squarespace.com",
  "godaddy.com", "cloudflare.com", "schema.org", "w3.org", "gstatic.com", "googleapis.com",
]);
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|woff2?|ttf)$/i;
const ROLE_PREFIX = [
  "info", "contact", "contacto", "hello", "hola", "admin", "office", "oficina",
  "appointments", "citas", "reception", "recepcion", "sales", "ventas",
  "support", "soporte", "mail", "email", "hi", "clinica", "clinic",
];
const FREE_PROVIDERS = new Set([
  "gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "aol.com", "icloud.com",
  "live.com", "msn.com", "yahoo.es", "hotmail.es", "hotmail.com.mx", "yahoo.com.mx",
]);

/** Naive eTLD+1 — good enough for same-site ranking. */
function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

export function normalizeUrl(raw: string): URL | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/** A scrapable business site (has a URL and isn't a social/link-in-bio page). */
export function isRealBusinessWebsite(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const u = normalizeUrl(raw);
  if (!u) return false;
  if (SOCIAL_RE.test(u.hostname) || SOCIAL_RE.test(raw)) return false;
  return true;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/(html|text|xml)/i.test(ct)) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return null;
  }
}

function extractEmails(html: string): string[] {
  // Decode the couple of HTML entities that commonly encode "@".
  const text = html.replace(/&#0*64;|&commat;/gi, "@");
  const found = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (e.includes("@")) found.add(e);
  }
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  return [...found];
}

// Only drops things that literally aren't a real email (scraper false positives) —
// image/asset refs, tracking/infra domains, malformed locals, template placeholders.
// Real emails (incl. gmail/branch/no-reply) are always kept.
function isPlausibleEmail(email: string): boolean {
  if (!email || email.length > 120) return false;
  if (IMG_EXT.test(email)) return false;
  if (/@\d+x\b/.test(email)) return false; // retina asset refs (foo@2x.png)
  const [local, domain] = email.split("@");
  if (!local || !domain || domain.indexOf(".") < 1) return false;
  if (JUNK_DOMAINS.has(domain)) return false;
  if (/[^a-z0-9._%+\-]/i.test(local)) return false;
  if (/(example|yourname|your-email|user@|email@example|name@)/.test(email)) return false;
  return true;
}

export type EmailScrapeResult = { email: string | null; emails: string[]; pagesFetched: number };

/**
 * Find business emails for a website. Fetches up to MAX_PAGES common pages
 * (early-exits once a same-domain email is found on the homepage) and returns
 * EVERY real email found — nothing is dropped except scraper false-positives.
 * `emails` is the full de-duped list, ranked so the most contactable business
 * address is first; `email` is that primary (same-domain > role > free provider,
 * no-reply/bounce last).
 */
export async function findBusinessEmail(rawWebsite: string): Promise<EmailScrapeResult> {
  const base = normalizeUrl(rawWebsite);
  if (!base || SOCIAL_RE.test(base.hostname)) return { email: null, emails: [], pagesFetched: 0 };
  const siteDomain = registrableDomain(base.hostname);

  const seen = new Set<string>();
  const all = new Set<string>();
  let pages = 0;

  for (const path of CONTACT_PATHS) {
    if (pages >= MAX_PAGES) break;
    let target: string;
    try {
      target = new URL(path || "/", base).toString();
    } catch {
      continue;
    }
    if (seen.has(target)) continue;
    seen.add(target);
    const html = await fetchHtml(target);
    if (html == null) continue;
    pages++;
    for (const e of extractEmails(html)) if (isPlausibleEmail(e)) all.add(e);
    // Homepage already yielded a same-domain business email → stop early.
    if (path === "" && [...all].some((e) => registrableDomain(e.split("@")[1]!) === siteDomain)) break;
  }

  const emails = [...all];
  if (emails.length === 0) return { email: null, emails: [], pagesFetched: pages };

  // Rank so the primary is the most contactable; ALL are still returned.
  const score = (e: string) => {
    const [local, dom] = e.split("@");
    const domainMatch = registrableDomain(dom!) === siteDomain;
    const isRole = ROLE_PREFIX.some((p) => local === p || local!.startsWith(p));
    const isFree = FREE_PROVIDERS.has(dom!);
    const isBounce = /^(no-?reply|noreply|donotreply|postmaster|abuse|webmaster|mailer-daemon)/.test(local!);
    let s = 0;
    if (domainMatch) s += 100;
    if (isRole) s += 20;
    if (isFree) s -= 30;
    if (isBounce) s -= 200; // keep it, but never make it the primary
    s -= Math.min(local!.length, 24) * 0.1;
    return s;
  };
  emails.sort((a, b) => score(b) - score(a));
  return { email: emails[0]!, emails: emails.slice(0, 25), pagesFetched: pages };
}
