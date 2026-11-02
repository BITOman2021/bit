const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const v=process.argv[2],fps=30;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+__dirname+'/ads.html?v='+v);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
const dur=await p.evaluate(()=>window.DUR);const dir=__dirname+'/frames_'+v;fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);
const n=Math.round(dur*fps);for(let i=0;i<n;i++){await p.evaluate(t=>window.render(t),i/fps);await p.screenshot({path:`${dir}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});}
await b.close();console.log('done',v,n)})();
