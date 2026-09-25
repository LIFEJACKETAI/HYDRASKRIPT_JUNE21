const sharp = require('sharp'); const fs = require('fs');
const chars='@%#*+=-:. ';
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
  const meta=await sharp('/tmp/pru_1.jpg').metadata();
  const g=await sharp('/tmp/pru_1.jpg').grayscale().raw().toBuffer();
  const W=meta.width,H=meta.height;
  // darkness of outer ring vs inner
  const ring=(ys,xs)=>{let s=0,c=0; for(const y of ys) for(const x of xs){ s+=g[y*W+x]; c++; } return s/c; };
  console.log('mean outer 6px:', ring([...Array(6).keys()], [...Array(W).keys()]).toFixed(0),
    '| top ring:', ring([...Array(6).keys()], [...Array(W).keys()]).toFixed(0),
    '| left ring:', ring([...Array(H).keys()], [...Array(6).keys()]).toFixed(0),
    '| interior:', ring([...Array(H).keys()], [...Array(W).keys()]).toFixed(0),
    '| edges only 1px:', ring([0],[...Array(W).keys()]).toFixed(0), ring([H-1],[...Array(W).keys()]).toFixed(0),
    '| left1:', ring([...Array(H).keys()],[0]).toFixed(0), 'right1:', ring([...Array(H).keys()],[W-1]).toFixed(0));
  console.log((await blockRender('/tmp/pru_1.jpg', 96)).join('\n'));
})().catch(e=>console.error(e.message));
