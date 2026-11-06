const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const dir=__dirname;
 let p=await b.newPage({viewport:{width:1080,height:1350}});
 await p.goto('file://'+dir+'/slides.html');await p.evaluate(()=>document.fonts.ready);
 for(let i=1;i<=7;i++){await p.locator('#s'+i).screenshot({path:`${dir}/slides/slide-${i}.png`});}
 await p.close();
 const ctx=await b.newContext({viewport:{width:1080,height:1920},recordVideo:{dir:dir+'/out',size:{width:1080,height:1920}}});
 p=await ctx.newPage();await p.goto('file://'+dir+'/reel.html');
 await p.waitForFunction(()=>window.__done,null,{timeout:60000});
 const v=p.video();await ctx.close();console.log(await v.path());await b.close()})();
