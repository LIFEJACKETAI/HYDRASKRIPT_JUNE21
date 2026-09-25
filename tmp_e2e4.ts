import 'dotenv/config';
import fs from 'fs';
import type { ColoringTheme } from '@/types';
const OWNER = 'ef8077c4-31cd-4430-b4a3-30a297b46100';
const SUBJECTS: [string,string|null,string|null][] = [
  ['WHALE','undersea-creatures',"A massive humpback whale arches gracefully just below the ocean surface, its massive pectoral fins outstretched, while a cascade of sunlight filters down in golden shafts. Silvery schools of small fish swirl around its belly, and gentle waves ripple outward. In the distant background, faint outlines of other whales migrate along a horizon of soft blue water, creating a sense of grand movement and tranquility."],
  ['FERRARI',null,"A sleek Ferrari LaFerrari cruising along a winding coastal highway at sunset, with cliffs on one side, ocean waves crashing below, palm trees silhouetted against a gradient sky of orange and pink, sun low on horizon casting long shadows, the car's aerodynamic lines emphasized, subtle motion blur lines to suggest speed, background includes a distant lighthouse."],
  ['FARM',null,'A group of farm animals near a red barn with a tractor'],
  ['CASTLE',null,'A friendly dragon flying over a castle with fluffy clouds'],
];
(async () => {
  const { generateColoringPage } = await import('@/lib/services/imageService');
  for (let i=0;i<SUBJECTS.length;i++){
    const [label,theme,subject]=SUBJECTS[i];
    const t0=Date.now();
    const res = await generateColoringPage(`55555555-5555-5555-5555-55555555555${i}`, OWNER, 0, subject || '', theme as ColoringTheme | null);
    console.log(`RESULT ${label}: ${res.success?'OK '+res.publicUrl:'ERR '+res.error} [${((Date.now()-t0)/1000).toFixed(0)}s]`);
  }
  const files=fs.readdirSync('public/assets/illustrations').filter(f=>f.startsWith('coloring_page'));
  for(const f of files) console.log('FILE', f);
})().catch(e=>console.error('TOP', e));
