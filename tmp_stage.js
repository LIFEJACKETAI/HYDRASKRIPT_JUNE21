const sharp = require('sharp'); const fs = require('fs');
(async()=>{
  const input = fs.readFileSync('/tmp/pruna_full_e2e.jpg');
  const gray = await sharp(input).grayscale().toBuffer();
  const localMean = await sharp(gray).blur(6).toBuffer();
  const dog = await sharp(localMean).composite([{input:gray,blend:'difference'}]).toBuffer();
  const edges = await sharp(dog).linear(6,0).threshold(30).toBuffer();
  for (const [name, buf] of [['gray',gray],['localMean',localMean],['dog',dog],['edges',edges]]) {
    const m = await sharp(buf).metadata();
    console.log(name, 'channels', m.channels, 'alpha', m.hasAlpha, 'fmt', m.format, 'space', m.space);
  }
  const thickened = await sharp(edges).blur(1.2).threshold(55).toBuffer();
  const m2 = await sharp(thickened).metadata();
  console.log('thickened', 'channels', m2.channels, 'alpha', m2.hasAlpha, 'fmt', m2.format);
  const g = await sharp(thickened).grayscale().raw().toBuffer();
  let m=0; for(const v of g) if(v>=40&&v<230)m++;
  console.log('thickened mid%', (100*m/g.length).toFixed(1));
  // now try: explicit removeAlpha before threshold
  const noAlpha = await sharp(edges).removeAlpha().toBuffer();
  const t2 = await sharp(noAlpha).blur(1.2).threshold(55).toBuffer();
  const g2 = await sharp(t2).grayscale().raw().toBuffer();
  let b=0,w=0,mn=0; for(const v of g2){ if(v<40)b++; else if(v>=230)w++; else mn++; }
  console.log('removeAlpha->blur->threshold: black%', (100*b/g2.length).toFixed(1), 'white%', (100*w/g2.length).toFixed(1), 'mid%', (100*mn/g2.length).toFixed(1));
  const mm = await sharp(t2).metadata(); console.log('t2 channels', mm.channels, 'alpha', mm.hasAlpha);
})();
