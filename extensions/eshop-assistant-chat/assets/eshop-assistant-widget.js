(function () {
  if (window.__ESHOP_ASSISTANT_LOADED__) return;
  window.__ESHOP_ASSISTANT_LOADED__ = true;

  var MASCOT_URL = "https://chatbot-production-6b09.up.railway.app/mascot.png";

  // UI strings follow the storefront language (<html lang>), Czech fallback
  // for cs/sk, English for everything else.
  var UI = {
    cs: {
      title: "Zeptejte se nás",
      greeting: "Dobrý den, jsem asistent tohoto e-shopu. Zeptejte se na produkty nebo jejich dostupnost.",
      open: "Otevřít chat", close: "Zavřít chat", newChat: "Nový chat", newChatAria: "Založit nový chat",
      confirmReset: "Klikněte znovu pro potvrzení", confirmResetAria: "Opravdu smazat historii? Klikněte znovu pro potvrzení",
      placeholder: "Napište zprávu…", message: "Zpráva", send: "Odeslat", sending: "Odesílám", typing: "Asistent píše odpověď",
      offline: "Chatbot právě neodpovídá. Zkuste to prosím za chvíli.", incomplete: "Chatbot vrátil neúplnou odpověď.",
      busy: "Příliš mnoho dotazů, zkuste to prosím za chvíli znovu.", generic: "Omlouvám se, nastala chyba.", view: "Zobrazit produkt", soldOut: "Vyprodáno",
    },
    sk: {
      title: "Opýtajte sa nás",
      greeting: "Dobrý deň, som asistent tohto e-shopu. Opýtajte sa na produkty alebo ich dostupnosť.",
      open: "Otvoriť chat", close: "Zavrieť chat", newChat: "Nový chat", newChatAria: "Založiť nový chat",
      confirmReset: "Kliknite znova pre potvrdenie", confirmResetAria: "Naozaj zmazať históriu? Kliknite znova pre potvrdenie",
      placeholder: "Napíšte správu…", message: "Správa", send: "Odoslať", sending: "Odosielam", typing: "Asistent píše odpoveď",
      offline: "Chatbot práve neodpovedá. Skúste to prosím o chvíľu.", incomplete: "Chatbot vrátil neúplnú odpoveď.",
      busy: "Príliš veľa otázok, skúste to prosím o chvíľu znova.", generic: "Ospravedlňujem sa, nastala chyba.", view: "Zobraziť produkt", soldOut: "Vypredané",
    },
    de: {
      title: "Fragen Sie uns",
      greeting: "Hallo, ich bin der Assistent dieses Shops. Fragen Sie nach Produkten oder deren Verfügbarkeit.",
      open: "Chat öffnen", close: "Chat schließen", newChat: "Neuer Chat", newChatAria: "Neuen Chat starten",
      confirmReset: "Zum Bestätigen erneut klicken", confirmResetAria: "Verlauf wirklich löschen? Zum Bestätigen erneut klicken",
      placeholder: "Nachricht schreiben…", message: "Nachricht", send: "Senden", sending: "Sende", typing: "Der Assistent schreibt",
      offline: "Der Chat antwortet gerade nicht. Bitte versuchen Sie es gleich noch einmal.", incomplete: "Unvollständige Antwort erhalten.",
      busy: "Zu viele Anfragen, bitte versuchen Sie es gleich noch einmal.", generic: "Entschuldigung, es ist ein Fehler aufgetreten.", view: "Produkt ansehen", soldOut: "Ausverkauft",
    },
    pl: {
      title: "Zapytaj nas",
      greeting: "Dzień dobry, jestem asystentem tego sklepu. Zapytaj o produkty lub ich dostępność.",
      open: "Otwórz czat", close: "Zamknij czat", newChat: "Nowy czat", newChatAria: "Rozpocznij nowy czat",
      confirmReset: "Kliknij ponownie, aby potwierdzić", confirmResetAria: "Na pewno usunąć historię? Kliknij ponownie, aby potwierdzić",
      placeholder: "Napisz wiadomość…", message: "Wiadomość", send: "Wyślij", sending: "Wysyłam", typing: "Asystent pisze odpowiedź",
      offline: "Czat chwilowo nie odpowiada. Spróbuj ponownie za chwilę.", incomplete: "Otrzymano niepełną odpowiedź.",
      busy: "Zbyt wiele pytań, spróbuj ponownie za chwilę.", generic: "Przepraszamy, wystąpił błąd.", view: "Zobacz produkt", soldOut: "Wyprzedane",
    },
    en: {
      title: "Ask us",
      greeting: "Hi, I'm this store's assistant. Ask me about products or their availability.",
      open: "Open chat", close: "Close chat", newChat: "New chat", newChatAria: "Start a new chat",
      confirmReset: "Click again to confirm", confirmResetAria: "Clear the conversation? Click again to confirm",
      placeholder: "Type a message…", message: "Message", send: "Send", sending: "Sending", typing: "The assistant is typing",
      offline: "The chat is not responding right now. Please try again in a moment.", incomplete: "The chat returned an incomplete answer.",
      busy: "Too many questions, please try again in a moment.", generic: "Sorry, something went wrong.", view: "View product", soldOut: "Sold out",
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

  var api = window.ESHOP_ASSISTANT_API || "/apps/eshop-assistant/chat";
  var fallbackApi = window.ESHOP_ASSISTANT_FALLBACK_API || "";
  var color = window.ESHOP_ASSISTANT_COLOR || "#173b70";
  var title = localizedSetting(window.ESHOP_ASSISTANT_TITLE, "title");
  var greeting = localizedSetting(window.ESHOP_ASSISTANT_GREETING, "greeting");
  var history = [];
  var caseStorageKey = "eshop-assistant-case-v1";
  var caseTtlMs = 24 * 60 * 60 * 1000;

  function newCaseId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === "x" ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }

  function loadCase() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(caseStorageKey) || "null");
      if (stored && stored.id && Date.now() - stored.touchedAt < caseTtlMs) return stored;
    } catch (_) {}
    return { id: newCaseId(), touchedAt: Date.now() };
  }

  var activeCase = loadCase();

  function saveCase() {
    activeCase.touchedAt = Date.now();
    try { window.localStorage.setItem(caseStorageKey, JSON.stringify(activeCase)); } catch (_) {}
  }

  function ensureActiveCase() {
    if (Date.now() - activeCase.touchedAt >= caseTtlMs) {
      activeCase = { id: newCaseId(), touchedAt: Date.now() };
      history = [];
    }
    saveCase();
  }

  function hexToRgb(hex) {
    var match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!match) return "23,59,112";
    return parseInt(match[1], 16) + "," + parseInt(match[2], 16) + "," + parseInt(match[3], 16);
  }

  function shadeColor(hex, percent) {
    var match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!match) return hex;
    var amt = Math.round(2.55 * percent);
    var clamp = function (value) { return value > 255 ? 255 : value < 0 ? 0 : value; };
    var r = clamp(parseInt(match[1], 16) + amt);
    var g = clamp(parseInt(match[2], 16) + amt);
    var b = clamp(parseInt(match[3], 16) + amt);
    var toHex = function (value) { var h = value.toString(16); return h.length === 1 ? "0" + h : h; };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  var colorRgb = hexToRgb(color);
  var colorDark = shadeColor(color, -14);

  var style = document.createElement("style");
  style.textContent =
    "#ea-bubble{position:fixed;right:22px;bottom:22px;width:60px;height:60px;border:0;border-radius:50%;background:linear-gradient(135deg," + color + "," + colorDark + ");color:#fff;cursor:pointer;z-index:2147483646;box-shadow:0 8px 24px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease;animation:ea-pop .4s cubic-bezier(.34,1.56,.64,1)}" +
    "#ea-bubble:hover{transform:scale(1.08);box-shadow:0 10px 28px rgba(0,0,0,.3),0 3px 10px rgba(0,0,0,.2)}" +
    "#ea-bubble:active{transform:scale(.95)}" +
    "#ea-bubble:focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:3px}" +
    "#ea-bubble.ea-attention{animation:ea-attn 1.6s ease-out 2}" +
    "#ea-bubble .ea-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .2s ease,transform .25s ease}" +
    "#ea-bubble .ea-icon-close{opacity:0;transform:rotate(-45deg) scale(.5)}" +
    ".ea-mascot{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}" +
    "#ea-bubble.ea-open .ea-icon-chat{opacity:0;transform:rotate(45deg) scale(.5)}" +
    "#ea-bubble.ea-open .ea-icon-close{opacity:1;transform:rotate(0) scale(1)}" +
    "@keyframes ea-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}" +
    "@keyframes ea-attn{0%,100%{box-shadow:0 8px 24px rgba(0,0,0,.25),0 0 0 0 rgba(" + colorRgb + ",.5)}50%{box-shadow:0 8px 24px rgba(0,0,0,.25),0 0 0 10px rgba(" + colorRgb + ",0)}}" +
    "#ea-panel{position:fixed;right:22px;bottom:92px;width:min(370px,calc(100vw - 28px));height:min(560px,calc(100vh - 120px));background:#fff;border-radius:20px;z-index:2147483646;box-shadow:0 20px 60px rgba(0,0,0,.22),0 4px 16px rgba(0,0,0,.12);overflow:hidden;font:15px/1.45 -apple-system,BlinkMacSystemFont,\"Segoe UI\",system-ui,sans-serif;display:flex;flex-direction:column;transform-origin:bottom right;transform:translateY(16px) scale(.96);opacity:0;visibility:hidden;pointer-events:none;transition:transform .25s cubic-bezier(.2,.9,.3,1.3),opacity .2s ease,visibility 0s linear .25s}" +
    "#ea-panel.ea-open{transform:translateY(0) scale(1);opacity:1;visibility:visible;pointer-events:auto;transition:transform .25s cubic-bezier(.2,.9,.3,1.3),opacity .2s ease,visibility 0s linear 0s}" +
    "#ea-head{display:flex;align-items:center;justify-content:space-between;gap:8px;background:linear-gradient(135deg," + color + "," + colorDark + ");color:#fff;padding:14px 14px 14px 16px;font-weight:700;flex:none}" +
    ".ea-head-title{display:flex;align-items:center;gap:10px;min-width:0}" +
    ".ea-avatar{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex:none}" +
    ".ea-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".ea-head-actions{display:flex;align-items:center;gap:2px;flex:none}" +
    "#ea-reset,#ea-close{border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s ease,transform .15s ease}" +
    "#ea-reset:hover,#ea-close:hover{background:rgba(255,255,255,.18)}" +
    "#ea-reset:active,#ea-close:active{transform:scale(.9)}" +
    "#ea-reset:focus-visible,#ea-close:focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:2px}" +
    "#ea-reset.ea-confirming{background:rgba(255,255,255,.32)}" +
    "#ea-msgs{flex:1;overflow:auto;padding:16px;background:#f6f7fb;scrollbar-width:thin;scrollbar-color:#c7cbd6 transparent}" +
    "#ea-msgs::-webkit-scrollbar{width:8px}" +
    "#ea-msgs::-webkit-scrollbar-thumb{background:#c7cbd6;border-radius:8px}" +
    "#ea-msgs::-webkit-scrollbar-track{background:transparent}" +
    ".ea-msg{max-width:84%;padding:10px 13px;border-radius:15px;margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere;animation:ea-msg-in .25s ease both;box-shadow:0 1px 2px rgba(0,0,0,.04)}" +
    "@keyframes ea-msg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}" +
    ".ea-bot{background:#eef0f5;color:#1f2430;border-bottom-left-radius:4px}" +
    ".ea-user{background:linear-gradient(135deg," + color + "," + colorDark + ");color:#fff;margin-left:auto;border-bottom-right-radius:4px;box-shadow:0 2px 6px rgba(" + colorRgb + ",.35)}" +
    ".ea-error{background:#fdeceb;color:#8a2a20;box-shadow:none;border:1px solid #f5c6c0}" +
    ".ea-wait{padding:12px 14px}" +
    ".ea-typing{display:inline-flex;gap:4px}" +
    ".ea-typing span{width:7px;height:7px;border-radius:50%;background:#9297a3;display:inline-block;animation:ea-bounce 1.2s infinite ease-in-out}" +
    ".ea-typing span:nth-child(2){animation-delay:.15s}" +
    ".ea-typing span:nth-child(3){animation-delay:.3s}" +
    "@keyframes ea-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}" +
    "#ea-bottom{border-top:1px solid #e7e9ef;background:#fff;flex:none}" +
    "#ea-form{display:flex}" +
    "#ea-input{min-width:0;flex:1;border:0;padding:14px 4px 14px 16px;font:inherit;outline:none;background:transparent;transition:box-shadow .15s ease}" +
    "#ea-input:focus{box-shadow:inset 0 -2px 0 " + color + "}" +
    "#ea-send{border:0;background:#27843b;color:#fff;padding:0 18px;margin:8px 8px 8px 8px;border-radius:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;min-width:92px;transition:background .18s ease,transform .1s ease}" +
    "#ea-send:hover:not(:disabled){background:#1f6b30}" +
    "#ea-send:active:not(:disabled){transform:scale(.96)}" +
    "#ea-send:disabled{opacity:.75;cursor:wait}" +
    "#ea-send:focus-visible,#ea-input:focus-visible{outline:2px solid rgba(0,0,0,.35);outline-offset:1px}" +
    ".ea-spinner{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;animation:ea-spin .7s linear infinite;display:inline-block}" +
    "@keyframes ea-spin{to{transform:rotate(360deg)}}" +
    "#ea-count{font-size:11px;color:#9aa0ab;text-align:right;padding:0 14px 6px;min-height:15px;opacity:0;transition:opacity .15s ease}" +
    "#ea-count.ea-show{opacity:1}" +
    ".ea-cards{display:flex;flex-direction:column;gap:8px;margin:-4px 0 12px;max-width:84%}" +
    ".ea-card{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e3e6ee;border-radius:12px;background:#fff;color:#1f2430;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:border-color .15s ease,box-shadow .15s ease}" +
    ".ea-card:hover{border-color:" + color + ";box-shadow:0 2px 8px rgba(" + colorRgb + ",.18)}" +
    ".ea-card-img{width:52px;height:52px;border-radius:8px;object-fit:cover;background:#f1f3f7;flex:none}" +
    ".ea-card-body{min-width:0;display:flex;flex-direction:column;gap:2px}" +
    ".ea-card-title{font-weight:600;font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}" +
    ".ea-card-meta{font-size:13px;color:#5b6170}" +
    ".ea-card-cta{font-size:12px;font-weight:700;color:" + color + "}" +
    "@media (prefers-reduced-motion:reduce){#ea-bubble,#ea-panel,.ea-msg,.ea-typing span,#ea-bubble .ea-icon,#ea-bubble.ea-attention{animation:none!important;transition:none!important}}";
  document.head.appendChild(style);

  var CHAT_ICON_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8z" fill="#fff"/></svg>';

  var bubble = document.createElement("button");
  bubble.id = "ea-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", T.open);
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML =
    '<span class="ea-icon ea-icon-chat" aria-hidden="true">' + CHAT_ICON_SVG + '</span>' +
    '<span class="ea-icon ea-icon-close" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></span>';

  // Load the mascot only after the page has finished loading so it never
  // competes with the store's own content (Core Web Vitals).
  function loadMascot() {
    var image = new Image();
    image.className = "ea-mascot";
    image.alt = "";
    image.decoding = "async";
    image.onload = function () {
      var slot = bubble.querySelector(".ea-icon-chat");
      slot.innerHTML = "";
      slot.appendChild(image);
    };
    image.src = MASCOT_URL;
  }
  function scheduleMascot() {
    if ("requestIdleCallback" in window) window.requestIdleCallback(loadMascot, { timeout: 4000 });
    else setTimeout(loadMascot, 1500);
  }
  if (document.readyState === "complete") scheduleMascot();
  else window.addEventListener("load", scheduleMascot);

  var panel = document.createElement("section");
  panel.id = "ea-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.innerHTML =
    '<div id="ea-head"><div class="ea-head-title"><span class="ea-avatar" aria-hidden="true">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a1 1 0 0 1 1 1v1.06A8.001 8.001 0 0 1 20 12v1h1a1 1 0 1 1 0 2h-1.1A8.002 8.002 0 0 1 13 21.94V23a1 1 0 1 1-2 0v-1.06A8.002 8.002 0 0 1 4.1 15H3a1 1 0 1 1 0-2h1v-1a8.001 8.001 0 0 1 7-7.94V3a1 1 0 0 1 1-1zm0 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-2.5 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="#fff"/></svg></span>' +
    '<span class="ea-title-text"></span></div>' +
    '<div class="ea-head-actions">' +
    '<button id="ea-reset" type="button">↻</button>' +
    '<button id="ea-close" type="button">✕</button></div></div>' +
    '<div id="ea-msgs" aria-live="polite"></div>' +
    '<div id="ea-bottom"><form id="ea-form">' +
    '<input id="ea-input" maxlength="1000" autocomplete="off">' +
    '<button id="ea-send" type="submit"><span class="ea-send-label"></span></button>' +
    '</form><div id="ea-count" aria-hidden="true"></div></div>';
  panel.querySelector(".ea-title-text").textContent = title;

  document.body.appendChild(panel);
  document.body.appendChild(bubble);

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
    try {
      messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
    } catch (_) {
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function addMessage(text, role, extraClass) {
    var element = document.createElement("div");
    element.className = "ea-msg " + (role === "user" ? "ea-user" : "ea-bot") +
      (extraClass ? " " + extraClass : "");
    element.textContent = text;
    messages.appendChild(element);
    scrollToBottom();
    return element;
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

  function formatPrice(amount, currency) {
    if (typeof amount !== "number") return "";
    try {
      return new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (_) {
      return amount + " " + (currency || "");
    }
  }

  // Clickable cards for the products mentioned in the answer.
  function addProductCards(products) {
    if (!products || !products.length) return;
    var list = document.createElement("div");
    list.className = "ea-cards";
    products.slice(0, 3).forEach(function (product) {
      if (!product || !product.url) return;
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

  addMessage(greeting, "assistant");

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
    if (isOpen) {
      bubble.classList.remove("ea-attention");
      input.focus();
    }
  }

  bubble.addEventListener("click", function () {
    setOpen(!panel.classList.contains("ea-open"));
  });

  closeBtn.addEventListener("click", function () {
    setOpen(false);
  });

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
    messages.innerHTML = "";
    addMessage(greeting, "assistant");
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
    addMessage(text, "user");
    history.push({ role: "user", content: text });
    setSendBusy();
    var waiting = addTypingIndicator();

    try {
      var payload = {
        caseId: activeCase.id,
        message: text,
        history: history.slice(-10),
      };
      var data;
      try {
        data = await sendChatRequest(api, payload);
      } catch (proxyError) {
        if (!fallbackApi || !proxyError.canUseFallback) throw proxyError;
        data = await sendChatRequest(fallbackApi, payload);
      }
      waiting.remove();
      addMessage(data.reply, "assistant");
      addProductCards(data.products);
      history.push({ role: "assistant", content: data.reply });
      if (data.caseId) activeCase.id = data.caseId;
      saveCase();
    } catch (error) {
      waiting.remove();
      addMessage(error.message || T.generic, "assistant", "ea-error");
    } finally {
      setSendIdle();
      input.focus();
    }
  });
})();
