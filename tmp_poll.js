const subject = "A massive humpback whale arches gracefully just below the ocean surface, its massive pectoral fins outstretched, while a cascade of sunlight filters down in golden shafts. Silvery schools of small fish swirl around its belly, and gentle waves ripple outward. In the distant background, faint outlines of other whales migrate along a horizon of soft blue water, creating a sense of grand movement and tranquility.";
const prefix = "Coloring book page:"; // plus themes prefix 'undersea-creatures'
const adult = "simple bold outlines, thick continuous lines, large open areas, for children to color";
const promptPlain = "An undersea scene of a humpback whale under the ocean surface with sunlight, fish, gentle waves"; // theme prefix short
const prompt = `Coloring book page: ${prefix} ${subject}. ${adult}. Render as clean black contour lines on a pure white background — a professional coloring-book outline drawing. Absolutely no color, no grayscale tones, no shading, no shadows, no gradients, no hatching, no cross-hatching, no stippling, no solid filled black areas, no texture, no photorealism, no pencil sketch. Only crisp continuous black outlines with white space left to color in.`;
async function t(label, p, qs) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?${qs}`;
  const r = await fetch(url);
  const ct = r.headers.get('content-type') || '';
  const buf = await r.arrayBuffer();
  console.log(label, r.status, ct, 'bytes:', buf.byteLength, 'urlLen:', url.length);
  return r.status;
}
(async () => {
  await t('FULL-long   flux nologo', prompt, "width=1024&height=1024&model=flux&seed=12345&nologo=true");
  await t('FULL-long   flux', prompt, "width=1024&height=1024&model=flux&seed=12345");
  await t('FULL-long   no-model', prompt, "width=1024&height=1024&seed=12345");
  await t('SHORT       flux nologo', promptPlain, "width=1024&height=1024&model=flux&seed=12345&nologo=true");
})().catch(e=>console.error(e.message));
