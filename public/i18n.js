(function () {
  "use strict";

  var LANGS = [
    { code: "cs", flag: "🇨🇿", label: "Čeština" },
    { code: "en", flag: "🇬🇧", label: "English" },
    { code: "sk", flag: "🇸🇰", label: "Slovenčina" },
    { code: "de", flag: "🇩🇪", label: "Deutsch" },
    { code: "pl", flag: "🇵🇱", label: "Polski" },
  ];
  var STORAGE_KEY = "chatnelo_lang";

  var translations = {
    cs: {
      common: {
        tryFree: "Vyzkoušet zdarma",
        privacyLink: "Zásady ochrany osobních údajů",
      },
      marketing: {
        tagline: "AI chatbot, který za vás na e-shopu odpovídá zákazníkům — podle reálných produktů a skladu. Funguje na Shopify i na jakémkoli jiném webu.",
        cta: "Vyzkoušet zdarma",
        stepsHeading: "Jak to funguje",
        steps: [
          { title: "Připojíte appku", text: "Na Shopify appku přidáte ze Shopify App Store, přihlásí se přes standardní Shopify OAuth. Mimo Shopify se zaregistrujete zdarma na /store/dashboard a dostanete přístupové klíče. V obou případech nikam nekopírujete žádné heslo." },
          { title: "Chatbot se sám naučí váš sortiment", text: "Na Shopify appka čte produkty, ceny a skladové zásoby přímo z Shopify Admin API. Mimo Shopify vyplníte katalog produktů a pravidla obchodu v řídícím panelu — v obou případech odpovědi odpovídají aktuální nabídce." },
          { title: "Widget se zobrazí zákazníkům", text: "Chat se objeví jako bublina v pravém dolním rohu vašeho e-shopu a odpovídá zákazníkům na dotazy o produktech, skladu, dopravě a vrácení zboží." },
          { title: "Platíte podle vyřešených případů", text: "Vyberete si jeden z pěti tarifů podle očekávaného provozu. Počítá se jedno chatové vlákno s úspěšnou odpovědí, ne každá jednotlivá zpráva." },
        ],
        pricingHeading: "Ceník",
        pricingIntro: "Pevná měsíční cena za tarif, ne platba za jednotlivou zprávu. Víte tedy dopředu, kolik appka bude stát, i v měsíci, kdy dorazí jen pár dotazů.",
        thPlan: "Tarif",
        thLimit: "Případů / měsíc",
        thPrice: "Cena / měsíc",
        faqHeading: "Časté dotazy",
        faq: [
          { q: "Pro koho je Chatnelo určené?", a: "Pro obchodníky, kteří chtějí zákazníkům automaticky odpovídat na dotazy o produktech, skladu, dopravě a vrácení zboží — ať už mají e-shop na Shopify, nebo na jiné platformě." },
          { q: "Funguje appka i mimo Shopify?", a: "Ano. Kromě instalace ze Shopify App Store nabízíme i univerzální variantu pro jakýkoli web: po registraci na /store/dashboard dostanete embed kód s data-store a data-key, který vložíte do svých stránek, a produkty spravujete přes řídící panel." },
          { q: "Odkud chatbot bere informace o produktech?", a: "Přímo z vašeho Shopify obchodu přes oficiální Shopify Admin API — názvy, ceny, popisy a aktuální skladové zásoby. Nic se nevymyšlí ani neupravuje ručně." },
          { q: 'Co se počítá jako jeden "případ"?', a: 'Jedno chatové vlákno, ve kterém chatbot úspěšně odpověděl zákazníkovi. Další zprávy ve stejném vláknu se nepočítají znovu. Po 24 hodinách nečinnosti nebo kliknutí na "Nový chat" začíná nový případ. Jedno vlákno má nejvýše 20 zpráv.' },
          { q: "Kolik to stojí?", a: "Pět samoobslužných tarifů s pevnou měsíční cenou, ne platbou za jednotlivou zprávu: Start 70 za 379 Kč, Basic 150 za 779 Kč, Growth 400 za 1 270 Kč, Pro 1000 za 2 490 Kč a Business 5000 za 7 990 Kč. Číslo v názvu je měsíční limit vyřešených případů, ne cena za jeden. Pro větší provoz jsou k dispozici i vyšší tarify na vyžádání." },
          { q: "Musím appku programovat nebo upravovat šablonu obchodu?", a: "Ne. Na Shopify appka sama přidá chat widget do vašeho obchodu po instalaci ze Shopify App Store. Mimo Shopify stačí vložit jeden řádek se <script> kódem, který dostanete po registraci v řídícím panelu — žádný zásah do kódu šablony ani programování není potřeba." },
          { q: "Jak appku nasadím na web mimo Shopify?", a: "Zaregistrujete se přímo na /store/dashboard (formulář na stránce, žádné volání API), dostanete jednorázově ID obchodu a přístupové klíče. Produkty a pravidla obchodu (doprava, vrácení, platba) vyplníte v řídícím panelu a jeden řádek se <script> kódem vložíte do svého webu. Tarif zvolíte a zaplatíte přímo v panelu přes Stripe." },
          { q: "Jsou data zákazníků v bezpečí?", a: "Appka neukladá zákaznické osobní údaje. Podporuje povinné Shopify compliance webhooky (žádost o data, výmaz zákazníka, výmaz obchodu) a všechny webhooky ověřuje podpisem HMAC." },
          { q: "Jak appku odinstaluji?", a: "Appku odebíráte standardně přes Shopify administraci obchodu. Po odinstalaci appka smaže uložené připojení a data o spotřebě daného obchodu." },
          { q: "V jakém jazyce chatbot odpovídá?", a: "Standardně česky, protože je navržený pro české a slovenské e-shopy. Odpovídá jen na základě reálných dat z vašeho obchodu, nic si nevymyšlí." },
        ],
        chatHeading: "Zeptejte se rovnou chatbota",
        chatPlaceholder: "Např. Jak dlouho trvá instalace?",
        chatSend: "Odeslat",
      },
      privacy: {
        title: "Zásady ochrany osobních údajů",
        updated: "Poslední aktualizace",
        sections: [
          { title: "Kdo appku provozuje", body: "Chatnelo provozuje {{name}} (kontakt: {{contactEmail}}, {{address}}). Tento dokument popisuje, jaká data appka při provozu zpracovává a proč." },
          { title: "Jaká data appka zpracovává — obchodníci na Shopify", body: "Po instalaci appka uloží přístupový token k vašemu Shopify obchodu (šifrovaný, uložený jen pro účel čtení produktů a skladu), doménu a interní ID obchodu, a počet měsíčně vyřešených chatových případů pro účely tarifikace. Appka neukladá žádné osobní údaje vašich zákazníků." },
          { title: "Jaká data appka zpracovává — obchody mimo Shopify", body: "Při registraci na /store/dashboard appka uloží název obchodu, kontaktní e-mail, přístupové klíče k widgetu a řídícímu panelu, produktový katalog, který sami vyplníte, a počet měsíčně vyřešených chatových případů. Pokud si zvolíte placený tarif, appka přes Stripe uloží identifikátor zákazníka a předplatného potřebný k fakturaci." },
          { title: "Zprávy v chatu", body: "Text zprávy, kterou návštěvník obchodu chatbotovi napíše, appka spolu s katalogem produktů pošle poskytovateli AI modelu (OpenAI) kvůli vygenerování odpovědi. Appka samotná obsah zpráv neukladá do databáze — ukladá se pouze počet zpráv a případů kvůli tarifikaci, ne jejich obsah." },
          { title: "Kdo má k datům přístup", body: "Zpracování probíhá u těchto zpracovatelů: OpenAI (generování odpovědí chatbota), Stripe (platby u obchodů mimo Shopify — pouze pokud si zvolíte placený tarif), Shopify (platby a přihlášení u Shopify obchodů) a Railway (hosting appky a databáze). Appka data neprodává ani nepředává nikomu jinému." },
          { title: "Jak dlouho se data uchovávají", body: "Data Shopify obchodu appka uchovává po dobu instalace. Po odinstalaci appky ze Shopify administrace appka do několika minut smaže uložený přístupový token i historii spotřeby daného obchodu — to zajišťují webhooky app/uninstalled a shop/redact. Data univerzálního obchodu appka uchovává, dokud obchod aktivně používáte; o výmaz můžete kdykoli požádat na kontaktním e-mailu výše." },
          { title: "Povinné Shopify compliance webhooky", body: "Appka podporuje povinné webhooky customers/data_request, customers/redact a shop/redact. Protože appka neukladá osobní údaje zákazníků obchodu, na žádost o data/výmaz zákazníka nemá co vracet ani mazat; při shop/redact odstraní uložené připojení a spotřebu daného obchodu. Všechny webhooky appka ověřuje podpisem HMAC, aby je nemohl vyvolat nikdo jiný než Shopify." },
          { title: "Zabezpečení", body: "Přístupové tokeny appka ukladá šifrované (AES-256-GCM). Přístup k řídícímu panelu a widgetu univerzálních obchodů appka ověřuje časově bezpečným porovnáním klíčů, aby nešly uhodnout postupným zkoušením." },
          { title: "Vaše práva", body: "Můžete požádat o přístup ke svým datům, jejich opravu nebo výmaz, a to na kontaktním e-mailu výše. U Shopify obchodů stačí appku odinstalovat — data se smaže automaticky." },
        ],
      },
      dashboard: {
        title: "Řídící panel obchodu",
        signupIntro: "Nemáte ještě obchod? Zaregistrujte se — je to zdarma, tarif zvolíte a zaplatíte později.",
        nameLabel: "Název obchodu",
        emailLabel: "E-mail",
        signupBtn: "Zaregistrovat obchod",
        signupOkStrong: "Uložte si adminKey níže bezpečně — znovu se nezobrazí.",
        idLabel: "ID obchodu",
        adminKeyLabel: "adminKey",
        continueBtn: "Pokračovat do panelu",
        loginIntro: "Už máte obchod? Zadejte ID obchodu a adminKey, které jste dostali při registraci.",
        loginBtn: "Přihlásit",
        embedIntro: "Vložte tento kód do HTML svého webu (např. před </body>):",
        billingHeading: "Tarif a platba",
        catalogHeading: "Katalog produktů a pravidla obchodu",
        catalogIntro: "Pole products je pole objektů s klíči id, nazev, cena, mena, sklad, popis. Pole rules může obsahovat doprava, vraceni, platba.",
        catalogLabel: "Katalog (JSON)",
        saveBtn: "Uložit katalog",
        usagePrefix: "Spotřeba: ",
        planWord: "tarif",
        currentPlanPrefix: "Aktuální tarif: ",
        noBilling: " Platby zatím nejsou nastavené, tarif běží v testovacím režimu.",
        paymentStatusPrefix: " (stav platby: ",
        paymentStatusSuffix: ")",
        noPaymentYet: " (zatím bez platby)",
        perMonthSuffix: " případů / měsíc — ",
        currencySuffix: " Kč",
        activePlanBtn: "Aktivní tarif",
        selectBtn: "Vybrat",
        saving: "Ukládám…",
        catalogSaved: "Katalog uložen.",
      },
      root: {
        intro: "Aplikace je připojená. Chat vpravo používá produkty a sklad tohoto obchodu.",
        usageCardTitle: "Spotřeba v tomto období",
        loading: "Načítám…",
        planPriceLabel: "Cena tarifu",
        caseHint: "Jeden případ je jedno chatové vlákno s úspěšnou odpovědí.",
      },
    },
    en: {
      common: { tryFree: "Try it for free", privacyLink: "Privacy policy" },
      marketing: {
        tagline: "An AI chatbot that answers your customers for you — based on your real products and stock. Works on Shopify and on any other website.",
        cta: "Try it for free",
        stepsHeading: "How it works",
        steps: [
          { title: "Connect the app", text: "On Shopify, add the app from the Shopify App Store and sign in with standard Shopify OAuth. Outside Shopify, sign up for free at /store/dashboard and get your access keys. Either way, you never copy any password anywhere." },
          { title: "The chatbot learns your catalog automatically", text: "On Shopify, the app reads products, prices and stock directly from the Shopify Admin API. Outside Shopify, you fill in your product catalog and store rules in the dashboard — either way, answers always match your current offering." },
          { title: "The widget appears for your customers", text: "The chat appears as a bubble in the bottom-right corner of your store and answers questions about products, stock, shipping and returns." },
          { title: "You pay based on resolved cases", text: "You pick one of five plans based on expected traffic. What counts is one chat thread with a successful answer, not every single message." },
        ],
        pricingHeading: "Pricing",
        pricingIntro: "A fixed monthly price per plan, not a charge per message. You know upfront what the app will cost, even in a month with only a few questions.",
        thPlan: "Plan",
        thLimit: "Cases / month",
        thPrice: "Price / month",
        faqHeading: "Frequently asked questions",
        faq: [
          { q: "Who is Chatnelo for?", a: "For merchants who want to automatically answer customer questions about products, stock, shipping and returns — whether their store runs on Shopify or another platform." },
          { q: "Does the app work outside Shopify too?", a: "Yes. Besides installing it from the Shopify App Store, we also offer a universal version for any website: after signing up at /store/dashboard you get an embed snippet with data-store and data-key, which you add to your pages, and you manage products through the dashboard." },
          { q: "Where does the chatbot get product information from?", a: "Directly from your Shopify store via the official Shopify Admin API — names, prices, descriptions and current stock levels. Nothing is invented or edited by hand." },
          { q: 'What counts as one "case"?', a: 'One chat thread in which the chatbot successfully answered the customer. Further messages in the same thread are not counted again. A new case starts after 24 hours of inactivity or when the customer clicks "New chat." One thread has at most 20 messages.' },
          { q: "How much does it cost?", a: "Five self-service plans with a fixed monthly price, not a charge per message: Start 70 for 379 CZK, Basic 150 for 779 CZK, Growth 400 for 1,270 CZK, Pro 1000 for 2,490 CZK, and Business 5000 for 7,990 CZK. The number in the name is the monthly limit of resolved cases, not the price of one. Higher plans are available on request for larger traffic." },
          { q: "Do I need to code anything or edit my store theme?", a: "No. On Shopify, the app adds the chat widget to your store on its own once installed from the Shopify App Store. Outside Shopify, you just add one line of <script> code you get after signing up in the dashboard — no theme code changes or programming needed." },
          { q: "How do I deploy the app on a site outside Shopify?", a: "You sign up directly at /store/dashboard (a form on the page, no API calls needed) and get a one-time store ID and access keys. You fill in products and store rules (shipping, returns, payment) in the dashboard and add one line of <script> code to your site. You choose and pay for a plan directly in the dashboard via Stripe." },
          { q: "Is customer data safe?", a: "The app does not store your customers' personal data. It supports the mandatory Shopify compliance webhooks (data request, customer redaction, shop redaction) and verifies every webhook with an HMAC signature." },
          { q: "How do I uninstall the app?", a: "You remove it the standard way through your Shopify store admin. After uninstalling, the app deletes the stored connection and usage data for that store." },
          { q: "What language does the chatbot reply in?", a: "Czech by default, since it was designed for Czech and Slovak stores. It only answers based on real data from your store — it never makes anything up." },
        ],
        chatHeading: "Ask the chatbot directly",
        chatPlaceholder: "E.g. How long does installation take?",
        chatSend: "Send",
      },
      privacy: {
        title: "Privacy Policy",
        updated: "Last updated",
        sections: [
          { title: "Who operates the app", body: "Chatnelo is operated by {{name}} (contact: {{contactEmail}}, {{address}}). This document describes what data the app processes while running, and why." },
          { title: "What data the app processes — Shopify merchants", body: "After installation, the app stores an access token to your Shopify store (encrypted, stored only to read products and stock), your domain and internal store ID, and the number of chat cases resolved each month for billing purposes. The app does not store any personal data about your customers." },
          { title: "What data the app processes — stores outside Shopify", body: "When you sign up at /store/dashboard, the app stores your store name, contact email, access keys for the widget and dashboard, the product catalog you fill in yourself, and the number of chat cases resolved each month. If you choose a paid plan, the app stores a customer and subscription identifier via Stripe, needed for billing." },
          { title: "Chat messages", body: "The text of a message a store visitor sends to the chatbot is sent, together with the product catalog, to the AI model provider (OpenAI) to generate a reply. The app itself does not store message content in its database — only the number of messages and cases is stored for billing, not their content." },
          { title: "Who has access to the data", body: "Processing takes place through the following processors: OpenAI (generating chatbot replies), Stripe (payments for stores outside Shopify — only if you choose a paid plan), Shopify (payments and login for Shopify stores), and Railway (hosting the app and database). The app does not sell or pass data to anyone else." },
          { title: "How long data is retained", body: "The app retains a Shopify store's data for as long as it is installed. After uninstalling the app from Shopify admin, the app deletes the stored access token and that store's usage history within a few minutes — handled by the app/uninstalled and shop/redact webhooks. Data for a universal store is retained for as long as you actively use it; you may request deletion at any time at the contact email above." },
          { title: "Mandatory Shopify compliance webhooks", body: "The app supports the mandatory webhooks customers/data_request, customers/redact and shop/redact. Because the app does not store customers' personal data, there is nothing to return or delete on a customer data/redaction request; on shop/redact it removes the stored connection and usage for that store. The app verifies every webhook with an HMAC signature so only Shopify can trigger them." },
          { title: "Security", body: "The app stores access tokens encrypted (AES-256-GCM). Access to the dashboard and widget for universal stores is verified with a timing-safe key comparison, so keys cannot be guessed by repeated attempts." },
          { title: "Your rights", body: "You may request access to your data, its correction, or its deletion, at the contact email above. For Shopify stores, simply uninstalling the app is enough — data is deleted automatically." },
        ],
      },
      dashboard: {
        title: "Store dashboard",
        signupIntro: "Do not have a store yet? Sign up — it is free, you choose and pay for a plan later.",
        nameLabel: "Store name",
        emailLabel: "Email",
        signupBtn: "Sign up store",
        signupOkStrong: "Save the adminKey below somewhere safe — it will not be shown again.",
        idLabel: "Store ID",
        adminKeyLabel: "adminKey",
        continueBtn: "Continue to dashboard",
        loginIntro: "Already have a store? Enter the store ID and adminKey you got when you signed up.",
        loginBtn: "Log in",
        embedIntro: "Add this code to your website's HTML (e.g. before </body>):",
        billingHeading: "Plan and billing",
        catalogHeading: "Product catalog and store rules",
        catalogIntro: "The products field is an array of objects with keys id, nazev, cena, mena, sklad, popis. The rules field can contain doprava, vraceni, platba.",
        catalogLabel: "Catalog (JSON)",
        saveBtn: "Save catalog",
        usagePrefix: "Usage: ",
        planWord: "plan",
        currentPlanPrefix: "Current plan: ",
        noBilling: " Billing is not set up yet, the plan is running in test mode.",
        paymentStatusPrefix: " (payment status: ",
        paymentStatusSuffix: ")",
        noPaymentYet: " (no payment yet)",
        perMonthSuffix: " cases / month — ",
        currencySuffix: " CZK",
        activePlanBtn: "Active plan",
        selectBtn: "Select",
        saving: "Saving…",
        catalogSaved: "Catalog saved.",
      },
      root: {
        intro: "The app is connected. The chat on the right uses this store's products and stock.",
        usageCardTitle: "Usage this period",
        loading: "Loading…",
        planPriceLabel: "Plan price",
        caseHint: "One case is one chat thread with a successful answer.",
      },
    },
    sk: {
      common: { tryFree: "Vyskúšať zdarma", privacyLink: "Zásady ochrany osobných údajov" },
      marketing: {
        tagline: "AI chatbot, ktorý za vás na e-shope odpovedá zákazníkom — podľa reálnych produktov a skladu. Funguje na Shopify aj na akomkoľvek inom webe.",
        cta: "Vyskúšať zdarma",
        stepsHeading: "Ako to funguje",
        steps: [
          { title: "Pripojíte appku", text: "Na Shopify appku pridáte zo Shopify App Store, prihlási sa cez štandardné Shopify OAuth. Mimo Shopify sa zaregistrujete zdarma na /store/dashboard a dostanete prístupové kľúče. V oboch prípadoch nikam nekopírujete žiadne heslo." },
          { title: "Chatbot sa sám naučí váš sortiment", text: "Na Shopify appka číta produkty, ceny a skladové zásoby priamo zo Shopify Admin API. Mimo Shopify vyplníte katalóg produktov a pravidlá obchodu v riadiacom paneli — v oboch prípadoch odpovede zodpovedajú aktuálnej ponuke." },
          { title: "Widget sa zobrazí zákazníkom", text: "Chat sa objaví ako bublina v pravom dolnom rohu vášho e-shopu a odpovedá zákazníkom na otázky o produktoch, sklade, doprave a vrátení tovaru." },
          { title: "Platíte podľa vyriešených prípadov", text: "Vyberiete si jeden z piatich tarifov podľa očakávanej prevádzky. Počíta sa jedno chatové vlákno s úspěšnou odpoveďou, nie každá jednotlivá správa." },
        ],
        pricingHeading: "Cenník",
        pricingIntro: "Pevná mesačná cena za tarif, nie platba za jednotlivú správu. Viete teda vopred, koľko appka bude stáť, aj v mesiaci, keď prídu len pár otázok.",
        thPlan: "Tarif",
        thLimit: "Prípadov / mesiac",
        thPrice: "Cena / mesiac",
        faqHeading: "Časté otázky",
        faq: [
          { q: "Pre koho je Chatnelo určené?", a: "Pre obchodníkov, ktorí chcú zákazníkom automaticky odpovedať na otázky o produktoch, sklade, doprave a vrátení tovaru — či už majú e-shop na Shopify, alebo na inej platforme." },
          { q: "Funguje appka aj mimo Shopify?", a: "Áno. Okrem inštalácie zo Shopify App Store ponúkame aj univerzálnu varinatu pre akykoľvek web: po registrácii na /store/dashboard dostanete embed kód s data-store a data-key, ktorý vložíte do svojich stránok, a produkty spravujete cez riadiaci panel." },
          { q: "Odkiaľ chatbot berie informácie o produktoch?", a: "Priamo z vášho Shopify obchodu cez oficiálne Shopify Admin API — názvy, ceny, popisy a aktuálne skladové zásoby. Nič sa nevymyšľa ani neupravuje ručne." },
          { q: 'Čo sa počíta ako jeden "prípad"?', a: 'Jedno chatové vlákno, v ktorom chatbot úspěšne odpovedal zákazníkovi. Ďalšie správy v rovnakom vlákne sa nepočítajú znova. Po 24 hodinách nečinnosti alebo kliknutí na "Nový chat" začína nový prípad. Jedno vlákno má najviac 20 správ.' },
          { q: "Koľko to stojí?", a: "Päť samoobslužných tarifov s pevnou mesačnou cenou, nie platbou za jednotlivú správu: Start 70 za 379 Kč, Basic 150 za 779 Kč, Growth 400 za 1 270 Kč, Pro 1000 za 2 490 Kč a Business 5000 za 7 990 Kč. Číslo v názve je mesačný limit vyriešených prípadov, nie cena za jeden. Pre väčšiu prevádzku sú k dispozícii aj vyššie tarify na vyžiadanie." },
          { q: "Musím appku programovať alebo upravovať šablónu obchodu?", a: "Nie. Na Shopify appka sama pridá chat widget do vášho obchodu po inštalácii zo Shopify App Store. Mimo Shopify stačí vložiť jeden riadok s <script> kódom, ktorý dostanete po registrácii v riadiacom paneli — žiadny zásah do kódu šablóny ani programovanie nie je potrebné." },
          { q: "Ako appku nasadím na web mimo Shopify?", a: "Zaregistrujete sa priamo na /store/dashboard (formulár na stránke, žiadne volanie API), dostanete jednorazovo ID obchodu a prístupové kľúče. Produkty a pravidlá obchodu (doprava, vrátenie, platba) vyplníte v riadiacom paneli a jeden riadok s <script> kódom vložíte do svojho webu. Tarif zvolíte a zaplatíte priamo v paneli cez Stripe." },
          { q: "Sú dáta zákazníkov v bezpečí?", a: "Appka neukladá osobné údaje zákazníkov. Podporuje povinné Shopify compliance webhooky (žiadosť o dáta, výmaz zákazníka, výmaz obchodu) a všetky webhooky overuje podpisom HMAC." },
          { q: "Ako appku odinštalujem?", a: "Appku odoberáte štandardne cez Shopify administráciu obchodu. Po odinštalovaní appka zmaže uložené pripojenie a dáta o spotrebe daného obchodu." },
          { q: "V akom jazyku chatbot odpovedá?", a: "Štandardne po česky, pretože je navrhnutý pre české a slovenské e-shopy. Odpovedá len na základe reálnych dát z vášho obchodu, nič si nevymyšľa." },
        ],
        chatHeading: "Opýtajte sa rovno chatbota",
        chatPlaceholder: "Napr. Ako dlho trvá inštalácia?",
        chatSend: "Odoslať",
      },
      privacy: {
        title: "Zásady ochrany osobných údajov",
        updated: "Posledná aktualizácia",
        sections: [
          { title: "Kto appku prevádzkuje", body: "Chatnelo prevádzkuje {{name}} (kontakt: {{contactEmail}}, {{address}}). Tento dokument popisuje, aké dáta appka pri prevádzke spracováva a prečo." },
          { title: "Aké dáta appka spracováva — obchodníci na Shopify", body: "Po inštalácii appka uloží prístupový token k vášmu Shopify obchodu (šifrovaný, uložený len na účel čítania produktov a skladu), doménu a interné ID obchodu, a počet mesačne vyriešených chatových prípadov na účely tarifikácie. Appka neukladá žiadne osobné údaje vašich zákazníkov." },
          { title: "Aké dáta appka spracováva — obchody mimo Shopify", body: "Pri registrácii na /store/dashboard appka uloží názov obchodu, kontaktný e-mail, prístupové kľúče k widgetu a riadiacemu panelu, produktový katalóg, ktorý sami vyplníte, a počet mesačne vyriešených chatových prípadov. Ak si zvolíte platený tarif, appka cez Stripe uloží identifikátor zákazníka a predplatného potrebný na fakturaciu." },
          { title: "Správy v chate", body: "Text správy, ktorú návštevník obchodu napíše chatbotovi, appka spolu s katalógom produktov pošle poskytovateľovi AI modelu (OpenAI) kvôli vygenerovaniu odpovede. Appka samotná obsah správ neukladá do databázy — ukladá sa iba počet správ a prípadov kvôli tarifikácii, nie ich obsah." },
          { title: "Kto má k dátam prístup", body: "Spracovanie prebieha u týchto spracovateľov: OpenAI (generovanie odpovedí chatbota), Stripe (platby pri obchodoch mimo Shopify — iba ak si zvolíte platený tarif), Shopify (platby a prihlásenie pri Shopify obchodoch) a Railway (hosting appky a databázy). Appka dáta nepredáva ani neposkytuje nikomu inému." },
          { title: "Ako dlho sa dáta uchovávajú", body: "Dáta Shopify obchodu appka uchováva počas trvania inštalácie. Po odinštalovaní appky zo Shopify administrácie appka do nikoľkoých minút zmaže uložený prístupový token aj históriu spotreby daného obchodu — to zaisťujú webhooky app/uninstalled a shop/redact. Dáta univerzálneho obchodu appka uchováva, kým obchod aktívne používate; o výmaz môžete kedykoľvek požiadať na kontaktnom e-maile vyššie." },
          { title: "Povinné Shopify compliance webhooky", body: "Appka podporuje povinné webhooky customers/data_request, customers/redact a shop/redact. Keďže appka neukladá osobné údaje zákazníkov obchodu, na žiadosť o dáta/výmaz zákazníka nemá čo vracať ani mazať; pri shop/redact odstráni uložené pripojenie a spotrebu daného obchodu. Všetky webhooky appka overuje podpisom HMAC, aby ich nemohol vyvolať nikto iný než Shopify." },
          { title: "Zabezpečenie", body: "Prístupové tokeny appka ukladá šifrované (AES-256-GCM). Prístup k riadiacemu panelu a widgetu univerzálnych obchodov appka overuje časovo bezpečným porovnaním kľúčov, aby sa nedali uhádnuť postupným skúšaním." },
          { title: "Vaše práva", body: "Môžete požiadať o prístup k svojim dátam, ich opravu alebo výmaz, a to na kontaktnom e-maile vyššie. Pri Shopify obchodoch stačí appku odinštalovať — dáta sa zmažú automaticky." },
        ],
      },
      dashboard: {
        title: "Riadiaci panel obchodu",
        signupIntro: "Nemáte ešte obchod? Zaregistrujte sa — je to zadarmo, tarif zvolíte a zaplatíte neskôr.",
        nameLabel: "Názov obchodu",
        emailLabel: "E-mail",
        signupBtn: "Zaregistrovať obchod",
        signupOkStrong: "Uložte si adminKey nižšie bezpečne — znova sa nezobrazí.",
        idLabel: "ID obchodu",
        adminKeyLabel: "adminKey",
        continueBtn: "Pokračovať do panela",
        loginIntro: "Už máte obchod? Zadajte ID obchodu a adminKey, ktoré ste dostali pri registrácii.",
        loginBtn: "Prihlásiť",
        embedIntro: "Vložte tento kód do HTML svojho webu (napr. pred </body>):",
        billingHeading: "Tarif a platba",
        catalogHeading: "Katalóg produktov a pravidlá obchodu",
        catalogIntro: "Pole products je pole objektov s kľúčmi id, nazev, cena, mena, sklad, popis. Pole rules môže obsahovať doprava, vraceni, platba.",
        catalogLabel: "Katalóg (JSON)",
        saveBtn: "Uložiť katalóg",
        usagePrefix: "Spotreba: ",
        planWord: "tarif",
        currentPlanPrefix: "Aktuálny tarif: ",
        noBilling: " Platby zatiaľ nie sú nastavené, tarif beží v testovacom režime.",
        paymentStatusPrefix: " (stav platby: ",
        paymentStatusSuffix: ")",
        noPaymentYet: " (zatiaľ bez platby)",
        perMonthSuffix: " prípadov / mesiac — ",
        currencySuffix: " Kč",
        activePlanBtn: "Aktívny tarif",
        selectBtn: "Vybrať",
        saving: "Ukladám…",
        catalogSaved: "Katalóg uložený.",
      },
      root: {
        intro: "Aplikácia je pripojená. Chat vpravo používa produkty a sklad tohto obchodu.",
        usageCardTitle: "Spotreba v tomto období",
        loading: "Načítavam…",
        planPriceLabel: "Cena tarifu",
        caseHint: "Jeden prípad je jedno chatové vlákno s úspěšnou odpoveďou.",
      },
    },
    de: {
      common: { tryFree: "Kostenlos testen", privacyLink: "Datenschutzerklärung" },
      marketing: {
        tagline: "Ein KI-Chatbot, der Ihre Kunden automatisch beantwortet — auf Basis Ihrer echten Produkte und Lagerbestände. Funktioniert mit Shopify und jeder anderen Website.",
        cta: "Kostenlos testen",
        stepsHeading: "So funktioniert es",
        steps: [
          { title: "App verbinden", text: "Bei Shopify fügen Sie die App aus dem Shopify App Store hinzu und melden sich über den Standard-Shopify-OAuth an. Außerhalb von Shopify registrieren Sie sich kostenlos unter /store/dashboard und erhalten Zugangsschlüssel. In beiden Fällen kopieren Sie nirgendwo ein Passwort." },
          { title: "Der Chatbot lernt Ihr Sortiment automatisch", text: "Bei Shopify liest die App Produkte, Preise und Lagerbestände direkt über die Shopify Admin API. Außerhalb von Shopify tragen Sie Produktkatalog und Shopregeln im Dashboard ein — in beiden Fällen entsprechen die Antworten immer dem aktuellen Angebot." },
          { title: "Das Widget erscheint für Ihre Kunden", text: "Der Chat erscheint als Blase unten rechts in Ihrem Shop und beantwortet Fragen zu Produkten, Lagerbestand, Versand und Rückgabe." },
          { title: "Sie zahlen nach gelösten Fällen", text: "Sie wählen einen von fünf Tarifen passend zum erwarteten Aufkommen. Gezählt wird ein Chat-Thread mit erfolgreicher Antwort, nicht jede einzelne Nachricht." },
        ],
        pricingHeading: "Preise",
        pricingIntro: "Ein fester monatlicher Preis pro Tarif, keine Abrechnung pro Nachricht. Sie wissen also im Voraus, was die App kostet — auch in einem Monat mit nur wenigen Anfragen.",
        thPlan: "Tarif",
        thLimit: "Fälle / Monat",
        thPrice: "Preis / Monat",
        faqHeading: "Häufige Fragen",
        faq: [
          { q: "Für wen ist Chatnelo gedacht?", a: "Für Händler, die Kundenfragen zu Produkten, Lagerbestand, Versand und Rückgabe automatisch beantworten möchten — egal ob ihr Shop auf Shopify oder einer anderen Plattform läuft." },
          { q: "Funktioniert die App auch außerhalb von Shopify?", a: "Ja. Neben der Installation aus dem Shopify App Store bieten wir auch eine universelle Version für jede Website: Nach der Registrierung unter /store/dashboard erhalten Sie einen Einbettungscode mit data-store und data-key, den Sie auf Ihren Seiten einfügen, und verwalten Produkte über das Dashboard." },
          { q: "Woher bezieht der Chatbot die Produktinformationen?", a: "Direkt aus Ihrem Shopify-Shop über die offizielle Shopify Admin API — Namen, Preise, Beschreibungen und aktuelle Lagerbestände. Nichts wird erfunden oder manuell bearbeitet." },
          { q: 'Was zählt als ein "Fall"?', a: 'Ein Chat-Thread, in dem der Chatbot dem Kunden erfolgreich geantwortet hat. Weitere Nachrichten im selben Thread werden nicht erneut gezählt. Nach 24 Stunden Inaktivität oder einem Klick auf "Neuer Chat" beginnt ein neuer Fall. Ein Thread hat maximal 20 Nachrichten.' },
          { q: "Was kostet das?", a: "Fünf Self-Service-Tarife mit festem Monatspreis, keine Abrechnung pro Nachricht: Start 70 für 379 CZK, Basic 150 für 779 CZK, Growth 400 für 1.270 CZK, Pro 1000 für 2.490 CZK und Business 5000 für 7.990 CZK. Die Zahl im Namen ist das monatliche Limit gelöster Fälle, nicht der Preis für einen einzelnen. Für höheres Volumen sind auf Anfrage auch größere Tarife verfügbar." },
          { q: "Muss ich etwas programmieren oder mein Shop-Theme anpassen?", a: "Nein. Bei Shopify fügt die App das Chat-Widget nach der Installation aus dem Shopify App Store selbstständig zu Ihrem Shop hinzu. Außerhalb von Shopify genügt eine Zeile <script>-Code, den Sie nach der Registrierung im Dashboard erhalten — keine Theme-Anpassung, kein Programmieren nötig." },
          { q: "Wie bringe ich die App auf eine Website außerhalb von Shopify?", a: "Sie registrieren sich direkt unter /store/dashboard (ein Formular auf der Seite, kein API-Aufruf nötig) und erhalten einmalig eine Store-ID und Zugangsschlüssel. Produkte und Shopregeln (Versand, Rückgabe, Zahlung) tragen Sie im Dashboard ein und fügen eine Zeile <script>-Code auf Ihrer Website ein. Den Tarif wählen und bezahlen Sie direkt im Dashboard über Stripe." },
          { q: "Sind Kundendaten sicher?", a: "Die App speichert keine personenbezogenen Daten Ihrer Kunden. Sie unterstützt die verpflichtenden Shopify-Compliance-Webhooks (Datenanfrage, Kundenlöschung, Shop-Löschung) und prüft jeden Webhook mit einer HMAC-Signatur." },
          { q: "Wie deinstalliere ich die App?", a: "Sie entfernen sie ganz normal über die Shopify-Administration Ihres Shops. Nach der Deinstallation löscht die App die gespeicherte Verbindung und die Nutzungsdaten dieses Shops." },
          { q: "In welcher Sprache antwortet der Chatbot?", a: "Standardmäßig auf Tschechisch, da er für tschechische und slowakische Shops entwickelt wurde. Er antwortet nur auf Basis echter Daten aus Ihrem Shop und erfindet nichts." },
        ],
        chatHeading: "Fragen Sie den Chatbot direkt",
        chatPlaceholder: "Z. B. Wie lange dauert die Installation?",
        chatSend: "Senden",
      },
      privacy: {
        title: "Datenschutzerklärung",
        updated: "Letzte Aktualisierung",
        sections: [
          { title: "Wer die App betreibt", body: "Chatnelo wird betrieben von {{name}} (Kontakt: {{contactEmail}}, {{address}}). Dieses Dokument beschreibt, welche Daten die App im Betrieb verarbeitet und warum." },
          { title: "Welche Daten die App verarbeitet — Händler auf Shopify", body: "Nach der Installation speichert die App ein Zugriffstoken für Ihren Shopify-Shop (verschlüsselt, nur zum Lesen von Produkten und Lagerbestand gespeichert), Ihre Domain und interne Shop-ID sowie die Anzahl der monatlich gelösten Chat-Fälle zu Abrechnungszwecken. Die App speichert keine personenbezogenen Daten Ihrer Kunden." },
          { title: "Welche Daten die App verarbeitet — Shops außerhalb von Shopify", body: "Bei der Registrierung unter /store/dashboard speichert die App Ihren Shopnamen, Ihre Kontakt-E-Mail, Zugangsschlüssel für Widget und Dashboard, den von Ihnen selbst eingetragenen Produktkatalog sowie die Anzahl der monatlich gelösten Chat-Fälle. Bei einem kostenpflichtigen Tarif speichert die App über Stripe eine Kunden- und Abo-Kennung, die für die Abrechnung nötig ist." },
          { title: "Chat-Nachrichten", body: "Der Text einer Nachricht, die ein Shop-Besucher an den Chatbot schreibt, wird zusammen mit dem Produktkatalog an den KI-Modellanbieter (OpenAI) gesendet, um eine Antwort zu erzeugen. Die App selbst speichert den Nachrichteninhalt nicht in ihrer Datenbank — gespeichert wird nur die Anzahl der Nachrichten und Fälle zu Abrechnungszwecken, nicht deren Inhalt." },
          { title: "Wer Zugriff auf die Daten hat", body: "Die Verarbeitung erfolgt bei folgenden Auftragsverarbeitern: OpenAI (Erzeugen der Chatbot-Antworten), Stripe (Zahlungen für Shops außerhalb von Shopify — nur bei einem kostenpflichtigen Tarif), Shopify (Zahlungen und Anmeldung für Shopify-Shops) und Railway (Hosting von App und Datenbank). Die App verkauft oder gibt Daten nicht an Dritte weiter." },
          { title: "Wie lange Daten gespeichert werden", body: "Die App speichert die Daten eines Shopify-Shops für die Dauer der Installation. Nach der Deinstallation der App aus der Shopify-Administration löscht die App innerhalb weniger Minuten das gespeicherte Zugriffstoken sowie den Nutzungsverlauf des Shops — dafür sorgen die Webhooks app/uninstalled und shop/redact. Daten eines universellen Shops speichert die App, solange Sie den Shop aktiv nutzen; eine Löschung können Sie jederzeit über die oben genannte Kontakt-E-Mail beantragen." },
          { title: "Verpflichtende Shopify-Compliance-Webhooks", body: "Die App unterstützt die verpflichtenden Webhooks customers/data_request, customers/redact und shop/redact. Da die App keine personenbezogenen Kundendaten des Shops speichert, gibt es bei einer Daten-/Löschanfrage eines Kunden nichts zurückzugeben oder zu löschen; bei shop/redact entfernt sie die gespeicherte Verbindung und Nutzung des jeweiligen Shops. Die App prüft jeden Webhook mit einer HMAC-Signatur, sodass ihn nur Shopify auslösen kann." },
          { title: "Sicherheit", body: "Die App speichert Zugriffstoken verschlüsselt (AES-256-GCM). Der Zugriff auf Dashboard und Widget universeller Shops wird über einen zeitsicheren Schlüsselvergleich geprüft, damit Schlüssel nicht durch wiederholtes Ausprobieren erraten werden können." },
          { title: "Ihre Rechte", body: "Sie können Zugriff auf Ihre Daten, deren Berichtigung oder Löschung über die oben genannte Kontakt-E-Mail beantragen. Bei Shopify-Shops genügt die Deinstallation der App — die Daten werden automatisch gelöscht." },
        ],
      },
      dashboard: {
        title: "Shop-Dashboard",
        signupIntro: "Noch keinen Shop? Registrieren Sie sich — kostenlos, den Tarif wählen und bezahlen Sie später.",
        nameLabel: "Shopname",
        emailLabel: "E-Mail",
        signupBtn: "Shop registrieren",
        signupOkStrong: "Speichern Sie den adminKey unten sicher ab — er wird nicht erneut angezeigt.",
        idLabel: "Shop-ID",
        adminKeyLabel: "adminKey",
        continueBtn: "Weiter zum Dashboard",
        loginIntro: "Sie haben bereits einen Shop? Geben Sie die Shop-ID und den adminKey ein, die Sie bei der Registrierung erhalten haben.",
        loginBtn: "Anmelden",
        embedIntro: "Fügen Sie diesen Code in das HTML Ihrer Website ein (z. B. vor </body>):",
        billingHeading: "Tarif und Zahlung",
        catalogHeading: "Produktkatalog und Shopregeln",
        catalogIntro: "Das Feld products ist ein Array von Objekten mit den Schlüsseln id, nazev, cena, mena, sklad, popis. Das Feld rules kann doprava, vraceni, platba enthalten.",
        catalogLabel: "Katalog (JSON)",
        saveBtn: "Katalog speichern",
        usagePrefix: "Nutzung: ",
        planWord: "Tarif",
        currentPlanPrefix: "Aktueller Tarif: ",
        noBilling: " Die Zahlung ist noch nicht eingerichtet, der Tarif läuft im Testmodus.",
        paymentStatusPrefix: " (Zahlungsstatus: ",
        paymentStatusSuffix: ")",
        noPaymentYet: " (noch keine Zahlung)",
        perMonthSuffix: " Fälle / Monat — ",
        currencySuffix: " CZK",
        activePlanBtn: "Aktiver Tarif",
        selectBtn: "Auswählen",
        saving: "Speichere…",
        catalogSaved: "Katalog gespeichert.",
      },
      root: {
        intro: "Die App ist verbunden. Der Chat rechts verwendet die Produkte und den Lagerbestand dieses Shops.",
        usageCardTitle: "Nutzung in diesem Zeitraum",
        loading: "Lade…",
        planPriceLabel: "Tarifpreis",
        caseHint: "Ein Fall ist ein Chat-Thread mit einer erfolgreichen Antwort.",
      },
    },
    pl: {
      common: { tryFree: "Wypróbuj za darmo", privacyLink: "Polityka prywatności" },
      marketing: {
        tagline: "Chatbot AI, który odpowiada Twoim klientom automatycznie — na podstawie rzeczywistych produktów i stanu magazynowego. Działa na Shopify i na dowolnej innej stronie.",
        cta: "Wypróbuj za darmo",
        stepsHeading: "Jak to działa",
        steps: [
          { title: "Podłączasz aplikację", text: "Na Shopify dodajesz aplikację ze Shopify App Store, logowanie odbywa się przez standardowy Shopify OAuth. Poza Shopify rejestrujesz się bezpłatnie na /store/dashboard i otrzymujesz klucze dostępu. W obu przypadkach nigdzie nie kopiujesz žadnego hasła." },
          { title: "Chatbot sam uczy się Twojego asortymentu", text: "Na Shopify aplikacja czyta produkty, ceny i stany magazynowe bezpośrednio z Shopify Admin API. Poza Shopify uzupełniasz katalog produktów i zasady sklepu w panelu — w obu przypadkach odpowiedzi zawsze odpowiadają aktualnej ofercie." },
          { title: "Widget pojawia się u klientów", text: "Czat pojawia się jako dymek w prawym dolnym rogu Twojego sklepu i odpowiada klientom na pytania o produkty, stan magazynowy, dostawę i zwroty." },
          { title: "Płacisz za rozwiązane przypadki", text: "Wybierasz jeden z pięciu planów zależnie od oczekiwanego ruchu. Liczy się jeden wątek czatu z udaną odpowiedzią, a nie każda pojedyncza wiadomość." },
        ],
        pricingHeading: "Cennik",
        pricingIntro: "Stała miesięczna cena za plan, a nie opłata za pojedynczą wiadomość. Wiesz więc z góry, ile aplikacja będzie kosztować, nawet w miesiącu z zaledwie kilkoma pytaniami.",
        thPlan: "Plan",
        thLimit: "Przypadków / miesiąc",
        thPrice: "Cena / miesiąc",
        faqHeading: "Najczęstsze pytania",
        faq: [
          { q: "Dla kogo jest Chatnelo?", a: "Dla sprzedawców, którzy chcą automatycznie odpowiadać klientom na pytania o produkty, stan magazynowy, dostawę i zwroty — niezależnie od tego, czy sklep działa na Shopify, czy na innej platformie." },
          { q: "Czy aplikacja działa też poza Shopify?", a: "Tak. Oprócz instalacji ze Shopify App Store oferujemy też uniwersalną wersję dla dowolnej strony: po rejestracji na /store/dashboard otrzymujesz kod do wklejenia z data-store i data-key, który dodajesz do swoich stron, a produktami zarządzasz przez panel." },
          { q: "Skąd chatbot bierze informacje o produktach?", a: "Bezpośrednio z Twojego sklepu Shopify przez oficjalne Shopify Admin API — nazwy, ceny, opisy i aktualne stany magazynowe. Nic nie jest wymyślane ani edytowane ręcznie." },
          { q: 'Co liczy się jako jeden "przypadek"?', a: 'Jeden wątek czatu, w którym chatbot skutecznie odpowiedział klientowi. Kolejne wiadomości w tym samym wątku nie są liczone ponownie. Po 24 godzinach nieaktywności lub kliknięciu "Nowy czat" zaczyna się nowy przypadek. Jeden wątek ma maksymalnie 20 wiadomości.' },
          { q: "Ile to kosztuje?", a: "Pięć samoobsługowych planów ze stałą miesięczną ceną, a nie opłatą za pojedynczą wiadomość: Start 70 za 379 CZK, Basic 150 za 779 CZK, Growth 400 za 1270 CZK, Pro 1000 za 2490 CZK oraz Business 5000 za 7990 CZK. Liczba w nazwie to miesięczny limit rozwiązanych przypadków, a nie cena za jeden. Dla większego ruchu dostępne są też wyższe plany na życzenie." },
          { q: "Czy muszę cokolwiek programować albo edytować szablon sklepu?", a: "Nie. Na Shopify aplikacja sama dodaje widget czatu do sklepu po instalacji ze Shopify App Store. Poza Shopify wystarczy dodać jedną linijkę kodu <script>, którą otrzymasz po rejestracji w panelu — żadnej ingerencji w kod szablonu ani programowania." },
          { q: "Jak wdrożyć aplikację na stronie poza Shopify?", a: "Rejestrujesz się bezpośrednio na /store/dashboard (formularz na stronie, bez wywołań API) i jednorazowo otrzymujesz ID sklepu oraz klucze dostępu. Produkty i zasady sklepu (dostawa, zwroty, płatność) uzupełniasz w panelu, a jedną linijkę kodu <script> dodajesz do swojej strony. Plan wybierasz i opłacasz bezpośrednio w panelu przez Stripe." },
          { q: "Czy dane klientów są bezpieczne?", a: "Aplikacja nie przechowuje danych osobowych Twoich klientów. Obsługuje obowiązkowe webhooki zgodności Shopify (żądanie danych, usunięcie klienta, usunięcie sklepu) i weryfikuje każdy webhook podpisem HMAC." },
          { q: "Jak odinstalować aplikację?", a: "Usuwasz ją standardowo przez panel administracyjny Shopify. Po odinstalowaniu aplikacja usuwa zapisane połączenie i dane o zużyciu danego sklepu." },
          { q: "W jakim języku odpowiada chatbot?", a: "Domyślnie po czesku, ponieważ został zaprojektowany dla sklepów czeskich i słowackich. Odpowiada wyłącznie na podstawie rzeczywistych danych z Twojego sklepu, niczego nie zmyśla." },
        ],
        chatHeading: "Zapytaj chatbota bezpośrednio",
        chatPlaceholder: "Np. Jak długo trwa instalacja?",
        chatSend: "Wyślij",
      },
      privacy: {
        title: "Polityka prywatności",
        updated: "Ostatnia aktualizacja",
        sections: [
          { title: "Kto prowadzi aplikację", body: "Chatnelo prowadzi {{name}} (kontakt: {{contactEmail}}, {{address}}). Ten dokument opisuje, jakie dane aplikacja przetwarza podczas działania i dlaczego." },
          { title: "Jakie dane przetwarza aplikacja — sprzedawcy na Shopify", body: "Po instalacji aplikacja zapisuje token dostępu do Twojego sklepu Shopify (zaszyfrowany, zapisany wyłącznie do odczytu produktów i stanu magazynowego), domenę i wewnętrzne ID sklepu oraz liczbę przypadków czatu rozwiązanych w danym miesiącu do celów rozliczeniowych. Aplikacja nie przechowuje żadnych danych osobowych Twoich klientów." },
          { title: "Jakie dane przetwarza aplikacja — sklepy poza Shopify", body: "Przy rejestracji na /store/dashboard aplikacja zapisuje nazwę sklepu, adres e-mail kontaktowy, klucze dostępu do widgetu i panelu, katalog produktów, który sam uzupełniasz, oraz liczbę przypadków czatu rozwiązanych w danym miesiącu. Jeśli wybierzesz płatny plan, aplikacja zapisuje przez Stripe identyfikator klienta i subskrypcji potrzebny do rozliczeń." },
          { title: "Wiadomości w czacie", body: "Treść wiadomości, którą odwiedzający sklep wysyła do chatbota, aplikacja przesyła wraz z katalogiem produktów do dostawcy modelu AI (OpenAI) w celu wygenerowania odpowiedzi. Sama aplikacja nie zapisuje treści wiadomości w bazie danych — zapisywana jest tylko liczba wiadomości i przypadków do celów rozliczeniowych, a nie ich treść." },
          { title: "Kto ma dostęp do danych", body: "Przetwarzanie odbywa się u następujących podmiotów przetwarzających: OpenAI (generowanie odpowiedzi chatbota), Stripe (płatności dla sklepów poza Shopify — tylko przy wyborze płatnego planu), Shopify (płatności i logowanie dla sklepów na Shopify) oraz Railway (hosting aplikacji i bazy danych). Aplikacja nie sprzedaje ani nie przekazuje danych nikomu innemu." },
          { title: "Jak długo dane są przechowywane", body: "Dane sklepu Shopify aplikacja przechowuje przez czas trwania instalacji. Po odinstalowaniu aplikacji z panelu administracyjnego Shopify aplikacja w ciągu kilku minut usuwa zapisany token dostępu oraz historię zużycia danego sklepu — zapewniają to webhooki app/uninstalled i shop/redact. Dane sklepu uniwersalnego aplikacja przechowuje, dopóki aktywnie z niego korzystasz; o usunięcie możesz poprosić w każdej chwili na powyższy adres e-mail kontaktowy." },
          { title: "Obowiązkowe webhooki zgodności Shopify", body: "Aplikacja obsługuje obowiązkowe webhooki customers/data_request, customers/redact i shop/redact. Ponieważ aplikacja nie przechowuje danych osobowych klientów sklepu, przy żądaniu danych/usunięcia klienta nie ma czego zwracać ani usuwać; przy shop/redact usuwa zapisane połączenie i zużycie danego sklepu. Aplikacja weryfikuje każdy webhook podpisem HMAC, dzięki czemu może go wywołać wyłącznie Shopify." },
          { title: "Bezpieczeństwo", body: "Aplikacja przechowuje tokeny dostępu w postaci zaszyfrowanej (AES-256-GCM). Dostęp do panelu i widgetu sklepów uniwersalnych aplikacja weryfikuje przez bezpieczne czasowo porównanie kluczy, aby nie dało się ich odgadnąć metodą prób." },
          { title: "Twoje prawa", body: "Możesz poprosić o dostęp do swoich danych, ich poprawienie lub usunięcie, pisząc na powyższy adres e-mail kontaktowy. W przypadku sklepów Shopify wystarczy odinstalować aplikację — dane zostaną usunięte automatycznie." },
        ],
      },
      dashboard: {
        title: "Panel sklepu",
        signupIntro: "Nie masz jeszcze sklepu? Zarejestruj się — to bezpłatne, plan wybierzesz i opłacisz później.",
        nameLabel: "Nazwa sklepu",
        emailLabel: "E-mail",
        signupBtn: "Zarejestruj sklep",
        signupOkStrong: "Zapisz poniższy adminKey w bezpiecznym miejscu — nie zostanie pokazany ponownie.",
        idLabel: "ID sklepu",
        adminKeyLabel: "adminKey",
        continueBtn: "Przejdź do panelu",
        loginIntro: "Masz już sklep? Podaj ID sklepu i adminKey, które otrzymałeś przy rejestracji.",
        loginBtn: "Zaloguj",
        embedIntro: "Dodaj ten kod do HTML swojej strony (np. przed </body>):",
        billingHeading: "Plan i płatność",
        catalogHeading: "Katalog produktów i zasady sklepu",
        catalogIntro: "Pole products to tablica obiektów z kluczami id, nazev, cena, mena, sklad, popis. Pole rules może zawierać doprava, vraceni, platba.",
        catalogLabel: "Katalog (JSON)",
        saveBtn: "Zapisz katalog",
        usagePrefix: "Zużycie: ",
        planWord: "plan",
        currentPlanPrefix: "Aktualny plan: ",
        noBilling: " Płatności nie są jeszcze skonfigurowane, plan działa w trybie testowym.",
        paymentStatusPrefix: " (status płatności: ",
        paymentStatusSuffix: ")",
        noPaymentYet: " (jeszcze bez płatności)",
        perMonthSuffix: " przypadków / miesiąc — ",
        currencySuffix: " CZK",
        activePlanBtn: "Aktywny plan",
        selectBtn: "Wybierz",
        saving: "Zapisywanie…",
        catalogSaved: "Katalog zapisany.",
      },
      root: {
        intro: "Aplikacja jest połączona. Czat po prawej używa produktów i stanu magazynowego tego sklepu.",
        usageCardTitle: "Zużycie w tym okresie",
        loading: "Ładowanie…",
        planPriceLabel: "Cena planu",
        caseHint: "Jeden przypadek to jeden wątek czatu z udaną odpowiedzią.",
      },
    },
  };

  window.CHATNELO_I18N = translations;

  function getPath(obj, dottedPath) {
    return dottedPath.split(".").reduce(function (node, key) {
      return node && node[key] !== undefined ? node[key] : undefined;
    }, obj);
  }

  function detectLang() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS.some(function (l) { return l.code === saved; })) return saved;
    } catch (e) {}
    var nav = ((navigator.language || "cs").split("-")[0] || "cs").toLowerCase();
    return LANGS.some(function (l) { return l.code === nav; }) ? nav : "cs";
  }

  function applyLang(lang) {
    var dict = translations[lang] || translations.cs;

    document.documentElement.lang = lang;

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var value = getPath(dict, el.getAttribute("data-i18n"));
      if (typeof value === "string") el.textContent = value;
    }

    var placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < placeholderNodes.length; j++) {
      var pEl = placeholderNodes[j];
      var pValue = getPath(dict, pEl.getAttribute("data-i18n-placeholder"));
      if (typeof pValue === "string") pEl.placeholder = pValue;
    }

    var templateNodes = document.querySelectorAll("[data-i18n-template]");
    for (var k = 0; k < templateNodes.length; k++) {
      var tEl = templateNodes[k];
      var tValue = getPath(dict, tEl.getAttribute("data-i18n-template"));
      if (typeof tValue === "string") {
        var operator = window.CHATNELO_OPERATOR || {};
        tValue = tValue
          .replace(/\{\{name\}\}/g, operator.name || "")
          .replace(/\{\{contactEmail\}\}/g, operator.contactEmail || "")
          .replace(/\{\{address\}\}/g, operator.address || "");
        tEl.textContent = tValue;
      }
    }

    var currentFlagEl = document.getElementById("chatnelo-lang-current");
    if (currentFlagEl) {
      var current = LANGS.filter(function (l) { return l.code === lang; })[0];
      currentFlagEl.textContent = current ? current.flag : "🇨🇿";
    }

    window.CHATNELO_LANG = lang;
    window.CHATNELO_T = function (path) { return getPath(dict, path); };
    document.dispatchEvent(new CustomEvent("chatnelo:langchange", { detail: { lang: lang } }));
  }

  function buildSwitcher() {
    var mount = document.getElementById("chatnelo-lang-switcher");
    if (!mount) return;

    var html = '<button type="button" id="chatnelo-lang-current" aria-haspopup="true" aria-expanded="false" aria-label="Jazyk / Language"></button>' +
      '<div id="chatnelo-lang-dropdown" role="menu">' +
      LANGS.map(function (l) {
        return '<button type="button" class="chatnelo-lang-option" data-lang="' + l.code + '" title="' + l.label + '" role="menuitem">' + l.flag + '</button>';
      }).join("") +
      "</div>";
    mount.innerHTML = html;

    var toggleBtn = document.getElementById("chatnelo-lang-current");
    var dropdown = document.getElementById("chatnelo-lang-dropdown");

    toggleBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = dropdown.classList.contains("open");
      dropdown.classList.toggle("open", !open);
      toggleBtn.setAttribute("aria-expanded", String(!open));
    });

    document.addEventListener("click", function () {
      dropdown.classList.remove("open");
      toggleBtn.setAttribute("aria-expanded", "false");
    });

    var optionButtons = mount.querySelectorAll(".chatnelo-lang-option");
    for (var i = 0; i < optionButtons.length; i++) {
      optionButtons[i].addEventListener("click", function (event) {
        event.stopPropagation();
        var lang = this.getAttribute("data-lang");
        try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
        applyLang(lang);
        dropdown.classList.remove("open");
        toggleBtn.setAttribute("aria-expanded", "false");
      });
    }

    applyLang(detectLang());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildSwitcher);
  } else {
    buildSwitcher();
  }
})();
