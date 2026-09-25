const sharp = require('sharp');
(async()=>{
  // synthetic: white 100x100 with a black-ish 40x40 gray block
  const raw = Buffer.alloc(100*100*3, 250);
  for (let y=20;y<60;y++) for(let x=20;x<60;x++){ const o=(y*100+x)*3; raw[o]=60; raw[o+1]=60; raw[o+2]=60; }
  const img = sharp(raw, { raw: { width:100, height:100, channels:3 } });
  const before = await img.clone().png().toBuffer();
  const after = await sharp(before).threshold(55).png().toBuffer();
  const r = await sharp(after).raw().toBuffer();
  const set = new Set(r);
  console.log('RGB input threshold(55): distinct', set.size, [...set].slice(0,8));
  // greyscale version
  const g = await sharp(before).grayscale().png().toBuffer();
  const g2 = await sharp(g).threshold(55).png().toBuffer();
  const r2 = await sharp(g2).raw().toBuffer();
  console.log('gray input threshold(55): distinct', new Set(r2).size, 'channels', (await sharp(g2).metadata()).channels);
  // full pipeline on synthetic
  const lin = await sharp(before).linear(6, 0).toBuffer();
  const e = await sharp(lin).threshold(30).png().toBuffer();
  const r3 = await sharp(e).raw().toBuffer();
  console.log('RGB linear->threshold(30): distinct', new Set(r3).size, 'channels', (await sharp(e).metadata()).channels, [...new Set(r3)].slice(0,8));
})();
