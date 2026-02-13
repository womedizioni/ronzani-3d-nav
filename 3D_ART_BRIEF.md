# 3D_ART_BRIEF

Version: 1.0  
Date: 2026-02-11  
Project: Typographic Museum Blog (`ronzani-3d-nav`)

## 1) Purpose

This document defines production rules for 3D assets so that runtime integration is predictable in R3F/Three.js.

Focus:

- mesh naming
- hierarchy and pivot points for animation
- waypoint and target anchors for camera
- export and QA checklist for Blender -> GLB handoff

## 2) Scene Standards

- Unit system: metric
- Scale: 1 unit = 1 meter
- Up axis: Y-up
- Room footprint target: about `5m x 7m`

## 3) Naming Convention (Mandatory)

Use lowercase snake_case only.

### 3.1 Environment meshes

- Prefix: `env_`
- Pattern: `env_<zone>_<name>_<nn>`
- Example: `env_wall_back_01`

### 3.2 Interactive meshes

- Prefix: `int_`
- Pattern: `int_<object_id>`
- Example: `int_typewriter_01`

`<object_id>` must match runtime JSON exactly.

### 3.3 Collision/helper meshes

- Prefix: `col_`
- Pattern: `col_<object_id>_<nn>`
- Mark as non-rendered helper geometry.

### 3.4 Animation pivot empties

- Prefix: `pivot_`
- Pattern: `pivot_<object_id>_<part>`
- Example: `pivot_type_case_cabinet_drawer_a`

### 3.5 Camera waypoint anchors

- Waypoint empty: `wp_<object_id>_<view>`
- Target empty: `tgt_<object_id>_<view>`
- Example:
  - `wp_typewriter_01_preview`
  - `tgt_typewriter_01_preview`

## 4) Interactive Object IDs (Authoritative List)

These IDs must be used exactly:

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

## 5) Hierarchy Rules

### 5.1 Interactive root

Each interactive object must have a clean root:

- `int_<object_id>` as parent node
- visual mesh children under that root
- optional helper empties as children (`pivot_`, `wp_`, `tgt_`)

### 5.2 Transform rules

- Apply transforms on visual meshes before export (`location/rotation/scale` baked).
- Keep pivot empties unbaked if needed as authored reference points.
- Avoid negative scales.

## 6) Pivot Rules for Animated Parts

### 6.1 Drawers

- Pivot located on drawer slide centerline at rear axis.
- Local forward axis aligns with open direction.
- Default closed pose = frame 0 / neutral transform.

### 6.2 Doors/lids

- Pivot on hinge axis.
- Hinge axis aligned with intended rotation axis.

### 6.3 Levers/wheels

- Pivot on physical center of rotation.
- Keep clean circular motion possible without offset drift.

### 6.4 Animation naming

Clips should use this pattern:

- `anim_<object_id>_<action>`
- examples:
  - `anim_type_case_cabinet_open`
  - `anim_heidelberg_windmill_spin`

## 7) Camera Waypoint Authoring

For each interactive object create at minimum:

- `preview` waypoint pair:
  - `wp_<object_id>_preview`
  - `tgt_<object_id>_preview`
- optional `detail` waypoint pair for tighter inspection.

Authoring constraints:

- Ensure target keeps object centered in frame.
- Avoid collisions with scene geometry.
- Keep camera positions reachable with smooth tween.

Runtime constraints to respect:

- local orbit clamp after arrival: `+-45deg` horizontal and vertical.

## 8) UV, Materials, and Baking

### 8.1 UV channels

- UV0: base textures
- UV1: lightmap UV (non-overlapping, padded islands)

### 8.2 Material policy

- PBR workflow (base color, roughness, metallic, normal)
- Avoid excessive material slot fragmentation.

### 8.3 Light baking

- Blender Cycles baked lighting (static)
- Separate lightmap textures per major asset group
- Suggested lightmap sizes:
  - hero assets: 1024-2048
  - secondary assets: 512-1024
  - small props: 256-512

## 9) LOD and Optimization

For heavy assets provide LOD variants:

- `lod0` high
- `lod1` medium
- `lod2` low

Naming:

- `<mesh_name>_lod0`
- `<mesh_name>_lod1`
- `<mesh_name>_lod2`

Global budgets:

- desktop GLB <= 8 MB
- mobile GLB <= 4 MB

## 10) Export Settings (Blender -> GLB)

Before export:

- purge unused data blocks
- apply modifiers intended for runtime mesh
- verify normals/tangents
- verify no missing textures

Export:

- format: glTF binary `.glb`
- include: selected objects only for production package
- texture compression pipeline target: KTX2/Basis (runtime/toolchain stage)
- mesh compression: DRACO where supported by pipeline

## 11) Handoff Package Structure

Required delivery:

```text
3d_handoff/
  scene_master.blend
  room_desktop.glb
  room_mobile.glb
  maps/
    lightmaps/
    textures_source/
  docs/
    object_map.csv
    waypoint_map.csv
```

`object_map.csv` minimum columns:

- `object_id`
- `mesh_root_name`
- `has_animation` (`yes/no`)
- `default_waypoint` (`wp_*`)
- `default_target` (`tgt_*`)

`waypoint_map.csv` minimum columns:

- `waypoint_name`
- `target_name`
- `object_id`
- `camera_intent` (`preview/detail`)

## 12) QA Checklist (Asset Acceptance)

1. All interactive IDs match authoritative list exactly.
2. All animated parts rotate/translate around correct pivots.
3. All waypoints/targets exist and are correctly named.
4. Lightmaps are clean (no severe seams or leaks).
5. Desktop and mobile GLB budgets are respected.
6. Scene opens in glTF viewer without missing resources.
