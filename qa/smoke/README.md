# Ronzani 3D Nav Smoke Suite

## Purpose

Repeatable release smoke checks for:

- menu source and rendered links
- scene contract/health gates
- model URL probe gate when scene is enabled
- runtime model loader gate (`scene_model_loader_ready`)
- scene override/retry runtime gates (`scene_override_contract_ready`, `scene_retry_api_ready`)
- rollout policy gate (`scene_rollout_contract_ready`)
- preview/article flow
- deep-link contract
- reduced-motion html fallback

## Prerequisites

- Node.js 18+ in WSL
- `npm` available
- plugin loaded on a reachable test URL

## Install

From plugin folder:

```bash
cd /home/matteo/blog_ronzani/wp-plugin/ronzani-3d-nav
npm install
npx playwright install chromium
```

## Run

Default target URL:

- `https://ronzanieditore.it/nav-3d-test/`

Custom target URL:

```bash
R3D_TARGET_URL="https://example.com/nav-3d-test/" npm run qa:smoke
```

Local commands:

```bash
npm run qa:smoke
npm run qa:smoke:headed
npm run qa:smoke:debug
```

## Troubleshooting

If tests fail with `Runtime shell not found`:

1. Verify the target URL is the published page that contains `[ronzani_3d_nav]`.
2. Run smoke with explicit URL:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/<pagina-3d-corretta>/" npm run qa:smoke
```

Common cause: stale slug (default URL returns a 404 template) or blocking popups/cookie overlays.

Per test scena forzata:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_scene=on" npm run qa:smoke
```

Per test rollout key dedicata:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_rollout_key=tester_a" npm run qa:smoke
```

Per gate V2 con scena effettivamente attiva e bootstrap in `ready`:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_scene=on" R3D_REQUIRE_SCENE_READY=1 npm run qa:smoke
```

Con `R3D_REQUIRE_SCENE_READY=1` viene attivato anche il check raycast `5/5` su oggetti seed.

Per imporre anche i gate scena avanzati (probe/override/rollout/retry/loader):

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_scene=on" R3D_REQUIRE_SCENE_READY=1 R3D_STRICT_QA_GATES=1 npm run qa:smoke
```

## Reports

Artifacts are generated in:

- `qa/smoke/reports/smoke-report.json`
- `qa/smoke/reports/html/`

Use these artifacts as release evidence in RC freeze.

## CI

GitHub Actions workflow: `.github/workflows/ronzani-3d-nav-smoke.yml`

Per RC tag (`ronzani-3d-nav-rc*` / `ronzani-3d-nav-v*rc*`) esegue smoke e archivia:

- JSON report
- HTML report
- Playwright traces (`test-results`)

Repository variables consigliate:

- `R3D_TARGET_URL` (es. `https://ronzanieditore.it/nav-3d-test/?r3d_scene=on`)
- `R3D_REQUIRE_SCENE_READY` (`1` per imporre bootstrap `ready`)
- `R3D_STRICT_QA_GATES` (`1` per richiedere anche i gate scena avanzati)
