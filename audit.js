// Free "store check" lead magnet: /kontrola-eshopu (cs) and /store-check (en).
// A shop owner pastes their URL and gets a 0-100 score with concrete findings
// about the things customers ask most (shipping, returns, contact, product info).
const dns = require("dns").promises;
const net = require("net");
const { discoverStore, isPrivateIp } = require("./growth");

const UA = "Mozilla/5.0 (compatible; ChatneloCheck/1.0; +https://chatnelo.com/kontrola-eshopu)";
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map();
const limits = new Map();

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error("bad_url"); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("bad_url");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("bad_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error("bad_url"); return url; }
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) throw new Error("bad_url");
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (!records.length) throw new Error("not_found");
  if (records.some((r) => isPrivateIp(r.address))) throw new Error("bad_url");
  return url;
}

async function safeFetch(raw, timeoutMs = 9000, maxBytes = 3 * 1024 * 1024) {
  let current = raw;
  for (let hop = 0; hop < 4; hop += 1) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(url.toString(), {
        redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "cs,en;q=0.8" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, status: response.status, text: "", url: url.toString(), ms: Date.now() - started };
        current = new URL(location, url).toString();
        continue;
      }
      const chunks = []; let size = 0;
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) { controller.abort(); break; }
          chunks.push(Buffer.from(value));
        }
      }
      return { ok: response.ok, status: response.status, text: Buffer.concat(chunks).toString("utf8"), url: url.toString(), ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, text: "", url: current, ms: 0 };
}

function decode(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function plain(html) {
  return decode(String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 600) {
    try {
      const url = new URL(decode(m[1]), base);
      if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      out.push({ url: url.toString(), path: decodeURIComponent(url.pathname).toLowerCase(), text: plain(m[2]).toLowerCase().slice(0, 80) });
    } catch (_) { /* ignore */ }
  }
  return out;
}
function findLink(all, re) {
  return all.find((l) => re.test(l.path) || re.test(l.text));
}

const CHAT_WIDGETS = [
  ["Smartsupp", /smartsupp/i], ["Tawk.to", /tawk\.to/i], ["LiveChat", /livechatinc|cdn\.livechat/i], ["Intercom", /intercom/i],
  ["Crisp", /crisp\.chat/i], ["Tidio", /tidio/i], ["Zendesk", /zdassets|zendesk/i], ["Gorgias", /gorgias/i],
  ["Freshchat", /freshchat|freshworks/i], ["HubSpot", /hs-scripts|hubspot/i], ["Messenger", /customerchat|xfbml\.customerchat/i],
  ["Chatnelo", /chatnelo\.com\/embed|eshop-assistant-widget/i], ["Daktela", /daktela/i], ["Shopify Inbox", /shopify-chat|inbox\.shopify/i],
];

const T = {
  cs: {
    https: ["Zabezpečené připojení (HTTPS)", "Web běží na HTTPS.", "Web neběží na HTTPS – prohlížeč zákazníkům ukazuje varování."],
    speed: ["Rychlost načtení", (ms) => `Úvodní stránka odpověděla za ${(ms / 1000).toFixed(1)} s.`, (ms) => `Úvodní stránka odpovídala ${(ms / 1000).toFixed(1)} s – pomalý web zákazníci často zavřou.`],
    mobile: ["Zobrazení na mobilu", "Web je připravený pro mobily.", "Chybí nastavení pro mobily (meta viewport) – na telefonu se web může zobrazovat špatně."],
    contact: ["Kontakt na první pohled", "Telefon i e-mail jsou na úvodní stránce.", "Na úvodní stránce chybí telefon nebo e-mail.", "Na úvodní stránce není ani telefon, ani e-mail – zákazník neví, kam napsat."],
    shipping: ["Doprava: cena a doba doručení", "Stránka o dopravě uvádí cenu i dobu doručení.", "Stránka o dopravě chybí cena nebo doba doručení.", "Nenašli jsme stránku o dopravě – „Kolik stojí doprava a kdy to dorazí?“ je nejčastější dotaz zákazníků."],
    returns: ["Vrácení zboží", "Podmínky vrácení jsou jasně popsané (lhůta ve dnech).", "Stránku o vrácení máte, ale chybí v ní jasná lhůta (např. 14 dní).", "Nenašli jsme stránku o vrácení nebo reklamaci zboží."],
    terms: ["Obchodní podmínky", "Obchodní podmínky jsou dostupné.", "", "Nenašli jsme odkaz na obchodní podmínky."],
    faq: ["Časté dotazy (FAQ)", "Máte stránku s častými dotazy.", "", "Chybí stránka s častými dotazy – zákazníci pak stejné otázky píšou e-mailem."],
    search: ["Vyhledávání na webu", "Web má vyhledávání.", "", "Nenašli jsme vyhledávání – u většího sortimentu zákazníci hledané zboží nenajdou."],
    reviews: ["Recenze a důvěra", "Na webu jsou recenze nebo hodnocení obchodu.", "", "Nenašli jsme recenze ani certifikát (Heureka, Trustpilot apod.) – noví zákazníci váhají."],
    products: ["Informace u produktů", (p) => `Produktů jsme zkontrolovali ${p.count}: popis má ${p.desc} %, obrázek ${p.img} %, cenu ${p.price} %.`, (p) => `Produktů jsme zkontrolovali ${p.count}, ale jen ${p.desc} % má delší popis – zákazníci se pak ptají na rozměry, materiál a velikosti.`, "Nepodařilo se načíst produkty automaticky – ověřte strukturovaná data (schema.org) nebo XML feed."],
    help: ["Rychlá odpověď zákazníkům", (n) => `Na webu je chat (${n}).`, "", "Na webu není žádný chat – kdo má dotaz večer nebo o víkendu, často odejde ke konkurenci."],
  },
  en: {
    https: ["Secure connection (HTTPS)", "The site runs on HTTPS.", "The site doesn't use HTTPS – browsers show customers a warning."],
    speed: ["Load speed", (ms) => `The homepage answered in ${(ms / 1000).toFixed(1)} s.`, (ms) => `The homepage took ${(ms / 1000).toFixed(1)} s – shoppers often leave slow sites.`],
    mobile: ["Mobile view", "The site is mobile-ready.", "No mobile viewport setting – the site may look broken on phones."],
    contact: ["Visible contact", "Phone and e-mail are on the homepage.", "The homepage is missing a phone number or e-mail.", "No phone or e-mail on the homepage – customers don't know where to write."],
    shipping: ["Shipping: price and delivery time", "The shipping page states both price and delivery time.", "The shipping page is missing the price or the delivery time.", "We couldn't find a shipping page – “How much is shipping and when will it arrive?” is the #1 customer question."],
    returns: ["Returns", "The return policy clearly states the time limit.", "There's a returns page, but no clear time limit (e.g. 30 days).", "We couldn't find a returns or refund page."],
    terms: ["Terms & conditions", "Terms are available.", "", "We couldn't find terms & conditions."],
    faq: ["FAQ page", "You have an FAQ page.", "", "No FAQ page – customers e-mail the same questions again and again."],
    search: ["On-site search", "The site has search.", "", "No search found – with a larger range, shoppers can't find what they want."],
    reviews: ["Reviews & trust", "The site shows reviews or ratings.", "", "No reviews or trust badges found – new visitors hesitate to buy."],
    products: ["Product information", (p) => `We checked ${p.count} products: ${p.desc}% have a description, ${p.img}% an image, ${p.price}% a price.`, (p) => `We checked ${p.count} products, but only ${p.desc}% have a longer description – shoppers then ask about size, material and fit.`, "We couldn't read products automatically – check your structured data (schema.org) or product feed."],
    help: ["Fast answers for shoppers", (n) => `The site has a chat (${n}).`, "", "No chat on the site – shoppers with a question at night or on weekends often leave."],
  },
};

async function runAudit(input, lang) {
  const t = T[lang] || T.cs;
  let raw = String(input || "").trim();
  if (!raw) throw new Error("bad_url");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  await assertPublicUrl(raw);
  const home = await safeFetch(raw);
  if (!home.text) throw new Error("unreachable");
  const base = new URL(home.url);
  const domain = base.hostname.replace(/^www\./, "");
  const html = home.text;
  const text = plain(html).toLowerCase();
  const all = links(html, base);
  const checks = [];
  const add = (key, weight, status, detail) => checks.push({ key, title: t[key][0], weight, status, detail });

  add("https", 6, base.protocol === "https:" ? "ok" : "bad", base.protocol === "https:" ? t.https[1] : t.https[2]);
  add("speed", 6, home.ms <= 2500 ? "ok" : (home.ms <= 5000 ? "warn" : "bad"), home.ms <= 2500 ? t.speed[1](home.ms) : t.speed[2](home.ms));
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  add("mobile", 6, viewport ? "ok" : "bad", viewport ? t.mobile[1] : t.mobile[2]);

  const phone = /href=["']tel:/i.test(html) || /\+\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{3}/.test(text) || /(tel|telefon|phone|mobil)[.:\s]{1,3}\+?\d[\d\s]{7,}/i.test(text);
  const email = /href=["']mailto:/i.test(html) || /[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  add("contact", 10, phone && email ? "ok" : (phone || email ? "warn" : "bad"), phone && email ? t.contact[1] : (phone || email ? t.contact[2] : t.contact[3]));

  const shipLink = findLink(all, /doprav|doruc|shipping|delivery|postovn|zpusoby-dopravy|doprava-a-platba/);
  const retLink = findLink(all, /vracen|vratk|reklamac|odstoupen|return|refund|exchange/);
  const termsLink = findLink(all, /obchodni-podminky|obchodní podmínky|podminky|terms|vop|conditions/);
  const faqLink = findLink(all, /faq|caste-dotazy|časté dotazy|otazky|dotazy|help|napoveda|nápověda|poradna/);
  const [shipPage, retPage] = await Promise.all([
    shipLink ? safeFetch(shipLink.url, 8000).catch(() => null) : null,
    retLink ? safeFetch(retLink.url, 8000).catch(() => null) : null,
  ]);
  const shipText = shipPage && shipPage.text ? plain(shipPage.text).toLowerCase() : "";
  const shipPrice = /(\d[\d\s]*,?\d*\s?(kč|czk|€|eur|\$|zł|pln))|zdarma|free/i.test(shipText);
  const shipTime = /(\d+\s?[-–]?\s?\d*\s?(pracovn\w*\s)?(dn|dní|dny|den|days?|business days|hodin|hours?))|zítra|tomorrow|next day/i.test(shipText);
  add("shipping", 14, shipLink ? (shipPrice && shipTime ? "ok" : "warn") : "bad", shipLink ? (shipPrice && shipTime ? t.shipping[1] : t.shipping[2]) : t.shipping[3]);

  const retText = retPage && retPage.text ? plain(retPage.text).toLowerCase() : "";
  const retDays = /(14|15|30|60|100)\s?(dn|dní|dnů|days?)/i.test(retText) || /(14|30)\s?(dn|dní|dnů|days?)/i.test(text);
  add("returns", 12, retLink ? (retDays ? "ok" : "warn") : "bad", retLink ? (retDays ? t.returns[1] : t.returns[2]) : t.returns[3]);
  add("terms", 4, termsLink ? "ok" : "bad", termsLink ? t.terms[1] : t.terms[3]);
  add("faq", 6, faqLink ? "ok" : "warn", faqLink ? t.faq[1] : t.faq[3]);

  const search = /type=["']search["']|name=["'](q|s|search|string|phrase|hledat)["']|\/(search|vyhledavani|hledat)/i.test(html);
  add("search", 4, search ? "ok" : "warn", search ? t.search[1] : t.search[3]);
  const reviews = /heureka|trustpilot|judge\.me|yotpo|okendo|trusted ?shops|zbozi\.cz|ověřeno zákazníky|recenz|hodnocen|reviews?|aggregateRating/i.test(html);
  add("reviews", 8, reviews ? "ok" : "warn", reviews ? t.reviews[1] : t.reviews[3]);

  let store = null;
  try { store = await discoverStore(home.url, () => []); } catch (_) { store = null; }
  const products = store && store.products ? store.products : [];
  if (products.length) {
    const pct = (fn) => Math.round((products.filter(fn).length / products.length) * 100);
    const p = { count: products.length, desc: pct((x) => (x.popis || "").length >= 80), img: pct((x) => !!x.obrazek), price: pct((x) => Number.isFinite(x.cena)) };
    add("products", 14, p.desc >= 70 ? "ok" : (p.desc >= 35 ? "warn" : "bad"), p.desc >= 70 ? t.products[1](p) : t.products[2](p));
  } else {
    add("products", 14, "warn", t.products[3]);
  }
  const widget = CHAT_WIDGETS.find(([, re]) => re.test(html));
  add("help", 10, widget ? "ok" : "bad", widget ? t.help[1](widget[0]) : t.help[3]);

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.status === "ok" ? c.weight : (c.status === "warn" ? c.weight * 0.5 : 0)), 0);
  const score = Math.round((got / total) * 100);
  const order = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);
  return { domain, name: (store && store.name) || domain, platform: (store && store.platform) || "", score, checks, products: products.length };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

const PAGE = {
  cs: {
    path: "/kontrola-eshopu", other: "/store-check", otherLabel: "English",
    title: "Kontrola e-shopu zdarma za 30 sekund | Chatnelo",
    description: "Zdarma zkontrolujte svůj e-shop: dopravu, vrácení zboží, kontakty, informace u produktů, rychlost a mobil. Skóre 0–100 a konkrétní tipy, co zlepšit.",
    kicker: "Zdarma · bez registrace", h1a: "Kontrola e-shopu", h1b: "za 30 sekund.",
    lead: "Vložte adresu e-shopu. Projdeme ho očima zákazníka a ukážeme, co mu chybí – a na co se vás pak ptá e-mailem.",
    ph: "vas-eshop.cz", btn: "Zkontrolovat", busy: "Kontroluji…",
    steps: ["Otevírám e-shop…", "Hledám dopravu a vrácení zboží…", "Kontroluji produkty…", "Počítám skóre…"],
    err: { bad_url: "Tohle nevypadá jako adresa webu.", not_found: "Tahle doména neexistuje.", unreachable: "E-shop se nepodařilo otevřít. Zkuste to prosím znovu.", busy: "Teď je to přetížené, zkuste to za chvíli.", error: "Něco se pokazilo, zkuste to prosím znovu." },
    scoreLabel: "Skóre e-shopu", of: "ze 100",
    verdict: [[85, "Výborně – e-shop je na zákazníky dobře připravený."], [65, "Dobrý základ, pár věcí ale zákazníky zdržuje."], [0, "Zákazníkům tu chybí důležité informace – část z nich odejde."]],
    ctaT: "Na tyhle věci se vás zákazníci ptají.", ctaP: "Chatnelo jim odpoví za vás – 24/7, podle vašich produktů, dopravy a podmínek. Vyzkoušejte si ho rovnou na svém e-shopu.",
    ctaBtn: "Vyzkoušet chat na mém e-shopu", share: "Zkopírovat odkaz na výsledek", copied: "Zkopírováno ✓", again: "Zkontrolovat jiný e-shop",
    what: "Co kontrolujeme", list: ["Doprava – cena a doba doručení", "Vrácení zboží a obchodní podmínky", "Kontakt a časté dotazy", "Popisy, obrázky a ceny produktů", "Rychlost, HTTPS a mobil", "Recenze, vyhledávání a chat"],
    faq: [["Je kontrola opravdu zdarma?", "Ano. Bez registrace a bez e-mailu. Kontrola jen čte veřejné stránky vašeho e-shopu."], ["Jak se počítá skóre?", "Každá oblast má váhu podle toho, jak často se na ni zákazníci ptají. Nejvíc váží doprava, produkty a vrácení zboží."], ["Funguje to pro Shoptet, WooCommerce i Shopify?", "Ano, pro jakýkoli veřejný e-shop."]],
    foot: "Kontrolu provozuje Chatnelo – AI chat, který zákazníkům e-shopů odpovídá 24/7.", home: "Zpět na chatnelo.com",
  },
  en: {
    path: "/store-check", other: "/kontrola-eshopu", otherLabel: "Česky",
    title: "Free online store check in 30 seconds | Chatnelo",
    description: "Check your online store for free: shipping, returns, contact, product info, speed and mobile. Get a 0–100 score and concrete tips.",
    kicker: "Free · no sign-up", h1a: "Store check", h1b: "in 30 seconds.",
    lead: "Paste your store's address. We'll look at it through a shopper's eyes and show what's missing – and what they'll e-mail you about.",
    ph: "your-store.com", btn: "Check my store", busy: "Checking…",
    steps: ["Opening your store…", "Looking for shipping and returns…", "Checking products…", "Calculating the score…"],
    err: { bad_url: "That doesn't look like a web address.", not_found: "That domain doesn't exist.", unreachable: "We couldn't open the store. Please try again.", busy: "We're busy right now, please try again in a moment.", error: "Something went wrong, please try again." },
    scoreLabel: "Store score", of: "out of 100",
    verdict: [[85, "Great – your store is well prepared for shoppers."], [65, "A solid base, but a few things slow shoppers down."], [0, "Shoppers are missing important info here – some of them will leave."]],
    ctaT: "These are the questions shoppers ask you.", ctaP: "Chatnelo answers them for you – 24/7, from your products, shipping and policies. Try it on your own store right now.",
    ctaBtn: "Try the chat on my store", share: "Copy link to the result", copied: "Copied ✓", again: "Check another store",
    what: "What we check", list: ["Shipping – price and delivery time", "Returns and terms", "Contact and FAQ", "Product descriptions, images and prices", "Speed, HTTPS and mobile", "Reviews, search and chat"],
    faq: [["Is it really free?", "Yes. No sign-up, no e-mail. The check only reads your store's public pages."], ["How is the score calculated?", "Each area is weighted by how often shoppers ask about it. Shipping, products and returns weigh the most."], ["Does it work for Shopify, WooCommerce and others?", "Yes, for any public online store."]],
    foot: "The check is run by Chatnelo – an AI chat that answers shoppers 24/7.", home: "Back to chatnelo.com",
  },
};

function page(lang) {
  const p = PAGE[lang];
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const appLd = { "@context": "https://schema.org", "@type": "WebApplication", name: p.title, url: `https://chatnelo.com${p.path}`, applicationCategory: "BusinessApplication", offers: { "@type": "Offer", price: "0" } };
  const client = { lang, t: { steps: p.steps, err: p.err, scoreLabel: p.scoreLabel, of: p.of, verdict: p.verdict, copied: p.copied, btn: p.btn, busy: p.busy, share: p.share } };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="https://chatnelo.com${p.path}">
<link rel="alternate" hreflang="${lang}" href="https://chatnelo.com${p.path}">
<link rel="alternate" hreflang="${lang === "cs" ? "en" : "cs"}" href="https://chatnelo.com${p.other}">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="https://chatnelo.com/icon-512.png"><meta property="og:url" content="https://chatnelo.com${p.path}">
<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, "\\u003c")}</script>
<script type="application/ld+json">${JSON.stringify(appLd).replace(/</g, "\\u003c")}</script>
<style>
*{box-sizing:border-box}
:root{--bg:#04050d;--mut:#a5b0c8;--line:rgba(255,255,255,.12)}
body{margin:0;background:radial-gradient(1000px 520px at 80% -10%,rgba(168,85,247,.35),transparent 60%),radial-gradient(800px 420px at 0% 20%,rgba(34,211,238,.16),transparent 60%),var(--bg);color:#f8fafc;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:#c4b5fd}
.top{max-width:1040px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:18px 22px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;color:#fff;text-decoration:none;font-size:1.1rem}
.brand img{width:38px;height:38px;border-radius:50%}
.top nav a{color:var(--mut);text-decoration:none;font-weight:600;margin-left:16px;font-size:.92rem}
main{max-width:860px;margin:0 auto;padding:30px 20px 60px}
.kick{display:inline-block;padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:#a7f3d0;font-weight:700;font-size:.82rem;background:rgba(16,185,129,.08)}
h1{margin:16px 0 12px;font-size:clamp(2.4rem,7vw,4.4rem);line-height:.98;letter-spacing:-.04em;font-weight:900}
h1 span{display:block;background:linear-gradient(110deg,#22d3ee,#a855f7 60%,#f472b6);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--mut);font-size:1.12rem;max-width:620px;margin:0 0 26px}
form{display:flex;gap:10px;flex-wrap:wrap}
input{flex:1 1 280px;padding:17px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:1.05rem}
input:focus{outline:none;border-color:#a855f7;background:rgba(255,255,255,.1)}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:16px 26px;border:none;border-radius:999px;background:linear-gradient(110deg,#22d3ee,#a855f7 60%,#f472b6);color:#fff;font-weight:800;font-size:1.02rem;cursor:pointer;text-decoration:none;box-shadow:0 18px 40px -18px rgba(168,85,247,.9)}
.btn:disabled{opacity:.6;cursor:wait}
.btn.ghost{background:transparent;border:1px solid var(--line);box-shadow:none}
.steps{list-style:none;padding:0;margin:22px 0 0}
.steps li{padding:5px 0;color:#64748b;font-weight:600}.steps li.on{color:#fff}.steps li.done{color:#34d399}
.msg{margin-top:16px;padding:13px 16px;border-radius:14px;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.3);color:#fde68a}
.res{margin-top:30px;border:1px solid var(--line);border-radius:24px;padding:26px;background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02))}
.head{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.ring{--v:0;width:132px;height:132px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--c) calc(var(--v)*1%),rgba(255,255,255,.08) 0);flex:none}
.ring div{width:106px;height:106px;border-radius:50%;background:#0b0d1d;display:grid;place-items:center;text-align:center}
.ring b{font-size:2.4rem;line-height:1;font-weight:900}.ring small{display:block;color:var(--mut);font-size:.72rem}
.head h2{margin:0 0 6px;font-size:1.5rem}.head p{margin:0;color:var(--mut)}
.items{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px}
.items li{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:13px 15px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
.items li i{font-style:normal;font-size:1.1rem}.items b{display:block}.items span{color:var(--mut);font-size:.94rem}
.cta{margin-top:24px;padding:22px;border-radius:18px;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(168,85,247,.18));border:1px solid rgba(192,132,252,.35)}
.cta h3{margin:0 0 6px;font-size:1.25rem}.cta p{margin:0 0 16px;color:#d4d4f5}
.row{display:flex;gap:10px;flex-wrap:wrap}
.sec{margin-top:46px}.sec h2{font-size:1.3rem;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.grid div{padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);font-weight:600}
details{border:1px solid var(--line);border-radius:14px;padding:13px 16px;margin-bottom:10px;background:rgba(255,255,255,.03)}
summary{cursor:pointer;font-weight:700}details p{margin:8px 0 0;color:var(--mut)}
footer{text-align:center;color:#64748b;font-size:.86rem;padding:10px 18px 40px}footer a{color:#94a3b8}
[hidden]{display:none!important}
@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.top nav a.hide-m{display:none}}
</style>
</head>
<body>
<div class="top"><a class="brand" href="/"><img src="/mascot.png" alt="">Chatnelo</a><nav><a class="hide-m" href="/">chatnelo.com</a><a href="${p.other}">${p.otherLabel}</a></nav></div>
<main>
  <span class="kick">${esc(p.kicker)}</span>
  <h1>${esc(p.h1a)}<span>${esc(p.h1b)}</span></h1>
  <p class="lead">${esc(p.lead)}</p>
  <form id="f"><input id="u" type="text" inputmode="url" autocomplete="url" spellcheck="false" placeholder="${esc(p.ph)}" required><button class="btn" id="go" type="submit">${esc(p.btn)}</button></form>
  <ul class="steps" id="st" hidden></ul>
  <div class="msg" id="msg" hidden></div>
  <section class="res" id="res" hidden>
    <div class="head"><div class="ring" id="ring"><div><b id="sc">0</b><small>${esc(p.of)}</small></div></div><div><h2 id="nm"></h2><p id="vd"></p></div></div>
    <ul class="items" id="it"></ul>
    <div class="cta"><h3>${esc(p.ctaT)}</h3><p>${esc(p.ctaP)}</p>
      <div class="row"><a class="btn" id="try" href="/#cn-try">${esc(p.ctaBtn)}</a><button class="btn ghost" id="sh" type="button">${esc(p.share)}</button><button class="btn ghost" id="ag" type="button">${esc(p.again)}</button></div>
    </div>
  </section>
  <div class="sec"><h2>${esc(p.what)}</h2><div class="grid">${p.list.map((x) => `<div>✓ ${esc(x)}</div>`).join("")}</div></div>
  <div class="sec">${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
</main>
<footer>${esc(p.foot)}<br><a href="/">${esc(p.home)}</a> · <a href="/privacy">Privacy</a> · © BrosWars Studio</footer>
<script>
(function(){
  var C=${JSON.stringify(client).replace(/</g, "\\u003c")}, t=C.t;
  function $(i){return document.getElementById(i);}
  function steps(n){var ul=$("st");ul.hidden=false;ul.innerHTML=t.steps.map(function(s,i){return '<li class="'+(i<n?'done':(i===n?'on':''))+'">'+(i<n?'✓ ':'• ')+s+'</li>';}).join("");}
  function run(url){
    if(!url)return; $("msg").hidden=true; $("res").hidden=true; $("go").disabled=true; $("go").textContent=t.busy;
    var n=0; steps(0); var tm=setInterval(function(){ if(n<t.steps.length-1) steps(++n); },3500);
    fetch("/audit/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url,lang:C.lang})})
      .then(function(r){return r.json().then(function(d){d.__s=r.status;return d;});})
      .then(function(d){
        clearInterval(tm); $("st").hidden=true;
        if(d.__s>=400) throw new Error(t.err[d.code]||t.err.error);
        show(d);
        try{history.replaceState(null,"",location.pathname+"?url="+encodeURIComponent(d.domain));}catch(e){}
      })
      .catch(function(e){clearInterval(tm);$("st").hidden=true;$("msg").textContent=e.message||t.err.error;$("msg").hidden=false;})
      .finally(function(){$("go").disabled=false;$("go").textContent=t.btn;});
  }
  function show(d){
    var col=d.score>=85?"#34d399":(d.score>=65?"#fbbf24":"#f87171");
    var ring=$("ring"); ring.style.setProperty("--c",col);
    var v=0, step=function(){ v=Math.min(d.score,v+2); ring.style.setProperty("--v",v); $("sc").textContent=v; if(v<d.score) requestAnimationFrame(step); }; step();
    $("nm").textContent=d.name+" · "+t.scoreLabel;
    for(var i=0;i<t.verdict.length;i++){ if(d.score>=t.verdict[i][0]){ $("vd").textContent=t.verdict[i][1]; break; } }
    var icon={ok:"✅",warn:"⚠️",bad:"❌"};
    $("it").innerHTML="";
    d.checks.forEach(function(c){ var li=document.createElement("li"); var i=document.createElement("i"); i.textContent=icon[c.status]; var w=document.createElement("div"); var b=document.createElement("b"); b.textContent=c.title; var s=document.createElement("span"); s.textContent=c.detail; w.appendChild(b); w.appendChild(s); li.appendChild(i); li.appendChild(w); $("it").appendChild(li); });
    $("try").href="/?try="+encodeURIComponent(d.domain)+"&utm_source=store-check#cn-try";
    $("res").hidden=false; $("res").scrollIntoView({behavior:"smooth",block:"start"});
  }
  $("f").addEventListener("submit",function(e){e.preventDefault();run($("u").value.trim());});
  $("ag").addEventListener("click",function(){$("res").hidden=true;$("u").value="";$("u").focus();window.scrollTo({top:0,behavior:"smooth"});});
  $("sh").addEventListener("click",function(){var b=this,l=location.href; var done=function(){var o=b.textContent;b.textContent=t.copied;setTimeout(function(){b.textContent=o;},1800);}; if(navigator.clipboard) navigator.clipboard.writeText(l).then(done,function(){}); });
  var pre=""; try{pre=new URLSearchParams(location.search).get("url")||"";}catch(e){}
  if(pre){ $("u").value=pre; run(pre); }
})();
</script>
</body>
</html>`;
}

function register(app, deps = {}) {
  const db = deps.database;
  let ready = null;
  function track(domain, score, ok) {
    if (!db) return;
    ready = ready || db.query(`CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), domain TEXT, score INTEGER, ok BOOLEAN)`).catch((e) => { ready = null; throw e; });
    ready.then(() => db.query("INSERT INTO audit_events (domain, score, ok) VALUES ($1,$2,$3)", [String(domain || "").slice(0, 200) || null, Number.isFinite(score) ? score : null, !!ok]))
      .catch((e) => deps.logRouteError && deps.logRouteError("Audit stats", e));
  }

  for (const lang of Object.keys(PAGE)) {
    const html = page(lang);
    app.get(PAGE[lang].path, (req, res) => res.type("html").send(html));
  }

  app.post("/audit/run", async (req, res) => {
    const ip = req.ip || "x";
    const now = Date.now();
    const entry = limits.get(ip);
    if (!entry || now - entry.start > 3600000) limits.set(ip, { start: now, count: 1 });
    else if (++entry.count > 10) return res.status(429).json({ code: "busy" });
    if (limits.size > 5000) limits.clear();
    const lang = req.body && req.body.lang === "en" ? "en" : "cs";
    const input = String((req.body && req.body.url) || "").trim().slice(0, 300);
    const key = `${lang}:${input.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")}`;
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return res.json(hit.data);
    try {
      const data = await Promise.race([
        runAudit(input, lang),
        new Promise((_, reject) => setTimeout(() => reject(new Error("unreachable")), 40000)),
      ]);
      cache.set(key, { at: now, data });
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      track(data.domain, data.score, true);
      res.json(data);
    } catch (error) {
      const code = ["bad_url", "not_found", "unreachable"].includes(error.message) ? error.message : "error";
      if (code === "error" && deps.logRouteError) deps.logRouteError("Audit run", error);
      track(input.replace(/^https?:\/\//, "").split("/")[0], null, false);
      res.status(code === "error" ? 500 : 400).json({ code });
    }
  });

  app.get("/stats/audit", async (req, res) => {
    const key = process.env.STATS_KEY || "";
    if (!key || String(req.query.key || "") !== key || !db) return res.status(404).send("Not found");
    try {
      await (ready || db.query(`CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), domain TEXT, score INTEGER, ok BOOLEAN)`));
      const rows = await db.query("SELECT domain, score, ok, created_at FROM audit_events ORDER BY created_at DESC LIMIT 100");
      res.json({ count: rows.rows.length, recent: rows.rows });
    } catch (error) { res.status(500).json({ code: "error" }); }
  });
}

module.exports = { register, runAudit, paths: Object.values(PAGE).map((p) => p.path) };
