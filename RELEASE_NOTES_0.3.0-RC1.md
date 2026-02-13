# Release Notes - 0.3.0-rc1

Data: 2026-02-12

## Novita principali

- Fase S: smoke automation Playwright aggiunta (`qa/smoke`).
- Fase T: documentazione operativa editor/admin e checklist handoff 3D.
- Fase U: processo release candidate formalizzato con freeze/go-no-go/rollback.

## Runtime e QA

- QA checks estesi fino a 37 gate.
- QA flow e smoke integrati nel runtime panel.
- Stato performance/quality e accessibility esposti via runtime API.

## File nuovi

- `package.json`
- `qa/smoke/playwright.config.mjs`
- `qa/smoke/tests/smoke.spec.mjs`
- `qa/smoke/README.md`
- `docs/OPERATIVA_EDITOR_ADMIN.md`
- `docs/3D_HANDOFF_CHECKLIST.md`
- `RELEASE_CANDIDATE_0.3.0-RC1.md`

## Compatibilita

- Richiede plugin `Ronzani 3D Nav` versione `0.3.0-rc1`.
