# Roadmap Status

Data aggiornamento: 2026-02-13

## Sintesi

Stato generale: `POST-RC1 AVANZATO`

Conferme attuali:
- Smoke strict locale su staging: `5/5 PASS` in 2 run consecutivi.
- Modello reale `.glb` collegato e bootstrap scena in stato `ready`.
- Gate raycast 5/5 passato in strict.
- CI remota GitHub validata: workflow `Ronzani 3D Nav Smoke` verde con artifact.

Evidenze salvate:
- Report JSON: `wp-plugin/ronzani-3d-nav/qa/smoke/reports/smoke-report.json`
- Report HTML: `wp-plugin/ronzani-3d-nav/qa/smoke/reports/html/index.html`
- Workflow CI repository: `.github/workflows/ronzani-3d-nav-smoke.yml`
- CI run id (manuale): `21986416578-1` con artifact JSON/HTML.

## Stato step (Roadmap successiva post RC1)

- V1 Baseline freeze su staging: `DONE`
- V2 Sblocco scena reale (`engine_bootstrap_state=ready`): `DONE`
- V3 Primo `.glb` reale collegato: `DONE`
- W1 Binding mesh/object_id definitivo: `DONE`
- W2 Camera director su waypoints reali: `DONE`
- W3 Interaction raycast su mesh reali: `DONE`
- X1 UX 3 livelli su scena reale: `DONE`
- X2 Riduzione warning mapping: `DONE`
- Y1 Performance pass desktop/mobile: `DONE`
- Y2 Accessibilita finale: `DONE`
- Z1 CI smoke automatizzata: `DONE (Formale)`
- Z2 Release 1.0.0 produzione: `IN CORSO`
  - Checklist operativa: `docs/Z2_POST_DEPLOY_CHECKLIST.md`

## Nota Z1 (Passo 1)

Il requisito Z1 e chiuso in modalita formale su GitHub.

Criteri soddisfatti:
- Repository GitHub pubblicata: `womedizioni/ronzani-3d-nav`.
- Variabili Actions configurate: `R3D_TARGET_URL`, `R3D_REQUIRE_SCENE_READY`, `R3D_STRICT_QA_GATES`.
- Run `workflow_dispatch` verde con artifact JSON/HTML/traces.

Comando strict usato:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_scene=on" R3D_REQUIRE_SCENE_READY=1 R3D_STRICT_QA_GATES=1 npm --prefix /home/matteo/blog_ronzani/wp-plugin/ronzani-3d-nav run qa:smoke
```

## Passo 2 (Pronto per CI remota)

Passo completato. Per dettagli operativi e storico setup: `docs/CI_REMOTE_ENABLE_GITHUB.md`.
