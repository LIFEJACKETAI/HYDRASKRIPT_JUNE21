const sharp = require('sharp'); const fs = require('fs');
function shadedMidFraction(grayRaw, width, height) {
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4);
  const dark = new Uint8Array(bw * bh);
  for (let y = 0; y < height; y++) { const off = y * width;
    for (let x = 0; x < width; x++) if (grayRaw[off + x] < 40) dark[(y >> 2) * bw + (x >> 2)] = 1; }
  let mid = 0, midFar = 0;
  for (let y = 0; y < height; y++) { const off = y * width, by = y >> 2;
    for (let x = 0; x < width; x++) {
      const v = grayRaw[off + x]; if (v < 40 || v >= 230) continue; mid++;
      const bx = x >> 2; let near = 0;
      for (let dy = -1; dy <= 1 && !near; dy++) { const yy = by + dy; if (yy < 0 || yy >= bh) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = bx + dx; if (xx >= 0 && xx < bw && dark[yy * bw + xx]) { near = 1; break; } } }
      if (!near) midFar++;
    } }
  return mid > 0 ? midFar / mid : 0;
}
(async()=>{
  const files = [
    ['REFERENCE good line art', 'public/TAJ-MAHAL_ADULT_COLORING_PAGE.png'],
    ['pruna shaded e2e (bad)', '/tmp/pruna_full_e2e.jpg'],
    ['pru_1 thin line raw', '/tmp/pru_1.jpg'],
    ['pruna_whale framed raw', '/tmp/pruna_whale.jpg'],
    ['taj child faint sketch', '/tmp/raw_TAJ-CHILD.jpg'],
    ['poll dark shaded', '/tmp/poll_color.png'],
  ];
  for (const [label, f] of files) {
    if (!fs.existsSync(f)) { console.log(label, 'MISSING'); continue; }
    const stats = await sharp(f).stats();
    const means = stats.channels.slice(0,3).map(c=>c.mean);
    const spread = Math.max(...means) - Math.min(...means);
    const meta = await sharp(f).metadata();
    const g = await sharp(f).grayscale().raw().toBuffer();
    let b=0,w=0; for (const v of g){ if(v<40)b++; else if(v>=230)w++; }
    const bf=b/g.length, wf=w/g.length;
    const midFar = shadedMidFraction(g, meta.width, meta.height);
    const pass = spread<=10 && bf>=0.008 && bf<=0.2 && wf>=0.60 && midFar<=0.45;
    console.log(label.padEnd(30), 'spread', spread.toFixed(0), 'black%', (100*bf).toFixed(1), 'white%', (100*wf).toFixed(1), 'midFar', midFar.toFixed(2), '=> alreadyLineArt SKIP:', pass);
  }
})();
