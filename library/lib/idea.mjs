// The idea text: an optional first line `status: stand-in`, then paragraphs separated by blank
// lines, each a <p>. Its links are read as every text's (lib/links.mjs). `[[shown words|keyword]]`
// or `[[keyword]]` marks a keyword, named by its id or its label in any case; a folded id stands
// for its target. Each marked word becomes <button data-k="canonical id">shown words</button> with
// plain text inside, the shown words as typed, as the idea has always drawn them. A link to a row
// or a page, and a keyword the public may not see, are drawn as in every text.
import { esc } from './shell.mjs';
import { linksIn, linkHtml, targetOf } from './links.mjs';

const STANDIN = /^status:\s*stand-in\s*$/i;

// The idea without its first line `status: stand-in` and the empty lines after it: what edit mode
// stores when the author saves an idea, which is then their own (design §5).
export function withoutStandin(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!STANDIN.test(lines[0].trim())) return String(text);
  lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join('\n');
}

// problems: [{level, message}]; the caller knows which file they belong to. `links`: what the
// idea's links know of the document (lib/links.mjs, less `here`, which is the Library); without
// it no row and no page is known, and every keyword counts as carried. The `keywords` returned
// are those the idea marks: the ones drawn as buttons.
export function parseIdea(text, { keywords, aliases, links = {} }) {
  const ctx = { up: '', ...links, keywords, aliases, here: 'library' };
  const problems = [];
  const marked = [];

  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const standin = STANDIN.test(lines[0].trim());
  if (standin) lines.shift();

  const paragraphs = lines.join('\n').split(/\n[ \t]*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const html = paragraphs.map((paragraph) => {
    let out = '';
    let from = 0;
    for (const link of linksIn(paragraph)) {
      const found = targetOf(link.target, ctx);
      out += esc(paragraph.slice(from, link.start));
      if (found.kind === 'keyword' && !found.dead) {
        out += `<button data-k="${esc(found.id)}">${esc(link.words ?? link.target)}</button>`;
        if (!marked.includes(found.id)) marked.push(found.id);
      } else {
        out += linkHtml(link, ctx);
        if (found.kind === 'keyword' && !found.id) problems.push({ level: 'error', message: `unknown keyword "${link.target}"` });
      }
      from = link.end;
    }
    return `<p>${out}${esc(paragraph.slice(from))}</p>`;
  });

  return { html: html.join(''), keywords: marked, standin, problems };
}
