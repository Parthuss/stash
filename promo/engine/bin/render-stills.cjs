// Local HTML only. Browser QA is mechanical; it never grants content-qa PASS.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

async function main() {
  const out = path.resolve(process.argv[2]);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'),
    headless: true,
  });
  try {
    const page = await browser.newPage({viewport: {width: 1080, height: 1350}, deviceScaleFactor: 1});
    await page.route('**/*', route => route.request().url().startsWith('file:') || route.request().url().startsWith('data:')
      ? route.continue() : route.abort());
    await page.goto(pathToFileURL(path.join(out, 'slides.html')).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.decode()));
      if (!document.fonts.check('800 82px Recursive') || !document.fonts.check('400 34px Rethink')) throw Error('font missing');
    });
    const slides = page.locator('.slide');
    const errors = [];
    const count = await slides.count();
    for (let i=0; i<count; i++) {
      const slide = slides.nth(i);
      const issues = await slide.evaluate(el => {
        const outer = el.getBoundingClientRect();
        const texts = [...el.querySelectorAll('[data-copy], .payoff')].map(t => ({t, r:t.getBoundingClientRect()}));
        const bad = [];
        for (const {t,r} of texts) {
          if (r.left < outer.left+48 || r.right > outer.right-48 || r.top < outer.top+48 || r.bottom > outer.bottom-40
            || t.scrollWidth > t.clientWidth+1 || t.scrollHeight > t.clientHeight+1) bad.push(`overflow: ${t.innerText}`);
        }
        const regions = [...el.querySelectorAll('h1,.body,.art,.payoff,.bridge,.label')].map(t => ({t,r:t.getBoundingClientRect()}));
        for (let a=0; a<regions.length; a++) for (let b=a+1; b<regions.length; b++) {
          const x=regions[a].r,y=regions[b].r;
          if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>2 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>2)
            bad.push(`overlap: ${regions[a].t.className || regions[a].t.tagName} / ${regions[b].t.className || regions[b].t.tagName}`);
        }
        return bad;
      });
      errors.push(...issues.map(x=>`slide ${i+1}: ${x}`));
      await slide.screenshot({path:path.join(out,`${String(i+1).padStart(2,'0')}.png`)});
    }
    fs.copyFileSync(path.join(out,'01.png'),path.join(out,'cover.png'));
    fs.mkdirSync(path.join(out,'qa'),{recursive:true});
    const hashes = {};
    for (const name of ['slides.html','copy.json','caption.txt','cover.png',...Array.from({length:count},(_,i)=>`${String(i+1).padStart(2,'0')}.png`)])
      hashes[name] = createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex');
    const checksPath = path.join(out,'qa/checks.json');
    const reportPath = path.join(out,'qa/report.md');
    const previous = fs.existsSync(checksPath) ? JSON.parse(fs.readFileSync(checksPath,'utf8')).hashes : null;
    if (fs.existsSync(reportPath) && JSON.stringify(previous) !== JSON.stringify(hashes)) {
      fs.copyFileSync(reportPath,path.join(out,'qa/report.previous.md'));
      fs.writeFileSync(reportPath,'Verdict: PENDING\n\nRender changed. Run content-qa on the new output.\n');
    }
    fs.writeFileSync(checksPath,JSON.stringify({width:1080,height:1350,slides:count,
      mechanical:errors.length?'FAIL':'PASS',errors,hashes},null,2)+'\n');
    console.log(`${count} slides rendered; mechanical ${errors.length?'FAIL':'PASS'}`);
    if(errors.length) throw Error(errors.join('\n'));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
