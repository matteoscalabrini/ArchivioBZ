import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { loadLibrary, sourceUrl } from '../lib/records.mjs';
import { parseIdea } from '../lib/idea.mjs';
import idea from '../steps/20-idea.mjs';
import { buildRoot, cleanRoot } from './helpers.mjs';

// A vocabulary shaped as loadLibrary returns it: canonical ids with labels, folded ids to targets.
const VOCABULARY = {
  keywords: {
    press: { label: 'Press' },
    wording: { label: 'Wording' },
    typeface: { label: 'Typeface' },
    'ponte-druso': { label: 'Ponte Druso' },
    newsreels: { label: 'Luce newsreels' },
  },
  aliases: { fraktur: 'typeface' },
};

const STANDIN = 'the idea is a stand-in; build with --present for a showing';

// The idea step on the fixtures, with `idea.md` written into the copy when given.
async function runStep({ text, present = false, edit = () => {} } = {}) {
  const root = await cleanRoot();
  if (text !== undefined) await writeFile(path.join(root, 'library', 'content', 'idea.md'), text);
  const lib = await loadLibrary(root);
  edit(lib);
  const ctx = { root, out: path.join(root, 'dist'), lib, options: { check: false, present }, problems: lib.problems, sourceUrl: (abs) => sourceUrl(root, abs) };
  const before = lib.problems.length;
  await idea(ctx);
  return { idea: ctx.idea, problems: lib.problems.slice(before) };
}

test('[[word|Wording]] becomes a button with data-k="wording" and text "word"', () => {
  const parsed = parseIdea('Another [[word|Wording]], another [[typeface]].', VOCABULARY);
  assert.equal(parsed.html, '<p>Another <button data-k="wording">word</button>, another <button data-k="typeface">typeface</button>.</p>');
  assert.deepEqual(parsed.keywords, ['wording', 'typeface']);
  assert.equal(parsed.standin, false);
  assert.deepEqual(parsed.problems, []);
});

test('a label matches whatever its case', () => {
  const parsed = parseIdea('At [[ponte DRUSO]], in [[newsreels|LUCE Newsreels]] and the [[PRESS]].', VOCABULARY);
  assert.equal(
    parsed.html,
    '<p>At <button data-k="ponte-druso">ponte DRUSO</button>, in <button data-k="newsreels">newsreels</button> and the <button data-k="press">PRESS</button>.</p>',
  );
  assert.deepEqual(parsed.keywords, ['ponte-druso', 'newsreels', 'press']);
  assert.deepEqual(parsed.problems, []);
});

test('a folded id resolves to its target', () => {
  const parsed = parseIdea('Set in [[Fraktur]], [[broken letters|fraktur]] and [[typeface]].', VOCABULARY);
  assert.deepEqual([...parsed.html.matchAll(/data-k="([^"]+)"/g)].map((m) => m[1]), ['typeface', 'typeface', 'typeface']);
  assert.deepEqual(parsed.keywords, ['typeface'], 'each keyword once');
  assert.deepEqual(parsed.problems, []);
});

test('an unknown keyword is an error that names it', () => {
  const parsed = parseIdea('The [[press]] and [[old posters|Posterz]].', VOCABULARY);
  assert.deepEqual(parsed.problems, [{ level: 'error', message: 'unknown keyword "Posterz"' }]);
  assert.equal(parsed.html, '<p>The <button data-k="press">press</button> and old posters.</p>', 'its words stay as plain text');
  assert.deepEqual(parsed.keywords, ['press']);
});

// The idea's links to a row or a page are drawn as every text's (lib/links.mjs); its keywords keep
// the idea's own buttons, as above.
test('a row and a page linked from the idea, given what the document holds', () => {
  const links = {
    rows: new Map([['1.09', { no: '2.08', title: 'The postcard', shown: true }], ['r7', { no: '', title: 'Kept back', shown: false }]]),
    pages: new Map([['on-the-bridge', { title: 'On the bridge', shown: true }]]),
    carried: new Set(['press', 'ponte-druso']),
    edit: false,
  };
  const text = 'Read [[the postcard|@1.09]], [[more|page:on-the-bridge]] and [[@r7]], in the [[press]], at [[Ponte Druso]], on [[typeface]].';
  const parsed = parseIdea(text, { ...VOCABULARY, links });
  assert.equal(parsed.html, '<p>Read <a href="#o=1.09" data-row="1.09">the postcard</a>, <a href="pages/on-the-bridge.html">more</a> and , '
    + 'in the <button data-k="press">press</button>, at <button data-k="ponte-druso">Ponte Druso</button>, on typeface.</p>');
  assert.deepEqual(parsed.keywords, ['press', 'ponte-druso'], 'a keyword no shown row carries is words, and its label stays out of the page');
  assert.deepEqual(parsed.problems, [], 'only an unknown keyword is an error');
  const edit = parseIdea(text, { ...VOCABULARY, links: { ...links, edit: true } });
  assert.match(edit.html, / and <span class="dead-link" title="The row is hidden\.">Kept back<\/span>, /);
  assert.match(edit.html, /on <span class="dead-link" title="No row shown carries this keyword\.">Typeface<\/span>\./);
  assert.equal(parseIdea('[[the postcard|@1.09]]', VOCABULARY).html, '<p>the postcard</p>', 'knowing no rows, the words alone');
});

test('status: stand-in sets standin and is not printed', () => {
  const standin = parseIdea('status: stand-in\n\nFirst paragraph,\nset over two lines.\n\n\nSecond [[press]].\n', VOCABULARY);
  assert.equal(standin.standin, true);
  assert.equal(standin.html, '<p>First paragraph, set over two lines.</p><p>Second <button data-k="press">press</button>.</p>');

  const own = parseIdea('﻿The idea, in the author\'s words.\r\n', VOCABULARY);
  assert.equal(own.standin, false);
  assert.equal(own.html, '<p>The idea, in the author&#39;s words.</p>');
});

test('angle brackets in the text are escaped', () => {
  const parsed = parseIdea('<script>x</script> & [[a <b>|press]]', VOCABULARY);
  assert.equal(parsed.html, '<p>&lt;script&gt;x&lt;/script&gt; &amp; <button data-k="press">a &lt;b&gt;</button></p>');
});

test('the step sets ctx.idea, reports problems against idea.md and warns for a keyword no row carries', async () => {
  const { idea: made, problems } = await runStep({
    text: 'status: stand-in\n\nIn the [[press]], in [[letters|Fraktur]], in [[colour]] and [[nope]].\n',
    edit(lib) {
      lib.keywords.colour = { label: 'Colour' };
    },
  });
  assert.deepEqual(made, {
    html: '<p>In the <button data-k="press">press</button>, in <button data-k="typeface">letters</button>, in <button data-k="colour">colour</button> and nope.</p>',
    keywords: ['press', 'typeface', 'colour'],
    standin: true,
  });
  assert.deepEqual(problems, [
    { level: 'error', where: 'library/content/idea.md', message: 'unknown keyword "nope"' },
    { level: 'warn', where: 'library/content/idea.md', message: 'marked keyword "colour" is on no row' },
    { level: 'warn', where: 'library/content/idea.md', message: STANDIN },
  ]);
});

test('a stand-in idea is announced unless the build is for presenting', async () => {
  const text = 'status: stand-in\n\nIn the [[press]].\n';
  assert.deepEqual((await runStep({ text })).problems, [{ level: 'warn', where: 'library/content/idea.md', message: STANDIN }]);
  assert.deepEqual((await runStep({ text, present: true })).problems, []);
  assert.deepEqual((await runStep({ text: 'In the [[press]].\n' })).problems, [], 'an idea of one\'s own is not announced');
});

test('the build announces the stand-in without --present, and npm run present builds with it', async () => {
  const root = await cleanRoot();
  await writeFile(path.join(root, 'library', 'content', 'idea.md'), 'status: stand-in\n\nIn the [[press]].\n');
  const plain = await buildRoot(root);
  assert.equal(plain.run.status, 0, plain.run.stderr);
  assert.match(plain.run.stdout, /^WARN library\/content\/idea\.md: the idea is a stand-in; build with --present for a showing$/m);
  const present = await buildRoot(root, '--present');
  assert.equal(present.run.status, 0, present.run.stderr);
  assert.doesNotMatch(present.run.stdout, /stand-in/);
  const { scripts } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(scripts.present, 'node library/build.mjs --present');
});

test('without idea.md, ctx.idea is null', async () => {
  const { idea: made, problems } = await runStep();
  assert.equal(made, null);
  assert.deepEqual(problems, []);
});
