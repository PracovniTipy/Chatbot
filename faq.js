const HOW_IT_WORKS = [
  {
    title: "Připojíte appku",
    text: "Na Shopify appku přidáte ze Shopify App Store, přihlásí se přes standardní Shopify OAuth. Mimo Shopify se zaregistrujete zdarma na /store/dashboard a dostanete přístupové klíče. V obou případech nikam nekopírujete žádné heslo.",
  },
  {
    title: "Chatbot se sám naučí váš sortiment",
    text: "Na Shopify appka čte produkty, ceny a skladové zásoby přímo z Shopify Admin API. Mimo Shopify vyplníte katalog produktů a pravidla obchodu v řídicím panelu — v obou případech odpovědi odpovídají aktuální nabídce.",
  },
  {
    title: "Widget se zobrazí zákazníkům",
    text: "Chat se objeví jako bublina v pravém dolním rohu vašeho e-shopu a odpovídá zákazníkům na dotazy o produktech, skladu, dopravě a vrácení zboží.",
  },
  {
    title: "Platíte podle vyřešených případů",
    text: "Vyberete si jeden z pěti tarifů podle očekávaného provozu. Počítá se jedno chatové vlákno s úspěšnou odpovědí, ne každá jednotlivá zpráva.",
  },
];

const FAQ = [
  {
    question: "Pro koho je Chatnelo určené?",
    answer: "Pro obchodníky, kteří chtějí zákazníkům automaticky odpovídat na dotazy o produktech, skladu, dopravě a vrácení zboží — ať už mají e-shop na Shopify, nebo na jiné platformě.",
  },
  {
    question: "Funguje appka i mimo Shopify?",
    answer: "Ano. Kromě instalace ze Shopify App Store nabízíme i univerzální variantu pro jakýkoli web: po registraci na /store/dashboard dostanete embed kód s data-store a data-key, který vložíte do svých stránek, a produkty spravujete přes řídicí panel.",
  },
  {
    question: "Odkud chatbot bere informace o produktech?",
    answer: "Přímo z vašeho Shopify obchodu přes oficiální Shopify Admin API — názvy, ceny, popisy a aktuální skladové zásoby. Nic se nevymýšlí ani neupravuje ručně.",
  },
  {
    question: "Co se počítá jako jeden \"případ\"?",
    answer: "Jedno chatové vlákno, ve kterém chatbot úspěšně odpověděl zákazníkovi. Další zprávy ve stejném vlákně se nepočítají znovu. Po 24 hodinách nečinnosti nebo kliknutí na \"Nový chat\" začíná nový případ. Jedno vlákno má nejvýše 20 zpráv.",
  },
  {
    question: "Kolik to stojí?",
    answer: "Pět samoobslužných tarifů s pevnou měsíční cenou, ne platbou za jednotlivou zprávu: Start 70 za 379 Kč, Basic 150 za 779 Kč, Growth 400 za 1 270 Kč, Pro 1000 za 2 490 Kč a Business 5000 za 7 990 Kč. Číslo v názvu je měsíční limit vyřešených případů, ne cena za jeden. Pro větší provoz jsou k dispozici i vyšší tarify na vyžádání.",
  },
  {
    question: "Musím appku programovat nebo upravovat šablonu obchodu?",
    answer: "Ne. Na Shopify appka sama přidá chat widget do vašeho obchodu po instalaci ze Shopify App Store. Mimo Shopify stačí vložit jeden řádek se <script> kódem, který dostanete po registraci v řídicím panelu — žádný zásah do kódu šablony ani programování není potřeba.",
  },
  {
    question: "Jak appku nasadím na web mimo Shopify?",
    answer: "Zaregistrujete se přímo na /store/dashboard (formulář na stránce, žádné volání API), dostanete jednorázově ID obchodu a přístupové klíče. Produkty a pravidla obchodu (doprava, vrácení, platba) vyplníte v řídicím panelu a jeden řádek se <script> kódem vložíte do svého webu. Tarif zvolíte a zaplatíte přímo v panelu přes Stripe.",
  },
  {
    question: "Jsou data zákazníků v bezpečí?",
    answer: "Appka neukládá zákaznické osobní údaje. Podporuje povinné Shopify compliance webhooky (žádost o data, výmaz zákazníka, výmaz obchodu) a všechny webhooky ověřuje podpisem HMAC.",
  },
  {
    question: "Jak appku odinstaluji?",
    answer: "Appku odebíráte standardně přes Shopify administraci obchodu. Po odinstalaci appka smaže uložené připojení a data o spotřebě daného obchodu.",
  },
  {
    question: "V jakém jazyce chatbot odpovídá?",
    answer: "Standardně česky, protože je navržený pro české a slovenské e-shopy. Odpovídá jen na základě reálných dat z vašeho obchodu, nic si nevymýšlí.",
  },
];

module.exports = { HOW_IT_WORKS, FAQ };
