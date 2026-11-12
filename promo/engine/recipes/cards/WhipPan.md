---
name: "WhipPan"
does: "Sideways whip between two full-frame scenes with directional blur only while moving."
use_when: "High-to-high energy cut between two demo scenes, landing on content to read."
avoid_when: "Landing on a still moment that needs a calm entry, or two whips in a row."
energy: "high"
frames: "14 f (12-18), cut mid-whip on the beat"
component: "import { WhipPan } from \"../recipes/shots\"; <WhipPan start={113} from={<SceneA/>} to={<SceneB/>} />"
source: "adapted from video-shotcraft references/shots/transition/shot-transitions.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
A fast move that borrows the blur frames to swap scenes. Speed curve bezier(.8,0,.15,1); blur sd = 0.085 x px/frame (cap 64) on the horizontal axis only.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| duration | 14 f | <10 flickers, >20 floats |
| blur sd | 0.085 x speed | too much smears the incoming UI |
| incoming lead | 8 f settled on arrival | scene starts mid-move |
| dir | left or right | alternate between whips |

## Pitfalls
- Blurred text is expected only during the whip; the incoming scene must be still at the end.
- Give the incoming scene 8 frames of lead before its real action.

## Usage
```tsx
<WhipPan start={cut - 7} from={A} to={B} dir="left" />
```
