"""Script -> editable HTML -> 1080x1350 PNGs for Instagram statics and carousels.

The carousel standard lives in promo/engine/CAROUSEL_STANDARD.md. This module enforces the parts a
machine can check (layout variety, no repeated hero visual, real product shown, type sizes, copy
rules) and fails closed. It cannot judge taste: content-qa still has to look at the output.

Visual assets, each declared once in the script's "assets" map and stored beside the script:
  ui        real Skwirl screens captured from the seeded demo app (promo/tools/demo/shots.cjs)
  thumb     demo reel covers (promo/tools/demo/covers); may recur as a story prop
  art       generated illustration (built-in imagegen; exported prompts, no text in art)
  licensed  open-licence illustration restyled to the brand (e.g. Microsoft Fluent Emoji, MIT)

Slide layouts: hook, statement, phone, zoom, promise, cta (see LAYOUTS below for fields).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import shutil
import subprocess
from pathlib import Path

from .schedule import text_problems

ENGINE = Path(__file__).resolve().parents[1]
REPO = ENGINE.parents[1]

UI_W = 390                      # CSS width of every captured screen (iPhone viewport)
BG = {"lilac": "#f8f7ff", "lavender": "#dcd8ff", "mint": "#cdf3e1", "peach": "#ffd8cb", "ink": "#1d1b2e"}
LAYOUTS = {"hook", "statement", "phone", "zoom", "promise", "cta"}
ASSET_TYPES = {"ui", "thumb", "art", "licensed"}
MAX_TITLE_WORDS, MAX_BODY_WORDS, MAX_HOOK_WORDS = 12, 28, 10
COPY_KEYS = ("kicker", "title", "body", "bridge", "label", "card_title", "card", "pill")


def _words(s: str) -> int:
    return len(s.split())


def _slide_visuals(slide: dict) -> list[tuple[str, str]]:
    """(asset id, crop key) pairs a slide shows, for the no-repeat rule."""
    out = []
    for tile in slide.get("tiles", []):
        if tile.get("asset"):
            out.append((tile["asset"], "tile"))
    for key in ("screen", "tile", "asset"):
        if slide.get(key):
            out.append((slide[key], "full"))
    for c in slide.get("crops", []):
        out.append((c["asset"], json.dumps(c.get("crop"))))
    return out


def read_script(path: Path) -> dict:
    data = json.loads(path.read_text())
    slides = data.get("slides", [])
    kind = data.get("kind", "carousel")
    if kind not in ("static", "carousel") or not (len(slides) == 1 if kind == "static" else 2 <= len(slides) <= 10):
        raise ValueError("static: 1 slide; carousel: 2-10 slides")
    assets = data.get("assets", {})
    problems = text_problems(data.get("caption", ""))
    if not assets:
        problems.append("no visuals: a real product shot (ui) or artwork is required")
    for key, a in assets.items():
        t = a.get("type")
        if t not in ASSET_TYPES:
            problems.append(f"asset {key}: type must be one of {sorted(ASSET_TYPES)}")
        if not a.get("file"):
            problems.append(f"asset {key}: file is required")
        if t == "ui" and "capture" not in a.get("source", ""):
            problems.append(f"asset {key}: ui shots must be real captures (source names the capture tool)")
        if t == "art" and not a.get("prompt"):
            problems.append(f"asset {key}: generated art needs its prompt")
        if t == "licensed" and not (a.get("licence") and a.get("source")):
            problems.append(f"asset {key}: licensed art needs licence and source")
    seen: dict[tuple[str, str], int] = {}
    shows_product = False
    for i, slide in enumerate(slides, 1):
        for key in COPY_KEYS:
            problems += [f"slide {i}: {p}" for p in text_problems(slide.get(key, ""))]
        for tile in slide.get("tiles", []):
            problems += [f"slide {i}: {p}" for p in text_problems(tile.get("label", ""))]
        for c in slide.get("crops", []):
            problems += [f"slide {i}: {p}" for p in text_problems(c.get("label", ""))]
        layout = slide.get("layout")
        if layout not in LAYOUTS:
            problems.append(f"slide {i}: layout must be one of {sorted(LAYOUTS)}")
        if slide.get("bg", "lilac") not in BG:
            problems.append(f"slide {i}: bg must be one of {sorted(BG)}")
        if not slide.get("title") or not slide.get("bridge"):
            problems.append(f"slide {i}: needs a title and a bridge (why the viewer swipes, or the CTA)")
        if _words(slide.get("title", "")) > MAX_TITLE_WORDS:
            problems.append(f"slide {i}: title over {MAX_TITLE_WORDS} words; one idea per slide")
        if _words(slide.get("body", "")) > MAX_BODY_WORDS:
            problems.append(f"slide {i}: body over {MAX_BODY_WORDS} words; IG is read small, cut it")
        for asset, crop in _slide_visuals(slide):
            if asset not in assets:
                problems.append(f"slide {i}: unknown asset {asset}")
                continue
            if assets[asset].get("type") == "ui":
                shows_product = True
            if assets[asset].get("type") != "thumb":
                if (asset, crop) in seen:
                    problems.append(f"slide {i}: repeats slide {seen[(asset, crop)]}'s visual ({asset}); every slide needs its own picture")
                seen.setdefault((asset, crop), i)
        if layout == "phone" and not slide.get("screen"):
            problems.append(f"slide {i}: phone layout needs a screen (ui asset)")
        if layout == "zoom" and not slide.get("crops"):
            problems.append(f"slide {i}: zoom layout needs crops")
        if layout == "zoom":
            for c in slide.get("crops", []):
                if len(c.get("crop", [])) != 4:
                    problems.append(f"slide {i}: crop is [x, y, w, h] in {UI_W}px screen space")
    if kind == "carousel":
        if _words(slides[0].get("title", "")) > MAX_HOOK_WORDS:
            problems.append(f"slide 1 is the hook: {MAX_HOOK_WORDS} words or fewer")
        for i in range(1, len(slides)):
            a, b = slides[i - 1], slides[i]
            if (a.get("layout"), a.get("arrange")) == (b.get("layout"), b.get("arrange")):
                problems.append(f"slides {i} and {i + 1} use the same layout; each slide should look different")
            if a.get("bg", "lilac") == b.get("bg", "lilac"):
                problems.append(f"slides {i} and {i + 1} share a background colour; alternate them")
        if len({(s.get("layout"), s.get("arrange")) for s in slides}) < min(len(slides), 4):
            problems.append("too few distinct layouts for a carousel (need 4+)")
        if not shows_product:
            problems.append("no slide shows the real product (a ui capture)")
        if slides[-1].get("layout") != "cta":
            problems.append("last slide should be the cta layout")
    if problems:
        raise ValueError("; ".join(problems))
    return data


def prompts(script: Path, out: Path) -> Path:
    data = read_script(script)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / "image-prompts.json"
    dest.write_text(json.dumps({key: {"prompt": val["prompt"], "file": val["file"],
                                     "generator": "built-in image_gen", "text_in_art": False}
                               for key, val in data["assets"].items() if val.get("type") == "art"}, indent=2) + "\n")
    return dest


def _inside(script: Path, rel: str) -> Path:
    dest = (script.parent / rel).resolve()
    if script.parent.resolve() not in dest.parents:
        raise ValueError("assets must live beside the script")
    return dest


def import_art(script: Path, key: str, source: Path) -> Path:
    """Copy a generated or captured image into the post folder (never overwrites)."""
    from PIL import Image
    data = read_script(script)
    dest = _inside(script, data["assets"][key]["file"])
    if dest.exists():
        raise ValueError("asset exists; use a new versioned filename")
    with Image.open(source) as im:
        im.verify()
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    return dest


def _data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
            ".woff2": "font/woff2"}[path.suffix.lower()]
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


# Inline icons (simple UI glyphs, not illustrations).
ICON = {
    "bookmark": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    "gone": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
    "play": '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff"/></svg>',
    "x": '<svg viewBox="0 0 24 24" fill="none" stroke="#f8f7ff" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    "down": '<svg viewBox="0 0 40 60" fill="none" stroke="#1d1b2e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4v48M6 38l14 14 14-14"/></svg>',
}

CSS = """
@font-face{font-family:Recursive;src:url('%(display)s');font-weight:800}
@font-face{font-family:Rethink;src:url('%(ui)s');font-weight:400 800}
*{box-sizing:border-box}body{margin:0;background:#1d1b2e;font-family:Rethink;color:#1d1b2e}
.slide{width:1080px;height:1350px;position:relative;overflow:hidden;padding:64px 80px 0;display:flex;flex-direction:column}
.meta{display:flex;align-items:center;justify-content:space-between;font-size:28px;font-weight:600;flex:none}
.brand{display:flex;align-items:center;gap:14px;font:800 36px Recursive;font-variation-settings:'CASL' 1;letter-spacing:-1px}
.brand img{width:46px;height:46px}
.count{color:#6a6880}
.text{flex:none;margin-top:48px}
.kicker{font-size:30px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6a6880;margin:0 0 18px}
h1{font:800 100px/1.08 Recursive;font-variation-settings:'CASL' 1;letter-spacing:-3px;margin:0;padding-bottom:18px}
.body{font-size:44px;line-height:1.28;font-weight:500;margin:14px 0 0;max-width:900px}
.vis{flex:1 1 auto;position:relative;margin-top:56px;min-height:0}
.ink{background:#1d1b2e;color:#f8f7ff}.ink .count,.ink .kicker{color:#a9a6c4}.ink .body{color:#dcd8ff}
.ink .brand img{filter:brightness(0) invert(1)}
.chip{display:inline-block;background:#1d1b2e;color:#f8f7ff;font-size:32px;font-weight:700;line-height:1.2;padding:12px 26px;border-radius:999px;white-space:nowrap}
/* hook: a Saved grid with one reel gone */
.l-hook h1{font-size:112px}
.panel{position:absolute;left:70px;right:70px;top:0;background:#fff;border:4px solid #1d1b2e;border-radius:48px;padding:28px 30px 30px}
.panel-h{display:flex;align-items:center;gap:14px;font:800 42px Recursive;font-variation-settings:'CASL' 1;margin-bottom:22px}
.panel-h svg{width:42px;height:42px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.tile{aspect-ratio:1/1;border-radius:24px;overflow:hidden;position:relative;background:#dcd8ff}
.tile img{width:100%%;height:100%%;object-fit:cover}
.tile .pl{position:absolute;left:18px;bottom:16px;width:44px;height:44px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
.tile.gone{background:#fff4f0;border:5px dashed #ff7a59;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#b8452a;text-align:center;font-size:30px;font-weight:700;line-height:1.3}
.tile.gone span{padding:4px 10px}
.tile.gone svg{width:84px;height:84px}
/* statement: a save points at someone else's post */
.diagram{position:absolute;left:0;right:0;top:50%%;transform:translateY(-58%%);display:flex;align-items:center;justify-content:space-between}
.node{width:380px;height:500px;border-radius:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;font-size:38px;font-weight:700;position:relative}
.node.save{background:#fff;border:4px solid #1d1b2e}
.node.save svg{width:150px;height:150px;color:#1d1b2e;fill:#dcd8ff}
.node.lost{border:5px dashed #1d1b2e;background:rgba(255,255,255,.35);color:#6a6880}
.node.lost img{width:280px;height:280px;object-fit:cover;border-radius:28px;filter:grayscale(1);opacity:.75}
.stamp{position:absolute;top:200px;left:50%%;transform:translateX(-50%%) rotate(-10deg);border:6px solid #1d1b2e;color:#1d1b2e;background:#ffd8cb;font:800 46px Recursive;font-variation-settings:'CASL' 1;padding:8px 26px;border-radius:16px;letter-spacing:1px}
.link{flex:1;height:0;border-top:7px dashed #1d1b2e;position:relative;margin:0 6px}
.link .x{position:absolute;left:50%%;top:-46px;transform:translateX(-50%%);width:86px;height:86px;border-radius:50%%;background:#1d1b2e;padding:18px}
/* phone: reel tile -> real screen in a phone frame */
.phone{position:absolute;right:0;top:0;width:520px;border:16px solid #1d1b2e;border-radius:76px;background:#1d1b2e;overflow:hidden;box-shadow:0 30px 80px rgba(29,27,46,.25)}
.phone img{display:block;width:100%%;border-radius:60px}
.reel{position:absolute;left:0;top:40px;width:280px;height:400px;border-radius:32px;overflow:hidden;border:4px solid #1d1b2e;background:#fff}
.reel img{width:100%%;height:100%%;object-fit:cover}
.reel .pl{position:absolute;left:50%%;top:50%%;width:110px;height:110px;margin:-55px 0 0 -55px;background:rgba(29,27,46,.55);border-radius:50%%;padding:26px 22px 26px 30px}
.reel-label{position:absolute;left:0;top:470px;width:280px;text-align:center}
.arrow{position:absolute;left:150px;top:470px;width:240px;height:200px}
.arrow-label{position:absolute;left:0;top:560px}
/* zoom: crops of real screens */
.crop{position:absolute;overflow:hidden;background:#fff;border:4px solid #1d1b2e;border-radius:36px;box-shadow:0 24px 60px rgba(29,27,46,.18)}
.crop img{position:absolute;left:0;top:0}
.crop-label{position:absolute;z-index:2}
.flow{display:flex;flex-direction:column;align-items:center;gap:22px;position:absolute;left:0;right:0;top:0}
.flow .crop{position:relative}
.flow .down{width:46px;height:70px}
.flow-row{display:flex;align-items:center;gap:28px}
/* promise */
.l-promise .text{margin-top:auto}
.card{margin:64px 0 auto;background:#cdf3e1;color:#1d1b2e;border-radius:40px;padding:56px 60px;font-size:46px;line-height:1.35;font-weight:600}
.card b{display:block;font-size:30px;letter-spacing:2px;text-transform:uppercase;margin-bottom:18px;color:#3d3b52}
/* cta */
.l-cta{align-items:center;text-align:center;justify-content:center;padding-top:0}
.l-cta .mark{width:230px;height:230px;margin-bottom:56px}
.l-cta h1{font-size:108px}
.l-cta .body{margin:34px auto 0;max-width:820px}
.l-cta .pill{margin-top:56px;background:#1d1b2e;color:#f8f7ff;font-size:40px;font-weight:700;padding:22px 48px;border-radius:999px}
.l-cta .label{margin-top:34px;font:800 40px Recursive;font-variation-settings:'CASL' 1}
"""


def build(script: Path, out: Path) -> Path:
    data = read_script(script)
    out.mkdir(parents=True, exist_ok=True)
    prompts(script, out)
    esc = html.escape
    br = lambda s: esc(s).replace("\n", "<br>")  # noqa: E731
    uri = {}
    for key, val in data["assets"].items():
        path = _inside(script, val["file"])
        if not path.is_file():
            raise ValueError(f"missing asset {key} ({val['file']}): capture it, or run imagegen then import-art")
        uri[key] = _data_uri(path)
    alt = {k: esc(v.get("alt", "")) for k, v in data["assets"].items()}
    tokens = (REPO / "worker/public/index.html").read_text()
    for token in BG.values():
        if token not in tokens:
            raise ValueError("brand tokens changed; reconcile the still renderer with worker/public")
    fonts = REPO / "worker/public/fonts"
    css = CSS % {"display": _data_uri(fonts / "recursive-800-casual.woff2"), "ui": _data_uri(fonts / "rethink-sans.woff2")}
    mark = _data_uri(REPO / "worker/public/mark.svg")
    n = len(data["slides"])

    def crop_html(c: dict, width: float, style: str = "") -> str:
        x, y, w, h = c["crop"]
        s = width / w
        height = h * s
        label = f'<span class="chip crop-label" style="{c.get("label_at", "left:28px;top:-28px")}" data-copy>{esc(c["label"])}</span>' if c.get("label") else ""
        rot = f"transform:rotate({c.get('rotate', 0)}deg);" if c.get("rotate") else ""
        return (f'<div class="crop-wrap" style="position:absolute;{style}{rot}">{label}<div class="crop" data-region style="position:relative;width:{width:.0f}px;height:{height:.0f}px">'
                f'<img alt="{alt[c["asset"]]}" src="{uri[c["asset"]]}" style="width:{UI_W * s:.1f}px;transform:translate({-x * s:.1f}px,{-y * s:.1f}px)"></div></div>')

    sections = []
    for i, sl in enumerate(data["slides"], 1):
        layout, bg = sl["layout"], sl.get("bg", "ink" if sl["layout"] == "promise" else "lilac")
        cls = f"slide l-{layout}" + (" ink" if bg == "ink" else "")
        meta = "" if layout == "cta" else (f'<div class="meta"><span class="brand" data-copy><img alt="" src="{mark}">Skwirl</span>'
                                          f'<span class="count meta-copy" data-copy>{i}/{n}</span></div>')
        text = ""
        if layout != "cta":
            text = ('<div class="text" data-region>' + (f'<p class="kicker" data-copy>{esc(sl["kicker"])}</p>' if sl.get("kicker") else "")
                    + f'<h1 data-copy>{br(sl["title"])}</h1>' + (f'<p class="body" data-copy>{br(sl["body"])}</p>' if sl.get("body") else "") + "</div>")
        vis = ""
        if layout == "hook":
            tiles = []
            for t in sl.get("tiles", []):
                if t.get("gone"):
                    tiles.append(f'<div class="tile gone">{ICON["gone"]}<span data-copy>{br(t.get("label", "Reel unavailable"))}</span></div>')
                else:
                    tiles.append(f'<div class="tile"><img alt="{alt[t["asset"]]}" src="{uri[t["asset"]]}"><span class="pl">{ICON["play"]}</span></div>')
            vis = (f'<div class="vis" data-region><div class="panel"><div class="panel-h">{ICON["bookmark"]}<span data-copy>{esc(sl.get("panel", "Saved"))}</span></div>'
                   f'<div class="grid">{"".join(tiles)}</div></div></div>')
        elif layout == "statement":
            lost = f'<img alt="{alt[sl["asset"]]}" src="{uri[sl["asset"]]}">' if sl.get("asset") else ""
            vis = (f'<div class="vis" data-region><div class="diagram"><div class="node save">{ICON["bookmark"]}<span data-copy>{esc(sl.get("from", "Your save"))}</span></div>'
                   f'<div class="link"><div class="x">{ICON["x"]}</div></div>'
                   f'<div class="node lost">{lost}<span data-copy>{esc(sl.get("to", "Their post"))}</span><span class="stamp" data-copy>{esc(sl.get("stamp", "Deleted"))}</span></div></div></div>')
        elif layout == "phone":
            tile = ""
            if sl.get("tile"):
                tile = (f'<div class="reel"><img alt="{alt[sl["tile"]]}" src="{uri[sl["tile"]]}"><span class="pl">{ICON["play"]}</span></div>'
                        + (f'<div class="reel-label"><span class="chip" data-copy>{esc(sl["tile_label"])}</span></div>' if sl.get("tile_label") else "")
                        + '<svg class="arrow" viewBox="0 0 240 200" fill="none" stroke="#1d1b2e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">'
                        '<path d="M20 10 C10 150 110 200 200 170"/><path d="M172 146 l30 24 -30 22"/></svg>'
                        + (f'<span class="chip arrow-label" style="background:#fff;color:#1d1b2e;border:4px solid #1d1b2e" data-copy>{esc(sl["arrow_label"])}</span>' if sl.get("arrow_label") else ""))
            style = "" if sl.get("tile") else "left:50%;right:auto;transform:translateX(-50%);"
            vis = (f'<div class="vis" data-region>{tile}<div class="phone" style="{style}"><img alt="{alt[sl["screen"]]}" src="{uri[sl["screen"]]}">'
                   '</div></div>')
        elif layout == "zoom":
            if sl.get("arrange") == "flow":
                parts = []
                for j, c in enumerate(sl["crops"]):
                    x, y, w, h = c["crop"]
                    width = c.get("width", 860)
                    label = f'<span class="chip" data-copy>{esc(c["label"])}</span>' if c.get("label") else ""
                    if j:
                        parts.append(f'<div class="flow-row">{ICON["down"].replace("<svg", "<svg class=down", 1)}{label}</div>')
                    elif label:
                        parts.append(label)
                    s = width / w
                    bare = "" if c.get("frame", True) else "border:0;background:none;box-shadow:none;"
                    parts.append(f'<div class="crop" data-region style="{bare}width:{width:.0f}px;height:{h * s:.0f}px"><img alt="{alt[c["asset"]]}" src="{uri[c["asset"]]}" '
                                 f'style="width:{UI_W * s:.1f}px;transform:translate({-x * s:.1f}px,{-y * s:.1f}px)"></div>')
                vis = f'<div class="vis"><div class="flow">{"".join(parts)}</div></div>'
            else:
                vis = '<div class="vis">' + "".join(
                    crop_html(c, c.get("width", 760), f'left:{c.get("left", 0)}px;top:{c.get("top", 0)}px;') for c in sl["crops"]) + "</div>"
        elif layout == "promise":
            if sl.get("card"):
                vis = f'<div class="card" data-region data-copy><b>{esc(sl.get("card_title", ""))}</b>{br(sl["card"])}</div>'
        elif layout == "cta":
            text = (f'<img class="mark" alt="Skwirl" src="{mark}"><h1 data-copy>{br(sl["title"])}</h1>'
                    + (f'<p class="body" data-copy>{br(sl["body"])}</p>' if sl.get("body") else "")
                    + (f'<div class="pill" data-copy>{esc(sl["pill"])}</div>' if sl.get("pill") else "")
                    + f'<div class="label" data-copy>{esc(sl.get("label", "skwirl.app"))}</div>')
        sections.append(f'<section class="{cls}" id="slide-{i:02}" style="background:{BG[bg]}">{meta}{text}{vis}</section>')
    page = out / "slides.html"
    page.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Skwirl carousel</title><style>'
                    + css + "</style><body>" + "\n".join(sections) + "</body></html>")
    (out / "caption.txt").write_text(data["caption"].strip() + "\n")
    (out / "copy.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return page


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["prompts", "import-art", "render"])
    ap.add_argument("script", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--art-id")
    ap.add_argument("--source", type=Path)
    args = ap.parse_args()
    if args.command == "import-art":
        if not args.art_id or not args.source:
            ap.error("import-art needs --art-id and --source")
        print(import_art(args.script, args.art_id, args.source))
        return
    if not args.out:
        ap.error("--out is required")
    if args.command == "prompts":
        print(prompts(args.script, args.out))
        return
    build(args.script, args.out)
    subprocess.run(["node", str(ENGINE / "bin/render-stills.cjs"), str(args.out.resolve())], check=True)
    # Bind the render to the exact script. Visual/truth review must still happen.
    (args.out / "qa/source.json").write_text(json.dumps({"script_sha256": hashlib.sha256(args.script.read_bytes()).hexdigest()}, indent=2))


if __name__ == "__main__":
    main()
