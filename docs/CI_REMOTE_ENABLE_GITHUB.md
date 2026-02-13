# CI Remota GitHub - Abilitazione

Data: 2026-02-13

## Obiettivo

Promuovere `Z1` da `Local CI equivalent` a `DONE formale` con run automatico su GitHub Actions e artifact archiviati per ogni release candidate.

## Prerequisiti

- Il codice deve essere in un repository GitHub.
- Deve esistere il file workflow `.github/workflows/ronzani-3d-nav-smoke.yml`.
- Il percorso plugin deve restare `wp-plugin/ronzani-3d-nav`.

## Setup minimo

1. In `Settings > Secrets and variables > Actions > Variables`, crea:
   - `R3D_TARGET_URL` = `https://ronzanieditore.it/nav-3d-test/?r3d_scene=on`
   - `R3D_REQUIRE_SCENE_READY` = `1`
   - `R3D_STRICT_QA_GATES` = `1`
2. Verifica che il workflow sia visibile in tab `Actions` con nome `Ronzani 3D Nav Smoke`.
3. Esegui `Run workflow` manuale (`workflow_dispatch`) sulla branch principale.

## Verifica run

Il run e valido se:
- Job `smoke` in stato `success`.
- Artifact presenti in fondo al run:
  - `ronzani-smoke-json-<run_id>-<attempt>`
  - `ronzani-smoke-html-<run_id>-<attempt>`
  - `ronzani-smoke-traces-<run_id>-<attempt>`

## Trigger release candidate

Il workflow parte anche su push tag:
- `ronzani-3d-nav-rc*`
- `ronzani-3d-nav-v*rc*`

Esempio:

```bash
git tag ronzani-3d-nav-rc2
git push origin ronzani-3d-nav-rc2
```

## Criterio di chiusura Z1 formale

`Z1` puo essere marcato `DONE formale` quando:
- almeno un run `workflow_dispatch` e verde con artifact;
- almeno un run su tag RC e verde con artifact.
