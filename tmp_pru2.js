require('dotenv').config();
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
async function stats(buf){ const s=await sharp(buf).stats(); const g=await sharp(buf).grayscale().raw().toBuffer(); let b=0,w=0; for(const v of g){ if(v<40)b++; else if(v>=230)w++; } return {mean:+(s.channels[0].mean).toFixed(0), stdev:+(s.channels[0].stdev).toFixed(1), black:+(100*b/g.length).toFixed(1), white:+(100*w/g.length).toFixed(1)}; }
async function pruna(prompt, name){
  const key = process.env.PRUNA_AI_API_KEY;
  const body = { input: { prompt, aspect_ratio: "1:1", seed: 42 } };
  const r = await fetch("https://api.pruna.ai/v1/predictions", { method:"POST", headers:{ "Content-Type":"application/json", apikey:key, Model:"p-image", "Try-Sync":"true" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const j = await r.json();
  if (j.generation_url) {
    const img = await fetch(j.generation_url, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await img.arrayBuffer());
    fs.writeFileSync('/tmp/'+name+'.jpg', buf);
    return { status: r.status, stats: await stats(buf), byteLen: buf.length };
  }
  return { status: r.status, body: JSON.stringify(j).slice(0,200) };
}
(async()=>{
  const v1 = "Black line art coloring book drawing of a humpback whale swimming under the ocean with sunlight rays, silvery fish, and gentle waves. Thick clean black contour outlines only, pure white background, no shading, no gray tones, no color, no fills, no frame border. Simple bold outlines with large open white areas to color.";
  const v2 = "Black outline drawing, coloring book style: a humpback whale beneath the ocean surface with light rays and fish. Pure white background, clean continuous black contour lines of even weight, generous white space, absolutely no shading, no hatching, no gray, no color, no border frame.";
  for (const [i,p] of [[1,v1],[2,v2]]) {
    const res = await pruna(p, 'pru_'+i);
    console.log('variant'+i, JSON.stringify(res));
  }
  console.log('--- RAW whale render ---');
  console.log((await blockRender(fs.readFileSync('/tmp/pruna_whale.jpg'), 96)).join('\n'));
})().catch(e=>{console.error(e.message)});
