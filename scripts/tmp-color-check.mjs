import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

function checkColor(value) {
  const s = String(value || '');
  if (!s || s === 'none' || s === 'normal' || s === 'auto') return true;
  const re = /rgba?\(([^)]*)\)/gi;
  let m, any = false;
  while ((m = re.exec(s))) {
    any = true;
    const parts = m[1].split(',').map(x => parseFloat(x.trim()));
    const [r,g,b,a=1] = parts;
    if (a === 0) continue;
    const blue = r === 0 && g === 47 && b === 167;
    const white = r === 255 && g === 255 && b === 255;
    if (!blue && !white) return false;
  }
  if (!any) {
    if (/currentcolor|transparent/i.test(s)) return true;
    return null;
  }
  return true;
}

async function scan(page, label) {
  await page.waitForTimeout(1200);
  const result = await page.evaluate(() => {
    const props = ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','textShadow','fill','stroke'];
    const rows = [];
    const allColors = new Set();
    function inspect(el, pseudo) {
      const tag = el.tagName;
      if (['IMG','VIDEO','CANVAS','OPTION'].includes(tag)) return;
      const cs = getComputedStyle(el, pseudo || undefined);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (pseudo) {
        const c = cs.content;
        if (!c || c === 'none' || c === 'normal') return;
      }
      if (!pseudo) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
      }
      const data = { tag, cls: el.className && typeof el.className === 'string' ? el.className : '', pseudo: pseudo || '', props: {} };
      for (const p of props) {
        if ((p === 'fill' || p === 'stroke') && !['path','circle','rect','line','polyline','polygon','ellipse','text','use','g','svg'].includes(tag)) continue;
        if (p.startsWith('border') || p === 'outlineColor') {
          const w = p.replace('Color','Width');
          if (parseFloat(cs[w]) === 0 || cs[p.replace('Color','Style')] === 'none') continue;
        }
        const v = cs[p];
        if (!v || v === 'none') continue;
        data.props[p] = v;
        allColors.add(v);
      }
      const bgImg = cs.backgroundImage;
      const mask = cs.maskImage || cs.webkitMaskImage;
      if (bgImg && bgImg !== 'none') { data.props.backgroundImage = bgImg; allColors.add(bgImg); }
      if (mask && mask !== 'none') { data.props.maskImage = mask; allColors.add(mask); }
      if (Object.keys(data.props).length) rows.push(data);
    }
    for (const el of document.querySelectorAll('body *')) {
      inspect(el, null);
      inspect(el, '::before');
      inspect(el, '::after');
    }
    return { rows, allColors: [...allColors] };
  });
  const allowed = (s) => {
    if (/gradient\(/i.test(s)) return false;
    if (/url\(/i.test(s)) return true; // not expected in these two pages; inspect separately
    const r = checkColor(s);
    return r !== false;
  };
  const violations = [];
  for (const row of result.rows) {
    for (const [prop, val] of Object.entries(row.props)) {
      if (!allowed(val)) violations.push({ tag: row.tag, cls: row.cls, pseudo: row.pseudo, prop, val });
    }
  }
  const gradient = result.rows.flatMap(row => Object.entries(row.props).filter(([p,v]) => /gradient\(/i.test(v)).map(([p,v]) => ({tag:row.tag,cls:row.cls,pseudo:row.pseudo,prop:p,val:v})));
  const badColors = [...new Set(result.allColors)].filter(s => !allowed(s));
  console.log(`\n=== ${label} ===`);
  console.log('elements/pseudos with paint:', result.rows.length);
  console.log('unique paint values:', result.allColors.length);
  console.log('forbidden assertions:', violations.length);
  console.log(JSON.stringify(violations.slice(0, 30), null, 2));
  console.log('gradients:', gradient.length, JSON.stringify(gradient.slice(0,10), null, 2));
  console.log('non-palette color strings:', badColors.length);
  console.log(JSON.stringify(badColors.slice(0,40), null, 2));
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem('orangecy.wordbook','cet4');
  localStorage.setItem('orangecy.cardsAutoplay','0');
  localStorage.setItem('orangecy.cardsSpeak','0');
});
const page = await context.newPage();
await page.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await page.waitForTimeout(1500);
await scan(page, 'player');
// open word peek and scan again
const target = page.locator('.lyric-word.is-target').nth(0);
await target.click({ force:true });
await page.waitForTimeout(600);
await scan(page, 'player + word peek');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.locator('.cards-trigger').first().click({ force:true }).catch(async()=>{
  await page.locator('.nav-item', {hasText:'词卡'}).first().click();
});
await page.waitForTimeout(1200);
await scan(page, 'word cards');
await browser.close();
