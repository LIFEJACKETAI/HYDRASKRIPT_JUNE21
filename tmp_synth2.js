const sharp = require('sharp');
(async()=>{
  const raw = Buffer.alloc(100*100*3, 250);
  for (let y=20;y<60;y++) for(let x=20;x<60;x++){ const o=(y*100+x)*3; raw[o]=60; raw[o+1]=60; raw[o+2]=60; }
  const before = await sharp(raw, { raw: { width:100, height:100, channels:3 } }).png().toBuffer();
  const e = await sharp(before).threshold(100).png().toBuffer();
  const r3 = await sharp(e).raw().toBuffer();
  console.log('RGB threshold(100): distinct', new Set(r3).size, [...new Set(r3)].slice(0,8));
  const blurred = await sharp(before).blur(1.2).png().toBuffer();
  const e2 = await sharp(blurred).threshold(100).png().toBuffer();
  const r4 = await sharp(e2).raw().toBuffer();
  console.log('blur->threshold(100): distinct', new Set(r4).size, [...new Set(r4)].slice(0,8));
  // and the exact real chain but with threshold ON the blurred image using greyscale first
  const lin = await sharp(before).linear(6, 0).png().toBuffer();
  const e3 = await sharp(lin).threshold(60).png().toBuffer();
  const r5 = await sharp(e3).raw().toBuffer();
  console.log('linear(6,0)->threshold(60): distinct', new Set(r5).size, [...new Set(r5)].slice(0,8));
})();
