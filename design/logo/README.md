# Skwirl logo

The mark is a squirrel's tail drawn as one tapered swirl ("Skwirl" sounds like "swirl"),
with a coral acorn tucked inside the curl: the thing it stashed for later.

- Geometry is generated, not drawn: a log spiral centreline (`mark.py`) with a width profile
  that starts as a hairline at the base, swells through the curl and thins to the tip.
- `final.py` writes the SVGs: `mark.svg` (bare), `icon.svg` (full-bleed lavender, the OS rounds
  it), `maskable.svg` (smaller, inside Android's safe circle), `favicon.svg` (rounded square).
- Colours: ink `#1d1b2e`, acorn coral `#ff7a59`, ground lavender `#dcd8ff`.
- Wordmark: "Skwirl" in Gloock, mark at ~1em to the left, gap ~0.26em.

Rebuild: `python3 final.py`, then render the PNG sizes with headless Chrome (512, 192, 180,
maskable 512) into `worker/public/`.
