// chatnelo.com home page: a cinematic scroll story ("02:47 – a customer asks,
// you sleep, Chatnelo answers, the customer buys"). Everything is vector/CSS,
// so it stays razor sharp on any screen (retina, 4K, 8K).

const STORY = {
  cs: {
    navDemo: "Ukázka", navPricing: "Ceník", navFaq: "Dotazy", navLogin: "Přihlásit se", navInstall: "Nainstalovat",
    kicker: "AI chatbot pro e-shopy", h1a: "Prodává,", h1b: "i když spíte.",
    heroSub: "Chatnelo odpovídá vašim zákazníkům 24/7 – podle skutečných produktů, cen a skladu. V jejich jazyce.",
    ctaTry: "Vyzkoušet na mém e-shopu", ctaShopify: "Nainstalovat na Shopify", scroll: "Scrollujte",
    c1: "Ve 2:47 v noci se zákazník ptá.", c2: "Vy spíte.", c2s: "Konkurence je o jedno kliknutí vedle.",
    c3: "Chatnelo ne.", c3s: "Odpověď za pár vteřin – přímo z vašeho skladu.",
    c4: "A zákazník nakoupí.", c4s: "Odpověď → karta produktu → košík → objednávka.",
    c5: "Každý dotaz.", c5b: "Každý jazyk.", c5s: "24 hodin denně. 7 dní v týdnu. Bez jediného zaměstnance navíc.",
    store: "Váš e-shop", online: "online", q: "Dobrý den, máte tuhle mikinu ve velikosti M?",
    a: "Ano! Velikost M je skladem 🙌 Mám ji rovnou přidat do košíku?", typing: "píše…",
    product: "Mikina Aurora", price: "1 290 Kč", stock: "Skladem", add: "Do košíku", toast: "Nová objednávka · 1 290 Kč",
    finalTitle: "Váš e-shop už nikdy nebude mlčet.", finalSub: "3 dny zdarma. Bez karty. Instalace za 5 minut.",
    other: "Jiný web? Registrace zdarma",
  },
  sk: {
    navDemo: "Ukážka", navPricing: "Cenník", navFaq: "Otázky", navLogin: "Prihlásiť sa", navInstall: "Nainštalovať",
    kicker: "AI chatbot pre e-shopy", h1a: "Predáva,", h1b: "aj keď spíte.",
    heroSub: "Chatnelo odpovedá vašim zákazníkom 24/7 – podľa skutočných produktov, cien a skladu. V ich jazyku.",
    ctaTry: "Vyskúšať na mojom e-shope", ctaShopify: "Nainštalovať na Shopify", scroll: "Scrollujte",
    c1: "O 2:47 v noci sa zákazník pýta.", c2: "Vy spíte.", c2s: "Konkurencia je o jedno kliknutie vedľa.",
    c3: "Chatnelo nie.", c3s: "Odpoveď za pár sekúnd – priamo z vášho skladu.",
    c4: "A zákazník nakúpi.", c4s: "Odpoveď → karta produktu → košík → objednávka.",
    c5: "Každá otázka.", c5b: "Každý jazyk.", c5s: "24 hodín denne. 7 dní v týždni. Bez jediného zamestnanca navyše.",
    store: "Váš e-shop", online: "online", q: "Dobrý deň, máte túto mikinu vo veľkosti M?",
    a: "Áno! Veľkosť M je skladom 🙌 Mám ju rovno pridať do košíka?", typing: "píše…",
    product: "Mikina Aurora", price: "52 €", stock: "Skladom", add: "Do košíka", toast: "Nová objednávka · 52 €",
    finalTitle: "Váš e-shop už nikdy nebude mlčať.", finalSub: "3 dni zdarma. Bez karty. Inštalácia za 5 minút.",
    other: "Iný web? Registrácia zdarma",
  },
  en: {
    navDemo: "Demo", navPricing: "Pricing", navFaq: "FAQ", navLogin: "Log in", navInstall: "Install",
    kicker: "AI chatbot for online stores", h1a: "It sells,", h1b: "while you sleep.",
    heroSub: "Chatnelo answers your customers 24/7 – from your real products, prices and stock. In their language.",
    ctaTry: "Try it on my store", ctaShopify: "Install on Shopify", scroll: "Scroll",
    c1: "2:47 AM. A customer asks.", c2: "You're asleep.", c2s: "Your competitor is one click away.",
    c3: "Chatnelo isn't.", c3s: "An answer in seconds – straight from your stock.",
    c4: "And the customer buys.", c4s: "Answer → product card → cart → order.",
    c5: "Every question.", c5b: "Every language.", c5s: "24 hours a day. 7 days a week. Zero extra staff.",
    store: "Your store", online: "online", q: "Hi, do you have this hoodie in size M?",
    a: "Yes! Size M is in stock 🙌 Shall I add it to your cart?", typing: "typing…",
    product: "Aurora Hoodie", price: "$54", stock: "In stock", add: "Add to cart", toast: "New order · $54",
    finalTitle: "Your store will never go silent again.", finalSub: "3 days free. No card. Set up in 5 minutes.",
    other: "Other website? Sign up free",
  },
  de: {
    navDemo: "Demo", navPricing: "Preise", navFaq: "FAQ", navLogin: "Anmelden", navInstall: "Installieren",
    kicker: "KI-Chatbot für Onlineshops", h1a: "Er verkauft,", h1b: "während Sie schlafen.",
    heroSub: "Chatnelo beantwortet Kundenfragen rund um die Uhr – aus Ihren echten Produkten, Preisen und Beständen. In ihrer Sprache.",
    ctaTry: "In meinem Shop testen", ctaShopify: "Auf Shopify installieren", scroll: "Scrollen",
    c1: "2:47 Uhr nachts. Ein Kunde fragt.", c2: "Sie schlafen.", c2s: "Die Konkurrenz ist nur einen Klick entfernt.",
    c3: "Chatnelo nicht.", c3s: "Eine Antwort in Sekunden – direkt aus Ihrem Lager.",
    c4: "Und der Kunde kauft.", c4s: "Antwort → Produktkarte → Warenkorb → Bestellung.",
    c5: "Jede Frage.", c5b: "Jede Sprache.", c5s: "24 Stunden am Tag. 7 Tage die Woche. Ohne zusätzliches Personal.",
    store: "Ihr Shop", online: "online", q: "Hallo, gibt es diesen Hoodie in Größe M?",
    a: "Ja! Größe M ist auf Lager 🙌 Soll ich ihn in den Warenkorb legen?", typing: "schreibt…",
    product: "Aurora Hoodie", price: "52 €", stock: "Auf Lager", add: "In den Warenkorb", toast: "Neue Bestellung · 52 €",
    finalTitle: "Ihr Shop wird nie wieder schweigen.", finalSub: "3 Tage gratis. Ohne Karte. Einrichtung in 5 Minuten.",
    other: "Andere Website? Gratis registrieren",
  },
  pl: {
    navDemo: "Demo", navPricing: "Cennik", navFaq: "FAQ", navLogin: "Zaloguj się", navInstall: "Zainstaluj",
    kicker: "Czatbot AI dla sklepów", h1a: "Sprzedaje,", h1b: "gdy Ty śpisz.",
    heroSub: "Chatnelo odpowiada Twoim klientom 24/7 – na podstawie prawdziwych produktów, cen i stanów. W ich języku.",
    ctaTry: "Wypróbuj na moim sklepie", ctaShopify: "Zainstaluj na Shopify", scroll: "Przewiń",
    c1: "2:47 w nocy. Klient pyta.", c2: "Ty śpisz.", c2s: "Konkurencja jest o jedno kliknięcie dalej.",
    c3: "Chatnelo nie.", c3s: "Odpowiedź w kilka sekund – prosto z Twojego magazynu.",
    c4: "I klient kupuje.", c4s: "Odpowiedź → karta produktu → koszyk → zamówienie.",
    c5: "Każde pytanie.", c5b: "Każdy język.", c5s: "24 godziny na dobę. 7 dni w tygodniu. Bez dodatkowych pracowników.",
    store: "Twój sklep", online: "online", q: "Dzień dobry, czy jest ta bluza w rozmiarze M?",
    a: "Tak! Rozmiar M jest dostępny 🙌 Dodać ją do koszyka?", typing: "pisze…",
    product: "Bluza Aurora", price: "219 zł", stock: "Dostępny", add: "Do koszyka", toast: "Nowe zamówienie · 219 zł",
    finalTitle: "Twój sklep już nigdy nie będzie milczał.", finalSub: "3 dni za darmo. Bez karty. Konfiguracja w 5 minut.",
    other: "Inna strona? Rejestracja za darmo",
  },
};

// Vector Chatnelo head – crisp at any size.
function mascotSvg(id) {
  return `<svg class="mascot" viewBox="0 0 240 240" aria-hidden="true">
  <defs>
    <radialGradient id="${id}h" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#3b3f7a"/><stop offset=".45" stop-color="#161936"/><stop offset="1" stop-color="#05060f"/></radialGradient>
    <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1230"/><stop offset="1" stop-color="#020412"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#c026d3"/></linearGradient>
    <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse class="orbit" cx="120" cy="96" rx="104" ry="30" fill="none" stroke="url(#${id}r)" stroke-width="2.5" stroke-dasharray="3 9" opacity=".75"/>
  <circle cx="50" cy="64" r="4" fill="#67e8f9" filter="url(#${id}g)"/><circle cx="196" cy="72" r="5" fill="#e879f9" filter="url(#${id}g)"/>
  <rect x="22" y="100" width="22" height="58" rx="11" fill="#1e2152" stroke="url(#${id}r)" stroke-width="3" filter="url(#${id}g)"/>
  <rect x="196" y="100" width="22" height="58" rx="11" fill="#1e2152" stroke="url(#${id}r)" stroke-width="3" filter="url(#${id}g)"/>
  <circle cx="120" cy="128" r="84" fill="url(#${id}h)"/>
  <path d="M62 86 Q120 40 178 86" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="7" stroke-linecap="round"/>
  <rect x="58" y="104" width="124" height="68" rx="34" fill="url(#${id}v)" stroke="url(#${id}r)" stroke-width="2.5"/>
  <g class="eyes" filter="url(#${id}g)">
    <rect x="80" y="122" width="34" height="24" rx="8" fill="#22d3ee"/>
    <circle cx="90" cy="134" r="2.6" fill="#0b1230"/><circle cx="97" cy="134" r="2.6" fill="#0b1230"/><circle cx="104" cy="134" r="2.6" fill="#0b1230"/>
    <path d="M86 146 l-4 8 10-6z" fill="#22d3ee"/>
    <path class="wink" d="M130 136 q12 -12 24 0" fill="none" stroke="#f472b6" stroke-width="6" stroke-linecap="round"/>
  </g>
  <path d="M104 160 q16 10 32 0" fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round" filter="url(#${id}g)"/>
</svg>`;
}

function hoodieSvg() {
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><defs>
    <linearGradient id="hd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset=".5" stop-color="#4f46e5"/><stop offset="1" stop-color="#0891b2"/></linearGradient>
    <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="M70 34 Q100 18 130 34 L166 52 Q182 60 184 78 L188 150 Q188 160 178 160 L164 160 L162 96 L160 176 Q160 184 152 184 L48 184 Q40 184 40 176 L38 96 L36 160 L22 160 Q12 160 12 150 L16 78 Q18 60 34 52 Z" fill="url(#hd)"/>
    <path d="M70 34 Q100 70 130 34 Q118 64 100 66 Q82 64 70 34Z" fill="#1e1b4b" opacity=".55"/>
    <path d="M70 120 h60 v26 q0 8 -8 8 h-44 q-8 0 -8 -8z" fill="#000" opacity=".16"/>
    <path d="M94 70 v28 M106 70 v24" stroke="#e0e7ff" stroke-width="3" stroke-linecap="round"/>
    <path d="M70 34 Q100 18 130 34 L166 52 Q120 46 100 60 Q80 46 34 52 Z" fill="url(#hs)"/>
  </svg>`;
}

function renderLanding({ stepsHtml, pricingHtml, faqHtml, tryHtml, calcHtml, footerHtml, headExtra, assetVersion }) {
  const story = JSON.stringify(STORY).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  ${headExtra}
  <style>
    :root{--bg:#04050d;--ink:#f8fafc;--mut:#a5b0c8;--c1:#22d3ee;--c2:#a855f7;--c3:#f472b6;--line:rgba(255,255,255,.1)}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
    body{margin:0;background:var(--bg);color:var(--ink);font-family:"SF Pro Display",-apple-system,"Segoe UI Variable Display","Segoe UI",Inter,Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
    a{color:inherit}
    .serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;font-style:italic;font-weight:400}
    .grad{background:linear-gradient(100deg,var(--c1),var(--c2) 55%,var(--c3));-webkit-background-clip:text;background-clip:text;color:transparent}
    .grain{position:fixed;inset:-50%;z-index:1;pointer-events:none;opacity:.06;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");animation:grain 1.2s steps(6) infinite}
    @keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}100%{transform:translate(1%,3%)}}
    .aurora{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(60vw 50vh at calc(20% + var(--mx,0)*6%) calc(15% + var(--my,0)*6%),rgba(34,211,238,.18),transparent 60%),radial-gradient(55vw 55vh at calc(85% - var(--mx,0)*6%) 25%,rgba(168,85,247,.24),transparent 60%),radial-gradient(70vw 60vh at 50% 110%,rgba(244,114,182,.12),transparent 60%)}
    nav.top{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,4vw,48px);transition:background .3s,backdrop-filter .3s,border-color .3s;border-bottom:1px solid transparent}
    nav.top.solid{background:rgba(4,5,13,.62);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border-color:var(--line)}
    .brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800;font-size:1.12rem;letter-spacing:-.01em}
    .brand .mascot{width:38px;height:38px}
    nav .links{display:flex;align-items:center;gap:clamp(10px,2vw,26px);font-size:.93rem;color:var(--mut)}
    nav .links a{text-decoration:none;transition:color .2s}
    nav .links a:hover{color:#fff}
    .pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.06);color:#fff;text-decoration:none;font-weight:700;font-size:.93rem;cursor:pointer;transition:transform .2s,background .2s,box-shadow .2s;white-space:nowrap}
    .pill:hover{transform:translateY(-1px);background:rgba(255,255,255,.12)}
    .pill.glow{border:none;background:linear-gradient(110deg,var(--c1),var(--c2) 60%,var(--c3));box-shadow:0 10px 40px -10px rgba(168,85,247,.9),inset 0 1px 0 rgba(255,255,255,.35)}
    .pill.big{padding:16px 26px;font-size:1.02rem}
    #chatnelo-lang-switcher{position:relative}
    #chatnelo-lang-current{font-size:1.1rem;line-height:1;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:999px;padding:8px 11px;cursor:pointer;color:#fff}
    #chatnelo-lang-dropdown{display:none;position:absolute;top:calc(100% + 8px);right:0;background:#0b0d1d;border:1px solid var(--line);border-radius:14px;padding:6px;flex-direction:column;gap:4px;z-index:60}
    #chatnelo-lang-dropdown.open{display:flex}
    .chatnelo-lang-option{font-size:1.15rem;background:none;border:none;border-radius:8px;padding:6px 10px;cursor:pointer}
    .chatnelo-lang-option:hover{background:rgba(255,255,255,.1)}
    main,header,footer{position:relative;z-index:2}
    /* HERO */
    .hero{min-height:100svh;display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:4vw;padding:110px clamp(18px,6vw,90px) 60px}
    .kicker{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--mut);font-size:.85rem;font-weight:600;letter-spacing:.02em}
    .kicker i{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.18);animation:pulse 2s infinite}
    @keyframes pulse{50%{box-shadow:0 0 0 9px rgba(52,211,153,0)}}
    .hero h1{margin:22px 0 18px;font-size:clamp(3rem,8.4vw,8.6rem);line-height:.92;letter-spacing:-.045em;font-weight:900}
    .hero h1 .serif{display:block;font-size:.92em;letter-spacing:-.02em;padding-right:.1em}
    .hero p.sub{max-width:560px;margin:0 0 30px;font-size:clamp(1.05rem,1.5vw,1.25rem);line-height:1.55;color:var(--mut)}
    .ctas{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .ctas .alt{color:var(--mut);font-size:.9rem;margin-left:4px}
    .hero-art{position:relative;aspect-ratio:1;max-width:620px;width:100%;justify-self:center}
    .hero-art .halo{position:absolute;inset:8%;border-radius:50%;background:conic-gradient(from 0deg,var(--c1),var(--c2),var(--c3),var(--c1));filter:blur(70px);opacity:.45;animation:spin 14s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .hero-art .ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.08)}
    .hero-art .ring.r2{inset:12%}.hero-art .ring.r3{inset:24%;border-style:dashed;animation:spin 40s linear infinite reverse}
    .hero-art .mascot{position:absolute;inset:14%;width:72%;height:72%;filter:drop-shadow(0 40px 60px rgba(124,58,237,.55));transform:translate3d(calc(var(--mx,0)*14px),calc(var(--my,0)*14px + var(--float,0px)),0) rotate(calc(var(--mx,0)*4deg));transition:transform .2s ease-out}
    .mascot .orbit{transform-origin:120px 96px;animation:orbit 6s linear infinite}
    @keyframes orbit{to{stroke-dashoffset:-120}}
    .mascot .wink{animation:wink 5s infinite;transform-origin:142px 132px}
    @keyframes wink{0%,88%,100%{transform:scaleY(1)}93%{transform:scaleY(.2)}}
    .bubble-f{position:absolute;padding:10px 14px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid var(--line);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-weight:600;font-size:.92rem;white-space:nowrap;animation:bob 6s ease-in-out infinite}
    .bubble-f.b1{top:8%;left:-4%}.bubble-f.b2{top:22%;right:-6%;animation-delay:-2s}.bubble-f.b3{bottom:12%;left:2%;animation-delay:-4s}.bubble-f.b4{bottom:4%;right:6%;animation-delay:-1s}
    @keyframes bob{50%{transform:translateY(-12px)}}
    .scrollhint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);color:var(--mut);font-size:.78rem;letter-spacing:.2em;text-transform:uppercase;display:flex;flex-direction:column;align-items:center;gap:8px}
    .scrollhint b{width:22px;height:36px;border:2px solid rgba(255,255,255,.3);border-radius:12px;position:relative}
    .scrollhint b::after{content:"";position:absolute;left:50%;top:7px;width:3px;height:7px;border-radius:2px;background:#fff;transform:translateX(-50%);animation:wheel 1.6s infinite}
    @keyframes wheel{to{transform:translate(-50%,12px);opacity:0}}
    /* STORY */
    .story{position:relative;height:620vh}
    .stage{position:sticky;top:0;height:100svh;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:4vw;padding:80px clamp(18px,6vw,90px) 40px}
    .clock{position:absolute;left:clamp(18px,6vw,90px);top:96px;font-variant-numeric:tabular-nums;font-weight:900;font-size:clamp(4rem,14vw,13rem);letter-spacing:-.05em;line-height:1;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.14);opacity:var(--clockO,1);transform:translateY(calc(var(--clockY,0)*1px))}
    .chapters{position:relative;height:60vh;min-height:320px}
    .chap{position:absolute;inset:auto 0 0 0;top:50%;transform:translateY(-50%);opacity:0;visibility:hidden;transition:opacity .45s,visibility .45s}
    .chap.on{opacity:1;visibility:visible}
    .chap .gw .w{background:linear-gradient(100deg,var(--c1),var(--c2) 55%,var(--c3));-webkit-background-clip:text;background-clip:text;color:transparent}
    .chap h2{margin:0;font-size:clamp(2.4rem,5.8vw,6rem);line-height:.98;letter-spacing:-.04em;font-weight:900}
    .chap h2 .serif{font-weight:400}
    .chap p{margin:18px 0 0;max-width:480px;font-size:clamp(1rem,1.4vw,1.2rem);color:var(--mut);line-height:1.5}
    .chap .w{display:inline-block;opacity:0;transform:translateY(.6em) rotate(2deg);filter:blur(8px);transition:opacity .6s,transform .7s cubic-bezier(.2,.8,.2,1),filter .6s}
    .chap.on .w{opacity:1;transform:none;filter:none}
    .chap p{opacity:0;transform:translateY(14px);transition:opacity .6s .25s,transform .6s .25s}
    .chap.on p{opacity:1;transform:none}
    .progress{position:absolute;left:clamp(18px,6vw,90px);bottom:34px;display:flex;align-items:center;gap:14px;color:var(--mut);font-size:.82rem;font-variant-numeric:tabular-nums;letter-spacing:.12em}
    .progress .bar{width:160px;height:2px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}
    .progress .bar i{display:block;height:100%;width:calc(var(--p,0)*100%);background:linear-gradient(90deg,var(--c1),var(--c2),var(--c3))}
    /* phone */
    .device{justify-self:center;position:relative;width:min(360px,80vw,calc((100svh - 130px) / 2.06));aspect-ratio:9/18.5;transform:perspective(1400px) rotateY(calc(-12deg + var(--p,0)*12deg)) rotateX(calc(6deg - var(--p,0)*6deg)) scale(var(--ds,1));transform-style:preserve-3d;transition:transform .15s linear}
    .device::before{content:"";position:absolute;inset:-14%;background:radial-gradient(closest-side,rgba(168,85,247,.4),transparent);filter:blur(30px);z-index:-1}
    .phone{position:absolute;inset:0;border-radius:54px;padding:12px;background:linear-gradient(145deg,#2a2d4a,#0b0c18 40%,#1b1d33);box-shadow:0 0 0 1.5px rgba(255,255,255,.12) inset,0 60px 120px -40px rgba(0,0,0,.9),0 30px 60px -30px rgba(124,58,237,.6)}
    .screen{position:relative;width:100%;height:100%;border-radius:43px;overflow:hidden;background:linear-gradient(180deg,#0b0e22,#05060f);display:flex;flex-direction:column}
    .notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:34%;height:26px;border-radius:20px;background:#000;z-index:5}
    .sbar{display:flex;justify-content:space-between;padding:16px 26px 6px;font-size:.8rem;font-weight:700;font-variant-numeric:tabular-nums}
    .shop{padding:8px 16px 0;opacity:calc(1 - var(--dim,0)*.65);transition:opacity .3s}
    .shop .sk{height:9px;border-radius:5px;background:rgba(255,255,255,.08);margin:8px 0}
    .shop .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
    .shop .grid div{aspect-ratio:1;border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.02))}
    .moon{position:absolute;top:58px;right:22px;font-size:1.4rem;opacity:var(--moon,0);transition:opacity .4s}
    .zzz{position:absolute;top:50px;right:52px;font-weight:800;color:var(--mut);opacity:var(--moon,0);animation:zz 2.4s infinite}
    @keyframes zz{50%{transform:translate(-6px,-8px)}}
    .chatwin{position:absolute;left:10px;right:10px;bottom:10px;border-radius:30px;background:rgba(15,17,38,.9);border:1px solid var(--line);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);padding:12px;display:flex;flex-direction:column;gap:9px;transform:translateY(calc((1 - var(--chatIn,0))*110%));transition:transform .5s cubic-bezier(.2,.8,.2,1)}
    .chead{display:flex;align-items:center;gap:9px;padding:2px 4px 6px;border-bottom:1px solid var(--line)}
    .chead .mascot{width:34px;height:34px}
    .chead b{display:block;font-size:.9rem}.chead span{font-size:.72rem;color:#34d399}
    .msg{max-width:86%;padding:9px 12px;border-radius:16px;font-size:.86rem;line-height:1.4}
    .msg.me{align-self:flex-end;background:linear-gradient(120deg,var(--c1),var(--c2));color:#fff;border-bottom-right-radius:5px}
    .msg.bot{align-self:flex-start;background:rgba(255,255,255,.08);border-bottom-left-radius:5px}
    .msg.typing{color:var(--mut);font-style:italic}
    .caret::after{content:"▍";animation:blink 1s steps(2) infinite;margin-left:1px;color:#fff}
    @keyframes blink{50%{opacity:0}}
    .pcard{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;padding:9px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid var(--line);transform:translateY(calc((1 - var(--cardIn,0))*30px)) scale(calc(.9 + var(--cardIn,0)*.1));opacity:var(--cardIn,0)}
    .pcard .img{flex:none;width:52px;height:52px;border-radius:14px;background:radial-gradient(circle at 30% 20%,#312e81,#0b0d1d);display:grid;place-items:center}
    .pcard .img svg{width:44px;height:44px}
    .pcard b{display:block;font-size:.88rem}
    .pcard .meta{display:flex;gap:8px;align-items:center;margin-top:3px;font-size:.78rem;white-space:nowrap}
    .pcard>div:nth-child(2){flex:1;min-width:0}
    .pcard .price{font-weight:800}
    .pcard .stock{color:#34d399;font-weight:700}
    .pcard button{flex:1 0 100%;border:none;border-radius:12px;padding:9px 10px;font-weight:800;font-size:.74rem;color:#fff;background:linear-gradient(120deg,var(--c1),var(--c2));transform:scale(calc(1 - var(--press,0)*.12));box-shadow:0 0 0 calc(var(--press,0)*8px) rgba(168,85,247,calc(.35 - var(--press,0)*.35))}
    .cart{position:absolute;top:56px;left:20px;display:flex;align-items:center;gap:6px;font-weight:800;font-size:.8rem}
    .cart i{display:grid;place-items:center;min-width:20px;height:20px;border-radius:10px;font-style:normal;background:var(--c3);color:#fff;font-size:.72rem;transform:scale(var(--cartPop,1))}
    .toast{position:absolute;left:50%;top:92px;transform:translate(-50%,calc((1 - var(--toast,0))*-30px));opacity:var(--toast,0);white-space:nowrap;padding:9px 14px;border-radius:999px;background:rgba(16,185,129,.16);border:1px solid rgba(52,211,153,.5);color:#a7f3d0;font-weight:800;font-size:.8rem;z-index:6}
    .langs{position:absolute;inset:0;pointer-events:none;opacity:var(--langs,0)}
    .langs span{position:absolute;padding:9px 14px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid var(--line);font-weight:700;font-size:clamp(.8rem,1.1vw,1rem);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transform:translate(calc(var(--lx)*var(--langs,0)*1px),calc(var(--ly)*var(--langs,0)*1px))}
    canvas#confetti{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7}
    /* CONTENT */
    .wrap{max-width:1120px;margin:0 auto;padding:0 clamp(18px,4vw,40px)}
    section.blk{padding:clamp(60px,9vw,120px) 0}
    .eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--c1);margin-bottom:12px}
    h2.big{margin:0 0 18px;font-size:clamp(2.2rem,5vw,4.4rem);line-height:1;letter-spacing:-.04em;font-weight:900}
    p.lead{margin:0 0 34px;color:var(--mut);font-size:1.12rem;max-width:640px;line-height:1.55}
    ol.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
    ol.steps li{padding:24px;border-radius:24px;background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid var(--line)}
    .step-number{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,var(--c1),var(--c2));font-weight:900;margin-bottom:14px}
    ol.steps h3{margin:0 0 8px;font-size:1.12rem}
    ol.steps p{margin:0;color:var(--mut);line-height:1.55;font-size:.95rem}
    table{width:100%;border-collapse:separate;border-spacing:0;border-radius:22px;overflow:hidden;border:1px solid var(--line);background:rgba(255,255,255,.03)}
    th,td{padding:16px 20px;text-align:left;border-bottom:1px solid var(--line)}
    tr:last-child td{border-bottom:none}
    th{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);background:rgba(255,255,255,.04)}
    td:first-child{font-weight:800}
    tbody tr:hover td{background:rgba(168,85,247,.08)}
    details{border:1px solid var(--line);border-radius:18px;padding:18px 22px;margin-bottom:10px;background:rgba(255,255,255,.03);transition:background .2s}
    details[open]{background:rgba(255,255,255,.06)}
    summary{cursor:pointer;font-weight:700;font-size:1.04rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
    summary::after{content:"+";color:var(--c1);font-size:1.4rem;line-height:1}
    details[open] summary::after{content:"–"}
    details p{margin:12px 0 0;color:var(--mut);line-height:1.6}
    #marketing-chat{border-radius:24px;padding:20px;background:rgba(255,255,255,.04);border:1px solid var(--line)}
    #marketing-chat-log{min-height:120px;max-height:340px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:10px}
    #marketing-chat .msg.user{align-self:flex-end;background:linear-gradient(120deg,var(--c1),var(--c2));color:#fff;max-width:80%;padding:10px 14px;border-radius:16px}
    #marketing-chat .msg.assistant{align-self:flex-start;background:rgba(255,255,255,.08);max-width:80%;padding:10px 14px;border-radius:16px;white-space:pre-wrap}
    #marketing-chat-form{display:flex;gap:8px}
    #marketing-chat-input{flex:1;padding:14px 16px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:#fff;font:inherit}
    #marketing-chat-form button{border:none;border-radius:999px;padding:0 22px;font-weight:800;color:#fff;background:linear-gradient(120deg,var(--c1),var(--c2));cursor:pointer}
    #cn-try,#cn-calc{color:#0f172a}
    .final{text-align:center;padding:clamp(80px,12vw,160px) 0}
    .final h2{font-size:clamp(2.6rem,7vw,6.6rem);line-height:.95;letter-spacing:-.045em;margin:0 0 20px;font-weight:900}
    .final .mascot{width:120px;height:120px;margin-bottom:10px;filter:drop-shadow(0 20px 40px rgba(124,58,237,.6))}
    .final .ctas{justify-content:center}
    footer{border-top:1px solid var(--line);padding:30px 18px 40px;text-align:center;color:var(--mut);font-size:.88rem}
    footer a{color:var(--mut)}
    .reveal{opacity:0;transform:translateY(40px);transition:opacity .9s,transform .9s cubic-bezier(.2,.8,.2,1)}
    .reveal.in{opacity:1;transform:none}
    @media (max-width:900px){
      nav .links a.hide-m{display:none}
      .hero{grid-template-columns:1fr;padding:84px 20px 70px;gap:0;min-height:auto}
      .hero-art{max-width:250px;order:-1;margin:0 auto 6px}
      .bubble-f{display:none}
      .hero h1{font-size:clamp(2.9rem,14vw,4.4rem);margin:14px 0 14px}
      .hero p.sub{font-size:1.02rem;margin-bottom:22px}
      .ctas{flex-direction:column;align-items:stretch}
      .ctas .pill{width:100%}
      .scrollhint{display:none}
      .story{height:480vh}
      .stage{display:flex;flex-direction:column;align-items:stretch;gap:0;padding:68px 16px 16px}
      .stage>div:not(.device):not(.clock):not(.langs):not(.progress){width:100%}
      .clock{top:58px;left:16px;font-size:30vw;opacity:calc(var(--clockO,1)*.5)}
      .chapters{flex:none;height:27svh;min-height:150px}
      .chap h2{font-size:clamp(2.1rem,10.5vw,3.1rem)}
      .chap p{font-size:.95rem;margin-top:8px}
      .device{flex:1;width:100%;max-width:420px;aspect-ratio:auto;margin:0 auto;transform:none}
      .device::before{inset:10%}
      .phone{padding:0;background:none;box-shadow:none;border-radius:0}
      .screen{background:none;border-radius:0;overflow:visible}
      .notch,.sbar,.shop,.zzz{display:none}
      .moon{top:8px;right:8px}
      .cart{top:6px;left:6px}
      .toast{top:4px}
      .chatwin{left:0;right:0;bottom:30px;border-radius:26px}
      .langs{display:none}
      .progress{bottom:10px;left:16px}
      .progress .bar{width:110px}
      section.blk{padding:64px 0}
      ol.steps li{padding:20px}
      th,td{padding:12px 12px;font-size:.88rem}
    }
    @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.grain{display:none}}
  </style>
</head>
<body>
  <div class="aurora" id="aurora"></div>
  <div class="grain"></div>
  <nav class="top" id="nav">
    <a class="brand" href="/">${mascotSvg("nv")}Chatnelo</a>
    <div class="links">
      <a class="hide-m" href="#cn-try" data-s="navDemo"></a>
      <a class="hide-m" href="#pricing" data-s="navPricing"></a>
      <a class="hide-m" href="#faq" data-s="navFaq"></a>
      <a href="/store/dashboard#login" data-s="navLogin"></a>
      <div id="chatnelo-lang-switcher"></div>
    </div>
  </nav>

  <header class="hero">
    <div>
      <span class="kicker"><i></i><span data-s="kicker"></span></span>
      <h1><span data-s="h1a"></span><span class="serif grad" data-s="h1b"></span></h1>
      <p class="sub" data-s="heroSub"></p>
      <div class="ctas">
        <a class="pill glow big" href="#cn-try" data-s="ctaTry"></a>
        <a class="pill big" href="https://apps.shopify.com/chatnelo" target="_blank" rel="noopener" data-s="ctaShopify"></a>
      </div>
    </div>
    <div class="hero-art" id="heroArt">
      <div class="halo"></div><div class="ring"></div><div class="ring r2"></div><div class="ring r3"></div>
      ${mascotSvg("hr")}
      <span class="bubble-f b1">Dobrý den 👋</span><span class="bubble-f b2">Hello! 🛍️</span><span class="bubble-f b3">Hallo 💬</span><span class="bubble-f b4">Dzień dobry ✨</span>
    </div>
    <div class="scrollhint"><b></b><span data-s="scroll"></span></div>
  </header>

  <section class="story" id="story">
    <div class="stage" id="stage">
      <div class="clock" id="clock">02:47</div>
      <div>
        <div class="chapters">
          <div class="chap" data-c="0"><h2 data-split="c1"></h2></div>
          <div class="chap" data-c="1"><h2 data-split="c2"></h2><p data-s="c2s"></p></div>
          <div class="chap" data-c="2"><h2 data-split="c3" class="gw"></h2><p data-s="c3s"></p></div>
          <div class="chap" data-c="3"><h2 data-split="c4"></h2><p data-s="c4s"></p></div>
          <div class="chap" data-c="4"><h2><span data-split="c5"></span><br><span class="serif gw" data-split="c5b"></span></h2><p data-s="c5s"></p></div>
        </div>
      </div>
      <div class="device" id="device">
        <div class="phone"><div class="screen">
          <div class="notch"></div>
          <div class="sbar"><span id="ptime">02:47</span><span>●●● 5G</span></div>
          <div class="cart">🛒 <i id="cartN">0</i></div>
          <div class="moon">🌙</div><div class="zzz">z z</div>
          <div class="toast" data-s="toast"></div>
          <div class="shop"><div class="sk" style="width:46%"></div><div class="sk" style="width:70%"></div><div class="grid"><div></div><div></div><div></div><div></div></div></div>
          <div class="chatwin">
            <div class="chead">${mascotSvg("ph")}<div><b>Chatnelo</b><span data-s="online"></span></div></div>
            <div class="msg me" id="qMsg"></div>
            <div class="msg bot typing" id="tMsg" data-s="typing"></div>
            <div class="msg bot" id="aMsg"></div>
            <div class="pcard"><div class="img">${hoodieSvg()}</div><div><b data-s="product"></b><div class="meta"><span class="price" data-s="price"></span><span class="stock">● <span data-s="stock"></span></span></div></div><button type="button" data-s="add"></button></div>
          </div>
          <canvas id="confetti"></canvas>
        </div></div>
      </div>
      <div class="langs" id="langs">
        <span style="left:52%;top:20%;--lx:-21;--ly:-10">Dobrý den 👋</span><span style="right:7%;top:16%;--lx:17;--ly:-15">Hello 🇬🇧</span>
        <span style="left:50%;bottom:30%;--lx:-21;--ly:10">Hallo 🇩🇪</span><span style="right:6%;bottom:24%;--lx:17;--ly:15">Dzień dobry 🇵🇱</span>
        <span style="left:58%;top:6%;--lx:-3;--ly:-20">Bonjour 🇫🇷</span><span style="right:8%;bottom:6%;--lx:10;--ly:25">Ciao 🇮🇹</span>
        <span style="right:5%;top:46%;--lx:21;--ly:0">Hola 🇪🇸</span>
      </div>
      <div class="progress"><span id="chapN">01 / 05</span><span class="bar"><i></i></span></div>
    </div>
  </section>

  <main>
    <div class="wrap" style="padding-top:clamp(40px,6vw,80px)">${tryHtml}</div>
    <section class="blk"><div class="wrap reveal">
      <div class="eyebrow">01</div>
      <h2 class="big" data-i18n="marketing.stepsHeading">Jak to funguje</h2>
      <ol class="steps">${stepsHtml}</ol>
    </div></section>
    <div class="wrap reveal">${calcHtml}</div>
    <section class="blk" id="pricing"><div class="wrap reveal">
      <div class="eyebrow">02</div>
      <h2 class="big" data-i18n="marketing.pricingHeading">Ceník</h2>
      <p class="lead" data-i18n="marketing.pricingIntro"></p>
      <table>
        <thead><tr><th data-i18n="marketing.thPlan">Tarif</th><th data-i18n="marketing.thLimit">Případů / měsíc</th><th data-i18n="marketing.thPrice">Cena / měsíc</th></tr></thead>
        <tbody>${pricingHtml}</tbody>
      </table>
    </div></section>
    <section class="blk" id="faq"><div class="wrap reveal">
      <div class="eyebrow">03</div>
      <h2 class="big" data-i18n="marketing.faqHeading">Časté dotazy</h2>
      ${faqHtml}
    </div></section>
    <section class="final"><div class="wrap reveal">
      ${mascotSvg("fn")}
      <h2><span data-s="finalTitle"></span></h2>
      <p class="lead" style="margin:0 auto 30px" data-s="finalSub"></p>
      <div class="ctas">
        <a class="pill glow big" href="https://apps.shopify.com/chatnelo" target="_blank" rel="noopener" data-s="ctaShopify"></a>
        <a class="pill big" href="/store/dashboard" data-s="other"></a>
      </div>
    </div></section>
  </main>
  <footer>${footerHtml}</footer>

  <script src="/i18n.js?v=${assetVersion}"></script>
  <script>(function (extra) { var all = window.CHATNELO_I18N || {}; Object.keys(extra).forEach(function (code) { if (all[code] && all[code].marketing) all[code].marketing.loginLink = extra[code]; }); })({ cs: "Přihlásit se", en: "Log in", sk: "Prihlásiť sa", de: "Anmelden", pl: "Zaloguj się" });</script>
  <script>
  (function () {
    var S = ${story};
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function $(id) { return document.getElementById(id); }
    function T() { return S[window.CHATNELO_LANG] || S[(document.documentElement.lang || "cs").slice(0, 2)] || S.en; }
    function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
    function texts() {
      var t = T(), n = document.querySelectorAll("[data-s]");
      for (var i = 0; i < n.length; i++) n[i].textContent = t[n[i].getAttribute("data-s")];
      var sp = document.querySelectorAll("[data-split]");
      for (var j = 0; j < sp.length; j++) {
        sp[j].innerHTML = t[sp[j].getAttribute("data-split")].split(" ").map(function (w, k) {
          return '<span class="w" style="transition-delay:' + (k * 70) + 'ms">' + esc(w) + "</span>";
        }).join(" ");
      }
      last = -1; frame();
    }
    document.addEventListener("chatnelo:langchange", texts);

    // pointer parallax
    var root = document.documentElement;
    window.addEventListener("pointermove", function (e) {
      root.style.setProperty("--mx", (e.clientX / innerWidth - .5).toFixed(3));
      root.style.setProperty("--my", (e.clientY / innerHeight - .5).toFixed(3));
    }, { passive: true });

    // confetti
    var cv = $("confetti"), cx = cv.getContext("2d"), parts = [], fired = false;
    function burst() {
      var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = r.width * dpr; cv.height = r.height * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var colors = ["#22d3ee", "#a855f7", "#f472b6", "#34d399", "#fde047"];
      parts = [];
      for (var i = 0; i < 90; i++) parts.push({ x: r.width / 2, y: r.height * .2, vx: (Math.random() - .5) * 9, vy: Math.random() * -7 - 2, s: Math.random() * 6 + 3, c: colors[i % 5], r: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 0 });
      (function tick() {
        cx.clearRect(0, 0, r.width, r.height);
        parts.forEach(function (p) { p.vy += .22; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = Math.max(0, 1 - p.life / 110); cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); });
        parts = parts.filter(function (p) { return p.life < 110; });
        if (parts.length) requestAnimationFrame(tick); else cx.clearRect(0, 0, r.width, r.height);
      })();
    }

    // scroll story
    var story = $("story"), stage = $("stage"), chaps = document.querySelectorAll(".chap"), last = -1;
    function clamp(v) { return Math.max(0, Math.min(1, v)); }
    function seg(p, a, b) { return clamp((p - a) / (b - a)); }
    function frame() {
      var r = story.getBoundingClientRect();
      var total = story.offsetHeight - innerHeight;
      var p = reduce ? 1 : clamp(-r.top / total);
      var t = T();
      var s = stage.style;
      s.setProperty("--p", p.toFixed(4));
      var c = p < .18 ? 0 : p < .36 ? 1 : p < .56 ? 2 : p < .78 ? 3 : 4;
      if (c !== last) { for (var i = 0; i < chaps.length; i++) chaps[i].classList.toggle("on", i === c); $("chapN").textContent = "0" + (c + 1) + " / 05"; last = c; }
      // chat in + question typing
      s.setProperty("--chatIn", seg(p, .02, .08).toFixed(3));
      var q = t.q, qn = Math.round(seg(p, .06, .17) * q.length);
      $("qMsg").textContent = q.slice(0, qn); $("qMsg").className = "msg me" + (qn < q.length ? " caret" : ""); $("qMsg").style.display = qn ? "" : "none";
      // night
      var night = seg(p, .2, .26) * (1 - seg(p, .36, .42));
      s.setProperty("--moon", night.toFixed(3)); s.setProperty("--dim", night.toFixed(3));
      $("tMsg").style.display = p > .3 && p < .42 ? "" : "none";
      // answer typing
      var a = t.a, an = Math.round(seg(p, .4, .52) * a.length);
      $("aMsg").textContent = a.slice(0, an); $("aMsg").className = "msg bot" + (an && an < a.length ? " caret" : ""); $("aMsg").style.display = an ? "" : "none";
      s.setProperty("--cardIn", seg(p, .5, .58).toFixed(3));
      var press = seg(p, .62, .66) * (1 - seg(p, .66, .7));
      s.setProperty("--press", press.toFixed(3));
      var bought = p > .67;
      $("cartN").textContent = bought ? "1" : "0";
      s.setProperty("--cartPop", (1 + seg(p, .67, .69) * (1 - seg(p, .69, .73)) * .6).toFixed(3));
      s.setProperty("--toast", (seg(p, .68, .72) * (1 - seg(p, .8, .84))).toFixed(3));
      if (bought && !fired && !reduce) { fired = true; burst(); }
      if (!bought) fired = false;
      // finale
      s.setProperty("--langs", seg(p, .8, .9).toFixed(3));
      s.setProperty("--ds", (1 - seg(p, .8, .92) * .12).toFixed(3));
      s.setProperty("--clockO", (1 - seg(p, .14, .2) + seg(p, .2, .26) * (1 - seg(p, .36, .42)) * .8).toFixed(3));
      var mins = 47 + Math.floor(seg(p, .4, 1) * 3);
      $("clock").textContent = "02:" + (mins < 10 ? "0" : "") + mins; $("ptime").textContent = $("clock").textContent;
      // nav + aurora
      $("nav").classList.toggle("solid", scrollY > 30);
      var hero = $("heroArt"); if (hero && !reduce) hero.style.setProperty("--float", (Math.sin(Date.now() / 900) * 8).toFixed(1) + "px");
    }
    var ticking = false;
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; frame(); }); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (!reduce) (function floatLoop() { var h = $("heroArt"); if (h) h.style.setProperty("--float", (Math.sin(Date.now() / 900) * 8).toFixed(1) + "px"); requestAnimationFrame(floatLoop); })();

    // reveal on scroll
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 }) : null;
    document.querySelectorAll(".reveal").forEach(function (el) { if (io && !reduce) io.observe(el); else el.classList.add("in"); });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", texts); else texts();
    var jump = /[#&]p=([0-9.]+)/.exec(location.hash);
    if (jump) setTimeout(function () { scrollTo(0, story.offsetTop + (story.offsetHeight - innerHeight) * parseFloat(jump[1])); }, 300);
  })();
  </script>
</body>
</html>`;
}

module.exports = { renderLanding };
