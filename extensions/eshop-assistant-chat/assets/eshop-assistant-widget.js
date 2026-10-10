(function () {
  if (window.__ESHOP_ASSISTANT_LOADED__) return;
  window.__ESHOP_ASSISTANT_LOADED__ = true;

  var MASCOT_URL = "https://chatbot-production-6b09.up.railway.app/mascot.png";
  var CONFIG = window.ESHOP_ASSISTANT_CONFIG || {};

  // ---------------------------------------------------------------- texts
  // UI strings follow the storefront language (<html lang>), English fallback.
  var UI = {
    cs: {
      title: "Zeptejte se nás",
      greeting: "Dobrý den, jsem asistent tohoto e-shopu. Zeptejte se na produkty nebo jejich dostupnost.",
      status: "Odpovídáme hned",
      open: "Otevřít chat", close: "Zavřít chat", newChat: "Nový chat", newChatAria: "Založit nový chat",
      confirmReset: "Klikněte znovu pro potvrzení", confirmResetAria: "Opravdu smazat historii? Klikněte znovu pro potvrzení",
      placeholder: "Napište zprávu…", message: "Zpráva", send: "Odeslat", sending: "Odesílám", typing: "Asistent píše odpověď",
      offline: "Chatbot právě neodpovídá. Zkuste to prosím za chvíli.", incomplete: "Chatbot vrátil neúplnou odpověď.",
      busy: "Příliš mnoho dotazů, zkuste to prosím za chvíli znovu.", generic: "Omlouvám se, nastala chyba.",
      view: "Zobrazit produkt", soldOut: "Vyprodáno",
    },
    sk: {
      title: "Opýtajte sa nás",
      greeting: "Dobrý deň, som asistent tohto e-shopu. Opýtajte sa na produkty alebo ich dostupnosť.",
      status: "Odpovedáme hneď",
      open: "Otvoriť chat", close: "Zavrieť chat", newChat: "Nový chat", newChatAria: "Založiť nový chat",
      confirmReset: "Kliknite znova pre potvrdenie", confirmResetAria: "Naozaj zmazať históriu? Kliknite znova pre potvrdenie",
      placeholder: "Napíšte správu…", message: "Správa", send: "Odoslať", sending: "Odosielam", typing: "Asistent píše odpoveď",
      offline: "Chatbot práve neodpovedá. Skúste to prosím o chvíľu.", incomplete: "Chatbot vrátil neúplnú odpoveď.",
      busy: "Príliš veľa otázok, skúste to prosím o chvíľu znova.", generic: "Ospravedlňujem sa, nastala chyba.",
      view: "Zobraziť produkt", soldOut: "Vypredané",
    },
    de: {
      title: "Fragen Sie uns",
      greeting: "Hallo, ich bin der Assistent dieses Shops. Fragen Sie nach Produkten oder deren Verfügbarkeit.",
      status: "Wir antworten sofort",
      open: "Chat öffnen", close: "Chat schließen", newChat: "Neuer Chat", newChatAria: "Neuen Chat starten",
      confirmReset: "Zum Bestätigen erneut klicken", confirmResetAria: "Verlauf wirklich löschen? Zum Bestätigen erneut klicken",
      placeholder: "Nachricht schreiben…", message: "Nachricht", send: "Senden", sending: "Sende", typing: "Der Assistent schreibt",
      offline: "Der Chat antwortet gerade nicht. Bitte versuchen Sie es gleich noch einmal.", incomplete: "Unvollständige Antwort erhalten.",
      busy: "Zu viele Anfragen, bitte versuchen Sie es gleich noch einmal.", generic: "Entschuldigung, es ist ein Fehler aufgetreten.",
      view: "Produkt ansehen", soldOut: "Ausverkauft",
    },
    pl: {
      title: "Zapytaj nas",
      greeting: "Dzień dobry, jestem asystentem tego sklepu. Zapytaj o produkty lub ich dostępność.",
      status: "Odpowiadamy od razu",
      open: "Otwórz czat", close: "Zamknij czat", newChat: "Nowy czat", newChatAria: "Rozpocznij nowy czat",
      confirmReset: "Kliknij ponownie, aby potwierdzić", confirmResetAria: "Na pewno usunąć historię? Kliknij ponownie, aby potwierdzić",
      placeholder: "Napisz wiadomość…", message: "Wiadomość", send: "Wyślij", sending: "Wysyłam", typing: "Asystent pisze odpowiedź",
      offline: "Czat chwilowo nie odpowiada. Spróbuj ponownie za chwilę.", incomplete: "Otrzymano niepełną odpowiedź.",
      busy: "Zbyt wiele pytań, spróbuj ponownie za chwilę.", generic: "Przepraszamy, wystąpił błąd.",
      view: "Zobacz produkt", soldOut: "Wyprzedane",
    },
    en: {
      title: "Ask us",
      greeting: "Hi, I'm this store's assistant. Ask me about products or their availability.",
      status: "We reply instantly",
      open: "Open chat", close: "Close chat", newChat: "New chat", newChatAria: "Start a new chat",
      confirmReset: "Click again to confirm", confirmResetAria: "Clear the conversation? Click again to confirm",
      placeholder: "Type a message…", message: "Message", send: "Send", sending: "Sending", typing: "The assistant is typing",
      offline: "The chat is not responding right now. Please try again in a moment.", incomplete: "The chat returned an incomplete answer.",
      busy: "Too many questions, please try again in a moment.", generic: "Sorry, something went wrong.",
      view: "View product", soldOut: "Sold out",
    },
  };
  var langCode = String(document.documentElement.lang || "en").toLowerCase().split("-")[0];
  var T = UI[langCode] || UI.en;

  // When the merchant keeps a default text (in any of our languages), show the
  // default in the storefront's language instead.
  function isDefaultText(value, key) {
    return Object.keys(UI).some(function (code) { return UI[code][key] === value; });
  }
  function localizedSetting(value, key) {
    if (!value || isDefaultText(String(value).trim(), key)) return T[key];
    return value;
  }

  // ---------------------------------------------------------------- config
  function validHex(value, fallback) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim()) ? String(value).trim() : fallback;
  }
  function expandHex(hex) {
    var value = hex.replace("#", "");
    if (value.length === 3) value = value.split("").map(function (c) { return c + c; }).join("");
    return value;
  }
  function hexToRgb(hex) {
    var value = expandHex(hex);
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }
  function shade(hex, percent) {
    var rgb = hexToRgb(hex);
    var amount = Math.round(2.55 * percent);
    return "#" + rgb.map(function (channel) {
      var next = Math.max(0, Math.min(255, channel + amount)).toString(16);
      return next.length === 1 ? "0" + next : next;
    }).join("");
  }
  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  var STYLES = ["classic", "minimal", "glass", "bold", "midnight"];
  var ICONS = ["mascot", "chat", "sparkle", "headset", "bag", "smile", "custom"];

  var primary = validHex(CONFIG.color || window.ESHOP_ASSISTANT_COLOR, "#173b70");
  var accent = validHex(CONFIG.accentColor, "#27843b");
  var headerText = validHex(CONFIG.headerTextColor, "#ffffff");
  var background = validHex(CONFIG.backgroundColor, "#f6f7fb");
  var botBubble = validHex(CONFIG.botBubbleColor, "#eef0f5");
  var textColor = validHex(CONFIG.textColor, "#1f2430");
  var windowStyle = STYLES.indexOf(CONFIG.windowStyle) !== -1 ? CONFIG.windowStyle : "classic";
  var launcherIcon = ICONS.indexOf(CONFIG.launcherIcon) !== -1 ? CONFIG.launcherIcon : "mascot";
  var launcherImage = typeof CONFIG.launcherImage === "string" ? CONFIG.launcherImage : "";
  if (launcherIcon === "custom" && !launcherImage) launcherIcon = "mascot";
  var launcherSize = clampNumber(CONFIG.launcherSize, 48, 80, 60);
  var radius = clampNumber(CONFIG.radius, 8, 28, 20);
  var side = CONFIG.position === "left" ? "left" : "right";

  if (windowStyle === "midnight") {
    background = "#121626";
    botBubble = "#1e2438";
    textColor = "#e8eaf3";
  }

  var primaryRgb = hexToRgb(primary).join(",");
  var primaryDark = shade(primary, -14);
  var accentDark = shade(accent, -10);

  var api = window.ESHOP_ASSISTANT_API || "/apps/eshop-assistant/chat";
  var fallbackApi = window.ESHOP_ASSISTANT_FALLBACK_API || "";
  var title = localizedSetting(CONFIG.title || window.ESHOP_ASSISTANT_TITLE, "title");
  var greeting = localizedSetting(CONFIG.greeting || window.ESHOP_ASSISTANT_GREETING, "greeting");

  // ---------------------------------------------------------------- conversation state
  var caseStorageKey = "eshop-assistant-case-v1";
  var transcriptKey = "eshop-assistant-transcript-v1";
  var caseTtlMs = 24 * 60 * 60 * 1000;
  var history = [];
  var transcript = [];

  function newCaseId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === "x" ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }
  function readJson(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  var activeCase = (function () {
    var stored = readJson(caseStorageKey);
    if (stored && stored.id && Date.now() - stored.touchedAt < caseTtlMs) return stored;
    return { id: newCaseId(), touchedAt: Date.now() };
  })();

  // The conversation survives page changes (e.g. after clicking a product card).
  (function restoreTranscript() {
    var stored = readJson(transcriptKey);
    if (stored && stored.caseId === activeCase.id && Array.isArray(stored.items)) {
      transcript = stored.items.slice(-40);
      history = transcript
        .filter(function (item) { return item.role === "user" || item.role === "assistant"; })
        .map(function (item) { return { role: item.role, content: item.text }; })
        .slice(-10);
    }
  })();

  function saveCase() {
    activeCase.touchedAt = Date.now();
    writeJson(caseStorageKey, activeCase);
    writeJson(transcriptKey, { caseId: activeCase.id, items: transcript.slice(-40) });
  }

  function ensureActiveCase() {
    if (Date.now() - activeCase.touchedAt >= caseTtlMs) {
      activeCase = { id: newCaseId(), touchedAt: Date.now() };
      history = [];
      transcript = [];
    }
    saveCase();
  }

  // ---------------------------------------------------------------- icons
  var ICON_SVGS = {
    chat: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6A3.5 3.5 0 0 1 16.5 16H11l-4.3 3.6c-.6.5-1.7.1-1.7-.8V16A3.5 3.5 0 0 1 4 12.5v-6Z" fill="#fff"/><circle cx="8.5" cy="9.5" r="1.2" fill="var(--ea-primary)"/><circle cx="12" cy="9.5" r="1.2" fill="var(--ea-primary)"/><circle cx="15.5" cy="9.5" r="1.2" fill="var(--ea-primary)"/></svg>',
    sparkle: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M10 3.5c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6Z" fill="#fff"/><path d="M17.5 13.5c.2 1.8 1 2.6 2.8 2.8-1.8.2-2.6 1-2.8 2.8-.2-1.8-1-2.6-2.8-2.8 1.8-.2 2.6-1 2.8-2.8Z" fill="#fff" opacity=".85"/><path d="M18 3c.1 1.1.6 1.6 1.7 1.7-1.1.1-1.6.6-1.7 1.7-.1-1.1-.6-1.6-1.7-1.7 1.1-.1 1.6-.6 1.7-1.7Z" fill="#fff" opacity=".7"/></svg>',
    headset: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><rect x="3.5" y="12" width="4" height="6" rx="2" fill="#fff"/><rect x="16.5" y="12" width="4" height="6" rx="2" fill="#fff"/><path d="M18.5 18v.5a2.5 2.5 0 0 1-2.5 2.5h-3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="21" r="1.3" fill="#fff"/></svg>',
    bag: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5.2 8h13.6l-.9 11.1A2 2 0 0 1 15.9 21H8.1a2 2 0 0 1-2-1.9L5.2 8Z" fill="#fff"/><path d="M9 10V7a3 3 0 0 1 6 0v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 14.5c.6 1 1.4 1.5 2.5 1.5s1.9-.5 2.5-1.5" stroke="var(--ea-primary)" stroke-width="1.6" stroke-linecap="round"/></svg>',
    smile: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3a8.5 8.5 0 0 0-7.4 12.7L3.5 20l4.4-1.1A8.5 8.5 0 1 0 12 3Z" fill="#fff"/><circle cx="9" cy="10.5" r="1.2" fill="var(--ea-primary)"/><circle cx="15" cy="10.5" r="1.2" fill="var(--ea-primary)"/><path d="M8.8 13.8c.8 1.2 1.9 1.8 3.2 1.8s2.4-.6 3.2-1.8" stroke="var(--ea-primary)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  var CLOSE_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
  var AVATAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M10 3.5c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6Z" fill="currentColor"/><path d="M17.5 13.5c.2 1.8 1 2.6 2.8 2.8-1.8.2-2.6 1-2.8 2.8-.2-1.8-1-2.6-2.8-2.8 1.8-.2 2.6-1 2.8-2.8Z" fill="currentColor" opacity=".8"/></svg>';

  // ---------------------------------------------------------------- styles
  var panelOffset = launcherSize + 32;
  var css = [
    ".ea-root{--ea-primary:" + primary + ";--ea-primary-dark:" + primaryDark + ";--ea-primary-rgb:" + primaryRgb + ";--ea-accent:" + accent + ";--ea-accent-dark:" + accentDark + ";--ea-header-text:" + headerText + ";--ea-bg:" + background + ";--ea-bot:" + botBubble + ";--ea-text:" + textColor + ";--ea-radius:" + radius + "px;--ea-launcher:" + launcherSize + "px}",
    "#ea-bubble{position:fixed;" + side + ":22px;bottom:22px;width:var(--ea-launcher);height:var(--ea-launcher);border:0;padding:0;border-radius:50%;background:linear-gradient(135deg,var(--ea-primary),var(--ea-primary-dark));cursor:pointer;z-index:2147483646;box-shadow:0 10px 28px rgba(var(--ea-primary-rgb),.35),0 3px 10px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease;animation:ea-pop .45s cubic-bezier(.34,1.56,.64,1)}",
    "#ea-bubble::after{content:'';position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.18);pointer-events:none}",
    "#ea-bubble:hover{transform:translateY(-2px) scale(1.06);box-shadow:0 14px 34px rgba(var(--ea-primary-rgb),.45),0 4px 12px rgba(0,0,0,.2)}",
    "#ea-bubble:active{transform:scale(.95)}",
    "#ea-bubble:focus-visible{outline:3px solid rgba(var(--ea-primary-rgb),.45);outline-offset:3px}",
    "#ea-bubble.ea-attention{animation:ea-attn 1.6s ease-out 2}",
    "#ea-bubble .ea-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .2s ease,transform .25s ease}",
    "#ea-bubble .ea-icon-close{opacity:0;transform:rotate(-45deg) scale(.5)}",
    "#ea-bubble.ea-open .ea-icon-chat{opacity:0;transform:rotate(45deg) scale(.5)}",
    "#ea-bubble.ea-open .ea-icon-close{opacity:1;transform:rotate(0) scale(1)}",
    ".ea-launcher-img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}",
    "@keyframes ea-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}",
    "@keyframes ea-attn{0%,100%{box-shadow:0 10px 28px rgba(var(--ea-primary-rgb),.35),0 0 0 0 rgba(var(--ea-primary-rgb),.5)}50%{box-shadow:0 10px 28px rgba(var(--ea-primary-rgb),.35),0 0 0 12px rgba(var(--ea-primary-rgb),0)}}",
    "#ea-panel{position:fixed;" + side + ":22px;bottom:" + panelOffset + "px;width:min(380px,calc(100vw - 24px));height:min(580px,calc(100vh - " + (panelOffset + 24) + "px));background:#fff;color:var(--ea-text);border-radius:var(--ea-radius);z-index:2147483646;box-shadow:0 24px 64px rgba(15,20,40,.22),0 6px 18px rgba(15,20,40,.12);overflow:hidden;font:15px/1.45 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Inter,system-ui,sans-serif;display:flex;flex-direction:column;transform-origin:bottom " + side + ";transform:translateY(16px) scale(.96);opacity:0;visibility:hidden;pointer-events:none;transition:transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s ease,visibility 0s linear .28s}",
    "#ea-panel.ea-open{transform:translateY(0) scale(1);opacity:1;visibility:visible;pointer-events:auto;transition:transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .2s ease,visibility 0s linear 0s}",
    "#ea-head{display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(135deg,var(--ea-primary),var(--ea-primary-dark));color:var(--ea-header-text);padding:14px 14px 14px 16px;flex:none}",
    ".ea-head-title{display:flex;align-items:center;gap:11px;min-width:0}",
    ".ea-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);color:var(--ea-header-text);display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}",
    ".ea-avatar img{width:100%;height:100%;object-fit:cover}",
    ".ea-head-text{display:flex;flex-direction:column;min-width:0}",
    ".ea-title-text{font-weight:700;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.01em}",
    ".ea-status{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85}",
    ".ea-status::before{content:'';width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.25)}",
    ".ea-head-actions{display:flex;align-items:center;gap:2px;flex:none}",
    "#ea-reset,#ea-close{border:0;background:transparent;color:inherit;font-size:18px;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s ease,transform .15s ease}",
    "#ea-reset:hover,#ea-close:hover{background:rgba(255,255,255,.18)}",
    "#ea-reset:active,#ea-close:active{transform:scale(.9)}",
    "#ea-reset.ea-confirming{background:rgba(255,255,255,.3)}",
    "#ea-msgs{flex:1;overflow:auto;padding:16px;background:var(--ea-bg);scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.18) transparent}",
    ".ea-msg{max-width:84%;padding:10px 13px;border-radius:16px;margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;animation:ea-msg-in .25s ease both}",
    "@keyframes ea-msg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
    ".ea-bot{background:var(--ea-bot);color:var(--ea-text);border-bottom-left-radius:5px}",
    ".ea-user{background:linear-gradient(135deg,var(--ea-primary),var(--ea-primary-dark));color:var(--ea-header-text);margin-left:auto;border-bottom-right-radius:5px;box-shadow:0 3px 10px rgba(var(--ea-primary-rgb),.28)}",
    ".ea-error{background:#fdeceb;color:#8a2a20;border:1px solid #f5c6c0}",
    ".ea-wait{padding:12px 14px}",
    ".ea-typing{display:inline-flex;gap:4px}",
    ".ea-typing span{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.45;display:inline-block;animation:ea-bounce 1.2s infinite ease-in-out}",
    ".ea-typing span:nth-child(2){animation-delay:.15s}",
    ".ea-typing span:nth-child(3){animation-delay:.3s}",
    "@keyframes ea-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:.9}}",
    ".ea-cards{display:flex;flex-direction:column;gap:8px;margin:-4px 0 12px;max-width:88%}",
    ".ea-card{display:flex;align-items:center;gap:11px;padding:9px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#fff;color:#1f2430;text-decoration:none;box-shadow:0 2px 6px rgba(15,20,40,.06);transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}",
    ".ea-card:hover{border-color:var(--ea-primary);box-shadow:0 6px 16px rgba(var(--ea-primary-rgb),.18);transform:translateY(-1px)}",
    ".ea-card-img{width:54px;height:54px;border-radius:10px;object-fit:cover;background:#f1f3f7;flex:none}",
    ".ea-card-body{min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".ea-card-title{font-weight:600;font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".ea-card-meta{font-size:13px;color:#5b6170}",
    ".ea-card-cta{font-size:12px;font-weight:700;color:var(--ea-primary)}",
    "#ea-bottom{border-top:1px solid rgba(0,0,0,.07);background:#fff;flex:none}",
    "#ea-form{display:flex;align-items:center}",
    "#ea-input{min-width:0;flex:1;border:0;padding:15px 6px 15px 16px;font:inherit;outline:none;background:transparent;color:inherit}",
    "#ea-send{border:0;background:linear-gradient(135deg,var(--ea-accent),var(--ea-accent-dark));color:#fff;padding:0 18px;margin:8px;height:40px;border-radius:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;min-width:92px;box-shadow:0 4px 12px rgba(0,0,0,.12);transition:filter .18s ease,transform .1s ease}",
    "#ea-send:hover:not(:disabled){filter:brightness(1.06)}",
    "#ea-send:active:not(:disabled){transform:scale(.96)}",
    "#ea-send:disabled{opacity:.75;cursor:wait}",
    "#ea-send:focus-visible,#ea-input:focus-visible{outline:2px solid rgba(var(--ea-primary-rgb),.45);outline-offset:1px}",
    ".ea-spinner{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;animation:ea-spin .7s linear infinite;display:inline-block}",
    "@keyframes ea-spin{to{transform:rotate(360deg)}}",
    "#ea-count{font-size:11px;color:#9aa0ab;text-align:right;padding:0 14px 6px;min-height:15px;opacity:0;transition:opacity .15s ease}",
    "#ea-count.ea-show{opacity:1}",
    // --- style: minimal
    ".ea-style-minimal #ea-head{background:#fff;color:var(--ea-text);border-bottom:1px solid rgba(0,0,0,.07)}",
    ".ea-style-minimal .ea-avatar{background:var(--ea-primary);color:#fff;box-shadow:none}",
    ".ea-style-minimal #ea-reset:hover,.ea-style-minimal #ea-close:hover{background:rgba(0,0,0,.06)}",
    ".ea-style-minimal #ea-msgs{background:#fff}",
    ".ea-style-minimal .ea-user{background:var(--ea-primary);box-shadow:none}",
    ".ea-style-minimal #ea-panel{box-shadow:0 18px 50px rgba(15,20,40,.16);border:1px solid rgba(0,0,0,.06)}",
    // --- style: glass
    ".ea-style-glass #ea-panel{background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.55)}",
    ".ea-style-glass #ea-head{background:rgba(var(--ea-primary-rgb),.88)}",
    ".ea-style-glass #ea-msgs{background:transparent}",
    ".ea-style-glass .ea-bot{background:rgba(255,255,255,.85);box-shadow:0 2px 8px rgba(15,20,40,.06)}",
    ".ea-style-glass #ea-bottom{background:rgba(255,255,255,.6)}",
    // --- style: bold
    ".ea-style-bold #ea-head{padding:20px 16px 22px 18px;border-radius:0 0 22px 22px;box-shadow:0 8px 20px rgba(var(--ea-primary-rgb),.25);position:relative;z-index:1}",
    ".ea-style-bold .ea-avatar{width:44px;height:44px}",
    ".ea-style-bold .ea-title-text{font-size:18px}",
    ".ea-style-bold #ea-msgs{margin-top:-12px;padding-top:26px}",
    ".ea-style-bold .ea-msg{border-radius:18px}",
    ".ea-style-bold #ea-send{border-radius:999px}",
    ".ea-style-bold #ea-bubble{border-radius:20px}",
    ".ea-style-bold #ea-bubble::after,.ea-style-bold .ea-launcher-img{border-radius:20px}",
    // --- style: midnight
    ".ea-style-midnight #ea-panel{background:#0f1220;box-shadow:0 24px 70px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.06)}",
    ".ea-style-midnight #ea-head{background:linear-gradient(135deg,var(--ea-primary),#0f1220)}",
    ".ea-style-midnight #ea-bottom{background:#0f1220;border-top-color:rgba(255,255,255,.08)}",
    ".ea-style-midnight #ea-input{color:#e8eaf3}",
    ".ea-style-midnight #ea-input::placeholder{color:#8a90a6}",
    ".ea-style-midnight .ea-card{background:#1a2033;color:#e8eaf3;border-color:rgba(255,255,255,.08)}",
    ".ea-style-midnight .ea-card-meta{color:#9aa1b8}",
    // --- small screens
    "@media (max-width:480px){#ea-panel{" + side + ":8px;width:calc(100vw - 16px);height:calc(100vh - " + (panelOffset + 16) + "px);bottom:" + (panelOffset - 8) + "px}#ea-bubble{" + side + ":14px;bottom:14px}}",
    "@media (prefers-reduced-motion:reduce){#ea-bubble,#ea-panel,.ea-msg,.ea-typing span,#ea-bubble .ea-icon,#ea-bubble.ea-attention,.ea-card{animation:none!important;transition:none!important}}",
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "ea-root ea-style-" + windowStyle;
  document.body.appendChild(root);

  // ---------------------------------------------------------------- launcher
  var bubble = document.createElement("button");
  bubble.id = "ea-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", T.open);
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML =
    '<span class="ea-icon ea-icon-chat" aria-hidden="true"></span>' +
    '<span class="ea-icon ea-icon-close" aria-hidden="true">' + CLOSE_SVG + "</span>";
  var iconSlot = bubble.querySelector(".ea-icon-chat");

  function showLauncherImage(url, defer) {
    iconSlot.innerHTML = ICON_SVGS.chat;
    function load() {
      var image = new Image();
      image.className = "ea-launcher-img";
      image.alt = "";
      image.decoding = "async";
      image.onload = function () {
        iconSlot.innerHTML = "";
        iconSlot.appendChild(image);
      };
      image.src = url;
    }
    if (!defer) return load();
    // Load after the store's own content so it never hurts page speed.
    function schedule() {
      if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 4000 });
      else setTimeout(load, 1500);
    }
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule);
  }

  if (launcherIcon === "custom") showLauncherImage(launcherImage, false);
  else if (launcherIcon === "mascot") showLauncherImage(MASCOT_URL, true);
  else iconSlot.innerHTML = ICON_SVGS[launcherIcon];

  // ---------------------------------------------------------------- panel
  var panel = document.createElement("section");
  panel.id = "ea-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.innerHTML =
    '<div id="ea-head"><div class="ea-head-title"><span class="ea-avatar" aria-hidden="true"></span>' +
    '<span class="ea-head-text"><span class="ea-title-text"></span><span class="ea-status"></span></span></div>' +
    '<div class="ea-head-actions">' +
    '<button id="ea-reset" type="button">↻</button>' +
    '<button id="ea-close" type="button">✕</button></div></div>' +
    '<div id="ea-msgs" aria-live="polite"></div>' +
    '<div id="ea-bottom"><form id="ea-form">' +
    '<input id="ea-input" maxlength="1000" autocomplete="off">' +
    '<button id="ea-send" type="submit"><span class="ea-send-label"></span></button>' +
    '</form><div id="ea-count" aria-hidden="true"></div></div>';
  panel.querySelector(".ea-title-text").textContent = title;
  panel.querySelector(".ea-status").textContent = T.status;

  var avatar = panel.querySelector(".ea-avatar");
  if (launcherIcon === "custom") {
    var avatarImage = new Image();
    avatarImage.alt = "";
    avatarImage.src = launcherImage;
    avatar.appendChild(avatarImage);
  } else {
    avatar.innerHTML = AVATAR_SVG;
  }

  root.appendChild(panel);
  root.appendChild(bubble);

  var messages = panel.querySelector("#ea-msgs");
  var form = panel.querySelector("#ea-form");
  var input = panel.querySelector("#ea-input");
  var send = panel.querySelector("#ea-send");
  var countEl = panel.querySelector("#ea-count");
  var resetBtn = panel.querySelector("#ea-reset");
  var closeBtn = panel.querySelector("#ea-close");

  resetBtn.title = T.newChat;
  resetBtn.setAttribute("aria-label", T.newChatAria);
  closeBtn.setAttribute("aria-label", T.close);
  input.placeholder = T.placeholder;
  input.setAttribute("aria-label", T.message);

  function setSendIdle() {
    send.disabled = false;
    send.innerHTML = '<span class="ea-send-label"></span>';
    send.querySelector(".ea-send-label").textContent = T.send;
  }
  function setSendBusy() {
    send.disabled = true;
    send.innerHTML = '<span class="ea-spinner" aria-hidden="true"></span><span class="ea-send-label"></span>';
    send.querySelector(".ea-send-label").textContent = T.sending;
  }
  setSendIdle();

  function scrollToBottom() {
    try { messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" }); }
    catch (_) { messages.scrollTop = messages.scrollHeight; }
  }

  function renderMessage(text, role, extraClass) {
    var element = document.createElement("div");
    element.className = "ea-msg " + (role === "user" ? "ea-user" : "ea-bot") + (extraClass ? " " + extraClass : "");
    element.textContent = text;
    messages.appendChild(element);
    scrollToBottom();
    return element;
  }

  function formatPrice(amount, currency) {
    if (typeof amount !== "number") return "";
    try {
      return new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (_) {
      return amount + " " + (currency || "");
    }
  }

  // Clickable cards for the products mentioned in the answer.
  function renderProductCards(products) {
    if (!products || !products.length) return;
    var list = document.createElement("div");
    list.className = "ea-cards";
    products.slice(0, 3).forEach(function (product) {
      if (!product || typeof product.url !== "string" || !/^(\/|https?:\/\/)/.test(product.url)) return;
      var card = document.createElement("a");
      card.className = "ea-card";
      card.href = product.url;
      if (product.image) {
        var image = document.createElement("img");
        image.className = "ea-card-img";
        image.src = product.image;
        image.alt = "";
        image.loading = "lazy";
        card.appendChild(image);
      }
      var body = document.createElement("span");
      body.className = "ea-card-body";
      var name = document.createElement("span");
      name.className = "ea-card-title";
      name.textContent = product.title;
      var meta = document.createElement("span");
      meta.className = "ea-card-meta";
      meta.textContent = [formatPrice(product.price, product.currency), product.inStock === false ? T.soldOut : ""]
        .filter(Boolean).join(" · ");
      var cta = document.createElement("span");
      cta.className = "ea-card-cta";
      cta.textContent = T.view + " →";
      body.appendChild(name);
      if (meta.textContent) body.appendChild(meta);
      body.appendChild(cta);
      card.appendChild(body);
      list.appendChild(card);
    });
    if (list.children.length) {
      messages.appendChild(list);
      scrollToBottom();
    }
  }

  function addTypingIndicator() {
    var element = document.createElement("div");
    element.className = "ea-msg ea-bot ea-wait";
    element.setAttribute("aria-label", T.typing);
    var dots = document.createElement("span");
    dots.className = "ea-typing";
    dots.innerHTML = "<span></span><span></span><span></span>";
    element.appendChild(dots);
    messages.appendChild(element);
    scrollToBottom();
    return element;
  }

  function renderTranscript() {
    messages.innerHTML = "";
    renderMessage(greeting, "assistant");
    transcript.forEach(function (item) {
      if (item.role === "user") renderMessage(item.text, "user");
      else if (item.role === "assistant") {
        renderMessage(item.text, "assistant");
        renderProductCards(item.products);
      }
    });
  }
  renderTranscript();

  setTimeout(function () {
    if (panel.classList.contains("ea-open")) return;
    bubble.classList.add("ea-attention");
    setTimeout(function () { bubble.classList.remove("ea-attention"); }, 3300);
  }, 1200);

  function setOpen(isOpen) {
    panel.classList.toggle("ea-open", isOpen);
    bubble.classList.toggle("ea-open", isOpen);
    bubble.setAttribute("aria-expanded", isOpen ? "true" : "false");
    bubble.setAttribute("aria-label", isOpen ? T.close : T.open);
    try { window.sessionStorage.setItem("eshop-assistant-open", isOpen ? "1" : "0"); } catch (_) {}
    if (isOpen) {
      bubble.classList.remove("ea-attention");
      scrollToBottom();
      input.focus();
    }
  }

  // Re-open the chat after navigating from a product card, so the customer
  // keeps their conversation in view.
  try {
    if (window.sessionStorage.getItem("eshop-assistant-open") === "1" && transcript.length) setOpen(true);
  } catch (_) {}

  bubble.addEventListener("click", function () { setOpen(!panel.classList.contains("ea-open")); });
  closeBtn.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel.classList.contains("ea-open")) setOpen(false);
  });
  document.addEventListener("click", function (event) {
    if (!panel.classList.contains("ea-open")) return;
    if (panel.contains(event.target) || bubble.contains(event.target)) return;
    setOpen(false);
  });

  var resetConfirmTimer = null;
  function armResetConfirm() {
    resetBtn.classList.add("ea-confirming");
    resetBtn.setAttribute("aria-label", T.confirmResetAria);
    resetBtn.title = T.confirmReset;
    resetConfirmTimer = setTimeout(disarmResetConfirm, 3000);
  }
  function disarmResetConfirm() {
    clearTimeout(resetConfirmTimer);
    resetBtn.classList.remove("ea-confirming");
    resetBtn.setAttribute("aria-label", T.newChatAria);
    resetBtn.title = T.newChat;
  }
  resetBtn.addEventListener("click", function () {
    if (!resetBtn.classList.contains("ea-confirming")) {
      armResetConfirm();
      return;
    }
    disarmResetConfirm();
    activeCase = { id: newCaseId(), touchedAt: Date.now() };
    history = [];
    transcript = [];
    renderTranscript();
    saveCase();
    input.focus();
  });

  input.addEventListener("input", function () {
    var len = input.value.length;
    if (len > 800) {
      countEl.textContent = len + " / 1000";
      countEl.classList.add("ea-show");
    } else {
      countEl.classList.remove("ea-show");
    }
  });

  // ---------------------------------------------------------------- network
  function chatError(message, canUseFallback) {
    var error = new Error(message);
    error.canUseFallback = Boolean(canUseFallback);
    return error;
  }

  async function sendChatRequest(endpoint, payload) {
    var response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      throw chatError(T.offline, true);
    }
    var contentType = response.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") === -1) throw chatError(T.offline, true);
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      // Server messages are Czech; show them only on Czech/Slovak storefronts.
      var serverMessage = (langCode === "cs" || langCode === "sk") && data.error ? data.error : "";
      if (response.status === 429) throw chatError(serverMessage || T.busy, false);
      throw chatError(serverMessage || T.offline, false);
    }
    if (!data.reply) throw chatError(T.incomplete, false);
    return data;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    ensureActiveCase();

    input.value = "";
    countEl.classList.remove("ea-show");
    renderMessage(text, "user");
    transcript.push({ role: "user", text: text });
    history.push({ role: "user", content: text });
    saveCase();
    setSendBusy();
    var waiting = addTypingIndicator();

    try {
      var payload = { caseId: activeCase.id, message: text, history: history.slice(-10) };
      var data;
      try {
        data = await sendChatRequest(api, payload);
      } catch (proxyError) {
        if (!fallbackApi || !proxyError.canUseFallback) throw proxyError;
        data = await sendChatRequest(fallbackApi, payload);
      }
      waiting.remove();
      renderMessage(data.reply, "assistant");
      renderProductCards(data.products);
      transcript.push({ role: "assistant", text: data.reply, products: data.products || [] });
      history.push({ role: "assistant", content: data.reply });
      if (data.caseId) activeCase.id = data.caseId;
      saveCase();
    } catch (error) {
      waiting.remove();
      renderMessage(error.message || T.generic, "assistant", "ea-error");
    } finally {
      setSendIdle();
      input.focus();
    }
  });
})();
