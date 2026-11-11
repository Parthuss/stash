# Landing visuals (branch crew/1111-201910-75e4, 11 Nov 2026)

Not deployed, not merged.

## Hero (`#productDemo`): one 15s CSS loop
1. 0 to 5s: three reels of different kinds (a scroll-animation tutorial, a pasta recipe, a book) fly into the Skwirl library on a phone and turn into notes. The newest goes to the top and pushes the older ones down. An older "Tokyo trip" note is already there, so places are covered too.
2. 5.4s: a Claude Code window opens over the bottom of the phone, and the real 9 Nov prompt types out letter by letter.
3. 8.3s: the "4 Web Animation Patterns" note gets a lavender ring, a pill lifts off it into the window and turns into the "Checked Skwirl" chip.
4. 9.1s: the reply streams in word by word: the first sentence of the real reply, same wording as #work.
5. Holds for about 4s, fades out and loops.

Captions under the visual light up in step: Save anything / Get a note / Back while you work.

- The stage is a fixed 380x540 that app.js scales to the column (`--s`), so phone and desktop show the same composition (0.93x at 390px, 1.15x on desktop).
- Tapping the visual pauses it. The hidden `#demoToggle` stays (it only shows on keyboard focus). The loop also pauses while the visual is off screen.
- With reduced motion you see the final frame: all notes, the ring, the full prompt, the chip and the reply.

## Work section (`#work`): plays once, when the card is half on screen
The prompt types with a caret, the chip pops, then the reply (with the caption and fine print unchanged) streams in. The three use cases start dimmed and light up one after another once the chip has shown, each with a brief white card behind it and its example chip popping. Screen readers get the plain sentences, because the split letters are aria-hidden copies. With reduced motion or no JS, you see the finished state.

## Files
- `*-hero-t<sec>s.png`: key frames. Desktop shots are the whole viewport. Phone shots crop to the visual, and `phone-hero-reduced.png` is the phone viewport.
- `*-work-t<sec>s.png`: frames from the work animation (1.2s typing, 2.9s chip, 4s streaming, 7.9s done).
- `*-reduced.png`: reduced motion.
- `desktop-hero.mp4`, `phone-hero.mp4`: one full 15s loop. `desktop-work.mp4`, `phone-work.mp4`: 8s. Recorded frame by frame, so playback is smooth regardless of machine speed. The sticky nav is hidden in the phone work recording only.
