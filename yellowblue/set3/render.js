const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const fps=30;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+__dirname+'/idea.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
if(process.argv[2]==='prev'){for(const t of process.argv[3].split(',').map(Number)){await p.evaluate(t=>window.render(t),t);await p.screenshot({path:`/tmp/claude-0/-home-user-bit/08d0e47b-59da-5899-8a12-808f3a941b12/scratchpad/y4_${t}.png`})}await b.close();return}
const dir=__dirname+'/frames';fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);const n=15*fps;
for(let i=0;i<n;i++){await p.evaluate(t=>window.render(t),i/fps);await p.screenshot({path:`${dir}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}
await b.close();console.log('done',n)})();
