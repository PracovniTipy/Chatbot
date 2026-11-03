<?php
/**
 * Plugin Name:       Chatnelo – AI Chatbot for WooCommerce
 * Plugin URI:        https://chatnelo.com
 * Description:       AI shopping assistant that answers your customers 24/7 using your real products, prices, stock and shipping rules. Shows clickable product cards and replies in the customer's language.
 * Version:           1.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            BrosWars Studio
 * Author URI:        https://chatnelo.com
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       chatnelo-ai-chatbot-for-woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CHATNELO_VERSION', '1.1.0' );
define( 'CHATNELO_SERVICE_URL', 'https://chatnelo.com' );

/* ---------------------------------------------------------------- settings */

function chatnelo_default_options() {
	return array(
		'store_id'   => '',
		'widget_key' => '',
		'color'      => '#312e81',
		'position'   => 'right',
		'title'      => '',
		'greeting'   => '',
	);
}

function chatnelo_options() {
	return wp_parse_args( get_option( 'chatnelo_options', array() ), chatnelo_default_options() );
}

function chatnelo_is_connected() {
	$o = chatnelo_options();
	return '' !== $o['store_id'] && '' !== $o['widget_key'];
}

function chatnelo_settings_url() {
	return admin_url( 'options-general.php?page=chatnelo' );
}

add_action( 'admin_menu', function () {
	add_options_page( 'Chatnelo', 'Chatnelo AI Chatbot', 'manage_options', 'chatnelo', 'chatnelo_settings_page' );
} );

add_action( 'admin_init', function () {
	register_setting( 'chatnelo', 'chatnelo_options', array(
		'type'              => 'array',
		'sanitize_callback' => 'chatnelo_sanitize_options',
		'default'           => chatnelo_default_options(),
	) );
} );

function chatnelo_sanitize_options( $input ) {
	$clean = chatnelo_default_options();
	$input = is_array( $input ) ? $input : array();
	$clean['store_id']   = preg_replace( '/[^a-f0-9\-]/i', '', (string) ( $input['store_id'] ?? '' ) );
	$clean['widget_key'] = preg_replace( '/[^a-f0-9]/i', '', (string) ( $input['widget_key'] ?? '' ) );
	$color               = sanitize_hex_color( $input['color'] ?? '' );
	$clean['color']      = $color ? $color : '#312e81';
	$clean['position']   = ( ( $input['position'] ?? '' ) === 'left' ) ? 'left' : 'right';
	$clean['title']      = sanitize_text_field( $input['title'] ?? '' );
	$clean['greeting']   = sanitize_text_field( $input['greeting'] ?? '' );
	return $clean;
}

function chatnelo_feed_url() {
	return rest_url( 'chatnelo/v1/feed' );
}

/* ------------------------------------------------------------ admin assets */

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'settings_page_chatnelo' !== $hook ) {
		return;
	}
	wp_register_style( 'chatnelo-admin', false, array(), CHATNELO_VERSION );
	wp_enqueue_style( 'chatnelo-admin' );
	wp_add_inline_style( 'chatnelo-admin', '
		.chatnelo-wrap{max-width:920px}
		.chatnelo-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:18px 0 20px;padding:22px 24px;border-radius:14px;background:linear-gradient(135deg,#0b1020,#1e1b4b 60%,#2e1065);color:#fff}
		.chatnelo-hero h1{color:#fff;margin:0 0 4px;font-size:22px;padding:0}
		.chatnelo-hero p{margin:0;color:#cbd5e1}
		.chatnelo-badge{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:600;font-size:13px}
		.chatnelo-badge.on{background:#10b981;color:#fff}
		.chatnelo-badge.off{background:#f59e0b;color:#111827}
		.chatnelo-card{background:#fff;border:1px solid #dcdcde;border-radius:12px;padding:20px 22px;margin-bottom:16px}
		.chatnelo-card h2{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:10px}
		.chatnelo-card h2 span{display:inline-flex;width:26px;height:26px;border-radius:50%;align-items:center;justify-content:center;background:#7c3aed;color:#fff;font-size:13px}
		.chatnelo-card p{margin:0 0 12px;color:#50575e}
		.chatnelo-copy{display:flex;gap:8px;align-items:center}
		.chatnelo-copy input{flex:1}
		.chatnelo-help{color:#50575e;margin-top:8px}
	' );
	wp_register_script( 'chatnelo-admin', false, array(), CHATNELO_VERSION, true );
	wp_enqueue_script( 'chatnelo-admin' );
	wp_add_inline_script( 'chatnelo-admin', '
		document.addEventListener("click", function (event) {
			var button = event.target.closest ? event.target.closest("[data-chatnelo-copy]") : null;
			if (!button) { return; }
			var input = document.getElementById(button.getAttribute("data-chatnelo-copy"));
			if (!input) { return; }
			input.select();
			var done = function () { var old = button.textContent; button.textContent = button.getAttribute("data-copied"); setTimeout(function () { button.textContent = old; }, 1500); };
			if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(input.value).then(done); } else { try { document.execCommand("copy"); done(); } catch (e) {} }
		});
	' );
} );

/* ---------------------------------------------------------- setup notice */

add_action( 'admin_notices', function () {
	if ( chatnelo_is_connected() || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( ! $screen || ! in_array( $screen->id, array( 'plugins', 'dashboard' ), true ) ) {
		return;
	}
	if ( get_user_meta( get_current_user_id(), 'chatnelo_notice_dismissed', true ) ) {
		return;
	}
	$dismiss = wp_nonce_url( add_query_arg( 'chatnelo_dismiss_notice', '1' ), 'chatnelo_dismiss_notice' );
	printf(
		'<div class="notice notice-info"><p><strong>%1$s</strong> %2$s</p><p><a class="button button-primary" href="%3$s">%4$s</a> <a href="%5$s">%6$s</a></p></div>',
		esc_html__( 'Chatnelo is almost ready.', 'chatnelo-ai-chatbot-for-woocommerce' ),
		esc_html__( 'Connect your Chatnelo account to show the AI chat on your store.', 'chatnelo-ai-chatbot-for-woocommerce' ),
		esc_url( chatnelo_settings_url() ),
		esc_html__( 'Finish setup', 'chatnelo-ai-chatbot-for-woocommerce' ),
		esc_url( $dismiss ),
		esc_html__( 'Dismiss', 'chatnelo-ai-chatbot-for-woocommerce' )
	);
} );

add_action( 'admin_init', function () {
	if ( empty( $_GET['chatnelo_dismiss_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified below.
		return;
	}
	check_admin_referer( 'chatnelo_dismiss_notice' );
	update_user_meta( get_current_user_id(), 'chatnelo_notice_dismissed', 1 );
	wp_safe_redirect( remove_query_arg( array( 'chatnelo_dismiss_notice', '_wpnonce' ) ) );
	exit;
} );

/* ----------------------------------------------------------- settings page */

function chatnelo_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$o         = chatnelo_options();
	$connected = chatnelo_is_connected();
	$signup    = CHATNELO_SERVICE_URL . '/store/dashboard';
	$copied    = __( 'Copied', 'chatnelo-ai-chatbot-for-woocommerce' );
	?>
	<div class="wrap chatnelo-wrap">
		<div class="chatnelo-hero">
			<div>
				<h1><?php esc_html_e( 'Chatnelo – AI Chatbot', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></h1>
				<p><?php esc_html_e( 'Answers your customers 24/7 from your real products, prices and stock.', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></p>
			</div>
			<?php if ( $connected ) : ?>
				<span class="chatnelo-badge on"><?php esc_html_e( '● Connected – the chat is live on your store', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></span>
			<?php else : ?>
				<span class="chatnelo-badge off"><?php esc_html_e( '● Not connected yet', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></span>
			<?php endif; ?>
		</div>

		<div class="chatnelo-card">
			<h2><span>1</span><?php esc_html_e( 'Create your free Chatnelo account', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></h2>
			<p><?php esc_html_e( 'Sign up with your e-mail. You can try the full version for 3 days for free – no card needed. Then you get your Store ID and widget key.', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></p>
			<a class="button button-primary" href="<?php echo esc_url( $signup ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open Chatnelo dashboard', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></a>
		</div>

		<form method="post" action="options.php">
			<?php settings_fields( 'chatnelo' ); ?>
			<div class="chatnelo-card">
				<h2><span>2</span><?php esc_html_e( 'Paste your Store ID and widget key', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></h2>
				<p><?php esc_html_e( 'You find both in the Chatnelo dashboard. Then click “Save Changes” at the bottom.', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></p>
				<table class="form-table" role="presentation">
					<tr><th scope="row"><label for="chatnelo_store_id"><?php esc_html_e( 'Store ID', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><input name="chatnelo_options[store_id]" id="chatnelo_store_id" type="text" class="regular-text code" value="<?php echo esc_attr( $o['store_id'] ); ?>" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></td></tr>
					<tr><th scope="row"><label for="chatnelo_widget_key"><?php esc_html_e( 'Widget key', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><input name="chatnelo_options[widget_key]" id="chatnelo_widget_key" type="text" class="regular-text code" value="<?php echo esc_attr( $o['widget_key'] ); ?>"></td></tr>
				</table>
			</div>

			<div class="chatnelo-card">
				<h2><span>3</span><?php esc_html_e( 'Teach the chatbot your products', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></h2>
				<p><?php esc_html_e( 'Copy this product feed address and paste it in the Chatnelo dashboard under “Products from XML feed”. Products, prices and stock then sync automatically every 6 hours.', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></p>
				<div class="chatnelo-copy">
					<input type="text" readonly class="large-text code" id="chatnelo_feed_url" value="<?php echo esc_attr( chatnelo_feed_url() ); ?>">
					<button type="button" class="button" data-chatnelo-copy="chatnelo_feed_url" data-copied="<?php echo esc_attr( $copied ); ?>"><?php esc_html_e( 'Copy', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></button>
				</div>
			</div>

			<div class="chatnelo-card">
				<h2><span>4</span><?php esc_html_e( 'Look and feel (optional)', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr><th scope="row"><label for="chatnelo_color"><?php esc_html_e( 'Brand color', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><input name="chatnelo_options[color]" id="chatnelo_color" type="color" value="<?php echo esc_attr( $o['color'] ); ?>"></td></tr>
					<tr><th scope="row"><label for="chatnelo_position"><?php esc_html_e( 'Position', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><select name="chatnelo_options[position]" id="chatnelo_position">
							<option value="right" <?php selected( $o['position'], 'right' ); ?>><?php esc_html_e( 'Bottom right', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></option>
							<option value="left" <?php selected( $o['position'], 'left' ); ?>><?php esc_html_e( 'Bottom left', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></option>
						</select></td></tr>
					<tr><th scope="row"><label for="chatnelo_title"><?php esc_html_e( 'Chat title', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><input name="chatnelo_options[title]" id="chatnelo_title" type="text" class="regular-text" value="<?php echo esc_attr( $o['title'] ); ?>"></td></tr>
					<tr><th scope="row"><label for="chatnelo_greeting"><?php esc_html_e( 'Greeting', 'chatnelo-ai-chatbot-for-woocommerce' ); ?></label></th>
						<td><input name="chatnelo_options[greeting]" id="chatnelo_greeting" type="text" class="large-text" value="<?php echo esc_attr( $o['greeting'] ); ?>"></td></tr>
				</table>
			</div>

			<?php submit_button(); ?>
		</form>
		<p class="chatnelo-help">
			<?php
			echo wp_kses(
				sprintf(
					/* translators: %s: support e-mail link */
					__( 'Need help? Write to %s – we will gladly help you with the setup.', 'chatnelo-ai-chatbot-for-woocommerce' ),
					'<a href="mailto:support@chatnelo.com">support@chatnelo.com</a>'
				),
				array( 'a' => array( 'href' => array() ) )
			);
			?>
		</p>
	</div>
	<?php
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( chatnelo_settings_url() ) . '">' . esc_html__( 'Settings', 'chatnelo-ai-chatbot-for-woocommerce' ) . '</a>' );
	return $links;
} );

/* ------------------------------------------------------------ chat widget */

add_action( 'wp_enqueue_scripts', function () {
	if ( ! chatnelo_is_connected() || is_admin() ) {
		return;
	}
	wp_enqueue_script( 'chatnelo-widget', CHATNELO_SERVICE_URL . '/embed.js', array(), CHATNELO_VERSION, array( 'in_footer' => true, 'strategy' => 'async' ) );
} );

add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	if ( 'chatnelo-widget' !== $handle ) {
		return $tag;
	}
	$o     = chatnelo_options();
	$attrs = array(
		'data-store'    => $o['store_id'],
		'data-key'      => $o['widget_key'],
		'data-color'    => $o['color'],
		'data-position' => $o['position'],
	);
	if ( '' !== $o['title'] ) {
		$attrs['data-title'] = $o['title'];
	}
	if ( '' !== $o['greeting'] ) {
		$attrs['data-greeting'] = $o['greeting'];
	}
	$extra = '';
	foreach ( $attrs as $name => $value ) {
		$extra .= ' ' . $name . '="' . esc_attr( $value ) . '"';
	}
	return str_replace( ' src=', $extra . ' src=', $tag );
}, 10, 2 );

/* ----------------------------------------------------------- product feed */

add_action( 'rest_api_init', function () {
	register_rest_route( 'chatnelo/v1', '/feed', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => 'chatnelo_render_feed',
	) );
} );

function chatnelo_xml( $text ) {
	return htmlspecialchars( wp_strip_all_tags( (string) $text ), ENT_XML1 | ENT_QUOTES, 'UTF-8' );
}

function chatnelo_render_feed() {
	if ( ! function_exists( 'wc_get_products' ) ) {
		return new WP_Error( 'chatnelo_no_woocommerce', 'WooCommerce is not active.', array( 'status' => 503 ) );
	}
	$currency = get_woocommerce_currency();
	$products = wc_get_products( array(
		'status'     => 'publish',
		'visibility' => 'catalog',
		'limit'      => 5000,
		'orderby'    => 'date',
		'order'      => 'DESC',
	) );
	$out  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
	$out .= '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>';
	$out .= '<title>' . chatnelo_xml( get_bloginfo( 'name' ) ) . '</title>';
	foreach ( $products as $product ) {
		$price = wc_get_price_including_tax( $product );
		$image = wp_get_attachment_image_url( $product->get_image_id(), 'woocommerce_thumbnail' );
		$terms = wp_get_post_terms( $product->get_id(), 'product_cat', array( 'fields' => 'names' ) );
		$out  .= '<item>';
		$out  .= '<g:id>' . chatnelo_xml( $product->get_id() ) . '</g:id>';
		$out  .= '<title>' . chatnelo_xml( $product->get_name() ) . '</title>';
		$out  .= '<g:description>' . chatnelo_xml( wp_trim_words( $product->get_short_description() ? $product->get_short_description() : $product->get_description(), 80 ) ) . '</g:description>';
		$out  .= '<link>' . esc_url( $product->get_permalink() ) . '</link>';
		if ( $image ) {
			$out .= '<g:image_link>' . esc_url( $image ) . '</g:image_link>';
		}
		$out .= '<g:price>' . chatnelo_xml( wc_format_decimal( $price, 2 ) . ' ' . $currency ) . '</g:price>';
		$out .= '<g:availability>' . ( $product->is_in_stock() ? 'in stock' : 'out of stock' ) . '</g:availability>';
		if ( ! is_wp_error( $terms ) && $terms ) {
			$out .= '<g:product_type>' . chatnelo_xml( implode( ' > ', $terms ) ) . '</g:product_type>';
		}
		$out .= '</item>';
	}
	$out .= '</channel></rss>';

	$response = new WP_REST_Response();
	$response->set_status( 200 );
	$response->header( 'Content-Type', 'application/xml; charset=UTF-8' );
	add_filter( 'rest_pre_serve_request', function ( $served, $result ) use ( $out ) {
		if ( $result->get_matched_route() === '/chatnelo/v1/feed' ) {
			echo $out; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- XML built from escaped parts above.
			return true;
		}
		return $served;
	}, 10, 2 );
	return $response;
}
