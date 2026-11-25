// The idea text: an optional first line `status: stand-in`, then paragraphs separated by blank
// lines. `[[shown words|keyword]]` or `[[keyword]]` marks a keyword, named by its id or its label in
// any case; a folded id stands for its target. Each marked word becomes
// <button data-k="canonical id">shown words</button> with plain text inside, each paragraph a <p>.
import { esc } from './shell.mjs';

const STANDIN = /^status:\s*stand-in\s*$/i;
const MARK = /\[\[([^[\]]*)\]\]/g;

// The idea without its first line `status: stand-in` and the empty lines after it: what edit mode
// stores when the author saves an idea, which is then their own (design §5).
export function withoutStandin(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!STANDIN.test(lines[0].trim())) return String(text);
  lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join('\n');
}

// problems: [{level, message}]; the caller knows which file they belong to.
export function parseIdea(text, { keywords, aliases }) {
  const find = lookup(keywords, aliases);
  const problems = [];
  const marked = [];

  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const standin = STANDIN.test(lines[0].trim());
  if (standin) lines.shift();

  const paragraphs = lines.join('\n').split(/\n[ \t]*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const html = paragraphs.map((paragraph) => {
    let out = '';
    let from = 0;
    for (const match of paragraph.matchAll(MARK)) {
      const bar = match[1].lastIndexOf('|');
      const name = (bar < 0 ? match[1] : match[1].slice(bar + 1)).trim();
      const shown = (bar < 0 ? match[1] : match[1].slice(0, bar)).trim() || name;
      const id = find(name);
      out += esc(paragraph.slice(from, match.index));
      if (id) {
        out += `<button data-k="${esc(id)}">${esc(shown)}</button>`;
        if (!marked.includes(id)) marked.push(id);
      } else {
        out += esc(shown);
        problems.push({ level: 'error', message: `unknown keyword "${name}"` });
      }
      from = match.index + match[0].length;
    }
    return `<p>${out}${esc(paragraph.slice(from))}</p>`;
  });

  return { html: html.join(''), keywords: marked, standin, problems };
}

// name -> canonical id, case and spacing aside; an id wins over a folded id, which wins over a label.
function lookup(keywords, aliases) {
  const ids = new Map();
  for (const [id, { label } = {}] of Object.entries(keywords)) if (label) ids.set(fold(label), id);
  for (const [id, target] of Object.entries(aliases)) ids.set(fold(id), target);
  for (const id of Object.keys(keywords)) ids.set(fold(id), id);
  return (name) => ids.get(fold(name));
}

const fold = (name) => String(name).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
