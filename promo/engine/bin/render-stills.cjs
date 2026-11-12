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
    const boxes = [];
    const renderedCopy = [];
    const count = await slides.count();
    for (let i=0; i<count; i++) {
      const slide = slides.nth(i);
      const issues = await slide.evaluate(el => {
        const outer = el.getBoundingClientRect();
        const bad = [];
        const hit = (x, y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2;
        // Copy stays inside the safe margin, never clips, and is big enough to read on a phone (IG shows 1080px at ~390pt).
        for (const t of el.querySelectorAll('[data-copy]')) {
          const r = t.getBoundingClientRect();
          if (r.left < outer.left+60 || r.right > outer.right-60 || r.top < outer.top+60 || r.bottom > outer.bottom-60
            || t.scrollWidth > t.clientWidth+1 || t.scrollHeight > t.clientHeight+1) bad.push(`overflow: ${t.innerText}`);
          const min = t.closest('.meta') ? 26 : 30;
          for (const n of [t, ...t.querySelectorAll('*')]) {
            if ([...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < min)
              bad.push(`text under ${min}px: ${n.innerText.slice(0, 40)}`);
          }
        }
        // Nothing outside the headline block may sit on top of it.
        const text = el.querySelector('.text');
        if (text) {
          const tr = text.getBoundingClientRect();
          for (const t of el.querySelectorAll('[data-region],[data-copy]')) {
            if (text.contains(t) || t.contains(text)) continue;
            if (hit(tr, t.getBoundingClientRect())) bad.push(`overlaps headline block: ${t.className || t.tagName} ${t.innerText.slice(0, 30)}`);
          }
        }
        // Copy blocks inside the visual must not collide with each other.
        const loose = [...el.querySelectorAll('[data-copy]')].filter(t => !text || !text.contains(t));
        for (let a=0; a<loose.length; a++) for (let b=a+1; b<loose.length; b++) {
          if (loose[a].contains(loose[b]) || loose[b].contains(loose[a])) continue;
          if (hit(loose[a].getBoundingClientRect(), loose[b].getBoundingClientRect())) bad.push(`copy overlap: ${loose[a].innerText.slice(0,20)} / ${loose[b].innerText.slice(0,20)}`);
        }
        return bad;
      });
      errors.push(...issues.map(x=>`slide ${i+1}: ${x}`));
      const measured = await slide.evaluate(el => {
        const outer = el.getBoundingClientRect();
        return [...el.querySelectorAll('[data-copy]')].map(t => {
          const r = t.getBoundingClientRect();
          return {text:t.innerText.trim(), bbox:[r.left-outer.left,r.top-outer.top,r.width,r.height]};
        }).filter(x => x.text);
      });
      for (const item of measured) {
        boxes.push({slide:i+1, file:`${String(i+1).padStart(2,'0')}.png`, ...item});
        renderedCopy.push({slide:i+1,text:item.text});
      }
      await slide.screenshot({path:path.join(out,`${String(i+1).padStart(2,'0')}.png`)});
    }
    fs.copyFileSync(path.join(out,'01.png'),path.join(out,'cover.png'));
    fs.mkdirSync(path.join(out,'qa'),{recursive:true});
    const evidencePath = path.join(out,'qa/evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify({
      viewer_files:[...Array.from({length:count},(_,i)=>`${String(i+1).padStart(2,'0')}.png`),'cover.png'],
      key_text_boxes:boxes, rendered_copy:renderedCopy,
      renderer:{name:'stills/playwright',width:1080,height:1350,slides:count},
    },null,2)+'\n');
    const hashes = {};
    for (const name of ['slides.html','copy.json','content.json','caption.txt','cover.png','qa/evidence.json',...Array.from({length:count},(_,i)=>`${String(i+1).padStart(2,'0')}.png`)])
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
