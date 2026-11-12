---
name: "FocusRing"
does: "Dims the screen except one rounded rect, draws a ring around it, optional label."
use_when: "Naming a specific button or field in a demo scene."
avoid_when: "The whole screen matters, or text under the dim must stay readable."
energy: "med"
frames: "12f dim, 18f ring draw, 28f label, hold >= 45"
component: "import { FocusRing } from \"../recipes/shots\"; <FocusRing start={0} rect={{x:18,y:512,w:355,h:49}} label=\"Tick it when you make it\"><ScreenImg src=\"recipes/note.png\"/></FocusRing>"
source: "adapted from video-shotcraft references/shots/opening/spotlight-hero-card.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
A spotlight that tells the viewer which field matters, with a light push toward it.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| dim | 0.5 | >0.65 hides context, <0.35 no focus |
| ring draw | ~18 f | instant ring looks pasted on |
| push | 1.22 | >1.4 and the label gets large |
| label | <= 4 words | long labels collide with UI |

## Pitfalls
- Ring padding is 5 css px; give rects exact bounds.
- Do not stack with CrashZoom on the same shot.

## Usage
```tsx
<FocusRing rect={btn} label="One tap"><ScreenImg src="recipes/note.png"/></FocusRing>
```
