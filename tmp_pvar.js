require('dotenv').config();
const sharp = require('sharp'); const fs = require('fs');
const chars='@%#*+=-:. ';
const WHALE = "A massive humpback whale arches gracefully just below the ocean surface, its massive pectoral fins outstretched, while a cascade of sunlight filters down in golden shafts. Silvery schools of small fish swirl around its belly, and gentle waves ripple outward. In the distant background, faint outlines of other whales migrate along a horizon of soft blue water, creating a sense of grand movement and tranquility.";
const COLOR = /\b(golden|gold|silver|silvery|blue|azure|teal|turquoise|cyan|green|emerald|olive|red|crimson|scarlet|maroon|pink|rose|magenta|purple|violet|indigo|orange|amber|peach|yellow|brown|tan|beige|cream|grey|gray|colourful|colorful|vivid|vibrant|bright|dark|dusky|glowing|glow|luminous|shimmering|sparkling|iridescent|rainbow|gradient|gradients|sunset|sunrise|dusk|dawn|twilight|halo|light|lighting|shadow|shadows|soft|hazy|misty|atmospheric|tranquil)\b/gi;
const scrub = s => s.replace(COLOR,'').replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').replace(/,\s*,/g,',').trim();
async function stats(buf){ const s=await sharp(buf).stats(); const g=await sharp(buf).grayscale().raw().toBuffer(); let b=0,w=0,m=0; for(const v of g){ if(v<40)b++; else if(v>=230)w++; else m++; } const n=g.length; return {black:+(100*b/n).toFixed(1),white:+(100*w/n).toFixed(1),mid:+(100*m/n).toFixed(1),stdev:+s.channels[0].stdev.toFixed(0)}; }
function shadedMid(g,W,H){ const bw=Math.ceil(W/4),bh=Math.ceil(H/4); const d=new Uint8Array(bw*bh);
  for(let y=0;y<H;y++){const o=y*W; for(let x=0;x<W;x++) if(g[o+x]<40) d[(y>>2)*bw+(x>>2)]=1;}
  let mid=0,far=0; for(let y=0;y<H;y++){const o=y*W,by=y>>2; for(let x=0;x<W;x++){const v=g[o+x]; if(v<40||v>=230)continue; mid++;
    const bx=x>>2; let near=0; for(let dy=-1;dy<=1&&!near;dy++){const yy=by+dy; if(yy<0||yy>=bh)continue; for(let dx=-1;dx<=1;dx++){const xx=bx+dx; if(xx>=0&&xx<bw&&d[yy*bw+xx]){near=1;break;}}} if(!near)far++;}}
  return mid? far/mid : 0; }
async function render(buf,W){ const m=await sharp(buf).metadata(); const raw=await sharp(buf).flatten({background:'#fff'}).grayscale().raw().toBuffer();
  const H=Math.round(W*0.5), sw=m.width/W, sh=m.height/H, o=[];
  for(let y=0;y<H;y++){let r='';for(let x=0;x<W;x++){let s=0,c=0;const x0=Math.floor(x*sw),x1=Math.min(m.width,Math.ceil((x+1)*sw)),y0=Math.floor(y*sh),y1=Math.min(m.height,Math.ceil((y+1)*sh));
    for(let yy=y0;yy<y1;yy++){const o2=yy*m.width;for(let xx=x0;xx<x1;xx++){s+=raw[o2+xx];c++;}} r+=chars[Math.min(9,Math.floor(s/c/256*10))];}o.push(r);} return o.join('\n'); }
async function pruna(prompt, name){
  const r = await fetch('https://api.pruna.ai/v1/predictions',{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.PRUNA_AI_API_KEY,Model:'p-image','Try-Sync':'true'},body:JSON.stringify({input:{prompt,aspect_ratio:'1:1',seed:777}}),signal:AbortSignal.timeout(90000)});
  const j=await r.json(); if(!j.generation_url) return {status:r.status, err:JSON.stringify(j).slice(0,150)};
  const im=await fetch(j.generation_url); const buf=Buffer.from(await im.arrayBuffer());
  fs.writeFileSync('/tmp/pv_'+name+'.jpg',buf);
  const m=await sharp(buf).metadata(); const g=await sharp(buf).grayscale().raw().toBuffer();
  return { ...(await stats(buf)), midFar:+shadedMid(g,m.width,m.height).toFixed(2) };
}
const A = "Coloring book page: Unders undersea illustration of, " + WHALE + ". intricate fine detail, evenly weighted continuous lines, ornate patterns, professional adult coloring-book quality. Render as clean black contour lines on a pure white background — a professional coloring-book outline drawing. Absolutely no color, no grayscale tones, no shading, no shadows, no gradients, no hatching, no cross-hatching, no stippling, no solid filled black areas, no texture, no photorealism, no pencil sketch. Only crisp continuous black outlines with white space left to color in.";
const B = "Adult coloring book line art. Pure white background with intricate black outline drawings only. Subject: " + scrub(WHALE) + ". Draw every element as clean even-weight black contour lines with white space inside each shape to color in. No color, no shading, no gradients, no fills.";
const C = "Adult coloring book line art. Pure white background with intricate black outline drawings only. Subject: " + WHALE + ". Ignore every mention of color, light, or mood and render the subject as clean even-weight black contour lines with white space inside each shape to color in. No color, no shading, no gradients, no fills.";
(async()=>{
  for (const [n,p] of [['A_control',A],['B_scrub',B],['C_ignorecolor',C]]) {
    console.log(n, JSON.stringify(await pruna(p,n)));
  }
  console.log('\n--- B render ---'); console.log(await render(fs.readFileSync('/tmp/pv_B_scrub.jpg'),96));
})();
