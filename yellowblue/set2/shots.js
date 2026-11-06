const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350}});
await p.goto('file://'+__dirname+'/slides.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
const o='/home/user/bit/yellowblue/set2/out';require('fs').mkdirSync(o,{recursive:true});
for(let i=1;i<=8;i++)await p.locator('#s'+i).screenshot({path:`${o}/gsw-${i}.png`});await b.close()})();
