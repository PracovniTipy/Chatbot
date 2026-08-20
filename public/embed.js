(function () {
  if (window.__ESHOP_ASSISTANT_EMBED_LOADED__) return;
  window.__ESHOP_ASSISTANT_EMBED_LOADED__ = true;

  var scriptTag = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  var storeId = scriptTag.getAttribute("data-store") || "";
  var apiKey = scriptTag.getAttribute("data-key") || "";
  if (!storeId || !apiKey) {
    console.error("Eshop Assistant AI: chybí data-store nebo data-key ve <script> tagu embed.js.");
    return;
  }

  var apiBase = (scriptTag.getAttribute("data-api") || "").replace(/\/$/, "");
  var api = apiBase ? apiBase + "/widget/chat" : "/widget/chat";
  var color = scriptTag.getAttribute("data-color") || "#173b70";
  var title = scriptTag.getAttribute("data-title") || "Zeptejte se nás";
  var greeting = scriptTag.getAttribute("data-greeting") ||
    "Dobrý den, jsem asistent tohoto e-shopu. Zeptejte se na produkty nebo jejich dostupnost.";
  var history = [];
  var caseStorageKey = "eshop-assistant-embed-case-" + storeId;
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

  var style = document.createElement("style");
  style.textContent =
    "#ea-bubble{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border:0;border-radius:50%;background:" + color + ";color:#fff;font-size:25px;cursor:pointer;z-index:2147483646;box-shadow:0 8px 24px #0004}" +
    "#ea-panel{position:fixed;right:22px;bottom:92px;width:min(370px,calc(100vw - 28px));height:min(530px,calc(100vh - 120px));background:#fff;border-radius:16px;z-index:2147483646;box-shadow:0 12px 40px #0004;overflow:hidden;font:15px/1.4 system-ui,-apple-system,sans-serif;display:none;flex-direction:column}" +
    "#ea-head{display:flex;align-items:center;justify-content:space-between;background:" + color + ";color:#fff;padding:15px 17px;font-weight:700}" +
    ".ea-head-actions{display:flex;align-items:center;gap:8px}" +
    "#ea-reset,#ea-close{border:0;background:transparent;color:#fff;font-size:21px;cursor:pointer;padding:0 3px}" +
    "#ea-msgs{flex:1;overflow:auto;padding:14px;background:#f6f7fb}" +
    ".ea-msg{max-width:84%;padding:10px 12px;border-radius:13px;margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".ea-bot{background:#e9ebf2;color:#202124}" +
    ".ea-user{background:" + color + ";color:#fff;margin-left:auto}" +
    ".ea-wait{opacity:.7;font-style:italic}" +
    "#ea-form{display:flex;border-top:1px solid #ddd;background:#fff}" +
    "#ea-input{min-width:0;flex:1;border:0;padding:14px;font:inherit;outline:none}" +
    "#ea-send{border:0;background:#27843b;color:#fff;padding:0 18px;font-weight:700;cursor:pointer}" +
    "#ea-send:disabled{opacity:.6;cursor:wait}";
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.id = "ea-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Otevřít chat");
  bubble.textContent = "💬";

  var panel = document.createElement("section");
  panel.id = "ea-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.innerHTML =
    '<div id="ea-head"><span></span><div class="ea-head-actions">' +
    '<button id="ea-reset" type="button" title="Nový chat" aria-label="Založit nový chat">↻</button>' +
    '<button id="ea-close" type="button" aria-label="Zavřít">×</button></div></div>' +
    '<div id="ea-msgs" aria-live="polite"></div>' +
    '<form id="ea-form"><input id="ea-input" maxlength="1000" autocomplete="off" placeholder="Napište zprávu…">' +
    '<button id="ea-send" type="submit">Odeslat</button></form>';
  panel.querySelector("#ea-head span").textContent = title;

  document.body.appendChild(panel);
  document.body.appendChild(bubble);

  var messages = panel.querySelector("#ea-msgs");
  var form = panel.querySelector("#ea-form");
  var input = panel.querySelector("#ea-input");
  var send = panel.querySelector("#ea-send");

  function addMessage(text, role, extraClass) {
    var element = document.createElement("div");
    element.className = "ea-msg " + (role === "user" ? "ea-user" : "ea-bot") +
      (extraClass ? " " + extraClass : "");
    element.textContent = text;
    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;
    return element;
  }

  addMessage(greeting, "assistant");

  bubble.addEventListener("click", function () {
    var opening = panel.style.display !== "flex";
    panel.style.display = opening ? "flex" : "none";
    bubble.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) input.focus();
  });

  panel.querySelector("#ea-close").addEventListener("click", function () {
    panel.style.display = "none";
    bubble.setAttribute("aria-expanded", "false");
  });

  panel.querySelector("#ea-reset").addEventListener("click", function () {
    activeCase = { id: newCaseId(), touchedAt: Date.now() };
    history = [];
    messages.innerHTML = "";
    addMessage(greeting, "assistant");
    saveCase();
    input.focus();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    ensureActiveCase();

    input.value = "";
    addMessage(text, "user");
    history.push({ role: "user", content: text });
    send.disabled = true;
    send.textContent = "…";
    var waiting = addMessage("Přemýšlím…", "assistant", "ea-wait");

    try {
      var response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId,
          apiKey: apiKey,
          caseId: activeCase.id,
          message: text,
          history: history.slice(-10),
        }),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || "Chatbot právě neodpovídá.");
      waiting.remove();
      addMessage(data.reply, "assistant");
      history.push({ role: "assistant", content: data.reply });
      if (data.caseId) activeCase.id = data.caseId;
      saveCase();
    } catch (error) {
      waiting.remove();
      addMessage(error.message || "Omlouvám se, nastala chyba.", "assistant");
    } finally {
      send.disabled = false;
      send.textContent = "Odeslat";
      input.focus();
    }
  });
})();
