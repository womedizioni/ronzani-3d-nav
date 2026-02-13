# Z2 Release 1.0.0 - Post Deploy Checklist

Data creazione: 2026-02-13
Scope: rollout controllato produzione + rollback plan + verifica 24h

## 1) Pre-deploy (Go/No-Go)

- [x] Versione plugin target definita: `1.0.0` (versione codice corrente: `0.3.0-rc1`)
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

- [ ] Upload/aggiornamento plugin in produzione completato
- [ ] Plugin attivo e senza errori PHP nel log
- [ ] Cache applicativa/CDN invalidate eseguita (se presente)
- [ ] Verifica pagina target con shortcode `[ronzani_3d_nav]`

## 3) Verifica Immediata Post-Deploy (T0)

- [ ] QA panel runtime: quick checks verdi
- [ ] QA panel runtime: flow checks verdi
- [ ] QA panel runtime: smoke interno verde
- [ ] Smoke strict Playwright post-deploy verde

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
