import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
await ctx.addInitScript(()=>{localStorage.setItem('orangecy.wordbook','cet4');localStorage.setItem('orangecy.cardsAutoplay','0');localStorage.setItem('orangecy.cardsSpeak','0');});
const page=await ctx.newPage();
await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
await page.locator('.play-button').click();
for (let i=0;i<8;i++){
 await page.waitForTimeout(500);
 const info=await page.evaluate(()=>{
   const singing=[...document.querySelectorAll('.lyric-word.is-singing')];
   const sung=[...document.querySelectorAll('.lyric-word.is-sung')];
   const waiting=[...document.querySelectorAll('.lyric-word.is-waiting')];
   return {t:document.querySelector('.player-time')?.textContent, singing:singing.length, sung:sung.length, waiting:waiting.length,
     color:singing[0]?getComputedStyle(singing[0]).color:null,
     shadow:singing[0]?getComputedStyle(singing[0]).textShadow:null,
     sungColor:sung[0]?getComputedStyle(sung[0]).color:null,
     waitColor:waiting[0]?getComputedStyle(waiting[0]).color:null};
 });
 console.log(i, info);
}
await page.screenshot({path:'/tmp/player-singing.png'});
await browser.close();
