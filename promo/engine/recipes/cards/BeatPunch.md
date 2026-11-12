---
name: "BeatPunch"
does: "Jump-cut punch-in on the beat: wide, 1.6x, 2.6x, with a 2-frame brightness tick."
use_when: "A rhythmic build into a detail, hook or mid-reel energy lift."
avoid_when: "Anywhere the viewer needs a steady read, or the target is not centred on a clear object."
energy: "high"
frames: "cuts on beats[0], beats[1]; hold last step >= 35"
component: "import { BeatPunch } from \"../recipes/shots\"; <BeatPunch beats={[15,30]} focus={[ptA, ptB]}><ScreenImg src=\"recipes/search-pasta.png\"/></BeatPunch>"
source: "adapted from video-shotcraft references/shots/rhythm/beat-cut-moves.md and rhythm-interrupt-moves.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
The cut itself is the drum. Hard cuts, no easing, each step closer to one target.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| scales | 1.6, 2.6 | >3 blurs the capture |
| beat frames | multiples of 15 | off the grid feels sloppy |
| tick | brightness 0.92 for 2 f | stronger reads as flicker |
| hold | >= 35 f | no time to read the close-up |

## Pitfalls
- Steps must close in on one subject, not jump between areas.
- Do not add easing between steps.

## Usage
```tsx
<BeatPunch beats={[beats(1), beats(2)]} focus={[card, title]}>{img}</BeatPunch>
```
