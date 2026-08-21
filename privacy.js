const OPERATOR_PLACEHOLDER = {
  name: "[DOPLŇTE: obchodní jméno / IČO]",
  contactEmail: "[DOPLŇTE: kontaktní e-mail]",
  address: "[DOPLŇTE: sídlo / adresa]",
};

const SECTIONS = [
  {
    title: "Kdo appku provozuje",
    body:
      "Chatnelo provozuje {{name}} (kontakt: {{contactEmail}}, {{address}}). " +
      "Tento dokument popisuje, jaká data appka při provozu zpracovává a proč.",
  },
  {
    title: "Jaká data appka zpracovává — obchodníci na Shopify",
    body:
      "Po instalaci appka uloží přístupový token k vašemu Shopify obchodu (šifrovaný, uložený jen pro účel čtení produktů a skladu), doménu a interní ID obchodu, a počet měsíčně vyřešených chatových případů pro účely tarifikace. Appka neukládá žádné osobní údaje vašich zákazníků.",
  },
  {
    title: "Jaká data appka zpracovává — obchody mimo Shopify",
    body:
      "Při registraci na /store/dashboard appka uloží název obchodu, kontaktní e-mail, přístupové klíče k widgetu a řídicímu panelu, produktový katalog, který sami vyplníte, a počet měsíčně vyřešených chatových případů. Pokud si zvolíte placený tarif, appka přes Stripe uloží identifikátor zákazníka a předplatného potřebný k fakturaci.",
  },
  {
    title: "Zprávy v chatu",
    body:
      "Text zprávy, kterou návštěvník obchodu chatbotovi napíše, appka spolu s katalogem produktů pošle poskytovateli AI modelu (OpenAI) kvůli vygenerování odpovědi. Appka samotná obsah zpráv neukládá do databáze — ukládá se pouze počet zpráv a případů kvůli tarifikaci, ne jejich obsah.",
  },
  {
    title: "Kdo má k datům přístup",
    body:
      "Zpracování probíhá u těchto zpracovatelů: OpenAI (generování odpovědí chatbota), Stripe (platby u obchodů mimo Shopify — pouze pokud si zvolíte placený tarif), Shopify (platby a přihlášení u Shopify obchodů) a Railway (hosting appky a databáze). Appka data neprodává ani nepředává nikomu jinému.",
  },
  {
    title: "Jak dlouho se data uchovávají",
    body:
      "Data Shopify obchodu appka uchovává po dobu instalace. Po odinstalaci appky ze Shopify administrace appka do několika minut smaže uložený přístupový token i historii spotřeby daného obchodu — to zajišťují webhooky app/uninstalled a shop/redact. Data univerzálního obchodu appka uchovává, dokud obchod aktivně používáte; o výmaz můžete kdykoli požádat na kontaktním e-mailu výše.",
  },
  {
    title: "Povinné Shopify compliance webhooky",
    body:
      "Appka podporuje povinné webhooky customers/data_request, customers/redact a shop/redact. Protože appka neukládá osobní údaje zákazníků obchodu, na žádost o data/výmaz zákazníka nemá co vracet ani mazat; při shop/redact odstraní uložené připojení a spotřebu daného obchodu. Všechny webhooky appka ověřuje podpisem HMAC, aby je nemohl vyvolat nikdo jiný než Shopify.",
  },
  {
    title: "Zabezpečení",
    body:
      "Přístupové tokeny appka ukládá šifrované (AES-256-GCM). Přístup k řídicímu panelu a widgetu univerzálních obchodů appka ověřuje časově bezpečným porovnáním klíčů, aby nešly uhodnout postupným zkoušením.",
  },
  {
    title: "Vaše práva",
    body:
      "Můžete požádat o přístup ke svým datům, jejich opravu nebo výmaz, a to na kontaktním e-mailu výše. U Shopify obchodů stačí appku odinstalovat — data se smažou automaticky.",
  },
];

function renderPrivacyText(operator = OPERATOR_PLACEHOLDER) {
  return SECTIONS.map((section) => ({
    title: section.title,
    body: section.body
      .replace(/\{\{name\}\}/g, operator.name)
      .replace(/\{\{contactEmail\}\}/g, operator.contactEmail)
      .replace(/\{\{address\}\}/g, operator.address),
  }));
}

module.exports = { OPERATOR_PLACEHOLDER, SECTIONS, renderPrivacyText };
