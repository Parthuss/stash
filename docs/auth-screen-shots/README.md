# Auth screen (12 Nov 2026), taken on live skwirl.app

Sign-up moved out of the hero. The hero has one "Start free" button, a quiet "Sign in" link and one fine-print line. Every Start free / Sign in on the page (and skwirl.app/#start, /#signin) opens the auth view: a ~400px card on a computer, full screen on a phone. It has Create account / Sign in tabs, then the 6-digit code step. Back or Esc closes it, and it doesn't add an entry to history.

- `01-hero-*`: hero, `02-create-*`: Create account tab, `03-signin-*`: Sign in tab, `04-code-*`: code step (the code request was intercepted in the test, so no email was sent).
- desktop = 1440x900, phone = 390x844, both at 2x, with reduced motion on.
