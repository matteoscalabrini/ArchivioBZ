// The last step: every JPEG the build wrote loses the metadata a camera or an editor put in it
// (lib/metadata.mjs): camera, time, GPS position, comments. Only a turned picture keeps its
// orientation. A JPEG that cannot be read is a warning and stays as it is.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripJpeg } from '../lib/metadata.mjs';

export default async function metadata(ctx) {
  const names = (await readdir(ctx.out, { recursive: true })).filter((name) => /\.jpe?g$/i.test(name));
  for (const name of names) {
    const file = path.join(ctx.out, name);
    const buf = await readFile(file);
    const bare = stripJpeg(buf);
    if (!bare) {
      ctx.problems.push({ level: 'warn', where: name.split(path.sep).join('/'), message: 'a JPEG whose metadata cannot be read, published as it is' });
      continue;
    }
    if (bare.length !== buf.length || !bare.equals(buf)) await writeFile(file, bare);
  }
}
