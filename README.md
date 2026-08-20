# Eshop Assistant AI

Univerzální AI chatbot pro e-shopy s napojením na produkty a sklad obchodu. Backend běží na Railway, připojení obchodů a spotřeba se ukládají do PostgreSQL.

Appka funguje ve dvou variantách:

1. **Shopify** – appka ze Shopify App Store, přihlášení přes OAuth, produkty a sklad se čtou přímo ze Shopify Admin API, platby jdou přes Shopify Billing.
2. **Univerzální (mimo Shopify)** – pro jakýkoli web. Obchodník se zaregistruje na `/store/dashboard` (backend: `POST /store/signup`), dostane ID obchodu a přístupové klíče (`apiKey`, `adminKey`), produkty a pravidla obchodu (doprava, vrácení, platba) vyplní v řídicím panelu (`GET/PUT /store/:id`, `/store/:id/catalog`) a vloží jeden `<script>` řádek (`public/embed.js`) do svého webu. Chat běží přes `POST /widget/chat`, ověřený `storeId` + `apiKey`. Logika mimo endpointy je ve `stores.js`. Nový obchod dostane výchozí tarif Start 70 bez vynucení platby, dokud v řídicím panelu nezvolí tarif a nezaplatí přes Stripe (`POST /store/:id/checkout`, webhook `POST /stripe/webhook`) — bez nastavených `STRIPE_*` proměnných běží tarif dál v testovacím režimu.

Povinné Shopify compliance webhooky (`customers/data_request`, `customers/redact`, `shop/redact`) a odinstalační webhook jsou deklarované v `shopify.app.toml`. Endpoint `/webhooks` ověřuje podpis HMAC. Aplikace neukládá zákaznické údaje; při `shop/redact` odstraní uložené připojení a spotřebu obchodu.

## Tarify

Pět samoobslužných tarifů má být v Shopify nastaveno přesně pod těmito názvy:

| Název v Shopify | Vyřešených případů / měsíc | Cena / měsíc |
|---|---:|---:|
| Start 70 | 70 | 379 Kč |
| Basic 150 | 150 | 779 Kč |
| Growth 400 | 400 | 1 270 Kč |
| Pro 1000 | 1 000 | 2 490 Kč |
| Business 5000 | 5 000 | 7 990 Kč |

Vyšší tarify jsou v kódu připravené jako soukromé nabídky: Scale 12000, Scale 30000, Scale 80000, Enterprise 200000 a Enterprise 500000.

Jeden případ je jedno chatové vlákno, ve kterém chatbot úspěšně odpověděl. Stejné vlákno se nepočítá znovu při každé zprávě. Po 24 hodinách neaktivity nebo po kliknutí na „Nový chat“ začne nový případ. Jeden případ má nejvýše 20 zpráv.

## Proměnné Railway

- `DATABASE_URL` – PostgreSQL databáze.
- `OPENAI_API_KEY` – klíč OpenAI.
- `OPENAI_MODEL` – používaný model.
- `SHOPIFY_CLIENT_ID` a `SHOPIFY_CLIENT_SECRET` – údaje Shopify aplikace.
- `USAGE_METERING_ENABLED=true` – zapne bezpečné počítání případů.
- `SHOPIFY_DEFAULT_PLAN_HANDLE=start-70` – testovací tarif, dokud není zapnuté placení.
- `SHOPIFY_SUBSCRIPTION_REQUIRED=false` – ponechat `false` během testování; změnit na `true` až po vytvoření a ověření plánů v Shopify.
- `SHOPIFY_USAGE_BILLING_ENABLED=false` – u pevných měsíčních tarifů musí zůstat `false`, aby se každý případ navíc neúčtoval jako samostatná položka.
- `MAX_MESSAGES_PER_CASE=20` – ochrana proti nekonečnému vláknu.
- `STRIPE_SECRET_KEY` – tajný klíč Stripe účtu; bez něj běží univerzální (mimo Shopify) tarify jen v testovacím režimu.
- `STRIPE_WEBHOOK_SECRET` – podpisový klíč webhooku `POST /stripe/webhook`, který ve Stripe napojte na eventy `checkout.session.completed`, `customer.subscription.updated` a `customer.subscription.deleted`.
- `STRIPE_PRICE_<TARIF>` – Stripe Price ID pro každý samoobslužný tarif, např. `STRIPE_PRICE_START_70`, `STRIPE_PRICE_BASIC_150`, `STRIPE_PRICE_GROWTH_400`, `STRIPE_PRICE_PRO_1000`, `STRIPE_PRICE_BUSINESS_5000` (název proměnné = handle tarifu velkými písmeny s podtržítky). Tarif bez nastavené ceny nejde v checkoutu vybrat.
- `GENERIC_SUBSCRIPTION_REQUIRED=false` – ponechat `false` během testování univerzálních obchodů; změnit na `true`, až bude Stripe checkout ověřený, aby `/widget/chat` vyžadoval aktivní platbu.

## Kontrola a nasazení

```sh
npm test
npx --yes @shopify/cli@latest app deploy
```

Po pushnutí backendu do `main` Railway vytvoří nový deploy. Shopify CLI je potřeba spustit při změně Theme App Extension.
