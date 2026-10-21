import { chromium } from 'playwright-core';
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
for (const width of [390, 320]) {
 const ctx=await b.newContext({viewport:{width,height:844},hasTouch:true});
 await ctx.addInitScript(()=>{localStorage.setItem('orangecy.wordbook','cet4');localStorage.setItem('orangecy.cardsAutoplay','0');localStorage.setItem('orangecy.cardsSpeak','0');});
 const p=await ctx.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}); await p.waitForTimeout(1400);
 console.log(width, await p.evaluate(()=>{const strip=document.querySelector('.check-strip');const rec=document.querySelector('.recommend-chip');return {strip:getComputedStyle(strip).display,rec:rec?.getBoundingClientRect().toJSON(),lyrics:document.querySelector('.lyrics-panel')?.getBoundingClientRect().toJSON(),scrollH:document.documentElement.scrollHeight,innerH:innerHeight};}));
 await p.screenshot({path:`/tmp/final-player-${width}.png`});
 await p.locator('.recommend-chip').click({force:true}); await p.waitForTimeout(500);
 console.log(width,'recommend view?',await p.locator('.recommend-stage').count());
 // go back with brand
 await p.locator('.brand').click({force:true}); await p.waitForTimeout(500);
 console.log(width,'back player?',await p.locator('.stage').count());
 // cards then brand
 const cards=p.locator('.cards-trigger').first(); await cards.click({force:true}); await p.waitForTimeout(700);
 const before=await p.locator('.cards-stage').count();
 await p.locator('.brand').click({force:true}); await p.waitForTimeout(500);
 console.log(width,'cards',before,'back player via brand',await p.locator('.stage').count(),'errs',errors);
 await ctx.close();
}
await b.close();
