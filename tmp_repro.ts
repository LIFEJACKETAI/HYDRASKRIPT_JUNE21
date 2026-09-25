import fs from 'fs';
(async () => {
  const { generateColoringPage } = await import('@/lib/services/imageService');
  const subject = "A massive humpback whale arches gracefully just below the ocean surface, its massive pectoral fins outstretched, while a cascade of sunlight filters down in golden shafts. Silvery schools of small fish swirl around its belly, and gentle waves ripple outward. In the distant background, faint outlines of other whales migrate along a horizon of soft blue water, creating a sense of grand movement and tranquility.";
  const res = await generateColoringPage(
    "458052cb-a011-489c-9f8d-74f04c0bd0d3",
    "00000000-0000-0000-0000-000000000000",
    0,
    subject,
    "undersea-creatures" as any,
  );
  console.log("RESULT:", JSON.stringify(res, null, 1).slice(0, 800));
})().catch(e => console.error("TOPLEVEL", e));
