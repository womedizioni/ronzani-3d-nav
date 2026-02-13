# Release Candidate Plan - 0.3.0-rc1

Data: 2026-02-12  
Scope: chiusura fasi S, T, U con gate QA automatizzati e runbook operativo.

## 1. Scope tecnico incluso

- Runtime UX/3D fino a fasi Q-R completate.
- QA panel in pagina con quick/flow/smoke.
- Smoke automation Playwright (fase S).
- Documentazione operativa editor/admin e handoff 3D (fase T).

## 2. Freeze policy (RC)

Durante RC:

- consentiti solo fix bloccanti/regressioni
- vietate nuove feature
- ogni fix richiede:
  - quick checks PASS
  - qa flow PASS
  - smoke PASS

## 3. Go/No-Go checklist

Go solo se:

- `runQaChecks()` = PASS totale
- `runQaFlow()` = PASS totale
- `runQaSmoke()` = PASS totale
- Playwright smoke suite PASS
- nessun blocker su menu/mapping/deep-link/fallback

No-Go se:

- menu source errato
- preview/article rotti
- deep-link non ripristinabile su reload
- fallback html non fruibile

## 4. Staging rollout

1. Carica zip RC su staging.
2. Apri `nav-3d-test`.
3. Esegui QA panel (quick + flow + smoke).
4. Esegui Playwright smoke:
   - `npm run qa:smoke`
5. Verifica mapping admin:
   - save mapping
   - repair/sync categories (se necessario)
6. Raccogli evidenze (json report + screenshot).

## 5. Produzione rollout

1. Backup plugin precedente.
2. Carica zip RC in produzione.
3. Ripeti quick checks + qa flow.
4. Verifica almeno 3 object_id manualmente.
5. Conferma assenza regressione menu.

## 6. Rollback plan

Trigger rollback:

- errore bloccante su homepage/blog nav
- rottura preview/article
- regressione menu principale

Rollback:

1. Disattiva plugin RC.
2. Reinstalla zip precedente stabile.
3. Pulisci cache.
4. Riesegui quick checks baseline.

## 7. Artefatti richiesti per chiusura RC

- zip plugin RC
- output QA panel json
- report Playwright json/html
- checklist Go/No-Go compilata

## 8. Comandi standard RC

```bash
cd /home/matteo/blog_ronzani/wp-plugin/ronzani-3d-nav
npm install
npx playwright install chromium
npm run qa:smoke
```
