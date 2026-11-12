---
name: "CrashZoom"
does: "6-frame punch from wide to a tight crop of one field, with bounce or slam landing."
use_when: "The single payoff moment: the field the viewer must remember."
avoid_when: "More than twice a reel, low-energy sections, or when the target is tiny text with no context."
energy: "high"
frames: "7f pull-back + 6f punch + 5f settle, hold >= 45"
component: "import { CrashZoom } from \"../recipes/shots\"; <CrashZoom start={14} mode=\"bounce\" frac={0.85} rect={titleRect}><ScreenImg src=\"recipes/note.png\"/></CrashZoom>"
source: "adapted from video-shotcraft references/shots/camera/crash-zoom-punch.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
Slow push says 'look'; this says 'look at THIS'. Bounce is springy, slam is heavy (shake 14px*e^(-t/1.8) for 6 f).

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| punch | 6 f (4-8) | >10 f reads as a normal push |
| zoom | frames target at 60-85% of width, cap 2.8 | beyond 2.8 the 3x capture blurs |
| overshoot | 4.5% (3-6) | larger looks like a toy spring |
| shake amp | 14px (slam only) | >20px reads as glitch |
| blur | only during the punch, <= 9px | blur on settled text hurts reading |

## Pitfalls
- Never mix bounce and slam in one reel.
- Pick a rect whose whole text fits; a half-cropped title looks like an error.
- Hold at least 45 frames after the punch.

## Usage
```tsx
<CrashZoom start={14} mode="slam" rect={titleRect}>
  <ScreenImg src="recipes/note.png" />
</CrashZoom>
```
