// The kinds of entry: library/content/kinds.json groups the row types under a few names ("Press":
// Newspaper page, Press article, Magazine), in the order the Library page offers them. A library
// without the file has no kinds. Nothing here throws; every fault becomes a problem.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TYPES } from './records.mjs';

const WHERE = 'library/content/kinds.json';

// -> { kinds: [{ id, label, types }], problems: [{ level, where, message }] }
export async function readKinds(root) {
  const problems = [];
  const report = (level, message) => problems.push({ level, where: WHERE, message });
  let text;
  try {
    text = await readFile(path.join(root, ...WHERE.split('/')), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') report('error', `cannot be read: ${error.message}`);
    return { kinds: [], problems };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    report('error', `is not JSON: ${error.message}`);
    return { kinds: [], problems };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    report('error', 'expected an object of kinds, each with a label and its types');
    return { kinds: [], problems };
  }

  const kinds = [];
  const owner = new Map(); // type -> id of the kind that named it first
  for (const [id, value] of Object.entries(data)) {
    const types = [];
    for (const type of Array.isArray(value?.types) ? value.types.map(String) : []) {
      if (owner.has(type)) {
        report('warn', `type "${type}" is named by "${owner.get(type)}" and again by "${id}": it stays with the first`);
        continue;
      }
      if (!TYPES.includes(type)) report('warn', `kind "${id}" names "${type}", which is not a row type`);
      owner.set(type, id);
      types.push(type);
    }
    kinds.push({ id, label: String(value?.label ?? id), types });
  }
  return { kinds, problems };
}

// The id of the kind that names `type`, or null.
export function kindOf(type, kinds) {
  return kinds.find((kind) => kind.types.includes(type))?.id ?? null;
}
