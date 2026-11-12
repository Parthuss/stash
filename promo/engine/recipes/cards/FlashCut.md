---
name: "FlashCut"
does: "4-frame white flash that covers a hard cut."
use_when: "A hard cut between two similar-energy scenes, on a beat."
avoid_when: "As decoration, or twice within a second."
energy: "med"
frames: "4 f decay starting on the cut frame"
component: "import { FlashCut } from \"../recipes/shots\"; <FlashCut at={60} />"
source: "adapted from video-shotcraft references/shots/transition/shot-transitions.md (flash-cut) and rhythm/beat-cut-moves.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
Hides a cut with a camera-flash decay: opacity 0.95 to 0, squared falloff.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| frames | 4 | >6 becomes a soft dissolve |
| peak | 0.95 | lower looks washed out |
| position | on the cut frame, on a beat | off-beat flash reads as a glitch |

## Pitfalls
- Put the scene change on the same frame as the flash start.
- Place SFX on that frame.

## Usage
```tsx
<FlashCut at={cutFrame} />
```
