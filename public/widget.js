(function () {
  if (window.__ESHOP_ASSISTANT_LOADED__) return;
  window.__ESHOP_ASSISTANT_LOADED__ = true;

  var api = window.ESHOP_ASSISTANT_API ||
    (window.CHATBOT_API ? window.CHATBOT_API.replace(/\/$/, "") + "/api/chat" : "/api/chat");
  var color = window.ESHOP_ASSISTANT_COLOR || "#173b70";
  var title = window.ESHOP_ASSISTANT_TITLE || "Zeptejte se nás";
  var greeting = window.ESHOP_ASSISTANT_GREETING ||
    "Dobrý den, jsem asistent tohoto e-shopu. Zeptejte se na produkty nebo jejich dostupnost.";
  var history = [];

  var style = document.createElement("style");
  style.textContent =
    "#ea-bubble{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border:0;border-radius:50%;background:" + color + ";color:#fff;font-size:25px;cursor:pointer;z-index:2147483646;box-shadow:0 8px 24px #0004}" +
    "#ea-panel{position:fixed;right:22px;bottom:92px;width:min(370px,calc(100vw - 28px));height:min(530px,calc(100vh - 120px));background:#fff;border-radius:16px;z-index:2147483646;box-shadow:0 12px 40px #0004;overflow:hidden;font:15px/1.4 system-ui,-apple-system,sans-serif;display:none;flex-direction:column}" +
    "#ea-head{display:flex;align-items:center;justify-content:space-between;background:" + color + ";color:#fff;padding:15px 17px;font-weight:700}" +
    "#ea-close{border:0;background:transparent;color:#fff;font-size:23px;cursor:pointer}" +
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
    '<div id="ea-head"><span></span><button id="ea-close" type="button" aria-label="Zavřít">×</button></div>' +
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

  async function requestHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (api.indexOf("/api/") !== -1) {
      for (var attempt = 0; attempt < 20; attempt++) {
        if (window.shopify && window.shopify.idToken) {
          headers.Authorization = "Bearer " + await window.shopify.idToken();
          break;
        }
        await new Promise(function (resolve) { setTimeout(resolve, 100); });
      }
    }
    return headers;
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

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;

    input.value = "";
    addMessage(text, "user");
    history.push({ role: "user", content: text });
    send.disabled = true;
    send.textContent = "…";
    var waiting = addMessage("Přemýšlím…", "assistant", "ea-wait");

    try {
      var response = await fetch(api, {
        method: "POST",
        headers: await requestHeaders(),
        body: JSON.stringify({ message: text, history: history.slice(-10) }),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || "Chatbot právě neodpovídá.");
      waiting.remove();
      addMessage(data.reply, "assistant");
      history.push({ role: "assistant", content: data.reply });
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
