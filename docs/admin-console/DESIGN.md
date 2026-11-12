---
name: Skwirl owner console
description: A light operational workspace for growth, people, processing, and traffic.
colors:
  bg: "#f8f7fc"
  surface: "#fff"
  ink: "#1d1b2e"
  muted: "#666277"
  line: "#e7e4ef"
  accent: "#6450c7"
  good: "#226449"
  bad: "#a13d2e"
  soft: "#f4f2f9"
typography:
  headline:
    fontFamily: "Recursive, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Recursive, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Rethink Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Rethink Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  metric:
    fontFamily: "Rethink Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "-0.035em"
rounded:
  bar: "3px"
  tag: "6px"
  control: "8px"
  surface: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  grid: "18px"
  lg: "24px"
  section: "38px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
---

# Design System: Skwirl owner console

## Overview

A familiar SaaS workspace with Skwirl's light lavender ground, white working surfaces, rounded forms, and expressive Recursive headings. The existing coral-and-ink mark carries the brand; restrained purple data marks carry the analysis. This is the owner-console system, not a replacement for the product-wide design system.

Sources: [`owner.html`](../../worker/public/owner.html), [`console.css`](../../worker/public/console.css), [`console.js`](../../worker/public/console.js), and [`fonts.css`](../../worker/public/fonts.css). Frontmatter records implemented reusable values; CSS remains the runtime source. The desktop and phone targets are (1440px) and (390px). Fixture previews demonstrate layout, not live business results or acceptance.

## Colors

**Primary:** `accent` identifies charts, action submissions, focused controls, and actionable activity names. Pale purple fills support bars and selected navigation without competing with the numbers.

**Neutral:** `bg` is the page ground, `surface` the working layer, `ink` primary text, `muted` supporting text, `line` dividers, and `soft` recessed tracks and hover surfaces.

**Status:** `good` and `bad` distinguish rising and falling deltas; arrows and text also carry direction. Failed-save counts use `bad`. Direction is a numeric comparison, not a universal judgment that an increase is beneficial.

## Typography

Self-hosted Recursive supplies the wordmark and section headings; self-hosted Rethink Sans supplies controls, tables, prose, and numbers. System sans-serif fallbacks remain available while fonts swap in. Numeric text uses tabular figures.

Use the frontmatter hierarchy. Subheadings are compact Rethink Sans (14px, weight 600); supporting labels generally use (11–13px). At the phone breakpoint, the page heading becomes (28px), section headings (20px), and metric values (30px). Table text becomes (11px), while user-name buttons remain (12px).

## Layout

One scrollable document orders Overview, Funnel, Users, Processing, Traffic, then Activity. Section links navigate within that document; the current link changes on selection.

- Desktop: fixed rail (202px), main offset by the same amount, main padding (38px), and main maximum width (1560px). Eight metric cells form four columns inside one divided surface. Health and traffic breakdowns use two columns with the `grid` gap.
- At (1180px) and below: rail narrows to (180px), main padding becomes (30px 24px), and metric delta/spark content stacks within each cell.
- At (850px) and below: the rail becomes a sticky top bar with a horizontally scrollable section navigator; main loses its left offset. Secondary user columns hide, with their details retained in the drawer.
- At (600px) and below: main padding is (24px 16px 20px), metrics use two columns, health and traffic breakdowns use one column, and the period controls sit below the heading. Last-seen hides from the user table. Funnel rates move beneath their bar/count row; activity timestamps move beneath the event. Section spacing tightens to (30px).

Tables scroll inside their own wrappers. Search and plan controls remain adjacent on phone. The user drawer is viewport-height and at most (510px) wide, becoming full-width on narrow screens. Sticky-header offsets preserve section headings during anchor navigation.

## Elevation & Depth

Panels are flat: white surfaces and thin borders establish grouping. Only the modal drawer and toast lift above the page. The drawer uses a leftward shadow (`-12px 0 40px #1d1b2e12`) and dimmed backdrop (`#1d1b2e36`); the toast uses (`0 5px 24px #1d1b2e20`). Avoid adding resting shadows to metric cells or data panels.

## Shapes

Use gently rounded panels, smaller rounded controls, and shallow bar corners from the frontmatter. Metrics share their outer panel's rounded silhouette and internal dividers; they are not eight floating cards. Tags and plan badges are small rounded rectangles. The activity dot is circular. Borders are generally (1px).

## Components

### Controls and navigation

Native buttons, selects, search inputs, textareas, and disclosure elements preserve familiar keyboard behavior. Standard buttons/selects have a minimum height of (40px); compact table actions are smaller on desktop and expand on phone. Secondary buttons are white, hover over `soft`, and primary form submissions use `accent` with white text. Disabled controls fade to opacity (0.5); unavailable push/requeue actions remain visibly disabled.

Visible keyboard focus uses an accent outline (3px) offset by (3px). Inputs use an accent caret. Provide programmatic labels for icon controls and visually hidden labels for search, plan, and reporting period. Keep the skip link, polite status regions, and native disclosures. Smooth anchor scrolling becomes immediate under reduced-motion preferences; animation and transitions are disabled there.

### Metric group and evidence tables

Each metric cell contains a label, large value, equal-period delta, and thin purple sparkline when history exists. Deltas show an arrow plus percentage, or an absolute increase when the previous value is zero. Unchanged values say “No change”; snapshots say “Snapshot now.” Missing history is named, and unavailable revenue shows an em dash with “No payment ledger.” Do not draw fabricated history.

Sparklines expose an accessible trend label and point titles. The metric disclosure supplies current/previous values and definitions, with a further table of all trend buckets. Preserve these text/table alternatives when adding charts.

### Funnel

Horizontal bars have explicit labels, counts, and cohort rates. A dashed boundary separates anonymous reach from the signup cohort: their bars use separate denominators. Retain the explanation and expandable table; bar length must not imply proven visitor-to-signup attribution.

### Users and action drawer

Names are buttons; clicking the non-interactive part of a user row also opens details. Search filters loaded users by name, and the plan selector filters that same set. The table states its loaded-account limit and labels saves as all-time done/pending/failed counts.

Use a native modal dialog with a labeled close control, Escape dismissal, and focus restoration to its opener. It preserves the underlying page and selected period. The drawer contains account facts, recent journey, and action forms. Choosing an action focuses its editor or submit button. Push text is required and capped at (240 characters); an owner message allows (500 characters), with blank explicitly clearing it. Requeue requires an explicit submission and preserves completed saves. Submissions disable their button while pending, then announce success or failure; availability and access are still enforced by the server.

### Health, traffic, and activity

Queue bars pair named states with counts and a table. Provider facts distinguish configuration, available credit, and estimated cost; usage and failure examples expand on demand. Current unresolved failures remain separate from waiting work.

Traffic uses one purple line, a single numeric axis, UTC date labels, point hover titles, and a complete table including zero-visit days. Measure the visible chart container before constructing its SVG. Breakdown bars retain labels, counts, and table alternatives. Activity is a divided chronological list; known user names open the same drawer.

Loading and refresh messages use a polite status region. A refresh failure keeps the last successful data visible with an explicit stale-data message. Missing/expired owner access clears private content and presents a sign-in link. Empty tables, traffic, failures, and journeys use specific text rather than blank surfaces.

### Content

Content joins the same scrollable document between Traffic and Activity, with a matching rail link. It retains the console's fonts, flat white panels, borders, controls, spacing and focus treatment. The setup checklist uses two columns on desktop and one on phone. It names Instagram, YouTube, private R2 storage, Telegram, engine enablement and dry-run state, with links to the corresponding setup steps.

The ideas table orders hooks, formats and numeric scores from highest to lowest. A shared score definition supplied by the API appears beneath the table; differing definitions appear beside their scores. Scores must not imply measured reach. Draft panels pair a media preview with the caption, quality-gate result, expandable findings and Approve/Skip buttons. Desktop uses preview and review columns; phone stacks them. Carousel previews scroll horizontally with slide-count text. Native video controls preserve familiar playback. Scheduled and posted items use scrollable tables, UTC dates, per-channel results and explicit “Not measured yet” states for pending 48-hour or 7-day snapshots.

Before connections exist, the section shows the setup checklist, backlog and a labeled local sample. Sample approval and skip controls are disabled. Run research, Run make and Pause/Resume controls stay hidden until the dedicated workflow token and content bucket are configured. Submissions disable controls while pending and announce the server's result. An approval request is a queued decision bound to the displayed content hash; the engine checks the gate and media evidence again before applying it. Safe console workflow requests use dry run; Resume does not enable live publishing.

Live previews remain private: the browser fetches media with the current owner credential and displays temporary blob URLs. Content requests use the same owner authentication as the rest of the console. Session changes clear the section and revoke preview URLs. Refresh failures retain the last content with an explicit stale-data message; a missing content integration leaves the rest of the console usable. Committed sample media illustrates a draft and carries no approval or publication claim.

## Do's and Don'ts

- **Do** keep definitions, time boundaries, cohort limits, unavailable states, and chart tables close to the data they qualify.
- **Do** preserve the light Skwirl fonts, colors, native control semantics, and keyboard-visible focus when extending this surface.
- **Do** keep data values and action outcomes supplied by the API; fixture values are layout evidence only.
- **Don't** introduce decorative gradients, imagery, or produced rasters into this console. Its implemented visual language is code-led data and controls.
- **Don't** turn this scoped console layout, its metrics, or its current data limitations into product-wide brand rules.

## Development brief (preserved direction contract)

Mode: Operate. Audience: Parth, checking growth and processing on a laptop or phone. The explicit task supplies the product facts and visual direction; no interview is needed for this scoped replacement.

THESIS: One operational workspace answers growth, people, processing and traffic in that order.
OWN-WORLD: Skwirl's lavender ground, white working surfaces, ink text, coral mark, Recursive headings and Rethink Sans controls. Restrained purple charts; no gradients.
STORY: Scan equal-period changes, inspect conversion, find a person, resolve failures, then understand traffic.
FIRST VIEWPORT: A narrow section rail, period selector at top right, eight divided metric cells, and a labeled conversion panel. Phone uses two metric columns and a horizontal section navigator.
FORM: Familiar SaaS console, explicitly requested through Stripe/Plausible/Linear references; code-led to retain the existing static Worker stack. Signature interaction: a user row opens a focused action drawer without losing the period or scroll position.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Trends use thin single-axis marks, one accent, text labels, native SVG hover titles, and an expandable table. Funnel stages expose cohort limitations. No historical queue, subscription, revenue, or credit values are invented. Full definitions are shown with the data. Actions remain behind the same server-side owner check as the existing admin endpoint.
