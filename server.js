require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const katalog = require("./catalog.js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function buildSystemPrompt() {
  const produkty = katalog
    .map(
      (p) =>
        `- ${p.nazev} (${p.id}): ${p.cena} ${p.mena}, sklad: ${
          p.sklad > 0 ? p.sklad + " ks" : "vyprodano"
        }. ${p.popis}`
    )
    .join("\n");

  return `Jsi zakaznicky a prodejni asistent ceskeho eshopu. Odpovidej strucne, vecne a v cestine.
Pouzivej VYHRADNE tato data o produktech a pravidlech obchodu, nic si nevymyslej:

PRODUKTY:
${produkty}

PRAVIDLA OBCHODU:
- Doprava: ${katalog.pravidla.doprava}
- Vraceni: ${katalog.pravidla.vraceni}
- Platba: ${katalog.pravidla.platba}

Pokud se zakaznik zepta na neco, co v datech neni (napr. konkretni cislo objednavky, reklamace), rekni ze si to preposles na lidskou podporu (support@eshop.cz) a nevymyslej si odpoved.
Kdyz je produkt vyprodany, uprimne to rekni a nabidni alternativu z katalogu.`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Chybi 'message' v telu pozadavku." });
    }

    if (!OPENAI_API_KEY) {
      return res.json({
        reply:
          "Demo bez API klice: nastav OPENAI_API_KEY v promennych prostredi (Railway -> Variables), abych mohl opravdu odpovidat pomoci AI. Zatim jen echo: \"" +
          message +
          "\""
      });
    }

    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user", content: message }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 400
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("OpenAI error:", r.status, errText);
      return res.status(502).json({ error: "AI sluzba momentalne neodpovida." });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Omlouvam se, nepodarilo se mi vygenerovat odpoved.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Interni chyba serveru." });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Chatbot bezi na portu ${PORT}`);
});
