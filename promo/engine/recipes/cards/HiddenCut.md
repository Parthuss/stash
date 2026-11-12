---
name: "HiddenCut"
does: "A brand card sweeps across and the hard cut happens while it covers the frame."
use_when: "Switching to unrelated content or a different screenshot, medium energy."
avoid_when: "Directly after another wipe, or when the two scenes are the same screen."
energy: "med"
frames: "14 f, cut at the midpoint, bezier(.3,0,.7,1)"
component: "import { HiddenCut, hiddenCutFrame } from \"../recipes/shots\"; <HiddenCut start={203} from={<SceneA/>} to={<SceneB/>} />"
source: "adapted from video-shotcraft references/shots/transition/transition-hidden-cut.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
Gives a hard cut a reason. The panel is wider than the frame so the frame is fully covered for ~4 frames around the cut.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| duration | 14 f | <10 flashes, >20 stalls |
| panel width | 1500 px | narrower leaves gaps at the cut |
| colour | C.lavender | off-brand colour reads as a template |
| mark | Skwirl mark | omit and it is just a wipe |

## Pitfalls
- The cut is at start + duration/2: align that frame to a beat.
- Keep the same wipe to once or twice per reel.

## Usage
```tsx
<HiddenCut start={cut - 7} from={A} to={B} />
```
