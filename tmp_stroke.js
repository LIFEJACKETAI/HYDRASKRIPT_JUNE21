const sharp=require('sharp'); const fs=require('fs');
(async()=>{
  for (const f of ['/tmp/pv_A_control.jpg','/tmp/pv_B_scrub.jpg','/tmp/pv_C_ignorecolor.jpg','public/TAJ-MAHAL_ADULT_COLORING_PAGE.png']) {
    if(!fs.existsSync(f)) { console.log(f,'MISSING'); continue; }
    const m=await sharp(f).metadata(); const g=await sharp(f).flatten({background:'#fff'}).grayscale().raw().toBuffer();
    const W=m.width,H=m.height;
    const runs=[];
    for(let y=0;y<H;y+=2){ const o=y*W; let run=0;
      for(let x=0;x<W;x++){ if(g[o+x]<128){ run++; } else { if(run>0) runs.push(run); run=0; } }
      if(run>0) runs.push(run); }
    runs.sort((a,b)=>a-b);
    const pct = p => runs.length? runs[Math.min(runs.length-1, Math.floor(runs.length*p))] : 0;
    console.log(f.split('/').pop().padEnd(38), 'W='+W, 'runs='+runs.length, 'p25='+pct(0.25), 'p50='+pct(0.5), 'p75='+pct(0.75), 'p90='+pct(0.9));
  }
})();
