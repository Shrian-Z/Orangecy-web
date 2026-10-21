import { chromium } from 'playwright-core';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
await ctx.addInitScript(()=>{localStorage.setItem('orangecy.wordbook','cet4');localStorage.setItem('orangecy.cardsAutoplay','0');localStorage.setItem('orangecy.cardsSpeak','0');});
const page=await ctx.newPage();
await page.goto('http://localhost:5173/',{waitUntil:'networkidle'}); await page.waitForTimeout(1800);
for (const [label, setup] of [
  ['player', async()=>{}],
  ['peek', async()=>{await page.locator('.lyric-word.is-target').first().click({force:true}); await page.waitForTimeout(500);}],
  ['imm', async()=>{await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.locator('.cover-expand').first().click({force:true}); await page.waitForTimeout(500);}],
]) {
 await setup();
 const rows=await page.evaluate(()=>{
  const props=['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','textShadow','fill','stroke'];
  const out=[];
  for(const el of document.querySelectorAll('body *')){
    if(['IMG','VIDEO','CANVAS','OPTION'].includes(el.tagName)) continue;
    for(const pseudo of [null,'::before','::after']){
      const cs=getComputedStyle(el,pseudo||undefined);
      if(cs.display==='none'||cs.visibility==='hidden') continue;
      if(pseudo && (!cs.content||cs.content==='none'||cs.content==='normal')) continue;
      for(const p of props){
        if(p.startsWith('border')){const w=parseFloat(cs[p.replace('Color','Width')]); const st=cs[p.replace('Color','Style')]; if(!w||st==='none') continue;}
        if(p==='outlineColor' && (parseFloat(cs.outlineWidth)===0||cs.outlineStyle==='none')) continue;
        if((p==='fill'||p==='stroke')&&!['path','circle','rect','line','polyline','polygon','ellipse','text','use','g','svg'].includes(el.tagName.toLowerCase())) continue;
        const v=cs[p];
        if(v && v!=='none' && /rgba?\(0,\s*0,\s*0,\s*0(?:\.[0-9]+)?\)/.test(v)) out.push({pseudo:p||'',p,tag:el.tagName,cls:String(el.className),v});
      }
    }
  }
  return out;
 });
 console.log(label, JSON.stringify(rows.slice(0,20),null,2), 'count',rows.length);
}
await browser.close();
