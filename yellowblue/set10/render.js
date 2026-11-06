const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const v=process.argv[2],fps=30;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('http://127.0.0.1:8765/s.html?v='+v);await p.evaluate(()=>document.fonts.ready);
await p.waitForFunction(()=>!window.isReady||window.isReady(),null,{timeout:30000});await p.waitForTimeout(400);
if(process.argv[3]==='prev'){for(const t of process.argv[4].split(',').map(Number)){await p.evaluate(t=>window.render(t),t);await p.screenshot({path:`/tmp/claude-0/-home-user-bit/08d0e47b-59da-5899-8a12-808f3a941b12/scratchpad/n10_${v}_${t}.png`})}await b.close();return}
const dir=__dirname+'/frames_'+v;fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);const n=Math.round((await p.evaluate(()=>window.DUR))*fps);
for(let i=0;i<n;i++){await p.evaluate(t=>window.render(t),i/fps);await p.screenshot({path:`${dir}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}
await b.close();console.log('done',v,n)})();
