=== Chatnelo – AI Chatbot for WooCommerce ===
Contributors: broswarsstudio
Tags: chatbot, ai chatbot, woocommerce, live chat, customer support
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI shopping assistant that answers your customers 24/7 from your real products, prices, stock and shipping rules – in their own language.

== Description ==

**Chatnelo** adds a friendly AI chat to your WooCommerce store. It answers the questions your customers ask every day – "Is this in stock?", "Do you have it in size M?", "How much is shipping?", "Any gift ideas under $50?" – using only your store's real data. When it recommends a product, it shows a clickable product card that leads straight to the product page.

No more lost sales at 2 AM because nobody was there to answer.

= Features =

* **Answers 24/7** from your real products, prices and stock – it never makes things up
* **Clickable product cards** right in the chat
* **Speaks your customer's language** – English, German, Spanish, French, Czech, Polish, Slovak and many more
* **Your brand color, title, greeting and position**
* **Automatic product sync** – the plugin publishes a product feed that Chatnelo refreshes every 6 hours
* **Set up in 5 minutes** – no coding

= How it works =

1. Install the plugin and create a free Chatnelo account.
2. Paste your Store ID and widget key into the plugin settings.
3. Paste the product feed address into your Chatnelo dashboard.
4. The chat bubble appears on your store and starts answering.

= Pricing =

Chatnelo is a hosted service. Every new account can try the full version for 3 days for free, without a card. After that you choose a monthly plan in the Chatnelo dashboard. Current plans and prices: https://chatnelo.com

= External service =

This plugin connects to the Chatnelo service (https://chatnelo.com), made by BrosWars Studio, to show the chat widget and to generate answers. It is required for the plugin to work.

* The chat widget script (https://chatnelo.com/embed.js) is loaded on your storefront pages once the plugin is connected.
* Messages your visitors type into the chat are sent to the Chatnelo service, which uses OpenAI to generate the answer. Chatnelo does not store the content of the messages, only a count of conversations for billing.
* The plugin publishes a public product feed at /wp-json/chatnelo/v1/feed with the same product data that is already visible in your store (name, description, price, stock status, link, image and category). The Chatnelo service downloads it to answer product questions.

Terms and privacy policy: https://chatnelo.com/privacy

== Installation ==

1. In WordPress go to **Plugins → Add New**, search for "Chatnelo" and click **Install Now**, then **Activate**.
2. Open **Settings → Chatnelo AI Chatbot** and click **Open Chatnelo dashboard** to create your free account.
3. Copy your **Store ID** and **widget key** from the dashboard into the plugin settings and click **Save Changes**.
4. Copy the product feed address from the plugin settings, paste it in the Chatnelo dashboard under **Products from XML feed** and click **Load products from feed**.

Need help? Write to support@chatnelo.com.

== Frequently Asked Questions ==

= Do I need to code anything? =

No. The plugin adds the chat and the product feed automatically. You only copy two values from your Chatnelo dashboard.

= Is there a free trial? =

Yes. Every account can try the full version for 3 days for free, without a card. Then you choose a plan.

= Which languages does it speak? =

It replies in the language the customer writes in.

= Where does the chatbot get its answers? =

Only from your store: products, prices, stock and the shipping, payment and returns information you add in the Chatnelo dashboard. If it does not know an answer, it says so instead of guessing.

= Does it slow down my store? =

No. The chat script loads asynchronously in the footer after your page.

= Can I change the colors and the text? =

Yes. In **Settings → Chatnelo AI Chatbot** you can set your brand color, the chat position, the title and the greeting.

== Changelog ==

= 1.1.0 =
* New guided settings page with connection status and one-click copy of the product feed.
* Setup reminder until the plugin is connected (dismissible).
* Service moved to the chatnelo.com domain.

= 1.0.1 =
* Text domain matches the plugin slug.

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 1.1.0 =
Easier guided setup and the new chatnelo.com address. Recommended for everyone.
