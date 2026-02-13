# 3D Handoff Checklist - Ronzani 3D Nav

Versione documento: 2026-02-12

Riferimenti:

- `BLUEPRINT_IMMERSIVE_BLOG.md`
- `3D_ART_BRIEF.md`

## 1. Naming obbligatorio mesh/object

Il modello deve includere questi object id:

- `gutenberg_press_01`
- `composing_stick_01`
- `typewriter_01`
- `type_case_cabinet`
- `main_desk_01`
- `linotype_machine_01`
- `heidelberg_windmill`
- `uv_exposure_unit`
- `laser_engraver_01`
- `magnifying_glass`
- `holo_drafting_table`
- `bio_ink_3dprinter`

## 2. Pivot e trasformazioni

- Pivot coerente con animazioni previste (cassetti, leve, sportelli).
- Trasformazioni applicate/freeze prima export.
- No scale non uniforme sui nodi interattivi.

## 3. Waypoint e target camera

Per ogni object id:

- waypoint `position` validato
- waypoint `target` validato
- `fov` entro range operativo

Verifica collisioni camera nei punti di focus.

## 4. Requisiti export GLB

- Formato: `.glb` preferito
- Assi e unita coerenti (`1 unit = 1 m`)
- Texture ottimizzate (KTX2/Basis dove possibile)
- Light bake statico incluso
- Nomi nodo stabili tra versioni

## 5. Budget performance consigliato

- Desktop: target 50-60 FPS medio
- Mobile medio: target >= 35 FPS
- Asset ridotti per evitare downgrade permanente a quality `low`

## 6. Test handoff prima consegna

1. `scene-config` contiene tutti gli `object_ids`.
2. `scene_binding_ready` PASS.
3. `interaction_layer_ready` PASS.
4. Click su object apre preview corretta.
5. Travel camera e orbit clamp funzionanti.

## 7. Pacchetto consegna minimo

- file `scene.glb`
- note export (tool/versione)
- eventuali texture esterne
- changelog oggetti rinominati/rimossi
- screenshot da viewpoint principali
