---
name: "TypeIn"
does: "Types a string into a search-field replica at 3 frames per char, reveals results, taps one."
use_when: "Showing search or filtering: the 'find it later' payoff."
avoid_when: "The app has no search state, or you cannot supply a clean screenshot region to cover the results."
energy: "med"
frames: "12f caret, 3 f/char, 7f reveal, tap at +18, hold >= 45"
component: "import { TypeIn, typeInEnd } from \"../recipes/shots\"; <TypeIn start={4} text=\"that pasta thing\" coverSrc=\"recipes/search-pasta.png\"><ScreenImg src=\"recipes/search-pasta.png\"/></TypeIn>"
source: "adapted from video-shotcraft references/shots/interaction/type-and-filter.md, Apache-2.0; re-implemented for 9:16"
---

## Intent
Fakes the typing from a finished screenshot: a field replica hides the baked-in text, a plain stretch of the same screenshot hides the results until the last char.

## Parameters
| param | value | what goes wrong if off |
|---|---|---|
| perChar | 3 f | <2 unreadable, >4 drags |
| zoom | 1.3 | >1.6 loses the results |
| results rect | covers chips and cards | a leftover chip gives away the trick |
| tapAt | centre of the result | tap on empty space |

## Pitfalls
- The cover is feathered but not perfect on strongly gradient backgrounds; check a still.
- Keep the query short (<= 20 chars) so it fits the field.

## Usage
```tsx
<TypeIn start={4} text={q} coverSrc="recipes/search-pasta.png">
  <ScreenImg src="recipes/search-pasta.png" />
</TypeIn>
```
