const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350}});
await p.goto('file://'+__dirname+'/slides.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
const o=__dirname+'/out';require('fs').mkdirSync(o,{recursive:true});
for(let i=1;i<=7;i++)await p.locator('#s'+i).screenshot({path:`${o}/chk-${i}.png`});await b.close()})();
