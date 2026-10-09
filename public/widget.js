(function () {
  // Preview chat inside the embedded Shopify admin page ("/"). It talks to
  // /api/chat with the App Bridge session token and does not use the
  // merchant's case quota.
  if (window.__ESHOP_ASSISTANT_LOADED__) return;
  window.__ESHOP_ASSISTANT_LOADED__ = true;

  var UI = {
    cs: { title: "Vyzkoušejte chat", greeting: "Tady si můžete vyzkoušet, jak chatbot odpovídá zákazníkům. Testovací zprávy se nepočítají do tarifu.", open: "Otevřít chat", close: "Zavřít", newChat: "Nový chat", placeholder: "Napište zprávu…", send: "Odeslat", thinking: "Přemýšlím…", error: "Chatbot právě neodpovídá." },
    en: { title: "Try the chat", greeting: "Try how the chatbot answers your customers. Test messages do not count towards your plan.", open: "Open chat", close: "Close", newChat: "New chat", placeholder: "Type a message…", send: "Send", thinking: "Thinking…", error: "The chat is not responding right now." },
    sk: { title: "Vyskúšajte chat", greeting: "Tu si môžete vyskúšať, ako chatbot odpovedá zákazníkom. Testovacie správy sa nepočítajú do tarifu.", open: "Otvoriť chat", close: "Zavrieť", newChat: "Nový chat", placeholder: "Napíšte správu…", send: "Odoslať", thinking: "Premýšľam…", error: "Chatbot práve neodpovedá." },
    de: { title: "Chat testen", greeting: "Testen Sie, wie der Chatbot Ihren Kunden antwortet. Testnachrichten zählen nicht zu Ihrem Tarif.", open: "Chat öffnen", close: "Schließen", newChat: "Neuer Chat", placeholder: "Nachricht schreiben…", send: "Senden", thinking: "Denke nach…", error: "Der Chat antwortet gerade nicht." },
    pl: { title: "Wypróbuj czat", greeting: "Sprawdź, jak chatbot odpowiada klientom. Wiadomości testowe nie liczą się do planu.", open: "Otwórz czat", close: "Zamknij", newChat: "Nowy czat", placeholder: "Napisz wiadomość…", send: "Wyślij", thinking: "Myślę…", error: "Czat chwilowo nie odpowiada." },
  };
  function T(key) {
    var lang = window.CHATNELO_LANG || (document.documentElement.lang || "cs").split("-")[0];
    return (UI[lang] || UI.en)[key];
  }

  var api = window.CHATBOT_API ? window.CHATBOT_API.replace(/\/$/, "") + "/api/chat" : "/api/chat";
  var color = "#173b70";
  var history = [];

  function newCaseId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === "x" ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }
  var caseId = newCaseId();

  var style = document.createElement("style");
  style.textContent =
    "#ea-bubble{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border:0;border-radius:50%;background:" + color + ";color:#fff;cursor:pointer;z-index:2147483646;box-shadow:0 8px 24px #0004;display:flex;align-items:center;justify-content:center}" +
    "#ea-panel{position:fixed;right:22px;bottom:92px;width:min(370px,calc(100vw - 28px));height:min(530px,calc(100vh - 120px));background:#fff;border-radius:16px;z-index:2147483646;box-shadow:0 12px 40px #0004;overflow:hidden;font:15px/1.4 system-ui,-apple-system,sans-serif;display:none;flex-direction:column}" +
    "#ea-head{display:flex;align-items:center;justify-content:space-between;background:" + color + ";color:#fff;padding:15px 17px;font-weight:700}" +
    ".ea-head-actions{display:flex;align-items:center;gap:8px}" +
    "#ea-reset,#ea-close{border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer;padding:0 3px}" +
    "#ea-msgs{flex:1;overflow:auto;padding:14px;background:#f6f7fb}" +
    ".ea-msg{max-width:84%;padding:10px 12px;border-radius:13px;margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".ea-bot{background:#e9ebf2;color:#202124}" +
    ".ea-user{background:" + color + ";color:#fff;margin-left:auto}" +
    ".ea-wait{opacity:.7;font-style:italic}" +
    ".ea-error{background:#fdeceb;color:#8a2a20}" +
    "#ea-form{display:flex;border-top:1px solid #ddd;background:#fff}" +
    "#ea-input{min-width:0;flex:1;border:0;padding:14px;font:inherit;outline:none}" +
    "#ea-send{border:0;background:#27843b;color:#fff;padding:0 18px;font-weight:700;cursor:pointer}" +
    "#ea-send:disabled{opacity:.6;cursor:wait}";
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.id = "ea-bubble";
  bubble.type = "button";
  bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8z" fill="#fff"/></svg>';

  var panel = document.createElement("section");
  panel.id = "ea-panel";
  panel.setAttribute("role", "dialog");
  panel.innerHTML =
    '<div id="ea-head"><span id="ea-title"></span><div class="ea-head-actions">' +
    '<button id="ea-reset" type="button">↻</button>' +
    '<button id="ea-close" type="button">×</button></div></div>' +
    '<div id="ea-msgs" aria-live="polite"></div>' +
    '<form id="ea-form"><input id="ea-input" maxlength="1000" autocomplete="off">' +
    '<button id="ea-send" type="submit"></button></form>';

  document.body.appendChild(panel);
  document.body.appendChild(bubble);

  var messages = panel.querySelector("#ea-msgs");
  var form = panel.querySelector("#ea-form");
  var input = panel.querySelector("#ea-input");
  var send = panel.querySelector("#ea-send");

  function applyTexts() {
    panel.setAttribute("aria-label", T("title"));
    panel.querySelector("#ea-title").textContent = T("title");
    panel.querySelector("#ea-reset").title = T("newChat");
    panel.querySelector("#ea-reset").setAttribute("aria-label", T("newChat"));
    panel.querySelector("#ea-close").setAttribute("aria-label", T("close"));
    bubble.setAttribute("aria-label", T("open"));
    input.placeholder = T("placeholder");
    if (!send.disabled) send.textContent = T("send");
  }

  function addMessage(text, role, extraClass) {
    var element = document.createElement("div");
    element.className = "ea-msg " + (role === "user" ? "ea-user" : "ea-bot") +
      (extraClass ? " " + extraClass : "");
    element.textContent = text;
    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;
    return element;
  }

  function resetChat() {
    caseId = newCaseId();
    history = [];
    messages.innerHTML = "";
    addMessage(T("greeting"), "assistant");
  }

  applyTexts();
  resetChat();
  document.addEventListener("chatnelo:langchange", function () {
    applyTexts();
    if (!history.length) resetChat();
  });

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
    resetChat();
    input.focus();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;

    input.value = "";
    addMessage(text, "user");
    history.push({ role: "user", content: text });
    send.disabled = true;
    send.textContent = "…";
    var waiting = addMessage(T("thinking"), "assistant", "ea-wait");

    try {
      // window.fetch is wrapped by the admin page to add the session token.
      var response = await window.fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: caseId, message: text, history: history.slice(-10) }),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.reply) throw new Error(data.error || T("error"));
      waiting.remove();
      addMessage(data.reply, "assistant");
      history.push({ role: "assistant", content: data.reply });
      if (data.caseId) caseId = data.caseId;
    } catch (error) {
      waiting.remove();
      addMessage(error.message || T("error"), "assistant", "ea-error");
    } finally {
      send.disabled = false;
      send.textContent = T("send");
      input.focus();
    }
  });
})();
