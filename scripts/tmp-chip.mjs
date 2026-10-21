import { chromium } from 'playwright-core';
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true});
await ctx.addInitScript(()=>{localStorage.setItem('orangecy.wordbook','cet4')});
const p=await ctx.newPage(); await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
console.log(await p.evaluate(()=>{
 const strip=document.querySelector('.check-strip'); const rec=document.querySelector('.recommend-chip');
 const cs=strip?getComputedStyle(strip):null; const cr=rec?getComputedStyle(rec):null;
 return {stripExists:!!strip, stripDisplay:cs?.display, stripRect:strip?.getBoundingClientRect().toJSON(), recDisplay:cr?.display, recRect:rec?.getBoundingClientRect().toJSON(), art:document.querySelector('.art-column')?.getBoundingClientRect().toJSON(), lyrics:document.querySelector('.lyrics-panel')?.getBoundingClientRect().toJSON()};
}));
await b.close();
