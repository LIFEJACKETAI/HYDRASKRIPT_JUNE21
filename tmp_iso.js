const sharp = require('sharp'); const fs = require('fs');
function hist(buf){ const s=new Set(buf); return {distinct:s.size, sample:[...s].slice(0,6)}; }
(async()=>{
  const input = fs.readFileSync('/tmp/pruna_full_e2e.jpg');
  const gray = await sharp(input).grayscale().toBuffer();
  const localMean = await sharp(gray).blur(6).toBuffer();
  const dog = await sharp(localMean).composite([{input:gray,blend:'difference'}]).toBuffer();
  const lin = await sharp(dog).linear(6,0).toBuffer();
  const edges = await sharp(lin).threshold(30).toBuffer();
  console.log('lin:', JSON.stringify(hist(await sharp(lin).greyscale().raw().toBuffer())));
  console.log('edges(after threshold30):', JSON.stringify(hist(await sharp(edges).greyscale().raw().toBuffer())));
  const blurred = await sharp(edges).blur(1.2).toBuffer();
  console.log('blurred:', JSON.stringify(hist(await sharp(blurred).greyscale().raw().toBuffer())));
  const thr = await sharp(blurred).threshold(55).toBuffer();
  console.log('thr55:', JSON.stringify(hist(await sharp(thr).greyscale().raw().toBuffer())));
  // explicit greyscale + threshold on single band
  const bw = await sharp(blurred).toColourspace('b-w').toBuffer();
  console.log('b-w:', JSON.stringify(hist(await sharp(bw).raw().toBuffer())));
  const thr2 = await sharp(bw).threshold(55).toBuffer();
  console.log('b-w->thr55:', JSON.stringify(hist(await sharp(thr2).raw().toBuffer())));
})();
