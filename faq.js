const HOW_IT_WORKS = [
  {
    title: "Nainstalujete appku",
    text: "Přidáte Eshop Assistant AI ze Shopify App Store na svůj obchod. Appka se připojí přes standardní Shopify přihlášení, žádné heslo ani API klíč nikam nekopírujete.",
  },
  {
    title: "Chatbot se sám naučí váš sortiment",
    text: "Po připojení appka čte produkty, ceny a skladové zásoby přímo z vašeho Shopify obchodu, takže odpovědi vždy odpovídají aktuální nabídce.",
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
    question: "Pro koho je Eshop Assistant AI určený?",
    answer: "Pro obchodníky, kteří mají e-shop na platformě Shopify a chtějí zákazníkům automaticky odpovídat na dotazy o produktech, skladu, dopravě a vrácení zboží.",
  },
  {
    question: "Funguje appka i mimo Shopify?",
    answer: "Ne. Eshop Assistant AI teď funguje výhradně pro obchody na Shopify — přihlášení, čtení produktů i platby jdou přes Shopify.",
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
    answer: "Pět samoobslužných tarifů podle počtu vyřešených případů za měsíc: Start 70 za 379 Kč, Basic 150 za 779 Kč, Growth 400 za 1 270 Kč, Pro 1000 za 2 490 Kč a Business 5000 za 7 990 Kč. Pro větší provoz jsou k dispozici i vyšší tarify na vyžádání.",
  },
  {
    question: "Musím appku programovat nebo upravovat šablonu obchodu?",
    answer: "Ne. Po instalaci ze Shopify App Store appka sama přidá chat widget do vašeho obchodu, žádný zásah do kódu šablony není potřeba.",
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
