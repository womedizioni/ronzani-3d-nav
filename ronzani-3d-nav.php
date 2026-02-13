<?php
/**
 * Plugin Name: Ronzani 3D Nav
 * Version: 0.3.0-rc1
 * Author: Ronzani
 */

defined('ABSPATH') || exit;

/**
 * Default shortcode settings.
 *
 * @return array
 */
function ronzani_3d_nav_default_settings(): array
{
    return array(
        'mode' => 'desk',
        'menu_location' => 'primary',
        'menu' => '',
    );
}



/**
 * Predefined hotspot positions in percentages.
 *
 * @return array
 */
function ronzani_3d_nav_default_hotspots(): array
{
    return array(
        array('x' => 12, 'y' => 22),
        array('x' => 24, 'y' => 38),
        array('x' => 36, 'y' => 26),
        array('x' => 48, 'y' => 44),
        array('x' => 60, 'y' => 30),
        array('x' => 72, 'y' => 40),
        array('x' => 84, 'y' => 26),
        array('x' => 18, 'y' => 60),
        array('x' => 32, 'y' => 74),
        array('x' => 52, 'y' => 66),
        array('x' => 68, 'y' => 72),
        array('x' => 82, 'y' => 58),
    );
}

/**
 * Build a hotspots array for the provided item count.
 *
 * @param int $count Number of menu items.
 * @return array
 */
function ronzani_3d_nav_build_hotspots(int $count): array
{
    $base = ronzani_3d_nav_default_hotspots();
    $base_count = count($base);

    if ($count <= $base_count) {
        return array_slice($base, 0, $count);
    }

    $hotspots = array();
    for ($i = 0; $i < $count; $i++) {
        $hotspots[] = $base[$i % $base_count];
    }

    return $hotspots;
}

/**
 * Normalize menu items to title/url pairs.
 *
 * @param array $items Raw menu items.
 * @return array
 */
function ronzani_3d_nav_normalize_menu_items($items): array
{
    if (empty($items)) {
        return array();
    }

    $menu_items = array();
    foreach ($items as $item) {
        if (empty($item->url)) {
            continue;
        }

        $menu_items[] = array(
            'title' => sanitize_text_field($item->title),
            'url' => esc_url_raw($item->url),
        );
    }

    return $menu_items;
}

/**
 * Build the menu items for the 3D nav data payload.
 *
 * @param string $location Menu location slug.
 * @param string $menu Menu name/slug/id override.
 * @return array
 */
function ronzani_3d_nav_get_menu_items(string $location, string $menu = ''): array
{
    $menu = trim($menu);

    if ($menu !== '') {
        $menu_obj = wp_get_nav_menu_object($menu);

        if (!$menu_obj) {
            $menus = wp_get_nav_menus();
            $needle = strtolower($menu);
            foreach ($menus as $maybe_menu) {
                if (!empty($maybe_menu->name) && strtolower($maybe_menu->name) === $needle) {
                    $menu_obj = $maybe_menu;
                    break;
                }
            }
        }

        if (empty($menu_obj->term_id)) {
            return array();
        }

        $items = wp_get_nav_menu_items((int) $menu_obj->term_id);
        return ronzani_3d_nav_normalize_menu_items($items);
    }

    $menu_id = 0;
    $locations = get_nav_menu_locations();

    if (!empty($locations[$location])) {
        $menu_id = (int) $locations[$location];
    } else {
        $menus = wp_get_nav_menus();
        if (!empty($menus[0]) && !empty($menus[0]->term_id)) {
            $menu_id = (int) $menus[0]->term_id;
        }
    }

    if (!$menu_id) {
        return array();
    }

    $items = wp_get_nav_menu_items($menu_id);
    return ronzani_3d_nav_normalize_menu_items($items);
}

/**
 * Enqueue base assets.
 *
 * @return void
 */
function ronzani_3d_nav_enqueue_base_assets(): void
{
    $base_dir = plugin_dir_path(__FILE__) . 'assets/';
    $base_url = plugin_dir_url(__FILE__) . 'assets/';

    $css_file = $base_dir . 'nav.css';
    $js_file  = $base_dir . 'nav.js';

    $css_ver = file_exists($css_file) ? filemtime($css_file) : null;
    $js_ver  = file_exists($js_file) ? filemtime($js_file) : null;

    wp_enqueue_style(
        'ronzani-3d-nav',
        $base_url . 'nav.css',
        array(),
        $css_ver
    );

    wp_enqueue_script(
        'ronzani-3d-nav',
        $base_url . 'nav.js',
        array(),
        $js_ver,
        true
    );
}

/**
 * Build the frontend payload for the provided shortcode settings.
 *
 * @param array $settings Shortcode settings.
 * @return array
 */
function ronzani_3d_nav_build_frontend_data(array $settings): array
{
    $menu_items = ronzani_3d_nav_get_menu_items($settings['menu_location'], $settings['menu']);
    $hotspots = ronzani_3d_nav_build_hotspots(count($menu_items));
    $menu_source = array(
        'type' => $settings['menu'] !== '' ? 'menu' : 'location',
        'value' => $settings['menu'] !== '' ? $settings['menu'] : $settings['menu_location'],
    );

    return array(
        'siteName' => get_bloginfo('name'),
        'homeUrl' => home_url('/'),
        'menuItems' => $menu_items,
        'mode' => $settings['mode'],
        'hotspots' => $hotspots,
        'menuSource' => $menu_source,
        'mappingEndpoint' => esc_url_raw(rest_url('ronzani-3d-nav/v1/mapping')),
        'mappingHealthEndpoint' => esc_url_raw(rest_url('ronzani-3d-nav/v1/mapping-health')),
        'sceneConfigEndpoint' => esc_url_raw(rest_url('ronzani-3d-nav/v1/scene-config')),
        'sceneHealthEndpoint' => esc_url_raw(rest_url('ronzani-3d-nav/v1/scene-health')),
        'viewerRolloutKey' => is_user_logged_in() ? 'user-' . (string) get_current_user_id() : '',
    );
}

/**
 * Localize the 3D nav payload once per request.
 *
 * @param array $settings Shortcode settings.
 * @return void
 */
function ronzani_3d_nav_localize_data(array $settings): void
{
    static $localized = false;

    if ($localized) {
        return;
    }

    wp_localize_script(
        'ronzani-3d-nav',
        'RONZANI_3D_NAV_DATA',
        ronzani_3d_nav_build_frontend_data($settings)
    );

    $localized = true;
}

/**
 * Return the option key used for 3D object mapping.
 *
 * @return string
 */
function ronzani_3d_nav_mapping_option_key(): string
{
    return 'ronzani_3d_nav_mapping';
}

/**
 * Seed mapping for interactive 3D objects.
 *
 * @return array
 */
function ronzani_3d_nav_default_mapping_seed(): array
{
    return array(
        array(
            'object_id' => 'gutenberg_press_01',
            'post_id' => 0,
            'category_slug' => 'origini-design',
            'waypoint' => array(
                'position' => array('x' => -2.2, 'y' => 1.4, 'z' => 1.4),
                'target' => array('x' => -1.4, 'y' => 1.0, 'z' => 1.0),
                'fov' => 42,
            ),
            'preview' => array(
                'title' => 'Origini del design tipografico',
                'abstract' => 'Articoli sulle origini del design e della stampa.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'composing_stick_01',
            'post_id' => 0,
            'category_slug' => 'font-kerning',
            'waypoint' => array(
                'position' => array('x' => -1.7, 'y' => 1.2, 'z' => 2.1),
                'target' => array('x' => -1.1, 'y' => 0.9, 'z' => 1.6),
                'fov' => 40,
            ),
            'preview' => array(
                'title' => 'Tecnica: font e kerning',
                'abstract' => 'Post tecnici su composizione, font e spaziatura.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'typewriter_01',
            'post_id' => 0,
            'category_slug' => 'ultimi-articoli',
            'waypoint' => array(
                'position' => array('x' => -0.8, 'y' => 1.25, 'z' => 2.5),
                'target' => array('x' => -0.2, 'y' => 0.95, 'z' => 1.8),
                'fov' => 38,
            ),
            'preview' => array(
                'title' => 'Ultimi articoli pubblicati',
                'abstract' => 'Accesso rapido ai contenuti piu recenti del blog.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'type_case_cabinet',
            'post_id' => 0,
            'category_slug' => 'archivio-categorie',
            'waypoint' => array(
                'position' => array('x' => -2.3, 'y' => 1.3, 'z' => 0.1),
                'target' => array('x' => -1.6, 'y' => 0.95, 'z' => 0.0),
                'fov' => 40,
            ),
            'preview' => array(
                'title' => 'Archivio categorie e tag',
                'abstract' => 'Naviga l archivio editoriale per tema.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'main_desk_01',
            'post_id' => 0,
            'category_slug' => 'featured',
            'waypoint' => array(
                'position' => array('x' => 0.0, 'y' => 1.35, 'z' => 2.7),
                'target' => array('x' => 0.0, 'y' => 0.95, 'z' => 1.9),
                'fov' => 36,
            ),
            'preview' => array(
                'title' => 'Featured e homepage editoriale',
                'abstract' => 'Selezione dei contenuti in evidenza.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'linotype_machine_01',
            'post_id' => 0,
            'category_slug' => 'case-studies',
            'waypoint' => array(
                'position' => array('x' => 1.8, 'y' => 1.4, 'z' => 1.5),
                'target' => array('x' => 1.2, 'y' => 1.0, 'z' => 1.0),
                'fov' => 39,
            ),
            'preview' => array(
                'title' => 'Case studies e workflow',
                'abstract' => 'Approfondimenti su processi complessi.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'heidelberg_windmill',
            'post_id' => 0,
            'category_slug' => 'news',
            'waypoint' => array(
                'position' => array('x' => 2.3, 'y' => 1.5, 'z' => 0.3),
                'target' => array('x' => 1.6, 'y' => 1.0, 'z' => 0.2),
                'fov' => 41,
            ),
            'preview' => array(
                'title' => 'News e aggiornamenti',
                'abstract' => 'Novita rapide su design, stampa e strumenti.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'uv_exposure_unit',
            'post_id' => 0,
            'category_slug' => 'tool-review',
            'waypoint' => array(
                'position' => array('x' => 2.1, 'y' => 1.2, 'z' => -0.9),
                'target' => array('x' => 1.5, 'y' => 0.9, 'z' => -0.7),
                'fov' => 40,
            ),
            'preview' => array(
                'title' => 'Recensioni software e tool',
                'abstract' => 'Valutazioni pratiche di strumenti digitali.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'laser_engraver_01',
            'post_id' => 0,
            'category_slug' => 'sperimentazione',
            'waypoint' => array(
                'position' => array('x' => 1.6, 'y' => 1.25, 'z' => -1.8),
                'target' => array('x' => 1.1, 'y' => 0.95, 'z' => -1.2),
                'fov' => 39,
            ),
            'preview' => array(
                'title' => 'Sperimentazione e DIY',
                'abstract' => 'Test e prototipi tra analogico e digitale.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'magnifying_glass',
            'post_id' => 0,
            'category_slug' => 'long-reads',
            'waypoint' => array(
                'position' => array('x' => 0.7, 'y' => 1.1, 'z' => -2.1),
                'target' => array('x' => 0.3, 'y' => 0.95, 'z' => -1.4),
                'fov' => 37,
            ),
            'preview' => array(
                'title' => 'Analisi visiva approfondita',
                'abstract' => 'Long-reads e letture di dettaglio.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'holo_drafting_table',
            'post_id' => 0,
            'category_slug' => 'ai-futuro',
            'waypoint' => array(
                'position' => array('x' => -0.6, 'y' => 1.4, 'z' => -2.3),
                'target' => array('x' => -0.2, 'y' => 1.0, 'z' => -1.7),
                'fov' => 38,
            ),
            'preview' => array(
                'title' => 'Visioni AI e UI del futuro',
                'abstract' => 'Scenari su design computazionale e interfacce.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
        array(
            'object_id' => 'bio_ink_3dprinter',
            'post_id' => 0,
            'category_slug' => 'green-design',
            'waypoint' => array(
                'position' => array('x' => -1.7, 'y' => 1.35, 'z' => -1.7),
                'target' => array('x' => -1.2, 'y' => 0.95, 'z' => -1.2),
                'fov' => 40,
            ),
            'preview' => array(
                'title' => 'Sostenibilita e green design',
                'abstract' => 'Ricerca su materiali, processi e impatto.',
                'cover_image' => '',
                'date' => '',
            ),
            'article_url' => home_url('/'),
        ),
    );
}

/**
 * Return authoritative list of interactive object IDs.
 *
 * @return array
 */
function ronzani_3d_nav_allowed_object_ids(): array
{
    $seed = ronzani_3d_nav_default_mapping_seed();
    $ids = array();

    foreach ($seed as $item) {
        if (!is_array($item) || !isset($item['object_id'])) {
            continue;
        }
        $object_id = sanitize_key((string) $item['object_id']);
        if ($object_id === '' || isset($ids[$object_id])) {
            continue;
        }
        $ids[$object_id] = $object_id;
    }

    return array_values($ids);
}

/**
 * Normalize a single mapping item to the expected schema.
 *
 * @param array $item Raw mapping item.
 * @param int   $index Item index fallback.
 * @return array
 */
function ronzani_3d_nav_normalize_mapping_item(array $item, int $index): array
{
    $defaults = array(
        'object_id' => 'object_' . $index,
        'post_id' => 0,
        'category_slug' => '',
        'waypoint' => array(
            'position' => array('x' => 0, 'y' => 1.2, 'z' => 2),
            'target' => array('x' => 0, 'y' => 1, 'z' => 0),
            'fov' => 40,
        ),
        'preview' => array(
            'title' => '',
            'abstract' => '',
            'cover_image' => '',
            'date' => '',
        ),
        'article_url' => '',
    );

    $item = wp_parse_args($item, $defaults);
    $waypoint = is_array($item['waypoint']) ? wp_parse_args($item['waypoint'], $defaults['waypoint']) : $defaults['waypoint'];
    $position = is_array($waypoint['position']) ? wp_parse_args($waypoint['position'], $defaults['waypoint']['position']) : $defaults['waypoint']['position'];
    $target = is_array($waypoint['target']) ? wp_parse_args($waypoint['target'], $defaults['waypoint']['target']) : $defaults['waypoint']['target'];
    $preview = is_array($item['preview']) ? wp_parse_args($item['preview'], $defaults['preview']) : $defaults['preview'];

    return array(
        'object_id' => sanitize_key((string) $item['object_id']),
        'post_id' => absint($item['post_id']),
        'category_slug' => sanitize_title((string) $item['category_slug']),
        'waypoint' => array(
            'position' => array(
                'x' => (float) $position['x'],
                'y' => (float) $position['y'],
                'z' => (float) $position['z'],
            ),
            'target' => array(
                'x' => (float) $target['x'],
                'y' => (float) $target['y'],
                'z' => (float) $target['z'],
            ),
            'fov' => (float) $waypoint['fov'],
        ),
        'preview' => array(
            'title' => sanitize_text_field((string) $preview['title']),
            'abstract' => sanitize_textarea_field((string) $preview['abstract']),
            'cover_image' => esc_url_raw((string) $preview['cover_image']),
            'date' => sanitize_text_field((string) $preview['date']),
        ),
        'article_url' => esc_url_raw((string) $item['article_url']),
    );
}

/**
 * Resolve a category slug against existing WP categories.
 *
 * Returns the sanitized slug when it exists, otherwise an empty string.
 * This keeps mapping payload strict-compatible on sites where seed slugs
 * are not present in taxonomy yet.
 *
 * @param string $slug Raw category slug.
 * @return string
 */
function ronzani_3d_nav_resolve_category_slug(string $slug): string
{
    static $cache = array();

    $normalized = sanitize_title($slug);
    if ($normalized === '') {
        return '';
    }

    if (array_key_exists($normalized, $cache)) {
        return (string) $cache[$normalized];
    }

    $exists = term_exists($normalized, 'category');
    if (empty($exists)) {
        $cache[$normalized] = '';
        return '';
    }

    $cache[$normalized] = $normalized;
    return $normalized;
}

/**
 * Get mapping payload for interactive objects.
 *
 * @return array
 */
function ronzani_3d_nav_get_mapping_payload(): array
{
    $seed = ronzani_3d_nav_default_mapping_seed();
    $raw = $seed;
    $source = 'seed';

    $stored = get_option(ronzani_3d_nav_mapping_option_key(), array());
    if (is_array($stored) && !empty($stored)) {
        $raw = $stored;
        $source = 'option';
    }

    $items = array();
    foreach ($raw as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        $normalized = ronzani_3d_nav_normalize_mapping_item($item, (int) $index);
        if ($normalized['object_id'] === '') {
            continue;
        }
        $normalized['category_slug'] = ronzani_3d_nav_resolve_category_slug((string) $normalized['category_slug']);

        $items[] = $normalized;
    }

    return array(
        'schemaVersion' => '2026-02-11',
        'source' => $source,
        'count' => count($items),
        'items' => $items,
    );
}

/**
 * REST callback for the mapping endpoint.
 *
 * @return WP_REST_Response
 */
function ronzani_3d_nav_rest_get_mapping()
{
    return rest_ensure_response(ronzani_3d_nav_get_mapping_payload());
}

/**
 * Build a health report for mapping completeness and data quality.
 *
 * @return array
 */
function ronzani_3d_nav_get_mapping_health_payload(): array
{
    $payload = ronzani_3d_nav_get_mapping_payload();
    $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : array();
    $allowed_object_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_object_ids, true);

    $seen = array();
    $present_allowed = array();
    $duplicates = array();
    $invalid_object_ids = array();
    $rows_with_warnings = array();

    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        $normalized = ronzani_3d_nav_normalize_mapping_item($item, (int) $index);
        $object_id = isset($normalized['object_id']) ? (string) $normalized['object_id'] : '';
        if ($object_id === '') {
            continue;
        }

        if (isset($seen[$object_id])) {
            $duplicates[$object_id] = $object_id;
        }
        $seen[$object_id] = true;

        $row_warnings = array();
        $is_allowed = isset($allowed_lookup[$object_id]);
        if ($is_allowed) {
            $present_allowed[$object_id] = true;
        } else {
            $invalid_object_ids[$object_id] = $object_id;
            $row_warnings[] = 'object_id_non_valido';
        }

        $post_id = isset($normalized['post_id']) ? absint($normalized['post_id']) : 0;
        $article_url = isset($normalized['article_url']) ? (string) $normalized['article_url'] : '';
        if ($post_id === 0 && $article_url === '') {
            $row_warnings[] = 'collegamento_contenuto_mancante';
        }

        $preview = isset($normalized['preview']) && is_array($normalized['preview']) ? $normalized['preview'] : array();
        $preview_title = isset($preview['title']) ? (string) $preview['title'] : '';
        $preview_abstract = isset($preview['abstract']) ? (string) $preview['abstract'] : '';

        if ($preview_title === '') {
            $row_warnings[] = 'preview_title_mancante';
        }
        if ($preview_abstract === '') {
            $row_warnings[] = 'preview_abstract_mancante';
        }

        $category_slug = isset($normalized['category_slug']) ? (string) $normalized['category_slug'] : '';
        if ($category_slug !== '') {
            $exists = term_exists($category_slug, 'category');
            if (empty($exists)) {
                $row_warnings[] = 'categoria_non_valida';
            }
        }

        if (!empty($row_warnings)) {
            $rows_with_warnings[] = array(
                'index' => (int) $index,
                'object_id' => $object_id,
                'warnings' => array_values($row_warnings),
            );
        }
    }

    $missing_object_ids = array_values(array_diff($allowed_object_ids, array_keys($present_allowed)));
    $duplicate_object_ids = array_values($duplicates);
    $invalid_object_ids = array_values($invalid_object_ids);
    $has_blockers = !empty($missing_object_ids) || !empty($duplicate_object_ids) || !empty($invalid_object_ids);

    $summary = array(
        'ok' => !$has_blockers,
        'strict_ok' => !$has_blockers && empty($rows_with_warnings),
        'has_blockers' => $has_blockers,
        'rows' => count($items),
        'allowed' => count($allowed_object_ids),
        'missing' => count($missing_object_ids),
        'duplicates' => count($duplicate_object_ids),
        'invalid' => count($invalid_object_ids),
        'rows_with_warnings' => count($rows_with_warnings),
    );

    return array(
        'schemaVersion' => isset($payload['schemaVersion']) ? (string) $payload['schemaVersion'] : '2026-02-11',
        'source' => isset($payload['source']) ? (string) $payload['source'] : 'unknown',
        'generatedAt' => gmdate('c'),
        'summary' => $summary,
        'allowed_object_ids' => $allowed_object_ids,
        'missing_object_ids' => $missing_object_ids,
        'duplicate_object_ids' => $duplicate_object_ids,
        'invalid_object_ids' => $invalid_object_ids,
        'rows_with_warnings' => $rows_with_warnings,
    );
}

/**
 * REST callback for mapping health endpoint.
 *
 * @return WP_REST_Response
 */
function ronzani_3d_nav_rest_get_mapping_health()
{
    return rest_ensure_response(ronzani_3d_nav_get_mapping_health_payload());
}

/**
 * Return the option key used for scene configuration.
 *
 * @return string
 */
function ronzani_3d_nav_scene_option_key(): string
{
    return 'ronzani_3d_nav_scene_config';
}

/**
 * Sanitize a rollout token used for allowlist matching.
 *
 * @param string $token Raw token.
 * @return string
 */
function ronzani_3d_nav_sanitize_rollout_token(string $token): string
{
    $normalized = sanitize_key((string) $token);
    if ($normalized === '') {
        return '';
    }

    return substr($normalized, 0, 64);
}

/**
 * Parse rollout allowlist tokens from free text.
 *
 * @param string $raw Raw allowlist text.
 * @return array
 */
function ronzani_3d_nav_parse_rollout_allowlist(string $raw): array
{
    $tokens = preg_split('/[\s,;]+/', $raw);
    if (!is_array($tokens)) {
        return array();
    }

    $allowlist = array();
    foreach ($tokens as $token) {
        $normalized = ronzani_3d_nav_sanitize_rollout_token((string) $token);
        if ($normalized === '' || isset($allowlist[$normalized])) {
            continue;
        }
        $allowlist[$normalized] = $normalized;
    }

    return array_values($allowlist);
}

/**
 * Normalize rollout payload for scene contract.
 *
 * @param mixed $input Raw rollout payload.
 * @return array
 */
function ronzani_3d_nav_build_scene_rollout_payload($input): array
{
    $percentage = 100;
    $allowlist = array();

    if (is_array($input)) {
        $percentage_raw = null;
        if (array_key_exists('percentage', $input)) {
            $percentage_raw = $input['percentage'];
        } elseif (array_key_exists('rollout_percentage', $input)) {
            $percentage_raw = $input['rollout_percentage'];
        }

        if ($percentage_raw !== null) {
            $percentage_text = trim((string) $percentage_raw);
            if ($percentage_text !== '' && is_numeric($percentage_text)) {
                $percentage = (int) round((float) $percentage_text);
            }
        }
        $percentage = max(0, min(100, $percentage));

        if (isset($input['allowlist']) && is_array($input['allowlist'])) {
            foreach ($input['allowlist'] as $token) {
                $normalized = ronzani_3d_nav_sanitize_rollout_token((string) $token);
                if ($normalized === '' || isset($allowlist[$normalized])) {
                    continue;
                }
                $allowlist[$normalized] = $normalized;
            }
        }

        $allowlist_text = '';
        if (isset($input['allowlist_text'])) {
            $allowlist_text = (string) $input['allowlist_text'];
        } elseif (isset($input['rollout_allowlist_text'])) {
            $allowlist_text = (string) $input['rollout_allowlist_text'];
        }
        if (trim($allowlist_text) !== '') {
            foreach (ronzani_3d_nav_parse_rollout_allowlist($allowlist_text) as $token) {
                if (!isset($allowlist[$token])) {
                    $allowlist[$token] = $token;
                }
            }
        }
    }

    $allowlist_values = array_values($allowlist);
    $allowlist_count = count($allowlist_values);
    $mode = 'all';
    if ($percentage >= 100) {
        $mode = 'all';
    } elseif ($percentage <= 0 && $allowlist_count === 0) {
        $mode = 'off';
    } elseif ($percentage <= 0 && $allowlist_count > 0) {
        $mode = 'allowlist';
    } elseif ($percentage > 0 && $allowlist_count === 0) {
        $mode = 'percentage';
    } else {
        $mode = 'hybrid';
    }

    return array(
        'percentage' => $percentage,
        'allowlist' => $allowlist_values,
        'allowlist_count' => $allowlist_count,
        'mode' => $mode,
    );
}

/**
 * Default scene contract payload.
 *
 * @return array
 */
function ronzani_3d_nav_default_scene_config(): array
{
    return array(
        'schemaVersion' => '2026-02-12',
        'source' => 'defaults',
        'enabled' => false,
        'engine' => 'webgl',
        'model_url' => '',
        'model_format' => 'glb',
        'notes' => '',
        'object_ids' => array_values(ronzani_3d_nav_allowed_object_ids()),
        'rollout' => ronzani_3d_nav_build_scene_rollout_payload(array()),
    );
}

/**
 * Return scene config payload for runtime bootstrap.
 *
 * @return array
 */
function ronzani_3d_nav_get_scene_config_payload(): array
{
    $defaults = ronzani_3d_nav_default_scene_config();
    $payload = $defaults;
    $stored = get_option(ronzani_3d_nav_scene_option_key(), array());

    if (is_array($stored) && !empty($stored)) {
        $payload['source'] = 'option';
        $payload['enabled'] = !empty($stored['enabled']);

        $engine = isset($stored['engine']) ? sanitize_key((string) $stored['engine']) : $defaults['engine'];
        $payload['engine'] = in_array($engine, array('webgl', 'webgpu'), true) ? $engine : $defaults['engine'];

        $model_url = isset($stored['model_url']) ? esc_url_raw((string) $stored['model_url']) : '';
        $payload['model_url'] = $model_url;

        $model_format = isset($stored['model_format']) ? sanitize_key((string) $stored['model_format']) : $defaults['model_format'];
        $payload['model_format'] = in_array($model_format, array('glb', 'gltf'), true) ? $model_format : $defaults['model_format'];

        $payload['notes'] = isset($stored['notes']) ? sanitize_textarea_field((string) $stored['notes']) : '';
        $stored_rollout = isset($stored['rollout']) && is_array($stored['rollout']) ? $stored['rollout'] : array();
        if (isset($stored['rollout_percentage'])) {
            $stored_rollout['rollout_percentage'] = $stored['rollout_percentage'];
        }
        if (isset($stored['rollout_allowlist_text'])) {
            $stored_rollout['rollout_allowlist_text'] = $stored['rollout_allowlist_text'];
        }
        if (isset($stored['rollout_allowlist']) && is_array($stored['rollout_allowlist'])) {
            $stored_rollout['allowlist'] = $stored['rollout_allowlist'];
        }
        $payload['rollout'] = ronzani_3d_nav_build_scene_rollout_payload($stored_rollout);

        $object_ids = array();
        if (isset($stored['object_ids']) && is_array($stored['object_ids'])) {
            foreach ($stored['object_ids'] as $object_id) {
                $normalized = sanitize_key((string) $object_id);
                if ($normalized === '' || isset($object_ids[$normalized])) {
                    continue;
                }
                $object_ids[$normalized] = $normalized;
            }
        }

        if (!empty($object_ids)) {
            $payload['object_ids'] = array_values($object_ids);
        }
    }

    if (empty($payload['object_ids']) || !is_array($payload['object_ids'])) {
        $payload['object_ids'] = array_values(ronzani_3d_nav_allowed_object_ids());
    }

    $payload['rollout'] = ronzani_3d_nav_build_scene_rollout_payload(
        isset($payload['rollout']) && is_array($payload['rollout']) ? $payload['rollout'] : array()
    );
    $payload['count'] = count($payload['object_ids']);
    return $payload;
}

/**
 * REST callback for the scene config endpoint.
 *
 * @return WP_REST_Response
 */
function ronzani_3d_nav_rest_get_scene_config()
{
    return rest_ensure_response(ronzani_3d_nav_get_scene_config_payload());
}

/**
 * Build transient cache key for scene model probe.
 *
 * @param string $model_url Model URL.
 * @return string
 */
function ronzani_3d_nav_scene_model_probe_cache_key(string $model_url): string
{
    return 'ronzani_3d_nav_scene_probe_' . md5($model_url);
}

/**
 * Probe model URL reachability with short timeout and cache.
 *
 * @param string $model_url Model URL.
 * @return array
 */
function ronzani_3d_nav_probe_scene_model_url(string $model_url): array
{
    $model_url = trim($model_url);
    $result = array(
        'checked' => false,
        'reachable' => false,
        'http_status' => 0,
        'error' => '',
        'cached' => false,
        'checked_at' => '',
    );

    if ($model_url === '') {
        $result['error'] = 'model_url_missing';
        return $result;
    }

    $cache_key = ronzani_3d_nav_scene_model_probe_cache_key($model_url);
    $cached = get_transient($cache_key);
    if (is_array($cached) && isset($cached['checked'])) {
        $cached['cached'] = true;
        return array_merge($result, $cached);
    }

    $args = array(
        'timeout' => 6,
        'redirection' => 3,
        'sslverify' => true,
        'user-agent' => 'Ronzani3DNav/0.3.0',
    );

    $response = wp_remote_head($model_url, $args);
    if (is_wp_error($response)) {
        $args_get = $args;
        $args_get['headers'] = array(
            'Range' => 'bytes=0-1023',
        );
        $response = wp_remote_get($model_url, $args_get);
    }

    if (is_wp_error($response)) {
        $result['checked'] = true;
        $result['error'] = sanitize_key((string) $response->get_error_code());
        $result['checked_at'] = gmdate('c');
        set_transient($cache_key, $result, 10 * MINUTE_IN_SECONDS);
        return $result;
    }

    $status = (int) wp_remote_retrieve_response_code($response);
    $result['checked'] = true;
    $result['http_status'] = $status;
    $result['reachable'] = $status >= 200 && $status < 400;
    $result['error'] = $result['reachable'] ? '' : 'http_' . $status;
    $result['checked_at'] = gmdate('c');

    set_transient($cache_key, $result, 10 * MINUTE_IN_SECONDS);
    return $result;
}

/**
 * Build a health report for scene contract consistency.
 *
 * @return array
 */
function ronzani_3d_nav_get_scene_health_payload(): array
{
    $payload = ronzani_3d_nav_get_scene_config_payload();
    $allowed_object_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_object_ids, true);

    $scene_object_ids = isset($payload['object_ids']) && is_array($payload['object_ids'])
        ? array_values(array_unique(array_map('sanitize_key', $payload['object_ids'])))
        : array();
    $scene_object_ids = array_values(array_filter($scene_object_ids, static function (string $object_id): bool {
        return $object_id !== '';
    }));

    $invalid_object_ids = array_values(array_filter($scene_object_ids, static function (string $object_id) use ($allowed_lookup): bool {
        return !isset($allowed_lookup[$object_id]);
    }));
    $missing_object_ids = array_values(array_diff($allowed_object_ids, $scene_object_ids));

    $enabled = !empty($payload['enabled']);
    $model_url = isset($payload['model_url']) ? trim((string) $payload['model_url']) : '';
    $model_url_set = $model_url !== '';
    $model_format = isset($payload['model_format']) ? sanitize_key((string) $payload['model_format']) : 'glb';
    $model_format = in_array($model_format, array('glb', 'gltf'), true) ? $model_format : 'glb';
    $rollout = isset($payload['rollout']) && is_array($payload['rollout'])
        ? ronzani_3d_nav_build_scene_rollout_payload($payload['rollout'])
        : ronzani_3d_nav_build_scene_rollout_payload(array());
    $rollout_percentage = isset($rollout['percentage']) ? (int) $rollout['percentage'] : 100;
    $rollout_allowlist_count = isset($rollout['allowlist_count']) ? (int) $rollout['allowlist_count'] : 0;
    $rollout_mode = isset($rollout['mode']) ? (string) $rollout['mode'] : 'all';

    $url_parts = $model_url_set ? wp_parse_url($model_url) : false;
    $scheme = is_array($url_parts) && isset($url_parts['scheme']) ? strtolower((string) $url_parts['scheme']) : '';
    $path = is_array($url_parts) && isset($url_parts['path']) ? (string) $url_parts['path'] : '';
    $path_extension = $path !== '' ? strtolower((string) pathinfo($path, PATHINFO_EXTENSION)) : '';
    $model_url_valid = false;
    if ($model_url_set && in_array($scheme, array('http', 'https'), true) && $path_extension !== '') {
        if ($model_format === 'glb' && $path_extension === 'glb') {
            $model_url_valid = true;
        }
        if ($model_format === 'gltf' && $path_extension === 'gltf') {
            $model_url_valid = true;
        }
    }
    $model_probe = ronzani_3d_nav_probe_scene_model_url($model_url);

    $warnings = array();
    $blockers = array();

    if ($enabled && !$model_url_set) {
        $blockers[] = 'model_url_missing';
    }
    if ($enabled && $model_url_set && !$model_url_valid) {
        $blockers[] = 'model_url_invalid_or_format_mismatch';
    }
    if ($enabled && $model_url_set && $model_url_valid) {
        if (!empty($model_probe['checked']) && empty($model_probe['reachable'])) {
            $blockers[] = 'model_url_unreachable';
        }
        if (empty($model_probe['checked'])) {
            $warnings[] = 'model_url_reachability_not_checked';
        }
    }
    if (empty($scene_object_ids)) {
        $blockers[] = 'scene_object_ids_empty';
    }
    if (!empty($invalid_object_ids)) {
        $blockers[] = 'scene_object_ids_invalid';
    }
    if (!empty($missing_object_ids)) {
        $warnings[] = 'scene_object_ids_not_full_contract';
    }
    if ($enabled && $rollout_percentage <= 0 && $rollout_allowlist_count === 0) {
        $warnings[] = 'scene_rollout_no_eligible_visitors';
    }

    $has_blockers = !empty($blockers);
    $summary = array(
        'ok' => !$has_blockers,
        'strict_ok' => !$has_blockers && empty($warnings),
        'has_blockers' => $has_blockers,
        'enabled' => $enabled,
        'model_url_set' => $model_url_set,
        'model_url_valid' => $model_url_valid,
        'model_probe_checked' => !empty($model_probe['checked']),
        'model_reachable' => !empty($model_probe['reachable']),
        'scene_objects' => count($scene_object_ids),
        'allowed' => count($allowed_object_ids),
        'missing' => count($missing_object_ids),
        'invalid' => count($invalid_object_ids),
        'warnings' => count($warnings),
        'rollout_percentage' => $rollout_percentage,
        'rollout_allowlist' => $rollout_allowlist_count,
        'rollout_mode' => $rollout_mode,
    );

    return array(
        'schemaVersion' => isset($payload['schemaVersion']) ? (string) $payload['schemaVersion'] : '2026-02-12',
        'source' => isset($payload['source']) ? (string) $payload['source'] : 'unknown',
        'generatedAt' => gmdate('c'),
        'summary' => $summary,
        'engine' => isset($payload['engine']) ? (string) $payload['engine'] : 'webgl',
        'model_format' => $model_format,
        'model_url' => $model_url,
        'model_probe' => $model_probe,
        'rollout' => $rollout,
        'scene_object_ids' => $scene_object_ids,
        'missing_object_ids' => $missing_object_ids,
        'invalid_object_ids' => $invalid_object_ids,
        'warnings' => $warnings,
        'blockers' => $blockers,
    );
}

/**
 * REST callback for scene health endpoint.
 *
 * @return WP_REST_Response
 */
function ronzani_3d_nav_rest_get_scene_health()
{
    return rest_ensure_response(ronzani_3d_nav_get_scene_health_payload());
}

/**
 * Register REST routes for the plugin.
 *
 * @return void
 */
function ronzani_3d_nav_register_rest_routes(): void
{
    register_rest_route(
        'ronzani-3d-nav/v1',
        '/mapping',
        array(
            'methods' => 'GET',
            'callback' => 'ronzani_3d_nav_rest_get_mapping',
            'permission_callback' => '__return_true',
        )
    );

    register_rest_route(
        'ronzani-3d-nav/v1',
        '/mapping-health',
        array(
            'methods' => 'GET',
            'callback' => 'ronzani_3d_nav_rest_get_mapping_health',
            'permission_callback' => '__return_true',
        )
    );

    register_rest_route(
        'ronzani-3d-nav/v1',
        '/scene-config',
        array(
            'methods' => 'GET',
            'callback' => 'ronzani_3d_nav_rest_get_scene_config',
            'permission_callback' => '__return_true',
        )
    );

    register_rest_route(
        'ronzani-3d-nav/v1',
        '/scene-health',
        array(
            'methods' => 'GET',
            'callback' => 'ronzani_3d_nav_rest_get_scene_health',
            'permission_callback' => '__return_true',
        )
    );
}
add_action('rest_api_init', 'ronzani_3d_nav_register_rest_routes');

/**
 * Enrich mapping item from linked post when post_id is valid.
 *
 * @param array $item Mapping item.
 * @return array
 */
function ronzani_3d_nav_hydrate_mapping_from_post(array $item): array
{
    $post_id = isset($item['post_id']) ? absint($item['post_id']) : 0;
    if ($post_id <= 0) {
        return $item;
    }

    $post = get_post($post_id);
    if (!$post || $post->post_status !== 'publish') {
        return $item;
    }

    if (empty($item['preview']['title'])) {
        $item['preview']['title'] = get_the_title($post);
    }

    if (empty($item['preview']['abstract'])) {
        if (has_excerpt($post)) {
            $item['preview']['abstract'] = $post->post_excerpt;
        } else {
            $raw = wp_strip_all_tags(strip_shortcodes((string) $post->post_content));
            $item['preview']['abstract'] = wp_trim_words($raw, 34, '...');
        }
    }

    if (empty($item['preview']['date'])) {
        $item['preview']['date'] = get_the_date('Y-m-d', $post);
    }

    if (empty($item['article_url'])) {
        $item['article_url'] = get_permalink($post);
    }

    if (empty($item['preview']['cover_image']) && has_post_thumbnail($post)) {
        $cover = wp_get_attachment_image_url(get_post_thumbnail_id($post), 'large');
        if ($cover) {
            $item['preview']['cover_image'] = $cover;
        }
    }

    return $item;
}

/**
 * Add a settings notice for mapping admin workflow.
 *
 * @param string $code Notice code.
 * @param string $message Notice message.
 * @param string $type Notice type.
 * @return void
 */
function ronzani_3d_nav_add_mapping_notice(string $code, string $message, string $type = 'warning'): void
{
    add_settings_error('ronzani_3d_nav_mapping', $code, $message, $type);
}

/**
 * Add a settings notice for scene config workflow.
 *
 * @param string $code Notice code.
 * @param string $message Notice message.
 * @param string $type Notice type.
 * @return void
 */
function ronzani_3d_nav_add_scene_notice(string $code, string $message, string $type = 'warning'): void
{
    add_settings_error('ronzani_3d_nav_scene', $code, $message, $type);
}

/**
 * Return published posts for admin picker.
 *
 * @return array
 */
function ronzani_3d_nav_get_admin_post_options(): array
{
    $posts = get_posts(
        array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'numberposts' => 250,
            'orderby' => 'date',
            'order' => 'DESC',
            'no_found_rows' => true,
        )
    );

    $items = array();
    foreach ($posts as $post) {
        $post_id = (int) $post->ID;
        $excerpt = '';
        if (has_excerpt($post_id)) {
            $excerpt = (string) get_the_excerpt($post_id);
        } else {
            $raw = wp_strip_all_tags(strip_shortcodes((string) $post->post_content));
            $excerpt = (string) wp_trim_words($raw, 34, '...');
        }

        $cover_image = '';
        if (has_post_thumbnail($post_id)) {
            $cover = wp_get_attachment_image_url(get_post_thumbnail_id($post_id), 'large');
            if (is_string($cover) && $cover !== '') {
                $cover_image = $cover;
            }
        }

        $items[] = array(
            'id' => $post_id,
            'title' => get_the_title($post),
            'date' => get_the_date('Y-m-d', $post),
            'edit_url' => get_edit_post_link($post_id, ''),
            'permalink' => get_permalink($post_id),
            'excerpt' => $excerpt,
            'cover_image' => $cover_image,
        );
    }

    return $items;
}

/**
 * Return categories for admin mapping selector.
 *
 * @return array
 */
function ronzani_3d_nav_get_admin_category_options(): array
{
    $terms = get_categories(
        array(
            'hide_empty' => false,
            'taxonomy' => 'category',
            'orderby' => 'name',
            'order' => 'ASC',
        )
    );

    $items = array();
    foreach ($terms as $term) {
        $items[] = array(
            'slug' => (string) $term->slug,
            'name' => (string) $term->name,
        );
    }

    return $items;
}

/**
 * Return seed categories used by default mapping slugs.
 *
 * @return array
 */
function ronzani_3d_nav_seed_category_catalog(): array
{
    $label_map = array(
        'origini-design' => 'Origini Design',
        'font-kerning' => 'Font e Kerning',
        'ultimi-articoli' => 'Ultimi Articoli',
        'archivio-categorie' => 'Archivio Categorie',
        'featured' => 'Featured',
        'case-studies' => 'Case Studies',
        'news' => 'News',
        'tool-review' => 'Tool Review',
        'sperimentazione' => 'Sperimentazione',
        'long-reads' => 'Long Reads',
        'ai-futuro' => 'AI Futuro',
        'green-design' => 'Green Design',
    );

    $seed = ronzani_3d_nav_default_mapping_seed();
    $catalog = array();

    foreach ($seed as $item) {
        if (!is_array($item)) {
            continue;
        }

        $slug = isset($item['category_slug']) ? sanitize_title((string) $item['category_slug']) : '';
        if ($slug === '' || isset($catalog[$slug])) {
            continue;
        }

        $label = isset($label_map[$slug]) ? $label_map[$slug] : ucwords(str_replace(array('-', '_'), ' ', $slug));
        $catalog[$slug] = $label;
    }

    return $catalog;
}

/**
 * Build a compact display label for post picker options.
 *
 * @param int    $post_id Post ID.
 * @param string $title Post title.
 * @param string $date Post date.
 * @return string
 */
function ronzani_3d_nav_build_post_picker_label(int $post_id, string $title, string $date): string
{
    $safe_title = trim($title) !== '' ? $title : '(senza titolo)';
    $safe_date = trim($date) !== '' ? $date : 'data n/d';
    return $post_id . ' - ' . $safe_title . ' [' . $safe_date . ']';
}

/**
 * Sanitize mapping option payload saved from admin.
 *
 * @param mixed $input Submitted option data.
 * @return array
 */
function ronzani_3d_nav_sanitize_mapping_option($input): array
{
    if (!is_array($input)) {
        ronzani_3d_nav_add_mapping_notice(
            'mapping_input_invalid',
            'Formato mapping non valido: ripristinato array vuoto.',
            'error'
        );
        return array();
    }

    $rows = array();
    $seen = array();
    $allowed_object_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_object_ids, true);
    $fov_min = 20.0;
    $fov_max = 90.0;

    foreach ($input as $index => $item) {
        if (!is_array($item)) {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_row_not_array_' . $index,
                'Riga ' . ($index + 1) . ': formato non valido, ignorata.'
            );
            continue;
        }

        $normalized = ronzani_3d_nav_normalize_mapping_item($item, (int) $index);
        if ($normalized['object_id'] === '') {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_object_missing_' . $index,
                'Riga ' . ($index + 1) . ': object_id vuoto, ignorata.',
                'error'
            );
            continue;
        }

        if (!isset($allowed_lookup[$normalized['object_id']])) {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_object_unknown_' . $index,
                'Riga ' . ($index + 1) . ': object_id non consentito (' . $normalized['object_id'] . '), ignorata.',
                'error'
            );
            continue;
        }

        if (isset($seen[$normalized['object_id']])) {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_object_duplicate_' . $index,
                'Riga ' . ($index + 1) . ': object_id duplicato (' . $normalized['object_id'] . '), ignorata.'
            );
            continue;
        }

        $post_id = isset($normalized['post_id']) ? absint($normalized['post_id']) : 0;
        if ($post_id > 0) {
            $post = get_post($post_id);
            if (!$post || $post->post_status !== 'publish') {
                ronzani_3d_nav_add_mapping_notice(
                    'mapping_post_invalid_' . $index,
                    'Riga ' . ($index + 1) . ': post_id ' . $post_id . ' non pubblicato o non valido. Azzerato.'
                );
                $normalized['post_id'] = 0;
            }
        }

        if ($normalized['category_slug'] !== '') {
            $resolved_category_slug = ronzani_3d_nav_resolve_category_slug((string) $normalized['category_slug']);
            if ($resolved_category_slug === '') {
                ronzani_3d_nav_add_mapping_notice(
                    'mapping_category_invalid_' . $index,
                    'Riga ' . ($index + 1) . ': category_slug "' . $normalized['category_slug'] . '" non trovata. Azzerata.'
                );
                $normalized['category_slug'] = '';
            } else {
                $normalized['category_slug'] = $resolved_category_slug;
            }
        }

        $current_fov = (float) $normalized['waypoint']['fov'];
        $clamped_fov = max($fov_min, min($fov_max, $current_fov));
        if ($clamped_fov !== $current_fov) {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_fov_clamped_' . $index,
                'Riga ' . ($index + 1) . ': FOV fuori range, corretto automaticamente a ' . $clamped_fov . '.'
            );
            $normalized['waypoint']['fov'] = $clamped_fov;
        }

        $normalized = ronzani_3d_nav_hydrate_mapping_from_post($normalized);
        $normalized = ronzani_3d_nav_normalize_mapping_item($normalized, (int) $index);

        $missing_fields = array();
        if ($normalized['post_id'] === 0 && $normalized['article_url'] === '') {
            $missing_fields[] = 'post_id/article_url';
        }
        if ($normalized['preview']['title'] === '') {
            $missing_fields[] = 'preview.title';
        }
        if ($normalized['preview']['abstract'] === '') {
            $missing_fields[] = 'preview.abstract';
        }
        if (!empty($missing_fields)) {
            ronzani_3d_nav_add_mapping_notice(
                'mapping_missing_fields_' . $index,
                'Riga ' . ($index + 1) . ' (' . $normalized['object_id'] . '): campi incompleti -> ' . implode(', ', $missing_fields) . '.'
            );
        }

        $seen[$normalized['object_id']] = true;
        $rows[] = $normalized;
    }

    $missing_object_ids = array_values(array_diff($allowed_object_ids, array_keys($seen)));
    if (!empty($missing_object_ids)) {
        ronzani_3d_nav_add_mapping_notice(
            'mapping_object_missing_set',
            'Object ID mancanti nel mapping: ' . implode(', ', $missing_object_ids) . '.'
        );
    }

    if (!empty($rows)) {
        $order_map = array_flip($allowed_object_ids);
        usort(
            $rows,
            static function (array $left, array $right) use ($order_map): int {
                $left_id = isset($left['object_id']) ? (string) $left['object_id'] : '';
                $right_id = isset($right['object_id']) ? (string) $right['object_id'] : '';
                $left_order = isset($order_map[$left_id]) ? (int) $order_map[$left_id] : PHP_INT_MAX;
                $right_order = isset($order_map[$right_id]) ? (int) $order_map[$right_id] : PHP_INT_MAX;
                return $left_order <=> $right_order;
            }
        );
    }

    if (empty($rows)) {
        ronzani_3d_nav_add_mapping_notice(
            'mapping_rows_empty',
            'Nessuna riga valida salvata: il frontend usera il seed di default.',
            'error'
        );
    }

    return $rows;
}

/**
 * Parse object IDs list from textarea/text input.
 *
 * @param string $raw Raw object IDs text.
 * @return array
 */
function ronzani_3d_nav_parse_scene_object_ids(string $raw): array
{
    $tokens = preg_split('/[\s,;]+/', $raw);
    if (!is_array($tokens)) {
        return array();
    }

    $ids = array();
    foreach ($tokens as $token) {
        $normalized = sanitize_key((string) $token);
        if ($normalized === '' || isset($ids[$normalized])) {
            continue;
        }
        $ids[$normalized] = $normalized;
    }

    return array_values($ids);
}

/**
 * Sanitize scene config payload saved from admin.
 *
 * @param mixed $input Submitted scene config.
 * @return array
 */
function ronzani_3d_nav_sanitize_scene_option($input): array
{
    $defaults = ronzani_3d_nav_default_scene_config();

    if (!is_array($input)) {
        ronzani_3d_nav_add_scene_notice(
            'scene_input_invalid',
            'Formato scene config non valido: ripristinata configurazione di default.',
            'error'
        );
        return $defaults;
    }

    $allowed_object_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_object_ids, true);

    $enabled = !empty($input['enabled']);

    $engine = isset($input['engine']) ? sanitize_key((string) $input['engine']) : $defaults['engine'];
    if (!in_array($engine, array('webgl', 'webgpu'), true)) {
        $engine = $defaults['engine'];
        ronzani_3d_nav_add_scene_notice(
            'scene_engine_invalid',
            'Engine non valido: ripristinato a webgl.'
        );
    }

    $model_url = isset($input['model_url']) ? esc_url_raw((string) $input['model_url']) : '';
    $model_format = isset($input['model_format']) ? sanitize_key((string) $input['model_format']) : $defaults['model_format'];
    if (!in_array($model_format, array('glb', 'gltf'), true)) {
        $model_format = $defaults['model_format'];
        ronzani_3d_nav_add_scene_notice(
            'scene_model_format_invalid',
            'Model format non valido: ripristinato a glb.'
        );
    }

    $notes = isset($input['notes']) ? sanitize_textarea_field((string) $input['notes']) : '';
    $rollout_percentage_input = isset($input['rollout_percentage']) ? trim((string) $input['rollout_percentage']) : '';
    if ($rollout_percentage_input !== '' && !is_numeric($rollout_percentage_input)) {
        ronzani_3d_nav_add_scene_notice(
            'scene_rollout_percentage_invalid',
            'Rollout percentage non numerico: ripristinato a 100.'
        );
    } elseif (
        $rollout_percentage_input !== '' &&
        ((int) round((float) $rollout_percentage_input) < 0 || (int) round((float) $rollout_percentage_input) > 100)
    ) {
        ronzani_3d_nav_add_scene_notice(
            'scene_rollout_percentage_clamped',
            'Rollout percentage fuori range: applicato clamp tra 0 e 100.'
        );
    }
    $rollout = ronzani_3d_nav_build_scene_rollout_payload(
        array(
            'rollout_percentage' => $rollout_percentage_input === '' ? '100' : $rollout_percentage_input,
            'rollout_allowlist_text' => isset($input['rollout_allowlist_text']) ? (string) $input['rollout_allowlist_text'] : '',
            'allowlist' => isset($input['rollout_allowlist']) && is_array($input['rollout_allowlist']) ? $input['rollout_allowlist'] : array(),
        )
    );

    $object_ids = array();
    if (isset($input['object_ids']) && is_array($input['object_ids'])) {
        foreach ($input['object_ids'] as $object_id) {
            $normalized = sanitize_key((string) $object_id);
            if ($normalized === '' || isset($object_ids[$normalized])) {
                continue;
            }
            $object_ids[$normalized] = $normalized;
        }
    }

    $object_ids_text = isset($input['object_ids_text']) ? (string) $input['object_ids_text'] : '';
    if (trim($object_ids_text) !== '') {
        foreach (ronzani_3d_nav_parse_scene_object_ids($object_ids_text) as $parsed_id) {
            if (!isset($object_ids[$parsed_id])) {
                $object_ids[$parsed_id] = $parsed_id;
            }
        }
    }

    $filtered_object_ids = array();
    foreach ($object_ids as $object_id) {
        if (!isset($allowed_lookup[$object_id])) {
            ronzani_3d_nav_add_scene_notice(
                'scene_object_id_invalid_' . $object_id,
                'Object ID non consentito in scene config: ' . $object_id . '.',
                'error'
            );
            continue;
        }
        $filtered_object_ids[$object_id] = $object_id;
    }

    if (empty($filtered_object_ids)) {
        $filtered_object_ids = array_fill_keys($allowed_object_ids, true);
        ronzani_3d_nav_add_scene_notice(
            'scene_object_ids_empty',
            'Nessun object_id valido nella scene config: ripristinata la lista ufficiale.',
            'error'
        );
    }

    if ($enabled && $model_url === '') {
        ronzani_3d_nav_add_scene_notice(
            'scene_model_missing',
            'Scena abilitata ma Model URL vuoto: il runtime restera in fallback finche non imposti un .glb/.gltf.'
        );
    }
    if ($enabled && isset($rollout['percentage'], $rollout['allowlist_count']) && (int) $rollout['percentage'] <= 0 && (int) $rollout['allowlist_count'] === 0) {
        ronzani_3d_nav_add_scene_notice(
            'scene_rollout_no_eligible_visitors',
            'Scena abilitata ma rollout senza target (0% e allowlist vuota): resterai in fallback in modalita auto.'
        );
    }

    return array(
        'enabled' => $enabled,
        'engine' => $engine,
        'model_url' => $model_url,
        'model_format' => $model_format,
        'notes' => $notes,
        'object_ids' => array_values(array_keys($filtered_object_ids)),
        'rollout' => array(
            'percentage' => isset($rollout['percentage']) ? (int) $rollout['percentage'] : 100,
            'allowlist' => isset($rollout['allowlist']) && is_array($rollout['allowlist']) ? $rollout['allowlist'] : array(),
        ),
    );
}

/**
 * Register settings for admin mapping page.
 *
 * @return void
 */
function ronzani_3d_nav_register_admin_settings(): void
{
    register_setting(
        'ronzani_3d_nav_mapping_group',
        ronzani_3d_nav_mapping_option_key(),
        array(
            'type' => 'array',
            'sanitize_callback' => 'ronzani_3d_nav_sanitize_mapping_option',
            'default' => array(),
        )
    );

    register_setting(
        'ronzani_3d_nav_scene_group',
        ronzani_3d_nav_scene_option_key(),
        array(
            'type' => 'array',
            'sanitize_callback' => 'ronzani_3d_nav_sanitize_scene_option',
            'default' => ronzani_3d_nav_default_scene_config(),
        )
    );
}
add_action('admin_init', 'ronzani_3d_nav_register_admin_settings');

/**
 * Register mapping page under Settings menu.
 *
 * @return void
 */
function ronzani_3d_nav_register_admin_menu(): void
{
    add_options_page(
        'Ronzani 3D Nav',
        'Ronzani 3D Nav',
        'manage_options',
        'ronzani-3d-nav-mapping',
        'ronzani_3d_nav_render_admin_page'
    );
}
add_action('admin_menu', 'ronzani_3d_nav_register_admin_menu');

/**
 * Handle reset action for mapping option.
 *
 * @return void
 */
function ronzani_3d_nav_handle_reset_mapping(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_reset_mapping');

    delete_option(ronzani_3d_nav_mapping_option_key());

    $redirect = add_query_arg(
        array(
            'page' => 'ronzani-3d-nav-mapping',
            'ronzani_mapping_reset' => '1',
        ),
        admin_url('options-general.php')
    );

    wp_safe_redirect($redirect);
    exit;
}
add_action('admin_post_ronzani_3d_nav_reset_mapping', 'ronzani_3d_nav_handle_reset_mapping');

/**
 * Handle reset action for scene config option.
 *
 * @return void
 */
function ronzani_3d_nav_handle_reset_scene_config(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_reset_scene_config');

    delete_option(ronzani_3d_nav_scene_option_key());

    $redirect = add_query_arg(
        array(
            'page' => 'ronzani-3d-nav-mapping',
            'ronzani_scene_reset' => '1',
        ),
        admin_url('options-general.php')
    );

    wp_safe_redirect($redirect);
    exit;
}
add_action('admin_post_ronzani_3d_nav_reset_scene_config', 'ronzani_3d_nav_handle_reset_scene_config');

/**
 * Create or align WP categories required by seed mapping slugs.
 *
 * @return void
 */
function ronzani_3d_nav_handle_sync_seed_categories(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_sync_seed_categories');

    $redirect_base = add_query_arg(
        array('page' => 'ronzani-3d-nav-mapping'),
        admin_url('options-general.php')
    );

    $catalog = ronzani_3d_nav_seed_category_catalog();
    if (empty($catalog)) {
        wp_safe_redirect(add_query_arg(array('ronzani_seed_category_error' => 'empty'), $redirect_base));
        exit;
    }

    $created = 0;
    $existing = 0;
    $updated = 0;
    $errors = 0;

    foreach ($catalog as $slug => $name) {
        $slug = sanitize_title((string) $slug);
        $name = sanitize_text_field((string) $name);
        if ($slug === '' || $name === '') {
            continue;
        }

        $existing_term = term_exists($slug, 'category');
        if (!empty($existing_term)) {
            $existing++;
            $term_id = is_array($existing_term) ? absint($existing_term['term_id']) : absint($existing_term);
            if ($term_id > 0) {
                $term = get_term($term_id, 'category');
                if ($term && !is_wp_error($term) && (string) $term->name !== $name) {
                    $update = wp_update_term(
                        $term_id,
                        'category',
                        array('name' => $name)
                    );
                    if (is_wp_error($update)) {
                        $errors++;
                    } else {
                        $updated++;
                    }
                }
            }
            continue;
        }

        $insert = wp_insert_term(
            $name,
            'category',
            array('slug' => $slug)
        );
        if (is_wp_error($insert)) {
            $errors++;
            continue;
        }
        $created++;
    }

    wp_safe_redirect(
        add_query_arg(
            array(
                'ronzani_seed_category_created' => $created,
                'ronzani_seed_category_existing' => $existing,
                'ronzani_seed_category_updated' => $updated,
                'ronzani_seed_category_errors' => $errors,
            ),
            $redirect_base
        )
    );
    exit;
}
add_action('admin_post_ronzani_3d_nav_sync_seed_categories', 'ronzani_3d_nav_handle_sync_seed_categories');

/**
 * Repair mapping rows to ensure full object_id coverage.
 *
 * Keeps existing valid rows and fills missing ones from default seed order.
 *
 * @return void
 */
function ronzani_3d_nav_handle_repair_mapping(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_repair_mapping');

    $redirect_base = add_query_arg(
        array('page' => 'ronzani-3d-nav-mapping'),
        admin_url('options-general.php')
    );

    $allowed_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_ids, true);

    $seed_lookup = array();
    $seed_items = ronzani_3d_nav_default_mapping_seed();
    foreach ($seed_items as $index => $seed_item) {
        if (!is_array($seed_item)) {
            continue;
        }
        $normalized = ronzani_3d_nav_normalize_mapping_item($seed_item, (int) $index);
        $object_id = isset($normalized['object_id']) ? (string) $normalized['object_id'] : '';
        if ($object_id === '' || !isset($allowed_lookup[$object_id])) {
            continue;
        }
        $seed_lookup[$object_id] = $normalized;
    }

    $payload = ronzani_3d_nav_get_mapping_payload();
    $current_items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : array();
    $current_lookup = array();
    foreach ($current_items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = ronzani_3d_nav_normalize_mapping_item($item, (int) $index);
        $object_id = isset($normalized['object_id']) ? (string) $normalized['object_id'] : '';
        if ($object_id === '' || !isset($allowed_lookup[$object_id]) || isset($current_lookup[$object_id])) {
            continue;
        }
        $current_lookup[$object_id] = $normalized;
    }

    $repaired_rows = array();
    $added_count = 0;
    foreach ($allowed_ids as $object_id) {
        if (isset($current_lookup[$object_id])) {
            $repaired_rows[] = $current_lookup[$object_id];
            continue;
        }
        if (isset($seed_lookup[$object_id])) {
            $repaired_rows[] = $seed_lookup[$object_id];
            $added_count++;
        }
    }

    if (empty($repaired_rows)) {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_repair_error' => 'empty'), $redirect_base));
        exit;
    }

    $sanitized = ronzani_3d_nav_sanitize_mapping_option($repaired_rows);
    if (empty($sanitized)) {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_repair_error' => 'sanitize'), $redirect_base));
        exit;
    }

    update_option(ronzani_3d_nav_mapping_option_key(), $sanitized, false);

    wp_safe_redirect(
        add_query_arg(
            array(
                'ronzani_mapping_repaired' => $added_count,
                'ronzani_mapping_repair_total' => count($sanitized),
            ),
            $redirect_base
        )
    );
    exit;
}
add_action('admin_post_ronzani_3d_nav_repair_mapping', 'ronzani_3d_nav_handle_repair_mapping');

/**
 * Handle JSON export for mapping option.
 *
 * @return void
 */
function ronzani_3d_nav_handle_export_mapping(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_export_mapping');

    $payload = ronzani_3d_nav_get_mapping_payload();
    $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : array();
    $export = array(
        'schemaVersion' => isset($payload['schemaVersion']) ? (string) $payload['schemaVersion'] : '2026-02-11',
        'source' => isset($payload['source']) ? (string) $payload['source'] : 'unknown',
        'count' => count($items),
        'exportedAt' => gmdate('c'),
        'items' => $items,
    );

    $json = wp_json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        wp_die('Errore durante la generazione del JSON di export.');
    }

    nocache_headers();
    $charset = get_option('blog_charset');
    if (!is_string($charset) || trim($charset) === '') {
        $charset = 'UTF-8';
    }

    header('Content-Type: application/json; charset=' . $charset);
    header('Content-Disposition: attachment; filename=ronzani-3d-nav-mapping-' . gmdate('Ymd-His') . '.json');

    echo $json;
    exit;
}
add_action('admin_post_ronzani_3d_nav_export_mapping', 'ronzani_3d_nav_handle_export_mapping');

/**
 * Handle JSON import for mapping option.
 *
 * @return void
 */
function ronzani_3d_nav_handle_import_mapping(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Permessi insufficienti.');
    }

    check_admin_referer('ronzani_3d_nav_import_mapping');

    $redirect_base = add_query_arg(
        array('page' => 'ronzani-3d-nav-mapping'),
        admin_url('options-general.php')
    );

    $raw_json = isset($_POST['ronzani_mapping_json']) ? trim((string) wp_unslash($_POST['ronzani_mapping_json'])) : '';
    if ($raw_json === '') {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_import_error' => 'empty'), $redirect_base));
        exit;
    }

    $decoded = json_decode($raw_json, true);
    if (!is_array($decoded)) {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_import_error' => 'json'), $redirect_base));
        exit;
    }

    $rows = array();
    if (isset($decoded['items']) && is_array($decoded['items'])) {
        $rows = $decoded['items'];
    } elseif (isset($decoded['object_id'])) {
        $rows = array($decoded);
    } elseif ($decoded === array_values($decoded)) {
        $rows = $decoded;
    }

    if (empty($rows)) {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_import_error' => 'shape'), $redirect_base));
        exit;
    }

    $sanitized = ronzani_3d_nav_sanitize_mapping_option($rows);
    if (empty($sanitized)) {
        wp_safe_redirect(add_query_arg(array('ronzani_mapping_import_error' => 'rows'), $redirect_base));
        exit;
    }

    update_option(ronzani_3d_nav_mapping_option_key(), $sanitized, false);

    wp_safe_redirect(
        add_query_arg(
            array(
                'ronzani_mapping_imported' => count($sanitized),
            ),
            $redirect_base
        )
    );
    exit;
}
add_action('admin_post_ronzani_3d_nav_import_mapping', 'ronzani_3d_nav_handle_import_mapping');

/**
 * Render a numeric input for mapping row.
 *
 * @param string $name Input name.
 * @param float  $value Input value.
 * @param string $step Numeric step.
 * @return string
 */
function ronzani_3d_nav_render_number_input(string $name, float $value, string $step = '0.01'): string
{
    return '<input type="number" class="small-text" name="' . esc_attr($name) . '" value="' . esc_attr((string) $value) . '" step="' . esc_attr($step) . '">';
}

/**
 * Render admin page for mapping management.
 *
 * @return void
 */
function ronzani_3d_nav_render_admin_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }

    $payload = ronzani_3d_nav_get_mapping_payload();
    $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : array();
    $scene_payload = ronzani_3d_nav_get_scene_config_payload();
    $scene_health_payload = ronzani_3d_nav_get_scene_health_payload();
    $scene_health_summary =
        isset($scene_health_payload['summary']) && is_array($scene_health_payload['summary'])
            ? $scene_health_payload['summary']
            : array();
    $post_options = ronzani_3d_nav_get_admin_post_options();
    $category_options = ronzani_3d_nav_get_admin_category_options();

    $scene_enabled = !empty($scene_payload['enabled']);
    $scene_engine = isset($scene_payload['engine']) ? (string) $scene_payload['engine'] : 'webgl';
    $scene_model_url = isset($scene_payload['model_url']) ? (string) $scene_payload['model_url'] : '';
    $scene_model_format = isset($scene_payload['model_format']) ? (string) $scene_payload['model_format'] : 'glb';
    $scene_notes = isset($scene_payload['notes']) ? (string) $scene_payload['notes'] : '';
    $scene_rollout = isset($scene_payload['rollout']) && is_array($scene_payload['rollout'])
        ? ronzani_3d_nav_build_scene_rollout_payload($scene_payload['rollout'])
        : ronzani_3d_nav_build_scene_rollout_payload(array());
    $scene_rollout_percentage = isset($scene_rollout['percentage']) ? (int) $scene_rollout['percentage'] : 100;
    $scene_rollout_allowlist = isset($scene_rollout['allowlist']) && is_array($scene_rollout['allowlist'])
        ? $scene_rollout['allowlist']
        : array();
    $scene_rollout_allowlist_count = isset($scene_rollout['allowlist_count']) ? (int) $scene_rollout['allowlist_count'] : count($scene_rollout_allowlist);
    $scene_rollout_mode = isset($scene_rollout['mode']) ? (string) $scene_rollout['mode'] : 'all';
    $scene_rollout_allowlist_text = implode("\n", array_map('strval', $scene_rollout_allowlist));
    $scene_object_ids = isset($scene_payload['object_ids']) && is_array($scene_payload['object_ids'])
        ? $scene_payload['object_ids']
        : array_values(ronzani_3d_nav_allowed_object_ids());
    $scene_object_ids_text = implode("\n", array_map('strval', $scene_object_ids));
    $scene_missing_model = $scene_enabled && trim($scene_model_url) === '';
    $scene_rollout_hard_block = $scene_enabled && $scene_rollout_percentage <= 0 && $scene_rollout_allowlist_count === 0;
    $scene_contract_count = count($scene_object_ids);
    $scene_health_ok = !empty($scene_health_summary['ok']);
    $scene_health_missing = isset($scene_health_summary['missing']) ? (int) $scene_health_summary['missing'] : 0;
    $scene_health_invalid = isset($scene_health_summary['invalid']) ? (int) $scene_health_summary['invalid'] : 0;
    $scene_health_warnings = isset($scene_health_summary['warnings']) ? (int) $scene_health_summary['warnings'] : 0;
    $scene_health_blockers = isset($scene_health_payload['blockers']) && is_array($scene_health_payload['blockers'])
        ? $scene_health_payload['blockers']
        : array();
    $scene_health_warnings_list = isset($scene_health_payload['warnings']) && is_array($scene_health_payload['warnings'])
        ? $scene_health_payload['warnings']
        : array();
    $scene_model_probe = isset($scene_health_payload['model_probe']) && is_array($scene_health_payload['model_probe'])
        ? $scene_health_payload['model_probe']
        : array();
    $scene_model_probe_checked = !empty($scene_model_probe['checked']);
    $scene_model_probe_reachable = !empty($scene_model_probe['reachable']);
    $scene_model_probe_status = isset($scene_model_probe['http_status']) ? (int) $scene_model_probe['http_status'] : 0;
    $scene_model_probe_error = isset($scene_model_probe['error']) ? (string) $scene_model_probe['error'] : '';
    $scene_health_rollout_mode = isset($scene_health_summary['rollout_mode']) ? (string) $scene_health_summary['rollout_mode'] : $scene_rollout_mode;
    $scene_health_rollout_percentage = isset($scene_health_summary['rollout_percentage']) ? (int) $scene_health_summary['rollout_percentage'] : $scene_rollout_percentage;
    $scene_health_rollout_allowlist = isset($scene_health_summary['rollout_allowlist']) ? (int) $scene_health_summary['rollout_allowlist'] : $scene_rollout_allowlist_count;

    $post_lookup = array();
    foreach ($post_options as $post_row) {
        $post_lookup[(int) $post_row['id']] = $post_row;
    }

    $category_lookup = array();
    foreach ($category_options as $category_row) {
        $category_lookup[(string) $category_row['slug']] = $category_row;
    }

    $allowed_object_ids = ronzani_3d_nav_allowed_object_ids();
    $allowed_lookup = array_fill_keys($allowed_object_ids, true);
    $present_object_ids = array();
    $invalid_object_ids = array();
    $rows_with_warnings = 0;
    $rows_with_post = 0;
    $rows_with_category = 0;

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $object_id = isset($item['object_id']) ? (string) $item['object_id'] : '';
        $post_id = isset($item['post_id']) ? (int) $item['post_id'] : 0;
        $category_slug = isset($item['category_slug']) ? (string) $item['category_slug'] : '';
        $article_url = isset($item['article_url']) ? (string) $item['article_url'] : '';
        $preview = isset($item['preview']) && is_array($item['preview']) ? $item['preview'] : array();
        $preview_title = isset($preview['title']) ? (string) $preview['title'] : '';
        $preview_abstract = isset($preview['abstract']) ? (string) $preview['abstract'] : '';

        if ($object_id !== '') {
            $present_object_ids[$object_id] = true;
            if (!isset($allowed_lookup[$object_id])) {
                $invalid_object_ids[$object_id] = $object_id;
            }
        }

        if ($post_id > 0) {
            $rows_with_post++;
        }
        if ($category_slug !== '') {
            $rows_with_category++;
        }

        $row_has_warning = false;
        if (!isset($allowed_lookup[$object_id])) {
            $row_has_warning = true;
        }
        if ($post_id === 0 && $article_url === '') {
            $row_has_warning = true;
        }
        if ($preview_title === '') {
            $row_has_warning = true;
        }
        if ($preview_abstract === '') {
            $row_has_warning = true;
        }
        if ($category_slug !== '' && !isset($category_lookup[$category_slug])) {
            $row_has_warning = true;
        }
        if ($row_has_warning) {
            $rows_with_warnings++;
        }
    }

    $missing_object_ids = array_values(array_diff($allowed_object_ids, array_keys($present_object_ids)));
    ?>
    <div class="wrap">
      <h1>Ronzani 3D Nav - Mapping Oggetti</h1>
      <?php settings_errors('ronzani_3d_nav_scene'); ?>
      <?php settings_errors('ronzani_3d_nav_mapping'); ?>
      <?php if (isset($_GET['settings-updated']) && !isset($_GET['ronzani_mapping_reset']) && !isset($_GET['ronzani_mapping_imported'])) : ?>
        <div class="notice notice-success is-dismissible"><p>Configurazione salvata correttamente.</p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_mapping_reset'])) : ?>
        <div class="notice notice-success is-dismissible"><p>Mapping ripristinato al seed di default.</p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_scene_reset'])) : ?>
        <div class="notice notice-success is-dismissible"><p>Scene config ripristinata ai default.</p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_mapping_imported'])) : ?>
        <div class="notice notice-success is-dismissible"><p>Import mapping completato. Righe importate: <strong><?php echo esc_html((string) absint($_GET['ronzani_mapping_imported'])); ?></strong>.</p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_mapping_import_error'])) : ?>
        <?php
        $import_error = sanitize_key((string) $_GET['ronzani_mapping_import_error']);
        $import_messages = array(
            'empty' => 'Import fallito: JSON vuoto.',
            'json' => 'Import fallito: JSON non valido.',
            'shape' => 'Import fallito: struttura JSON non supportata (usa {"items":[...]} oppure un array di righe).',
            'rows' => 'Import fallito: nessuna riga valida dopo sanitizzazione.',
        );
        $import_message = isset($import_messages[$import_error]) ? $import_messages[$import_error] : 'Import fallito.';
        ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($import_message); ?></p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_mapping_repaired'])) : ?>
        <?php
        $repaired_added = absint($_GET['ronzani_mapping_repaired']);
        $repaired_total = isset($_GET['ronzani_mapping_repair_total']) ? absint($_GET['ronzani_mapping_repair_total']) : 0;
        $repair_message = $repaired_added > 0
            ? 'Riparazione completata. Righe aggiunte dal seed: ' . $repaired_added . '. Totale mapping: ' . $repaired_total . '.'
            : 'Riparazione completata. Nessun object_id mancante: mapping gia completo.';
        ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($repair_message); ?></p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_mapping_repair_error'])) : ?>
        <?php
        $repair_error = sanitize_key((string) $_GET['ronzani_mapping_repair_error']);
        $repair_messages = array(
            'empty' => 'Riparazione fallita: impossibile costruire un mapping valido.',
            'sanitize' => 'Riparazione fallita: sanitizzazione non riuscita.',
        );
        $repair_error_message = isset($repair_messages[$repair_error]) ? $repair_messages[$repair_error] : 'Riparazione fallita.';
        ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($repair_error_message); ?></p></div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_seed_category_created']) || isset($_GET['ronzani_seed_category_existing'])) : ?>
        <?php
        $seed_created = isset($_GET['ronzani_seed_category_created']) ? absint($_GET['ronzani_seed_category_created']) : 0;
        $seed_existing = isset($_GET['ronzani_seed_category_existing']) ? absint($_GET['ronzani_seed_category_existing']) : 0;
        $seed_updated = isset($_GET['ronzani_seed_category_updated']) ? absint($_GET['ronzani_seed_category_updated']) : 0;
        $seed_errors = isset($_GET['ronzani_seed_category_errors']) ? absint($_GET['ronzani_seed_category_errors']) : 0;
        ?>
        <div class="notice <?php echo $seed_errors > 0 ? 'notice-warning' : 'notice-success'; ?> is-dismissible">
          <p>
            Categorie seed allineate:
            create <strong><?php echo esc_html((string) $seed_created); ?></strong>,
            esistenti <strong><?php echo esc_html((string) $seed_existing); ?></strong>,
            rinominate <strong><?php echo esc_html((string) $seed_updated); ?></strong>,
            errori <strong><?php echo esc_html((string) $seed_errors); ?></strong>.
          </p>
        </div>
      <?php endif; ?>
      <?php if (isset($_GET['ronzani_seed_category_error'])) : ?>
        <div class="notice notice-error is-dismissible"><p>Allineamento categorie seed fallito: catalogo vuoto.</p></div>
      <?php endif; ?>

      <p>Configura la scena 3D e il mapping tra <code>object_id</code> e contenuti del blog.</p>
      <p><strong>Sorgenti correnti:</strong> scena <strong><?php echo esc_html((string) $scene_payload['source']); ?></strong>, mapping <strong><?php echo esc_html((string) $payload['source']); ?></strong>.</p>

      <style>
        .ronzani-scene-card { background:#fff; border:1px solid #dcdcde; border-radius:8px; padding:12px 16px; margin:12px 0 16px; }
        .ronzani-scene-grid { display:grid; gap:10px 12px; grid-template-columns: repeat(4,minmax(160px,1fr)); align-items:end; }
        .ronzani-scene-grid label { display:block; font-weight:600; margin-bottom:4px; }
        .ronzani-scene-grid input[type="text"],
        .ronzani-scene-grid input[type="url"],
        .ronzani-scene-grid select,
        .ronzani-scene-grid textarea { width:100%; }
        .ronzani-scene-grid .span-2 { grid-column: span 2; }
        .ronzani-scene-grid .span-4 { grid-column: 1 / -1; }
        .ronzani-scene-warning { margin:10px 0 0; padding:8px 12px; border-radius:6px; background:#fff8e1; border:1px solid #e3d1a3; color:#8a6d3b; }
        .ronzani-mapping-card { background:#fff; border:1px solid #dcdcde; border-radius:8px; margin:12px 0; padding:12px 16px; }
        .ronzani-mapping-grid { display:grid; gap:10px 12px; grid-template-columns: repeat(4,minmax(160px,1fr)); align-items:end; }
        .ronzani-mapping-grid label { display:block; font-weight:600; margin-bottom:4px; }
        .ronzani-mapping-grid input[type="text"],
        .ronzani-mapping-grid input[type="url"],
        .ronzani-mapping-grid input[type="date"],
        .ronzani-mapping-grid input[type="number"],
        .ronzani-mapping-grid select,
        .ronzani-mapping-grid textarea { width:100%; }
        .ronzani-mapping-grid .span-2 { grid-column: span 2; }
        .ronzani-mapping-grid .span-4 { grid-column: 1 / -1; }
        .ronzani-mapping-card summary { cursor:pointer; font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .ronzani-mapping-card code { font-size:12px; }
        .ronzani-mapping-badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; line-height:1.3; }
        .ronzani-mapping-badge-warning { background:#fff8e1; color:#8a6d3b; border:1px solid #e3d1a3; }
        .ronzani-help { margin-top:4px; font-size:12px; color:#50575e; }
        .ronzani-row-warnings { margin:4px 0 0; padding:8px 12px; background:#fff8e1; border:1px solid #e3d1a3; border-radius:6px; }
        .ronzani-row-warnings li { margin:4px 0; }
        .ronzani-row-selector { display:inline-flex; align-items:center; gap:6px; margin-left:auto; font-size:12px; color:#50575e; font-weight:400; }
        .ronzani-row-selector input { margin:0; }
        .ronzani-mapping-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0 16px; padding:10px 12px; background:#fff; border:1px solid #dcdcde; border-radius:8px; }
        .ronzani-mapping-toolbar .button { margin:0; }
        .ronzani-mapping-toolbar .button[data-active="1"] { background:#e7f3ff; border-color:#72aee6; color:#1d2327; }
        .ronzani-mapping-toolbar .ronzani-toolbar-meta { font-size:12px; color:#50575e; }
        .ronzani-mapping-toolbar .ronzani-toolbar-spacer { flex:1 1 auto; min-width:16px; }
        .ronzani-mapping-toolbar .ronzani-toolbar-feedback[data-state="ok"] { color:#008a20; font-weight:600; }
        .ronzani-mapping-toolbar .ronzani-toolbar-feedback[data-state="warn"] { color:#b32d2e; font-weight:600; }
        .ronzani-mapping-health { margin:12px 0 16px; padding:12px; background:#fff; border:1px solid #dcdcde; border-radius:8px; }
        .ronzani-health-row { display:flex; flex-wrap:wrap; gap:8px; }
        .ronzani-health-badge { display:inline-block; padding:4px 10px; border-radius:999px; background:#f6f7f7; border:1px solid #dcdcde; font-size:12px; }
        .ronzani-health-badge[data-tone="warn"] { background:#fff8e1; border-color:#e3d1a3; color:#8a6d3b; }
        .ronzani-health-note { margin:8px 0 0; font-size:12px; }
        .ronzani-health-note[data-tone="warn"] { color:#8a6d3b; }
        .ronzani-health-note code { font-size:11px; }
      </style>

      <div class="ronzani-mapping-health">
        <h2 style="margin-top:0;">Scene Health</h2>
        <div class="ronzani-health-row">
          <span class="ronzani-health-badge" data-tone="<?php echo esc_attr($scene_health_ok ? 'ok' : 'warn'); ?>">
            Stato: <?php echo esc_html($scene_health_ok ? 'OK' : 'KO'); ?>
          </span>
          <span class="ronzani-health-badge">
            Enabled: <?php echo esc_html(!empty($scene_health_summary['enabled']) ? '1' : '0'); ?>
          </span>
          <span class="ronzani-health-badge">
            Model URL: <?php echo esc_html(!empty($scene_health_summary['model_url_set']) ? 'set' : 'missing'); ?>
          </span>
          <span class="ronzani-health-badge">
            Model valid: <?php echo esc_html(!empty($scene_health_summary['model_url_valid']) ? '1' : '0'); ?>
          </span>
          <span class="ronzani-health-badge" data-tone="<?php echo esc_attr($scene_model_probe_checked ? 'ok' : 'warn'); ?>">
            Probe checked: <?php echo esc_html($scene_model_probe_checked ? '1' : '0'); ?>
          </span>
          <span class="ronzani-health-badge" data-tone="<?php echo esc_attr($scene_model_probe_reachable ? 'ok' : 'warn'); ?>">
            Reachable: <?php echo esc_html($scene_model_probe_reachable ? '1' : '0'); ?>
          </span>
          <span class="ronzani-health-badge">
            HTTP: <?php echo esc_html((string) $scene_model_probe_status); ?>
          </span>
          <span class="ronzani-health-badge">
            Missing IDs: <?php echo esc_html((string) $scene_health_missing); ?>
          </span>
          <span class="ronzani-health-badge" data-tone="<?php echo esc_attr($scene_health_invalid > 0 ? 'warn' : 'ok'); ?>">
            Invalid IDs: <?php echo esc_html((string) $scene_health_invalid); ?>
          </span>
          <span class="ronzani-health-badge" data-tone="<?php echo esc_attr($scene_health_warnings > 0 ? 'warn' : 'ok'); ?>">
            Warnings: <?php echo esc_html((string) $scene_health_warnings); ?>
          </span>
          <span class="ronzani-health-badge">
            Rollout mode: <?php echo esc_html($scene_health_rollout_mode); ?>
          </span>
          <span class="ronzani-health-badge">
            Rollout %: <?php echo esc_html((string) $scene_health_rollout_percentage); ?>
          </span>
          <span class="ronzani-health-badge">
            Allowlist: <?php echo esc_html((string) $scene_health_rollout_allowlist); ?>
          </span>
        </div>
        <?php if (!empty($scene_health_blockers)) : ?>
          <p class="ronzani-health-note" data-tone="warn">
            Blockers: <code><?php echo esc_html(implode(', ', array_map('strval', $scene_health_blockers))); ?></code>
          </p>
        <?php endif; ?>
        <?php if (!empty($scene_health_warnings_list)) : ?>
          <p class="ronzani-health-note" data-tone="warn">
            Warning codes: <code><?php echo esc_html(implode(', ', array_map('strval', $scene_health_warnings_list))); ?></code>
          </p>
        <?php endif; ?>
        <?php if ($scene_model_probe_error !== '') : ?>
          <p class="ronzani-health-note" data-tone="warn">
            Model probe error: <code><?php echo esc_html($scene_model_probe_error); ?></code>
          </p>
        <?php endif; ?>
      </div>

      <form method="post" action="options.php" class="ronzani-scene-card">
        <?php settings_fields('ronzani_3d_nav_scene_group'); ?>
        <h2 style="margin-top:0;">Scene Config (V3)</h2>
        <p style="margin-top:0;">Controlla il contratto scena usato dal runtime: se <strong>enabled</strong>, <strong>model_url</strong> valido e rollout passa (allowlist o percentuale), il bootstrap puo uscire da <code>scene-disabled</code>.</p>
        <div class="ronzani-scene-grid">
          <div>
            <label for="ronzani-scene-enabled">Abilita scena</label>
            <label for="ronzani-scene-enabled" style="font-weight:400;">
              <input type="checkbox" id="ronzani-scene-enabled" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[enabled]'); ?>" value="1" <?php checked($scene_enabled); ?>>
              Attiva bootstrap scena 3D
            </label>
          </div>

          <div>
            <label for="ronzani-scene-engine">Engine</label>
            <select id="ronzani-scene-engine" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[engine]'); ?>">
              <option value="webgl" <?php selected($scene_engine, 'webgl'); ?>>WebGL</option>
              <option value="webgpu" <?php selected($scene_engine, 'webgpu'); ?>>WebGPU (preview)</option>
            </select>
          </div>

          <div>
            <label for="ronzani-scene-format">Model format</label>
            <select id="ronzani-scene-format" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[model_format]'); ?>">
              <option value="glb" <?php selected($scene_model_format, 'glb'); ?>>GLB</option>
              <option value="gltf" <?php selected($scene_model_format, 'gltf'); ?>>GLTF</option>
            </select>
          </div>

          <div>
            <label>Object IDs in contract</label>
            <input type="text" value="<?php echo esc_attr((string) $scene_contract_count); ?>" readonly>
          </div>

          <div class="span-4">
            <label for="ronzani-scene-model-url">Model URL (.glb/.gltf)</label>
            <input type="url" id="ronzani-scene-model-url" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[model_url]'); ?>" value="<?php echo esc_attr($scene_model_url); ?>" placeholder="https://.../museum-room.glb">
          </div>

          <div class="span-2">
            <label for="ronzani-scene-object-ids">Object IDs (uno per riga o separati da virgola)</label>
            <textarea id="ronzani-scene-object-ids" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[object_ids_text]'); ?>" rows="6" class="code"><?php echo esc_textarea($scene_object_ids_text); ?></textarea>
            <p class="ronzani-help">Usa solo gli object_id ufficiali del blueprint; gli ID non validi vengono scartati in salvataggio.</p>
          </div>

          <div class="span-2">
            <label for="ronzani-scene-notes">Note operative</label>
            <textarea id="ronzani-scene-notes" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[notes]'); ?>" rows="6"><?php echo esc_textarea($scene_notes); ?></textarea>
          </div>

          <div>
            <label for="ronzani-scene-rollout-percentage">Rollout percentuale (0-100)</label>
            <input
              type="number"
              id="ronzani-scene-rollout-percentage"
              name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[rollout_percentage]'); ?>"
              min="0"
              max="100"
              step="1"
              value="<?php echo esc_attr((string) $scene_rollout_percentage); ?>"
            >
            <p class="ronzani-help"><code>100</code> = tutti, <code>0</code> = solo allowlist.</p>
          </div>

          <div>
            <label>Rollout mode</label>
            <input type="text" value="<?php echo esc_attr($scene_rollout_mode); ?>" readonly>
          </div>

          <div>
            <label>Allowlist count</label>
            <input type="text" value="<?php echo esc_attr((string) $scene_rollout_allowlist_count); ?>" readonly>
          </div>

          <div></div>

          <div class="span-4">
            <label for="ronzani-scene-rollout-allowlist">Rollout allowlist (chiavi visitor, una per riga)</label>
            <textarea id="ronzani-scene-rollout-allowlist" name="<?php echo esc_attr(ronzani_3d_nav_scene_option_key() . '[rollout_allowlist_text]'); ?>" rows="4" class="code"><?php echo esc_textarea($scene_rollout_allowlist_text); ?></textarea>
            <p class="ronzani-help">Formato token: lettere, numeri, underscore o trattino (es: <code>user-1</code>, <code>tester_a</code>).</p>
          </div>
        </div>
        <?php if ($scene_missing_model) : ?>
          <p class="ronzani-scene-warning">Scena abilitata ma <code>model_url</code> vuoto: il runtime restera in fallback finche non imposti il modello.</p>
        <?php endif; ?>
        <?php if ($scene_rollout_hard_block) : ?>
          <p class="ronzani-scene-warning">Scena abilitata ma rollout bloccante (<code>0%</code> e allowlist vuota): in modalita auto il runtime restera in fallback.</p>
        <?php endif; ?>
        <?php submit_button('Salva Scene Config', 'secondary', 'submit', false, array('style' => 'margin-top:12px;')); ?>
      </form>

      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:-6px; margin-bottom:14px;">
        <?php wp_nonce_field('ronzani_3d_nav_reset_scene_config'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_reset_scene_config">
        <?php submit_button('Reset Scene Config', 'secondary', 'submit', false); ?>
      </form>

      <h2>Mapping Oggetti</h2>
      <p><strong>Workflow consigliato:</strong> cerca un articolo nel campo <em>Post</em>, selezionalo e salva. Il sistema compila automaticamente i campi preview mancanti.</p>

      <div class="ronzani-mapping-health">
        <div class="ronzani-health-row">
          <span class="ronzani-health-badge">Righe mapping: <?php echo esc_html((string) count($items)); ?> / <?php echo esc_html((string) count($allowed_object_ids)); ?></span>
          <span class="ronzani-health-badge <?php echo $rows_with_warnings > 0 ? '' : ''; ?>" data-tone="<?php echo esc_attr($rows_with_warnings > 0 ? 'warn' : 'ok'); ?>">Righe con warning: <?php echo esc_html((string) $rows_with_warnings); ?></span>
          <span class="ronzani-health-badge">Righe con Post: <?php echo esc_html((string) $rows_with_post); ?></span>
          <span class="ronzani-health-badge">Righe con Categoria: <?php echo esc_html((string) $rows_with_category); ?></span>
        </div>
        <?php if (!empty($missing_object_ids)) : ?>
          <p class="ronzani-health-note" data-tone="warn">
            Object ID mancanti: <code><?php echo esc_html(implode(', ', $missing_object_ids)); ?></code>
          </p>
        <?php endif; ?>
        <?php if (!empty($invalid_object_ids)) : ?>
          <p class="ronzani-health-note" data-tone="warn">
            Object ID non validi presenti: <code><?php echo esc_html(implode(', ', array_values($invalid_object_ids))); ?></code>
          </p>
        <?php endif; ?>
      </div>

      <datalist id="ronzani-3d-nav-post-options">
        <?php foreach ($post_options as $post_option) : ?>
          <?php $option_label = ronzani_3d_nav_build_post_picker_label((int) $post_option['id'], (string) $post_option['title'], (string) $post_option['date']); ?>
          <option
            value="<?php echo esc_attr($option_label); ?>"
            data-post-id="<?php echo esc_attr((string) $post_option['id']); ?>"
            data-title="<?php echo esc_attr((string) $post_option['title']); ?>"
            data-date="<?php echo esc_attr((string) $post_option['date']); ?>"
            data-url="<?php echo esc_attr((string) $post_option['permalink']); ?>"
            data-excerpt="<?php echo esc_attr((string) $post_option['excerpt']); ?>"
            data-cover-image="<?php echo esc_attr((string) $post_option['cover_image']); ?>"
          ></option>
        <?php endforeach; ?>
      </datalist>

      <form method="post" action="options.php">
        <?php settings_fields('ronzani_3d_nav_mapping_group'); ?>
        <div class="ronzani-mapping-toolbar">
          <button type="button" class="button" id="ronzani-filter-warning" data-active="0">Mostra solo warning</button>
          <button type="button" class="button" id="ronzani-select-visible">Seleziona visibili</button>
          <button type="button" class="button" id="ronzani-clear-selection">Deseleziona</button>
          <span class="ronzani-toolbar-meta" id="ronzani-selection-count">0 righe selezionate</span>
          <span class="ronzani-toolbar-spacer"></span>
          <label for="ronzani-bulk-category"><strong>Categoria bulk</strong></label>
          <select id="ronzani-bulk-category">
            <option value="">Nessuna categoria</option>
            <?php foreach ($category_options as $category_option) : ?>
              <option value="<?php echo esc_attr((string) $category_option['slug']); ?>">
                <?php echo esc_html((string) $category_option['name'] . ' (' . (string) $category_option['slug'] . ')'); ?>
              </option>
            <?php endforeach; ?>
          </select>
          <button type="button" class="button" id="ronzani-apply-bulk-category">Applica categoria</button>
          <button type="button" class="button" id="ronzani-clear-selected-posts">Azzera post selezionati</button>
          <label for="ronzani-fill-overwrite">
            <input type="checkbox" id="ronzani-fill-overwrite" value="1">
            Sovrascrivi campi preview gia compilati
          </label>
          <button type="button" class="button" id="ronzani-fill-selected-from-post">Compila preview dai post</button>
          <span class="ronzani-toolbar-meta ronzani-toolbar-feedback" id="ronzani-toolbar-feedback" data-state="" aria-live="polite"></span>
        </div>

        <?php foreach ($items as $index => $item) : ?>
          <?php
          $object_id = isset($item['object_id']) ? (string) $item['object_id'] : '';
          $post_id = isset($item['post_id']) ? (int) $item['post_id'] : 0;
          $category_slug = isset($item['category_slug']) ? (string) $item['category_slug'] : '';
          $article_url = isset($item['article_url']) ? (string) $item['article_url'] : '';

          $position = isset($item['waypoint']['position']) && is_array($item['waypoint']['position']) ? $item['waypoint']['position'] : array('x' => 0, 'y' => 0, 'z' => 0);
          $target = isset($item['waypoint']['target']) && is_array($item['waypoint']['target']) ? $item['waypoint']['target'] : array('x' => 0, 'y' => 0, 'z' => 0);
          $fov = isset($item['waypoint']['fov']) ? (float) $item['waypoint']['fov'] : 40.0;

          $preview = isset($item['preview']) && is_array($item['preview']) ? $item['preview'] : array();
          $preview_title = isset($preview['title']) ? (string) $preview['title'] : '';
          $preview_abstract = isset($preview['abstract']) ? (string) $preview['abstract'] : '';
          $preview_cover = isset($preview['cover_image']) ? (string) $preview['cover_image'] : '';
          $preview_date = isset($preview['date']) ? (string) $preview['date'] : '';

          $post_picker_value = '';
          $post_edit_url = '';
          $post_view_url = '';
          if ($post_id > 0 && isset($post_lookup[$post_id])) {
              $post_picker_value = ronzani_3d_nav_build_post_picker_label($post_id, (string) $post_lookup[$post_id]['title'], (string) $post_lookup[$post_id]['date']);
              $post_edit_url = (string) $post_lookup[$post_id]['edit_url'];
              $post_view_url = (string) $post_lookup[$post_id]['permalink'];
          } elseif ($post_id > 0) {
              $post_picker_value = (string) $post_id;
          }

          $row_warnings = array();
          if ($post_id === 0 && $article_url === '') {
              $row_warnings[] = 'Manca collegamento contenuto: imposta un Post oppure Article URL.';
          }
          if ($preview_title === '') {
              $row_warnings[] = 'Preview title vuoto.';
          }
          if ($preview_abstract === '') {
              $row_warnings[] = 'Preview abstract vuoto.';
          }
          if ($category_slug !== '' && !isset($category_lookup[$category_slug])) {
              $row_warnings[] = 'Categoria non valida: ' . $category_slug . '.';
          }
          if (!isset($allowed_lookup[$object_id])) {
              $row_warnings[] = 'Object ID non previsto dal blueprint: ' . $object_id . '.';
          }
          $warning_count = count($row_warnings);
          $post_hidden_id = 'ronzani-post-id-' . $index;
          ?>
          <details class="ronzani-mapping-card" data-has-warning="<?php echo esc_attr($warning_count > 0 ? '1' : '0'); ?>" data-row-index="<?php echo esc_attr((string) $index); ?>" open>
            <summary>
              <?php echo esc_html(($index + 1) . '. ' . $object_id); ?>
              <code>(object_id)</code>
              <span class="ronzani-mapping-badge ronzani-mapping-badge-warning" <?php echo $warning_count > 0 ? '' : 'style="display:none"'; ?>><?php echo esc_html((string) $warning_count); ?> warning</span>
              <label class="ronzani-row-selector">
                <input type="checkbox" class="ronzani-row-select" aria-label="Seleziona riga <?php echo esc_attr((string) ($index + 1)); ?>">
                seleziona
              </label>
            </summary>

            <div class="ronzani-mapping-grid" style="margin-top:12px;">
              <div>
                <label>Object ID</label>
                <input type="text" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][object_id]'); ?>" value="<?php echo esc_attr($object_id); ?>" readonly>
              </div>

              <div class="span-2">
                <label>Post (ricerca)</label>
                <input
                  type="hidden"
                  id="<?php echo esc_attr($post_hidden_id); ?>"
                  class="ronzani-post-id-input"
                  name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][post_id]'); ?>"
                  value="<?php echo esc_attr((string) $post_id); ?>"
                >
                <input
                  type="text"
                  class="ronzani-post-picker"
                  list="ronzani-3d-nav-post-options"
                  data-target="<?php echo esc_attr($post_hidden_id); ?>"
                  value="<?php echo esc_attr($post_picker_value); ?>"
                  placeholder="Cerca articolo pubblicato..."
                >
                <p class="ronzani-help">Digita titolo o ID, poi seleziona dalla lista suggerita.</p>
                <?php if ($post_edit_url !== '' || $post_view_url !== '') : ?>
                  <p class="ronzani-help">
                    <?php if ($post_edit_url !== '') : ?>
                      <a href="<?php echo esc_url($post_edit_url); ?>">Modifica post</a>
                    <?php endif; ?>
                    <?php if ($post_edit_url !== '' && $post_view_url !== '') : ?> | <?php endif; ?>
                    <?php if ($post_view_url !== '') : ?>
                      <a href="<?php echo esc_url($post_view_url); ?>" target="_blank" rel="noopener noreferrer">Apri post</a>
                    <?php endif; ?>
                  </p>
                <?php endif; ?>
              </div>

              <div>
                <label>Category</label>
                <select class="ronzani-category-select" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][category_slug]'); ?>">
                  <option value="">Nessuna categoria</option>
                  <?php foreach ($category_options as $category_option) : ?>
                    <option value="<?php echo esc_attr((string) $category_option['slug']); ?>" <?php selected($category_slug, (string) $category_option['slug']); ?>>
                      <?php echo esc_html((string) $category_option['name'] . ' (' . (string) $category_option['slug'] . ')'); ?>
                    </option>
                  <?php endforeach; ?>
                </select>
              </div>

              <div>
                <label>FOV</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][fov]', $fov); ?>
              </div>
              <div>
                <label>Pos X</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][position][x]', (float) $position['x']); ?>
              </div>
              <div>
                <label>Pos Y</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][position][y]', (float) $position['y']); ?>
              </div>
              <div>
                <label>Pos Z</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][position][z]', (float) $position['z']); ?>
              </div>

              <div>
                <label>Tgt X</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][target][x]', (float) $target['x']); ?>
              </div>
              <div>
                <label>Tgt Y</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][target][y]', (float) $target['y']); ?>
              </div>
              <div>
                <label>Tgt Z</label>
                <?php echo ronzani_3d_nav_render_number_input(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][waypoint][target][z]', (float) $target['z']); ?>
              </div>

              <div class="span-2">
                <label>Preview Title</label>
                <input type="text" class="ronzani-preview-title-input" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][preview][title]'); ?>" value="<?php echo esc_attr($preview_title); ?>">
              </div>
              <div class="span-2">
                <label>Preview Date</label>
                <input type="date" class="ronzani-preview-date-input" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][preview][date]'); ?>" value="<?php echo esc_attr($preview_date); ?>">
              </div>

              <div class="span-4">
                <label>Preview Abstract</label>
                <textarea class="ronzani-preview-abstract-input" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][preview][abstract]'); ?>" rows="3"><?php echo esc_textarea($preview_abstract); ?></textarea>
              </div>
              <div class="span-2">
                <label>Preview Cover Image URL</label>
                <input type="url" class="ronzani-preview-cover-input" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][preview][cover_image]'); ?>" value="<?php echo esc_attr($preview_cover); ?>">
              </div>
              <div class="span-2">
                <label>Article URL</label>
                <input type="url" class="ronzani-article-url-input" name="<?php echo esc_attr(ronzani_3d_nav_mapping_option_key() . '[' . $index . '][article_url]'); ?>" value="<?php echo esc_attr($article_url); ?>">
              </div>

              <?php if ($warning_count > 0) : ?>
                <div class="span-4">
                  <ul class="ronzani-row-warnings">
                    <?php foreach ($row_warnings as $warning) : ?>
                      <li><?php echo esc_html($warning); ?></li>
                    <?php endforeach; ?>
                  </ul>
                </div>
              <?php endif; ?>
            </div>
          </details>
        <?php endforeach; ?>

        <?php submit_button('Salva Mapping'); ?>
      </form>

      <hr>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('ronzani_3d_nav_reset_mapping'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_reset_mapping">
        <?php submit_button('Ripristina Seed di Default', 'secondary'); ?>
      </form>

      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:-8px; margin-bottom:0;">
        <?php wp_nonce_field('ronzani_3d_nav_repair_mapping'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_repair_mapping">
        <?php submit_button('Ripara object_id mancanti', 'secondary'); ?>
        <p class="description">Ricostruisce il mapping con tutti i 12 object_id ufficiali: mantiene le righe valide esistenti e aggiunge quelle mancanti dal seed.</p>
      </form>

      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:10px; margin-bottom:0;">
        <?php wp_nonce_field('ronzani_3d_nav_sync_seed_categories'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_sync_seed_categories">
        <?php submit_button('Crea/Allinea categorie seed', 'secondary'); ?>
        <p class="description">Crea (o rinomina) le categorie WordPress usate dai 12 <code>category_slug</code> del blueprint, per ridurre i warning nel mapping health.</p>
      </form>

      <hr>
      <h2>Backup / Restore Mapping</h2>
      <p>Esporta il mapping corrente in JSON per backup o versionamento. Importando JSON, il mapping attuale viene sovrascritto.</p>

      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-bottom:16px;">
        <?php wp_nonce_field('ronzani_3d_nav_export_mapping'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_export_mapping">
        <?php submit_button('Esporta JSON Mapping', 'secondary', 'submit', false); ?>
      </form>

      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <?php wp_nonce_field('ronzani_3d_nav_import_mapping'); ?>
        <input type="hidden" name="action" value="ronzani_3d_nav_import_mapping">
        <p><label for="ronzani-mapping-json"><strong>Incolla JSON mapping</strong></label></p>
        <textarea id="ronzani-mapping-json" name="ronzani_mapping_json" rows="10" class="large-text code" placeholder='{"items":[{"object_id":"gutenberg_press_01","post_id":123}]}'></textarea>
        <p class="description">Formati supportati: oggetto con <code>items</code>, array di righe, oppure singola riga mapping.</p>
        <?php submit_button('Importa JSON Mapping', 'secondary'); ?>
      </form>
    </div>

    <script>
      (() => {
        const datalist = document.getElementById('ronzani-3d-nav-post-options');
        if (!datalist) {
          return;
        }

        const optionMap = new Map();
        const postMetaMap = new Map();
        Array.from(datalist.querySelectorAll('option')).forEach((option) => {
          const id = Number(option.dataset.postId || 0);
          const label = (option.value || '').trim();
          if (!Number.isFinite(id) || id <= 0) return;
          optionMap.set(label, id);
          postMetaMap.set(id, {
            title: (option.dataset.title || '').trim(),
            date: (option.dataset.date || '').trim(),
            url: (option.dataset.url || '').trim(),
            excerpt: (option.dataset.excerpt || '').trim(),
            coverImage: (option.dataset.coverImage || '').trim(),
          });
        });

        const resolvePostId = (rawValue) => {
          const value = (rawValue || '').trim();
          if (value === '') return 0;
          if (optionMap.has(value)) return optionMap.get(value);

          const match = value.match(/^(\d+)\b/);
          if (!match) return 0;
          const parsed = Number(match[1]);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        };

        const cards = Array.from(document.querySelectorAll('.ronzani-mapping-card'));
        const rowCheckboxes = Array.from(document.querySelectorAll('.ronzani-row-select'));
        const filterWarningButton = document.getElementById('ronzani-filter-warning');
        const selectVisibleButton = document.getElementById('ronzani-select-visible');
        const clearSelectionButton = document.getElementById('ronzani-clear-selection');
        const selectionCount = document.getElementById('ronzani-selection-count');
        const bulkCategorySelect = document.getElementById('ronzani-bulk-category');
        const applyBulkCategoryButton = document.getElementById('ronzani-apply-bulk-category');
        const clearSelectedPostsButton = document.getElementById('ronzani-clear-selected-posts');
        const fillOverwriteCheckbox = document.getElementById('ronzani-fill-overwrite');
        const fillSelectedFromPostButton = document.getElementById('ronzani-fill-selected-from-post');
        const toolbarFeedback = document.getElementById('ronzani-toolbar-feedback');

        const postPickers = Array.from(document.querySelectorAll('.ronzani-post-picker'));
        postPickers.forEach((picker) => {
          const targetId = picker.dataset.target || '';
          const hidden = targetId ? document.getElementById(targetId) : null;
          if (!hidden) return;

          const syncHiddenValue = () => {
            const postId = resolvePostId(picker.value);
            hidden.value = String(postId);
          };

          picker.addEventListener('change', syncHiddenValue);
          picker.addEventListener('blur', syncHiddenValue);
          picker.addEventListener('input', () => {
            if (picker.value.trim() === '') {
              hidden.value = '0';
            }
          });
        });

        const getCardCheckbox = (card) => card ? card.querySelector('.ronzani-row-select') : null;
        const getVisibleCards = () => cards.filter((card) => !card.hidden);
        const getSelectedCards = () =>
          cards.filter((card) => {
            const checkbox = getCardCheckbox(card);
            return Boolean(checkbox && checkbox.checked);
          });

        const updateSelectionCount = () => {
          if (!selectionCount) return;
          const selected = getSelectedCards().length;
          selectionCount.textContent = `${selected} righe selezionate`;
        };

        const setToolbarFeedback = (message = '', state = '') => {
          if (!toolbarFeedback) return;
          toolbarFeedback.textContent = message;
          toolbarFeedback.dataset.state = state;
        };

        let warningFilterEnabled = false;
        const applyWarningFilter = () => {
          cards.forEach((card) => {
            const hasWarning = card.dataset.hasWarning === '1';
            card.hidden = warningFilterEnabled && !hasWarning;
          });

          if (filterWarningButton) {
            filterWarningButton.dataset.active = warningFilterEnabled ? '1' : '0';
            filterWarningButton.textContent = warningFilterEnabled ? 'Mostra tutte le righe' : 'Mostra solo warning';
          }
          updateSelectionCount();
        };

        cards.forEach((card) => {
          const selectorLabel = card.querySelector('.ronzani-row-selector');
          const checkbox = getCardCheckbox(card);
          if (selectorLabel) {
            selectorLabel.addEventListener('click', (event) => {
              event.stopPropagation();
            });
          }
          if (checkbox) {
            checkbox.addEventListener('click', (event) => {
              event.stopPropagation();
            });
            checkbox.addEventListener('change', updateSelectionCount);
          }
        });

        if (filterWarningButton) {
          filterWarningButton.addEventListener('click', () => {
            warningFilterEnabled = !warningFilterEnabled;
            applyWarningFilter();
          });
        }

        if (selectVisibleButton) {
          selectVisibleButton.addEventListener('click', () => {
            getVisibleCards().forEach((card) => {
              const checkbox = getCardCheckbox(card);
              if (checkbox) {
                checkbox.checked = true;
              }
            });
            updateSelectionCount();
            setToolbarFeedback('', '');
          });
        }

        if (clearSelectionButton) {
          clearSelectionButton.addEventListener('click', () => {
            rowCheckboxes.forEach((checkbox) => {
              checkbox.checked = false;
            });
            updateSelectionCount();
            setToolbarFeedback('', '');
          });
        }

        if (applyBulkCategoryButton && bulkCategorySelect) {
          applyBulkCategoryButton.addEventListener('click', () => {
            const selectedCards = getSelectedCards();
            if (!selectedCards.length) {
              setToolbarFeedback('Nessuna riga selezionata.', 'warn');
              return;
            }

            selectedCards.forEach((card) => {
              const categorySelect = card.querySelector('.ronzani-category-select');
              if (categorySelect) {
                categorySelect.value = bulkCategorySelect.value;
              }
            });
            setToolbarFeedback(`Categoria applicata a ${selectedCards.length} righe.`, 'ok');
          });
        }

        if (clearSelectedPostsButton) {
          clearSelectedPostsButton.addEventListener('click', () => {
            const selectedCards = getSelectedCards();
            if (!selectedCards.length) {
              setToolbarFeedback('Nessuna riga selezionata.', 'warn');
              return;
            }

            selectedCards.forEach((card) => {
              const postIdInput = card.querySelector('.ronzani-post-id-input');
              const pickerInput = card.querySelector('.ronzani-post-picker');
              if (postIdInput) {
                postIdInput.value = '0';
              }
              if (pickerInput) {
                pickerInput.value = '';
              }
            });
            setToolbarFeedback(`Post azzerati su ${selectedCards.length} righe.`, 'ok');
          });
        }

        if (fillSelectedFromPostButton) {
          fillSelectedFromPostButton.addEventListener('click', () => {
            const selectedCards = getSelectedCards();
            if (!selectedCards.length) {
              setToolbarFeedback('Nessuna riga selezionata.', 'warn');
              return;
            }

            const overwrite = Boolean(fillOverwriteCheckbox && fillOverwriteCheckbox.checked);
            let updatedRows = 0;

            const maybeFillField = (input, value) => {
              if (!input || !value) return false;
              const current = (input.value || '').trim();
              if (!overwrite && current !== '') return false;
              if (current === value) return false;
              input.value = value;
              return true;
            };

            selectedCards.forEach((card) => {
              const postIdInput = card.querySelector('.ronzani-post-id-input');
              const postId = postIdInput ? Number(postIdInput.value || 0) : 0;
              if (!Number.isFinite(postId) || postId <= 0) {
                return;
              }

              const meta = postMetaMap.get(postId);
              if (!meta) {
                return;
              }

              let rowChanged = false;
              const previewTitleInput = card.querySelector('.ronzani-preview-title-input');
              const previewDateInput = card.querySelector('.ronzani-preview-date-input');
              const previewAbstractInput = card.querySelector('.ronzani-preview-abstract-input');
              const previewCoverInput = card.querySelector('.ronzani-preview-cover-input');
              const articleUrlInput = card.querySelector('.ronzani-article-url-input');

              rowChanged = maybeFillField(previewTitleInput, meta.title) || rowChanged;
              rowChanged = maybeFillField(previewDateInput, meta.date) || rowChanged;
              rowChanged = maybeFillField(previewAbstractInput, meta.excerpt) || rowChanged;
              rowChanged = maybeFillField(previewCoverInput, meta.coverImage) || rowChanged;
              rowChanged = maybeFillField(articleUrlInput, meta.url) || rowChanged;

              if (rowChanged) {
                updatedRows += 1;
              }
            });

            if (updatedRows === 0) {
              setToolbarFeedback('Nessuna riga aggiornata (campi gia compilati o post non valido).', 'warn');
              return;
            }

            setToolbarFeedback(`Preview compilata su ${updatedRows} righe. Ricorda di salvare.`, 'ok');
          });
        }

        updateSelectionCount();
      })();
    </script>
    <?php
}

/**
 * Check if the 3D nav is active on the current page.
 *
 * @return bool
 */
function ronzani_3d_nav_is_active(): bool
{
    global $post;
    return is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'ronzani_3d_nav');
}

/**
 * Enqueue assets only when the 3D nav is active.
 *
 * @return void
 */
function ronzani_3d_nav_enqueue_assets(): void
{
    if (ronzani_3d_nav_is_active()) {
        ronzani_3d_nav_enqueue_base_assets();
    }
}
add_action('wp_enqueue_scripts', 'ronzani_3d_nav_enqueue_assets');

/**
 * Add body class when the 3D nav is active.
 *
 * @param array $classes
 * @return array
 */
function ronzani_3d_nav_body_class(array $classes): array
{
    if (ronzani_3d_nav_is_active()) {
        $classes[] = 'ronzani-3d-nav-active';
    }
    return $classes;
}
add_filter('body_class', 'ronzani_3d_nav_body_class');

/**
 * Shortcode renderer for the 3D nav wrapper.
 *
 * @return string
 */
function ronzani_3d_nav_shortcode($atts = array()): string
{
    $defaults = ronzani_3d_nav_default_settings();
    $atts = shortcode_atts($defaults, $atts, 'ronzani_3d_nav');

    $mode = isset($atts['mode']) ? sanitize_key($atts['mode']) : $defaults['mode'];
    $menu_location = isset($atts['menu_location']) ? sanitize_key($atts['menu_location']) : $defaults['menu_location'];
    $menu = isset($atts['menu']) ? trim(sanitize_text_field($atts['menu'])) : '';

    $mode = $mode !== '' ? $mode : $defaults['mode'];
    $menu_location = $menu_location !== '' ? $menu_location : $defaults['menu_location'];
    $settings = array(
        'mode' => $mode,
        'menu_location' => $menu_location,
        'menu' => $menu,
    );

    // Ensure frontend data reflects the effective shortcode attributes.
    ronzani_3d_nav_localize_data($settings);

    return '<div class="ronzani-3d-nav-wrap" data-menu-location="' . esc_attr($menu_location) . '" data-mode="' . esc_attr($mode) . '" data-menu="' . esc_attr($menu) . '" data-ronzani-plugin="ronzani-3d-nav">'
        . '<div id="ronzani-3d-nav-root" aria-hidden="true"></div>'
        . '<div class="ronzani-3d-nav-ui" aria-label="Site navigation">'
        . '<button class="ronzani-3d-nav-skip" type="button">Skip animation</button>'
        . '</div>'
        . '</div>';
}

/**
 * Register the shortcode late to avoid overrides by other sources.
 *
 * @return void
 */
function ronzani_3d_nav_register_shortcode(): void
{
    remove_shortcode('ronzani_3d_nav');
    add_shortcode('ronzani_3d_nav', 'ronzani_3d_nav_shortcode');

    // Optional debug log to verify the active shortcode callback.
    $default_log_enabled = defined('WP_DEBUG') && WP_DEBUG;
    $log_enabled = (bool) apply_filters('ronzani_3d_nav_shortcode_debug_log', $default_log_enabled);

    if (!$log_enabled) {
        return;
    }

    global $shortcode_tags;
    $active_callback = $shortcode_tags['ronzani_3d_nav'] ?? null;
    $is_our_shortcode = ($active_callback === 'ronzani_3d_nav_shortcode');

    error_log(
        '[ronzani-3d-nav] shortcode check on wp_loaded: ' .
        ($is_our_shortcode ? 'active callback is ronzani_3d_nav_shortcode' : 'active callback differs from ronzani_3d_nav_shortcode')
    );
}
add_action('wp_loaded', 'ronzani_3d_nav_register_shortcode', 9999);
