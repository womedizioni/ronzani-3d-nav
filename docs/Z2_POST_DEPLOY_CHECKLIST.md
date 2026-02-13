# Z2 Release 1.0.0 - Post Deploy Checklist

Data creazione: 2026-02-13
Scope: rollout controllato produzione + rollback plan + verifica 24h

## 1) Pre-deploy (Go/No-Go)

- [x] Versione plugin target definita: `1.0.0` (versione codice corrente: `1.0.0`)
- [x] Backup completo disponibile (DB + files): `Sistema_2026-02-13_10:59` (Host, file + DB)
- [x] Snapshot configurazioni plugin esportato (scene config + mapping)
- [x] Finestra di deploy confermata: `2026-02-13 16:30-17:30` (Owner: Matteo, contatti: Chat/Diretto)
- [x] Piano rollback confermato con tempi (RTO) e responsabilita: ripristino Host "Ripristina tutti i file e i database", `RTO 15 minuti`, owner Matteo
- [x] URL smoke produzione confermato: `https://ronzanieditore.it/nav-3d-test/?r3d_scene=on` (`HTTP 200`)
- [x] Ultimo smoke strict staging/target verde (`5 passed`) + CI GitHub verde (`run 21986416578-1`)

Evidenze sezione 1:
- `docs/evidence/z2-predeploy-20260213/scene-config.json`
- `docs/evidence/z2-predeploy-20260213/mapping.json`
- `docs/evidence/z2-predeploy-20260213/scene-health.json`
- `docs/evidence/z2-predeploy-20260213/mapping-health.json`

Stato sezione 1 (Go/No-Go): `7/7 completati`, `GO`.

## 2) Deploy Produzione

- [x] Upload/aggiornamento plugin in produzione completato (conferma operativa Matteo)
- [x] Plugin attivo (validato da smoke strict post-deploy)
- [ ] Nessun errore PHP nel log server (pending verifica pannello hosting)
- [ ] Cache applicativa/CDN invalidate eseguita (se presente) - pending conferma
- [x] Verifica pagina target con shortcode `[ronzani_3d_nav]` (`HTTP 200` + smoke strict verde)

## 3) Verifica Immediata Post-Deploy (T0)

- [x] QA panel runtime: quick checks verdi (`OK 46/46`)
- [x] QA panel runtime: flow checks verdi (coperto da test smoke `qa flow`)
- [x] QA panel runtime: smoke interno verde (equivalenza funzionale tramite smoke strict end-to-end)
- [x] Smoke strict Playwright post-deploy verde (`5 passed`, `unexpected=0`, `flaky=0`)

Evidenze sezione 3:
- QA Panel quick checks: `OK (46/46)`
- Run smoke strict post-deploy: `2026-02-13T13:46:31Z`
- Report JSON: `qa/smoke/reports/smoke-report.json`
- Report HTML: `qa/smoke/reports/html/index.html`

Comando riferimento:

```bash
R3D_TARGET_URL="https://ronzanieditore.it/nav-3d-test/?r3d_scene=on" R3D_REQUIRE_SCENE_READY=1 R3D_STRICT_QA_GATES=1 npm --prefix /home/matteo/blog_ronzani/wp-plugin/ronzani-3d-nav run qa:smoke
```

Output atteso:
- `5 passed`

## 4) Monitoraggio 24h (No Regressioni Critiche)

Controlli consigliati a T+1h, T+4h, T+12h, T+24h:

- [ ] Errori runtime JS critici assenti (console monitor / RUM se disponibile)
- [ ] Errori PHP/WP critici assenti nei log server
- [ ] `scene-config` endpoint risponde correttamente
- [ ] `mapping` endpoint risponde correttamente
- [ ] Navigazione core (Explore -> Preview -> Article) funzionante
- [ ] Deep-link/back-forward funzionanti
- [ ] Performance percepita stabile su desktop/mobile
- [ ] Nessuna segnalazione P1/P0 da editorial/team

## 5) Criteri Rollback

Rollback immediato se almeno uno:

- [ ] Smoke strict post-deploy fallisce in modo riproducibile
- [ ] Errore critico che blocca homepage/pagina target
- [ ] Regressione critica su navigazione o apertura articoli
- [ ] Tasso errori runtime/PHP sopra soglia concordata

## 6) Procedura Rollback

- [ ] Disattiva versione corrente plugin
- [ ] Ripristina versione precedente stabile
- [ ] Ripristina configurazioni precedenti (se alterate)
- [ ] Invalida cache applicativa/CDN
- [ ] Riesegui smoke baseline su produzione
- [ ] Comunica stato rollback agli stakeholder

## 7) Sign-off Finale Z2

`Z2` e chiuso quando:
- [ ] Smoke post-deploy verde
- [ ] Nessuna regressione critica in 24h
- [ ] Checklist operativa compilata e archiviata

Owner deploy:
Matteo
Data/ora deploy:
Pianificata `2026-02-13 16:30-17:30`
Data/ora chiusura Z2:
Note finali:
