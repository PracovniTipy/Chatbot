<?php
/**
 * Removes Chatnelo settings when the plugin is deleted.
 *
 * @package chatnelo-ai-chatbot
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'chatnelo_options' );
delete_metadata( 'user', 0, 'chatnelo_notice_dismissed', '', true );
