# Operativa Editor/Admin - Ronzani 3D Nav

Versione documento: 2026-02-12  
Ambiente target: WordPress admin + pagina test `nav-3d-test`

## 1. Dove lavorare in WordPress

- Pagina mapping plugin:
  - `Impostazioni -> Ronzani 3D Nav Mapping`
  - URL tipico: `/wp-admin/options-general.php?page=ronzani-3d-nav-mapping`
- Pagina frontend test:
  - `https://ronzanieditore.it/nav-3d-test/`

## 2. Cosa gestisce il mapping

Ogni riga collega:

- `object_id` (oggetto 3D)
- `post_id` o `article_url`
- `category_slug`
- waypoint camera (`position`, `target`, `fov`)
- preview (`title`, `abstract`, `cover_image`, `date`)

Gli `object_id` validi sono 12 e devono essere tutti presenti.

## 2.b Cosa gestisce la scene config (V2)

- `enabled`: abilita/disabilita bootstrap scena.
- `engine`: `webgl` o `webgpu` (preview).
- `model_url`: URL pubblico del file `.glb/.gltf`.
- `model_format`: `glb` o `gltf`.
- `object_ids`: contratto oggetti scena usato dal runtime.
- `rollout_percentage`: quota visitatori (0-100) abilitata in modalita auto.
- `rollout_allowlist`: chiavi visitor abilitate sempre (una per riga).
- `notes`: note operative interne.

Nota operativa: se `enabled=1` ma `model_url` e vuoto, il runtime resta in fallback con reason `scene-model-url-missing`.
La `Scene Health` verifica anche la raggiungibilita del `model_url` (probe HTTP con cache breve).
Con `rollout_percentage=0` e allowlist vuota, la scena resta in fallback per tutti in modalita auto.

## 2.c Override scena per QA (Fase X)

- Query URL:
  - `?r3d_scene=auto` usa la config admin.
  - `?r3d_scene=on` forza bootstrap scena.
  - `?r3d_scene=off` forza fallback 2D.
- Runtime API:
  - `window.RONZANI_3D_NAV_RUNTIME.getSceneOverride()`
  - `window.RONZANI_3D_NAV_RUNTIME.setSceneOverride('on')`
  - `window.RONZANI_3D_NAV_RUNTIME.retrySceneBootstrap()`

## 2.d Rollout Runtime (Fase Y3/Z)

- Runtime API rollout:
  - `window.RONZANI_3D_NAV_RUNTIME.getSceneRollout()`
  - `window.RONZANI_3D_NAV_RUNTIME.setSceneRolloutKey('tester_a')`
  - `window.RONZANI_3D_NAV_RUNTIME.clearSceneRolloutKey()`
- Query debug rollout key:
  - `?r3d_rollout_key=tester_a`
- Dataset principali:
  - `sceneRolloutMode`, `sceneRolloutPercentage`, `sceneRolloutAllowlist`
  - `sceneRolloutKey`, `sceneRolloutBucket`, `sceneRolloutPass`

## 3. Flusso editor standard

1. Apri la pagina mapping admin.
2. Per ogni riga seleziona un post dal picker.
3. Verifica titolo/abstract/cover/date preview.
4. Verifica `category_slug` coerente.
5. Salva mapping.
6. Vai su `nav-3d-test` e controlla preview/article.

## 4. Azioni admin rapide

- `Ripara mapping`:
  - ricrea eventuali righe mancanti mantenendo quelle valide.
- `Sincronizza categorie seed`:
  - crea/allinea categorie WordPress attese dal blueprint.
- `Esporta JSON`:
  - backup/versionamento mapping.
- `Importa JSON`:
  - ripristino o deployment mapping tra ambienti.
- `Reset mapping`:
  - riporta al seed (operazione distruttiva).

## 5. QA rapido in pagina (console browser)

```js
window.RONZANI_3D_NAV_RUNTIME.runQaChecks()
window.RONZANI_3D_NAV_RUNTIME.runQaFlow().then(console.log)
window.RONZANI_3D_NAV_RUNTIME.runQaSmoke().then(console.log)
```

Gate minimi:

- Quick Checks: tutto PASS
- QA Flow: 5/5
- Smoke: tutto PASS
- includi anche `scene_health_ok` tra i gate quick.
- se scena abilitata, verifica anche `scene_model_probe_ready` PASS.
- se scena abilitata, verifica anche `scene_model_loader_ready` (stato `ready` o `loading` durante bootstrap).
- verifica anche `scene_override_contract_ready` e `scene_retry_api_ready` PASS.
- verifica anche `scene_rollout_contract_ready` PASS.

## 6. Checklist prima del rilascio contenuti

- Menu renderizzato corretto (non main menu se non richiesto).
- `mapping_health_ok` PASS (oppure warning accettati e noti).
- Preview/apertura articolo funzionanti su almeno 3 oggetti.
- Deep-link preview/article funzionante (reload incluso).
- Fallback html valido in reduced motion.

## 7. Troubleshooting veloce

- Vedo menu sbagliato:
  - controlla shortcode `menu`/`menu_location` nella pagina.
- Non vedo oggetti cliccabili:
  - verifica `mapping_loaded` e `interaction_layer_ready`.
- Warning categorie nel mapping health:
  - usa `Sincronizza categorie seed`.
- Stato fallback inatteso:
  - verifica `reduced motion` browser e supporto WebGL.
  - verifica `Scene Config`: `enabled`, `model_url`, `object_ids`.
  - verifica rollout (`rollout_percentage`, allowlist e `sceneRolloutPass`).

## 8. Endpoint utili

- Mapping:
  - `/wp-json/ronzani-3d-nav/v1/mapping`
- Mapping health:
  - `/wp-json/ronzani-3d-nav/v1/mapping-health`
- Scene config:
  - `/wp-json/ronzani-3d-nav/v1/scene-config`
- Scene health:
  - `/wp-json/ronzani-3d-nav/v1/scene-health`
