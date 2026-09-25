const sharp = require('sharp'); const fs = require('fs');
const chars='@%#*+=-:. ';
async function stats(buf){ const s=await sharp(buf).stats(); const g=await sharp(buf).grayscale().raw().toBuffer(); let b=0,w=0,m=0; for(const v of g){ if(v<40)b++; else if(v>=230)w++; else m++; } const n=g.length; return {stdev:+(s.channels[0].stdev).toFixed(1), black:+(100*b/n).toFixed(1), white:+(100*w/n).toFixed(1), mid:+(100*m/n).toFixed(1)}; }
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
function percentile(g, frac){ const h=new Array(256).fill(0); for(const v of g) h[v]++; let t=Math.floor(g.length*frac), acc=0; for(let v=0;v<256;v++){ acc+=h[v]; if(acc>=t) return v; } return 255; }
(async()=>{
  const input=fs.readFileSync('/tmp/pruna_whale.jpg');
  console.log('RAW:', JSON.stringify(await stats(input)));
  const grayRaw=await sharp(input).grayscale().raw().toBuffer();
  let bk=0; for(const v of grayRaw) if(v<40)bk++; const blackFrac=bk/grayRaw.length;
  const gray=await sharp(input).grayscale().toBuffer();
  const local=await sharp(gray).blur(6).toBuffer();
  const dog=await sharp(local).composite([{input:gray,blend:'difference'}]).toBuffer();
  const edges=await sharp(dog).linear(6,0).threshold(30).toBuffer();
  let union;
  if (blackFrac>=0.015) union=edges;
  else { const t=percentile(grayRaw,0.04); const ink=await sharp(gray).threshold(t).negate().toBuffer(); union=await sharp(edges).composite([{input:ink,blend:'lighten'}]).toBuffer(); }
  const thick=await sharp(union).blur(1.2).threshold(55).toBuffer();
  const out=await sharp(thick).negate().png().toBuffer();
  console.log('LINEART:', JSON.stringify(await stats(out)), 'rawBlackFrac', blackFrac.toFixed(3));
  console.log((await blockRender(out, 96)).join('\n'));
})().catch(e=>{console.error(e);process.exit(1)});
