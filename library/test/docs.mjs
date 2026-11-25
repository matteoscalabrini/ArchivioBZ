// A small valid archive document for the tests of the cloud code: chapters c1, c2… holding the
// row ids given, each row minimal, and a few keywords, one alias and one place so that a test can
// use them. Passes checkDoc; `next` lies past the ids used.
export function sampleDoc(shape = { c1: ['a', 'b', 'c'], c2: ['d'] }) {
  const ids = Object.values(shape).flat();
  return {
    v: 1,
    chapters: Object.entries(shape).map(([id, rows]) => ({ id, title: `Chapter ${id}`, rows: [...rows] })),
    rows: Object.fromEntries(ids.map((id) => [id, {
      hidden: false,
      record: { title: `Row ${id}`, type: 'Poster', date: '', year: null, keywords: [], text: [] },
      find: { on: [], shows: [], colours: [], names: [] },
      pictures: [],
      thumb: null,
    }])),
    keywords: { wall: { label: 'Wall' }, poster: { label: 'Poster' }, march: { label: 'March' } },
    aliases: { walls: 'wall' },
    places: { piazza: { name: 'Piazza', lat: 46.5, lon: 11.35, inside: true, x: 10, y: 20, z: 0 } },
    idea: '',
    about: '',
    next: { row: 1, chapter: Object.keys(shape).length + 1 },
  };
}

// One chapter of n rows, a, b, c…
export const sampleWith = (n) => sampleDoc({ c1: Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i)) });
