// The Map page, out/map.html, made by mapPage (lib/pages.mjs), and the dot data it draws from,
// copied to out/map-data/. Runs before the Library step, which reads place.inside.
//
// Sets on every place: inside, x, y (metres east and north of the map's origin) and z (ground
// height; 0 outside the dot field). A place without coordinates is not inside and has x, y, z null.
// The dot data belongs to the site's code, so it is found beside this file, not under ctx.root.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locatePlaces } from '../lib/places.mjs';
import { mapPage } from '../lib/pages.mjs';

const MAP_DATA = fileURLToPath(new URL('../map-data/', import.meta.url));
const FILES = ['dots.json', 'dots.bin.gz']; // what the page draws from; the height grid is read here only

export default async function map(ctx) {
  const meta = await locatePlaces(ctx.lib);
  const { html, problems } = mapPage(ctx.lib, { meta, sourceUrl: ctx.sourceUrl });
  ctx.problems.push(...problems);
  await ctx.write('map.html', html);
  for (const file of FILES) await ctx.copyFile(path.join(MAP_DATA, file), `map-data/${file}`);
}
