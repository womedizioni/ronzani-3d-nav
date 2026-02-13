# BLUEPRINT: IMMERSIVE TYPOGRAPHIC MUSEUM BLOG

Version: 1.1  
Date: 2026-02-11  
Project target: `ronzani-3d-nav` (WordPress plugin)

## 1) Product Direction

Create an immersive 3D blog where navigation happens through a typographic museum room.

- Functional inspiration: Penderecki's Garden (fluid navigation, spatial storytelling).
- Aesthetic concept: Typographic Room timeline:
  - Ancient
  - Industrial
  - Future
- UX principle: no hard page reload in the core flow (SPA-like feel in-page).

## 2) Mandatory Tech Stack and Standards

### Core stack (mandatory)

- Three.js with React Three Fiber (R3F)
- GSAP for camera tweening and UI transitions
- 3D assets in `.glb/.gltf`
- Texture compression: Basis Universal / KTX2

### World standards (mandatory)

- Scale: 1 unit = 1 meter
- Room target size: about `5m x 7m`
- Lighting: static baked lightmaps from Blender Cycles
- No real-time heavy lighting dependency on runtime

## 3) Interactive Object Catalog (object_id)

Only these mapped objects are interactive. Everything else is environment dressing.

| object_id | Physical element | Era | Content destination |
|---|---|---|---|
| `gutenberg_press_01` | Wooden press (1450) | Ancient | Design origins articles |
| `composing_stick_01` | Manual composing stick | Ancient | Font and kerning technical posts |
| `typewriter_01` | Vintage typewriter | Vintage | Latest published posts |
| `type_case_cabinet` | Movable type cabinet | Vintage | Tag/Category archive |
| `main_desk_01` | Master desk | Vintage | Homepage / Featured posts |
| `linotype_machine_01` | Linotype machine | Industrial | Case studies / complex workflows |
| `heidelberg_windmill` | Heidelberg windmill | Industrial | Fast news/updates |
| `uv_exposure_unit` | UV offset unit | Modern | Software/tool reviews |
| `laser_engraver_01` | Laser engraver | Modern | Experiments / DIY |
| `magnifying_glass` | Loupe | Universal | Deep visual analysis / long-reads |
| `holo_drafting_table` | Holographic drafting table | Future | AI + UI/UX future visions |
| `bio_ink_3dprinter` | Organic 3D printer | Future | Sustainability / green design |

## 4) Camera System (Penderecki Logic)

### A) Travel mode

- On object click, camera performs smooth interpolation to a predefined waypoint.
- Motion must include damping/inertia to avoid harsh movement.
- During transition, input is gated (`transitioning` state).

### B) Local focus mode

After waypoint arrival:

- Camera enters constrained local orbit.
- Rotation clamp:
  - Horizontal: `+-45deg`
  - Vertical: `+-45deg`
- User can inspect object details without losing global context.

## 5) UX Flow (3 levels)

### Level 1: Exploration (The Room)

- User navigates the 3D room.
- Interactive objects expose `hover` feedback:
  - mild emissive/highlight
  - optional 2D billboard label

### Level 2: Preview (Floating Card)

On object selection:

- camera zoom/travel to waypoint
- lightweight HTML overlay appears with:
  - title
  - abstract
  - cover image
  - CTA: `LEGGI TUTTO`

### Level 3: Reading (3/4 Slide-over)

On CTA click:

- right panel opens at `75%` width
- left `25%` still shows 3D context with blur/depth focus effect
- content container must support:
  - formatted text
  - image galleries
  - video
  - external embeds

## 6) Data-Driven CMS Integration

### Source of truth

WordPress remains the content backend for this phase.

- Posts/categories from WP
- Mapping fields in post meta or plugin-managed data
- REST endpoints exposed by plugin

### Runtime mapping contract

```json
{
  "object_id": "type_case_cabinet",
  "post_id": 123,
  "category_slug": "tipografia",
  "waypoint": {
    "position": { "x": 1.2, "y": 1.1, "z": -2.0 },
    "target": { "x": 0.4, "y": 1.0, "z": -1.2 },
    "fov": 40
  },
  "preview": {
    "title": "La Storia della Tipografia",
    "abstract": "Anteprima contenuto...",
    "cover_image": "https://example.com/image.jpg",
    "date": "2026-02-11"
  },
  "article_url": "https://ronzanieditore.it/post-slug"
}
```

### Interaction rule

Raycasting layer must only consider objects present in mapping JSON.

## 7) Rendering and Post-Processing Stack

Mandatory post stack:

- Bloom: holographic parts and accent lights
- Vignette + grain: cinematic vintage tone
- Depth of field: dynamic focus based on camera-to-target distance

Guardrails:

- disable/reduce expensive effects on low-tier mobile
- keep readability first when reading panel is open

## 8) State Machine Contract

States:

- `explore`
- `preview_open`
- `article_open`
- `transitioning`
- `fallback_2d`

Core events:

- `HOVER_OBJECT`
- `SELECT_OBJECT`
- `OPEN_PREVIEW`
- `OPEN_ARTICLE`
- `CLOSE_PREVIEW`
- `CLOSE_ARTICLE`
- `ESCAPE`
- `WEBGL_UNAVAILABLE`
- `REDUCED_MOTION_ON`

## 9) Accessibility and Fallback Requirements

Mandatory:

- keyboard reachable hotspots (`Tab`, `Enter`, `Space`)
- visible focus styles
- `Esc` closes preview/panel
- focus trap inside slide-over
- reduced-motion mode disables heavy travel and effects
- full HTML fallback (`fallback_2d`) when WebGL fails or is disabled

## 10) Performance Budgets

Desktop targets:

- 50-60 FPS average
- GLB budget <= 8 MB

Mobile targets:

- >= 35 FPS average on mid-tier devices
- GLB budget <= 4 MB (mobile variant)

Asset constraints:

- baked lightmaps
- KTX2/Basis textures
- mesh compression where applicable

## 11) Menu Integration Constraint (No Regression)

Existing menu logic is preserved:

1. shortcode `menu`
2. shortcode `menu_location`
3. fallback first available menu

Do not reintroduce fragile shortcode-content parsing for runtime menu selection.

## 12) Milestones

### M1 - Foundation

- R3F scene boot
- GLB loader
- state machine scaffold
- fallback 2D UI

### M2 - Interaction

- raycasting by mapped IDs
- hover/select states
- camera waypoint travel + orbit constraints

### M3 - Reading layer

- preview card
- 3/4 slide-over panel
- URL deep linking
- focus/accessibility hardening

### M4 - Optimization

- post-processing tuning
- mobile adaptive quality
- perf profiling and fixes

### M5 - Polish

- typographic motion refinements
- final QA cross-browser/device

## 13) QA Acceptance

1. Correct mapped object triggers correct content.
2. Menu/category mapping remains correct (no fallback-to-main-menu bug).
3. Full keyboard flow works end-to-end.
4. No-WebGL and reduced-motion paths are usable.
5. Performance budgets are met on target devices.

## 14) Next Deliverable for Dev/3D Team

Create and maintain: `3D_ART_BRIEF.md`

Purpose:

- define mesh naming conventions
- define pivot-point rules for animation (drawers, levers, lids)
- define waypoint anchoring and camera target markers
- define export checklist for clean handoff to R3F runtime
