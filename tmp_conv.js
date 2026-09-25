const sharp = require('sharp'); const fs = require('fs');
(async()=>{
  const input = fs.readFileSync('/tmp/pruna_full_e2e.jpg');
  const grayRaw = await sharp(input).grayscale().raw().toBuffer();
  let bk=0; for (const v of grayRaw) if (v<40) bk++; const blackFrac = bk/grayRaw.length;
  const gray = await sharp(input).grayscale().toBuffer();
  const localMean = await sharp(gray).blur(6).toBuffer();
  const dog = await sharp(localMean).composite([{input:gray,blend:'difference'}]).toBuffer();
  const edges = await sharp(dog).linear(6,0).threshold(30).toBuffer();
  let union;
  if (blackFrac >= 0.015) union = edges;
  else { const hist=new Array(256).fill(0); for(const v of grayRaw) hist[v]++; let t=Math.floor(grayRaw.length*0.04),acc=0,th=255;
    for(let v=0;v<256;v++){acc+=hist[v]; if(acc>=t){th=v;break;}}
    const ink=await sharp(gray).threshold(th).negate().toBuffer();
    union=await sharp(edges).composite([{input:ink,blend:'lighten'}]).toBuffer(); }
  const thickened = await sharp(union).blur(1.2).threshold(55).toBuffer();
  const out = await sharp(thickened).negate().png().toBuffer();
  const g = await sharp(out).grayscale().raw().toBuffer();
  let b=0,w=0,m=0; for(const v of g){ if(v<40)b++; else if(v>=230)w++; else m++; }
  console.log('rawBlackFrac', blackFrac.toFixed(3), '-> output black%', (100*b/g.length).toFixed(1), 'white%', (100*w/g.length).toFixed(1), 'mid%', (100*m/g.length).toFixed(1));
  // distinct values present
  const set=new Set(g); console.log('distinct values:', set.size, [...set].slice(0,10));
})();
