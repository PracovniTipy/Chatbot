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
      "Po instalaci appka uloží přístupový token k vašemu Shopify obchodu (šifrovaný, uložený jen pro účel čtení produktů, skladu a obchodních podmínek obchodu, např. dopravy a vrácení zboží), doménu a interní ID obchodu, počet měsíčně vyřešených chatových případů pro účely tarifikace a anonymizovaný přehled dotazů zákazníků (viz Zprávy v chatu). Osobní údaje vašich zákazníků appka ukládá jen tehdy, když zákazník v chatu sám zanechá e-mail, aby mu obchod odpověděl.",
  },
  {
    title: "Jaká data appka zpracovává — obchody mimo Shopify",
    body:
      "Při registraci na /store/dashboard appka uloží název obchodu, kontaktní e-mail, přístupové klíče k widgetu a řídicímu panelu, produktový katalog, který sami vyplníte, a počet měsíčně vyřešených chatových případů. Pokud si zvolíte placený tarif, appka přes Stripe uloží identifikátor zákazníka a předplatného potřebný k fakturaci.",
  },
  {
    title: "Zprávy v chatu",
    body:
      "Text zprávy, kterou návštěvník obchodu chatbotovi napíše, appka spolu s katalogem produktů pošle poskytovateli AI modelu (OpenAI) kvůli vygenerování odpovědi. Aby obchodník viděl, na co se zákazníci nejčastěji ptají, appka ukládá text dotazů bez osobních údajů (e-maily a telefonní čísla automaticky skryje) a bez vazby na konkrétního zákazníka, a to nejvýše 90 dní. Odpovědi chatbota ani celé konverzace se neukládají. Když chatbot nezná odpověď, může zákazník dobrovolně zanechat e-mail; ten appka uloží šifrovaně spolu s dotazem a zpřístupní ho jen danému obchodu, aby mohl zákazníkovi odpovědět.",
  },
  {
    title: "Kdo má k datům přístup",
    body:
      "Zpracování probíhá u těchto zpracovatelů: OpenAI (generování odpovědí chatbota), Stripe (platby u obchodů mimo Shopify — pouze pokud si zvolíte placený tarif), Shopify (platby a přihlášení u Shopify obchodů) a Railway (hosting appky a databáze). Appka data neprodává ani nepředává nikomu jinému.",
  },
  {
    title: "Jak dlouho se data uchovávají",
    body:
      "Data Shopify obchodu appka uchovává po dobu instalace. Dotazy a e-maily zanechané zákazníky v chatu se automaticky mažou po 90 dnech. Po odinstalaci appky ze Shopify administrace appka do několika minut smaže uložený přístupový token, historii spotřeby, přehled dotazů i e-maily zákazníků daného obchodu — to zajišťují webhooky app/uninstalled a shop/redact. Data univerzálního obchodu appka uchovává, dokud obchod aktivně používáte; o výmaz můžete kdykoli požádat na kontaktním e-mailu výše.",
  },
  {
    title: "Povinné Shopify compliance webhooky",
    body:
      "Appka podporuje povinné webhooky customers/data_request, customers/redact a shop/redact. Jediný osobní údaj zákazníka, který appka může mít, je e-mail, který zákazník sám zanechal v chatu: při customers/redact ho appka smaže, při customers/data_request zjistí, zda je uložen. Při shop/redact odstraní všechna data daného obchodu. Všechny webhooky appka ověřuje podpisem HMAC, aby je nemohl vyvolat nikdo jiný než Shopify.",
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
