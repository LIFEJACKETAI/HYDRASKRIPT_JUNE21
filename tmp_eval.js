const sharp = require('sharp'); const fs = require('fs');
const chars='@%#*+=-:. ';
async function stats(buf){ const s=await sharp(buf).stats(); const g=await sharp(buf).grayscale().raw().toBuffer(); let b=0,w=0,m=0; for(const v of g){ if(v<40)b++; else if(v>=230)w++; else m++; } const n=g.length;
  return {mean:+s.channels[0].mean.toFixed(0), stdev:+s.channels[0].stdev.toFixed(1), black:+(100*b/n).toFixed(1), white:+(100*w/n).toFixed(1), mid:+(100*m/n).toFixed(1)}; }
async function blockRender(buf, W){
  const meta=await sharp(buf).metadata();
  const raw=await sharp(buf).flatten({background:'#fff'}).grayscale().raw().toBuffer();
  const sw=meta.width/W, sh=meta.height/Math.round(W*0.5), H=Math.round(W*0.5);
  const o=[];
  for(let y=0;y<H;y++){ let r=''; for(let x=0;x<W;x++){
    let sum=0,cnt=0; const x0=Math.floor(x*sw),x1=Math.min(meta.width,Math.ceil((x+1)*sw)),y0=Math.floor(y*sh),y1=Math.min(meta.height,Math.ceil((y+1)*sh));
    for(let yy=y0;yy<y1;yy++){const off=yy*meta.width;for(let xx=x0;xx<x1;xx++){sum+=raw[off+xx];cnt++;}}
    r+=chars[Math.min(9,Math.floor((sum/cnt)/256*10))];
  } o.push(r); }
  return o;
}
(async()=>{
  const f = process.argv[2];
  console.log(f.split('/').pop(), JSON.stringify(await stats(f)));
  console.log((await blockRender(f, 96)).join('\n'));
})();
