// Real app screenshots of the demo account at iPhone size (390x844 @2x), as PNG.
//   node promo/tools/demo/shots.cjs <out-dir>        (after demo.sh)
// Needs playwright-core and Google Chrome. If require fails: cd promo && npm i --no-save playwright-core
const path = require("path"), fs = require("fs");
let pw; try { pw = require("playwright-core"); } catch { pw = require(path.join(process.env.HOME, ".npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")); }
const out = path.resolve(process.argv[2] || "."), tok = fs.readFileSync(path.join(__dirname, ".demotok"), "utf8").trim();
(async () => {
  const b = await pw.chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  await ctx.addInitScript((t) => { localStorage.setItem("stash_token", t); localStorage.setItem("stash_welcomed", "1"); localStorage.setItem("stash_link_saved", "1"); localStorage.setItem("skwirl_src", "1"); sessionStorage.setItem("sk_prompt", "none"); }, tok);
  const p = await ctx.newPage();
  const still = () => p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  const shot = async (name, full = false) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600); await p.screenshot({ path: path.join(out, name + ".png"), fullPage: full }); };
  await p.goto("http://localhost:8799/"); await p.waitForSelector(".card[data-id]"); await still(); await shot("library");
  await p.fill("#q", "dinner idea tonight"); await p.press("#q", "Enter").catch(() => {}); await p.waitForTimeout(1500); await shot("search-dinner");
  await p.fill("#q", "that pasta thing"); await p.press("#q", "Enter").catch(() => {}); await p.waitForTimeout(1500); await shot("search-pasta");
  await p.fill("#q", ""); await p.press("#q", "Enter").catch(() => {}); await p.waitForTimeout(1200);
  await p.click('.card:has-text("Garlic butter pasta")'); await p.waitForTimeout(800); await still();
  await p.evaluate(() => { const f = document.getElementById("fab"); if (f) f.style.display = "none"; });
  await shot("note"); await shot("note-full", true);
  await p.click("#back"); await p.waitForTimeout(500); await p.click("#mentionsBtn"); await p.waitForSelector(".mcard"); await still(); await shot("lists");
  await b.close(); console.log("wrote", out);
})();
