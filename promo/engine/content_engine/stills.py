"""Script + generated artwork -> editable HTML + 1080x1350 PNGs.

Image generation belongs to the weekly agent's built-in imagegen tool. This module
exports prompts and fails closed until the agent imports every generated image.
It never substitutes stock art or calls an unconfigured paid API.
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


def read_script(path: Path) -> dict:
    data = json.loads(path.read_text())
    slides = data.get("slides", [])
    kind = data.get("kind", "carousel")
    if kind not in ("static", "carousel") or not (len(slides) == 1 if kind == "static" else 2 <= len(slides) <= 10):
        raise ValueError("static: 1 slide; carousel: 2-10 slides")
    problems = text_problems(data.get("caption", ""))
    for slide in slides:
        for key in ("kicker", "title", "body", "bridge", "label", "card_title", "card"):
            problems += text_problems(slide.get(key, ""))
        if not slide.get("title") or not slide.get("bridge"):
            problems.append("each slide needs a title and a bridge to the next slide or CTA")
        if slide.get("art") and slide["art"] not in data.get("art", {}):
            problems.append("unknown art id")
    if not data.get("art"):
        problems.append("generated artwork is required")
    if problems:
        raise ValueError("; ".join(problems))
    return data


def prompts(script: Path, out: Path) -> Path:
    data = read_script(script)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / "image-prompts.json"
    dest.write_text(json.dumps({key: {"prompt": val["prompt"], "file": val["file"],
                                     "generator": "built-in image_gen", "text_in_art": False}
                               for key, val in data["art"].items()}, indent=2) + "\n")
    return dest


def import_art(script: Path, key: str, source: Path) -> Path:
    from PIL import Image
    data = read_script(script)
    asset = data["art"][key]
    dest = (script.parent / asset["file"]).resolve()
    if script.parent.resolve() not in dest.parents:
        raise ValueError("art must live beside the script")
    if dest.exists():
        raise ValueError("asset exists; use a new versioned filename")
    with Image.open(source) as im:
        im.verify()
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    return dest


def _data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build(script: Path, out: Path) -> Path:
    data = read_script(script)
    out.mkdir(parents=True, exist_ok=True)
    prompts(script, out)
    esc = html.escape
    art = {}
    for key, val in data["art"].items():
        path = (script.parent / val["file"]).resolve()
        if not path.is_file():
            raise ValueError(f"missing generated art {key}: run imagegen, then import-art")
        art[key] = _data_uri(path, "image/png")
    fonts = REPO / "worker/public/fonts"
    display = _data_uri(fonts / "recursive-800-casual.woff2", "font/woff2")
    ui = _data_uri(fonts / "rethink-sans.woff2", "font/woff2")
    tokens = (REPO / "worker/public/index.html").read_text()
    for token in ("#f8f7ff", "#1d1b2e", "#dcd8ff", "#cdf3e1", "#ffd8cb"):
        if token not in tokens:
            raise ValueError("brand tokens changed; reconcile still renderer with worker/public")
    css = f"""@font-face{{font-family:Recursive;src:url('{display}');font-weight:800}}
@font-face{{font-family:Rethink;src:url('{ui}');font-weight:400 600}}
*{{box-sizing:border-box}}body{{margin:0;background:#1d1b2e;color:#1d1b2e;font-family:Rethink}}
.slide{{width:1080px;height:1350px;position:relative;overflow:hidden;background:#f8f7ff;padding:70px 80px}}
.brand{{font:800 36px Recursive;font-variation-settings:'CASL' 1;letter-spacing:-1px}}
.top{{display:flex;align-items:center;justify-content:space-between}}.count{{font-size:26px}}
.kicker{{margin-top:40px;font-size:26px;font-weight:600;letter-spacing:3px;text-transform:uppercase}}
h1{{font:800 82px/1.16 Recursive;font-variation-settings:'CASL' 1;letter-spacing:-3px;margin:22px 0 20px;padding-bottom:8px;max-width:920px}}
.body{{font-size:34px;line-height:1.3;max-width:880px;margin:0}}
.art{{position:absolute;left:110px;top:545px;width:860px;height:570px;object-fit:cover;object-position:center;border-radius:32px}}
.bridge{{position:absolute;left:80px;bottom:92px;width:920px;border-top:2px solid #dcd8ff;padding-top:24px;font-size:30px;line-height:1.25}}
.label{{position:absolute;left:80px;bottom:50px;font-size:20px;color:#6a6880}}
.dark{{background:#1d1b2e;color:#f8f7ff}}.dark .bridge{{border-color:#6a6880}}
.dark .label{{color:#dcd8ff}}.dark .body{{color:#dcd8ff}}
.text h1{{font-size:88px}}.text .body{{font-size:38px;line-height:1.45}}
.payoff{{position:absolute;left:80px;top:640px;width:920px;padding:48px;background:#cdf3e1;border-radius:32px;color:#1d1b2e;font-size:40px;line-height:1.4}}
.payoff b{{font-size:28px;display:block;margin-bottom:16px;letter-spacing:2px;text-transform:uppercase}}
"""
    sections = []
    for i, slide in enumerate(data["slides"], 1):
        classes = "slide " + ("dark " if slide.get("dark") else "") + ("text" if not slide.get("art") else "")
        picture = f'<img class="art" alt="{esc(data["art"][slide["art"]].get("alt", ""))}" src="{art[slide["art"]]}">' if slide.get("art") else ""
        payoff = f'<div class="payoff"><b>{esc(slide.get("card_title", ""))}</b>{esc(slide["card"]).replace(chr(10), "<br>")}</div>' if slide.get("card") else ""
        sections.append(f'''<section class="{classes}" id="slide-{i:02}">
<div class="top"><span class="brand" data-copy>Skwirl</span><span class="count" data-copy>{i:02} / {len(data['slides']):02}</span></div>
<div class="kicker" data-copy>{esc(slide.get('kicker', ''))}</div>
<h1 data-copy>{esc(slide['title']).replace(chr(10), '<br>')}</h1>
<p class="body" data-copy>{esc(slide.get('body', '')).replace(chr(10), '<br>')}</p>{picture}{payoff}
<div class="bridge" data-copy>{esc(slide['bridge'])}</div>
<div class="label" data-copy>{esc(slide.get('label', 'skwirl.app'))}</div></section>''')
    page = out / "slides.html"
    page.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Skwirl carousel</title><style>' + css + '</style><body>' + '\n'.join(sections) + '</body></html>')
    (out / "caption.txt").write_text(data["caption"].strip() + "\n")
    (out / "copy.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return page


def main():
    ap = argparse.ArgumentParser(description=__doc__)
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
