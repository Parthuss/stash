---
name: "Parallax"
does: "2-4 depth layers converge at different speeds; back layers blurred and desaturated; hero lifts at the end."
use_when: "Hook or outro: showing 'many saved things' with depth and polish."
avoid_when: "Dense UI the viewer must read, or when layers would hide the hero."
energy: "med"
frames: "45 f travel, lift in the last 12 f, hold >= 20"
component: "import { Parallax } from \"../recipes/shots\"; <Parallax duration={45} layers={[{speed:0.35,blur:4,sat:0.55,node:back},{speed:1.4,node:hero}]} />"
source: "adapted from video-shotcraft references/shots/camera/depth-layer-moves.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
Layers travel travel x speed px (0.35 / 0.7 / 1.4) and settle together; the last layer is the hero.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| speeds | 0.35 / 0.7 / 1.4 | equal speeds look flat |
| back blur | 2-4 px | >6 looks broken |
| saturate | 0.55-0.8 | full colour fights the hero |
| lift | scale +5%, -18px, shadow | no lift, no climax |

## Pitfalls
- Hero must stay unblurred.
- Layers should be full-frame nodes; offscreen layers waste frames.

## Usage
```tsx
<Parallax layers={[back, mid, hero]} />
```
