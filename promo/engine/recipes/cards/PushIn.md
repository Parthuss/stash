---
name: "PushIn"
does: "Slow camera push from the wide phone shot to one rect."
use_when: "Opening a scene, or pointing at a card or title without urgency."
avoid_when: "The target is already large, or the beat needs a sharp hit (use CrashZoom)."
energy: "low"
frames: "45-75 frame push, then hold >= 45 if text must be read"
component: "import { PushIn } from \"../recipes/shots\"; <PushIn start={0} duration={50} rect={{x:36,y:388,w:290,h:74}} endScale={1.6}><ScreenImg src=\"recipes/note.png\"/></PushIn>"
source: "adapted from video-shotcraft references/shots/opening/spotlight-hero-card.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
A calm 'please look here'. Centre and zoom share one eased curve, so the target slides to frame centre as the shot closes in.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| duration | 45-75 f | <40 reads as a hit, >90 drifts |
| endScale | 1.4-1.8 | >2.2 on a 3x capture goes soft |
| rect | the exact field | pointing at a whole card wastes the move |
| frac | 0.62 | target fills too little or clips |

## Pitfalls
- Do not push into a region with no text or meaning.
- Label chips can cover UI at high zoom; keep them in the bottom margin.

## Usage
```tsx
<PushIn start={0} rect={titleRect} endScale={1.6}>
  <ScreenImg src="recipes/note.png" />
</PushIn>
```
