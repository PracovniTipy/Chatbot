(function () {
  var API = window.CHATBOT_API || "";
  var history = [];

  var style = document.createElement("style");
  style.textContent = `
    #ecb-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;
      background:#1F3864;color:#fff;display:flex;align-items:center;justify-content:center;
      cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:999999;font-size:24px;}
    #ecb-panel{position:fixed;bottom:88px;right:20px;width:320px;max-height:440px;
      background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);
      display:none;flex-direction:column;overflow:hidden;z-index:999999;font-family:sans-serif;}
    #ecb-panel.open{display:flex;}
    #ecb-header{background:#1F3864;color:#fff;padding:10px 14px;font-size:14px;font-weight:600;}
    #ecb-messages{flex:1;overflow-y:auto;padding:10px;font-size:13px;background:#f7f7f8;}
    .ecb-msg{margin:6px 0;padding:8px 10px;border-radius:8px;max-width:85%;line-height:1.35;}
    .ecb-msg.bot{background:#e7e9f0;color:#1a1a1a;align-self:flex-start;}
    .ecb-msg.user{background:#1F3864;color:#fff;margin-left:auto;}
    #ecb-inputrow{display:flex;border-top:1px solid #eee;}
    #ecb-input{flex:1;border:none;padding:10px;font-size:13px;outline:none;}
    #ecb-send{background:#2E7D32;color:#fff;border:none;padding:0 14px;cursor:pointer;font-size:13px;}
  `;
  document.head.appendChild(style);

  var bubble = document.createElement("div");
  bubble.id = "ecb-bubble";
  bubble.innerText = "💬";
  document.body.appendChild(bubble);

  var panel = document.createElement("div");
  panel.id = "ecb-panel";
  panel.innerHTML = `
    <div id="ecb-header">Zeptejte se nas</div>
    <div id="ecb-messages" style="display:flex;flex-direction:column;"></div>
    <div id="ecb-inputrow">
      <input id="ecb-input" type="text" placeholder="Napiste zpravu..." />
      <button id="ecb-send">Odeslat</button>
    </div>
  `;
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#ecb-messages");
  var inputEl = panel.querySelector("#ecb-input");
  var sendEl = panel.querySelector("#ecb-send");

  function addMsg(text, who) {
    var el = document.createElement("div");
    el.className = "ecb-msg " + who;
    el.innerText = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  addMsg("Dobry den, jsem asistent teto eshopu. Zeptejte se na produkty, dopravu nebo vraceni.", "bot");

  bubble.addEventListener("click", function () {
    panel.classList.toggle("open");
  });

  async function send() {
    var text = inputEl.value.trim();
    if (!text) return;
    addMsg(text, "user");
    history.push({ role: "user", content: text });
    inputEl.value = "";

    try {
      var resp = await fetch(API + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history })
      });
      var data = await resp.json();
      var reply = data.reply || data.error || "Chyba pripojeni.";
      addMsg(reply, "bot");
      history.push({ role: "assistant", content: reply });
    } catch (e) {
      addMsg("Nepodarilo se spojit se serverem.", "bot");
    }
  }

  sendEl.addEventListener("click", send);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send();
  });
})();