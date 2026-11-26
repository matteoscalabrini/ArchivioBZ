// node library/test/browser/edit.check.mjs   (npm run check:edit)
//
// Edit mode as the author meets it, in a browser: the local server (tools/dev.mjs) on a draft made
// afresh from the test fixtures in a temporary folder, the installed Chrome driven headless by
// puppeteer-core with a profile of its own, and each step below checked on the page. Each step
// that holds is printed; the first that does not stops the check with what the page showed
// instead, and the exit code is 1. The server, the browser and the temporary folders go in every
// outcome. Screenshots of the edit page, of the public page after Publish, of the edit page at a
// phone's width, of the compact view, at both widths, of the way back after a row link, and of 🔗's
// finder at both widths, are written to library/.cache/check-edit/.
// Not part of npm test, since it needs Chrome. Then steps add pictures (＋ picture): on this
// computer's stores first, then as the cloud's page does, the Blob client in the page given a
// stand-in for Vercel's Blob service, so that nothing leaves this computer. The last steps follow
// the links typed in a row's text and the way back from them, in edit mode and, once published,
// on the public page; and the last write such links with 🔗 in a row's text, the idea and About,
// with the legend under each field.
//
// The fixtures' draft, by row id: chapter c1 "Zero" [0.01], c2 "Five" [5.00 5.01 5.02 5.03],
// c3 "Twelve" [12.01]; numbered 1.01, 2.01 to 2.04 and 3.01 to begin with. The steps build on
// each other, so each one names the order it expects in full.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../../cloud/db.mjs';
import { makeStore } from '../../cloud/store.mjs';
import { cloudStores, localStores } from '../../cloud/pictures.mjs';
import { stripJpeg } from '../../lib/metadata.mjs';
import { moveIn, devPictures } from '../../tools/move-in.mjs';
import { startDev } from '../../tools/dev.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(LIBRARY, 'test', 'fixtures');
const SHOTS = path.join(LIBRARY, '.cache', 'check-edit');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHAPTER_TITLES = { 0: 'Zero', 5: 'Five', 12: 'Twelve' };

// The words the author reads, as edit mode must say them (global constraints).
const LOGGED_OUT = 'Logged out. Log in again; what you typed is kept.';
const NOTHING = 'No changes since the last publish';
const BUTTONS = ['About', 'Public site', 'Discard', 'Publish', 'Log out'];

// The list once steps 1 to 20 have run, every row shown.
const ALL_ROWS = '# c1 0.01=1.01 # c2 5.01=— 5.02=2.01 5.03=2.02 5.00=2.03 # c3 12.01=3.01';

// Typed as the title of 5.02: markup that must be shown as typed and never read as markup.
const MARKED = 'Alpenzeitung & <b>"Dolomiten"</b> </script>';
// 5.01's title: once 5.01 is hidden, none of the public files may hold it.
const HIDDEN_TITLE = 'Two photographs of a bridge';

const WAIT = 8000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What goes at the end, whatever happened: the browser, the server, the temporary folder.
let work = null;
let browser = null;
let dev = null;
let cleaning = null;
const cleanup = () => (cleaning ??= (async () => {
  await browser?.close().catch(() => {});
  await dev?.close().catch(() => {});
  if (work) await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
})());
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => cleanup().then(() => process.exit(130)));
}

// What went wrong on a page between two checks: an error thrown in it, or a dialog of the
// browser's own (an alert, a confirm, the question before leaving), which edit mode never means
// to raise in any of these steps. A browser dialog is dismissed, so a page asked to leave stays.
const problems = [];
const dialogWaiters = new Set();
function watch(page) {
  page.on('pageerror', (error) => problems.push(`the page threw: ${error.message}`));
  page.on('dialog', async (dialog) => {
    const said = `the browser asked (${dialog.type()}${dialog.message() ? `: ${dialog.message()}` : ''})`;
    problems.push(said);
    for (const resolve of dialogWaiters) resolve(said);
    dialogWaiters.clear();
    await dialog.dismiss().catch(() => {});
  });
  return page;
}
// Resolves with a sentence when the browser next asks something on any page watched.
const browserAsks = () => new Promise((resolve) => dialogWaiters.add(resolve));

let n = 0;
async function step(name, run) {
  n += 1;
  try {
    await run();
  } catch (error) {
    throw new Error(`step ${n}, ${name}: ${error.message}`);
  }
  if (problems.length) throw new Error(`step ${n}, ${name}: ${problems.join('; ')}`);
  console.log(`ok ${n} - ${name}`);
}

const check = (holds, message) => {
  if (!holds) throw new Error(message);
};

// The list as it stands: each visible heading as "# <chapter id>", each row as "<id>=<number>".
const listing = (page) => page.evaluate(() => [...document.querySelectorAll('.list > h2.chapter, .list > article.row')]
  .filter((el) => !el.hidden)
  .map((el) => (el.matches('h2') ? `# ${el.dataset.chapter}` : `${el.dataset.no}=${el.querySelector('.c-no').textContent.trim()}`))
  .join(' '));

// Waits until the list stands as `want`; else fails with the list as it is.
async function listShows(page, want, when) {
  const deadline = Date.now() + WAIT;
  let shown = await listing(page);
  while (shown !== want && Date.now() < deadline) {
    await pause(50);
    shown = await listing(page);
  }
  check(shown === want, `${when}, the list should read\n    ${want}\n  but reads\n    ${shown}`);
}

// Waits until the chapters' headings read `want`, each as "<chapter id>=<its number>".
async function headingsRead(page, want, when) {
  const read = () => page.evaluate(() => [...document.querySelectorAll('.list > h2.chapter')]
    .map((h) => `${h.dataset.chapter}=${h.querySelector('.ch-no').textContent.trim()}`).join(' '));
  const deadline = Date.now() + WAIT;
  let shown = await read();
  while (shown !== want && Date.now() < deadline) {
    await pause(50);
    shown = await read();
  }
  check(shown === want, `${when}, the headings should read ${want} but read ${shown}`);
}

// Waits until a row's title reads `want` (and holds no element: markup typed stays text).
async function titleShows(page, id, want, when) {
  try {
    await page.waitForFunction((rowId, wanted) => {
      const button = document.querySelector(`article.row[data-no="${rowId}"] .c-title button`);
      return button && !button.hidden && button.textContent === wanted && button.children.length === 0;
    }, { timeout: WAIT }, id, want);
  } catch {
    const shown = await page.$eval(`article.row[data-no="${id}"] .c-title button`, (b) => b.outerHTML).catch(() => 'no such row');
    throw new Error(`${when}, the title of ${id} should read ${JSON.stringify(want)} but is ${shown}`);
  }
}

// Every request edit mode makes to /edit/<route> with its body, and the status it was answered.
const sent = [];
function record(page) {
  page.on('response', (response) => {
    const request = response.request();
    const route = new URL(request.url()).pathname.match(/^\/edit\/(op|publish|discard|logout)$/)?.[1];
    if (!route || request.method() !== 'POST') return;
    let body = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { /* not JSON: none of these */ }
    sent.push({ route, body, status: response.status() });
  });
}
// Waits until `count` more edits than `before` have been answered.
async function sentSince(before, count) {
  const deadline = Date.now() + WAIT;
  while (sent.length < before + count && Date.now() < deadline) await pause(50);
  check(sent.length >= before + count, `${sent.length - before} edits were answered, not ${count}`);
}
const answerTo = (page, route) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/edit/${route}`, { timeout: WAIT });

async function logIn(page, base) {
  await page.goto(`${base}/edit/`);
  await page.waitForSelector('form.login input[type=password]');
  await page.type('form.login input[type=password]', 'dev');
  await Promise.all([page.waitForNavigation(), page.click('form.login button[type=submit]')]);
  await page.waitForSelector('.ed-bar .ed-publish');
}

// Opens the field that the ✎ `key` in `within` opens, types `text` in place of what it holds, and
// leaves it open. -> the field's input, as a selector.
async function typeIn(page, within, key, text) {
  await page.click(`${within} button.ed[data-ed="${key}"]`);
  const input = `${within} .ed-field[data-ed="${key}"] input`;
  await page.waitForSelector(input);
  await page.$eval(input, (el) => el.select());
  await page.keyboard.type(text);
  return input;
}
const typeTitle = (page, id, text) => typeIn(page, `article.row[data-no="${id}"]`, 'title', text);
const typeNumber = (page, id, text) => typeIn(page, `article.row[data-no="${id}"]`, 'number', text);
const typeChapter = (page, chapter, text) => typeIn(page, `h2.chapter[data-chapter="${chapter}"]`, 'chapter-title', text);

// Opens the idea's field and types `text` in place of its Markdown.
async function typeIdea(page, text) {
  await page.click('section.idea button.ed[data-ed="idea"]');
  const area = 'section.idea .ed-field[data-ed="idea"] textarea';
  await page.waitForSelector(area);
  await page.$eval(area, (el) => el.select());
  await page.keyboard.type(text);
  return area;
}

async function chapterShows(page, chapter, want, when) {
  try {
    await page.waitForFunction((id, wanted) => document.querySelector(`h2.chapter[data-chapter="${id}"] .ch-title`)?.textContent === wanted,
      { timeout: WAIT }, chapter, want);
  } catch {
    const shown = await page.$eval(`h2.chapter[data-chapter="${chapter}"]`, (h) => h.textContent).catch(() => 'no such heading');
    throw new Error(`${when}, chapter ${chapter} should be called ${JSON.stringify(want)} but its heading reads ${JSON.stringify(shown)}`);
  }
}

// With a field typed in and still open (`open()`), a click on Log out (`by`: 'logout') or on
// Public site ('site'). Holds when the login form or the public page comes with nothing asked on
// the way, on the page or by the browser, and the last edit sent is the field's (`op`: fields it
// must match), answered 200.
async function leaveBy(page, by, open, op) {
  await open();
  const where = by === 'logout' ? 'the login form' : 'the public page';
  const asked = page.waitForSelector('dialog.ed-dialog[open] .ed-question', { timeout: WAIT })
    .then(async (q) => `the page asked ${JSON.stringify(await q.evaluate((el) => el.textContent))}`);
  const arrived = (by === 'logout'
    ? page.waitForSelector('form.login input[type=password]', { timeout: WAIT })
    : page.waitForFunction(() => location.pathname === '/' && document.querySelector('.list article.row') && !document.getElementById('edit-data'), { timeout: WAIT })
  ).then(() => 'arrived');
  asked.catch(() => {});
  arrived.catch(() => {});
  const outcome = Promise.race([asked, arrived, browserAsks()]);
  const button = by === 'logout'
    ? await page.evaluateHandle(() => [...document.querySelectorAll('.ed-bar .ed-actions > button')].find((b) => b.textContent.trim() === 'Log out') ?? null)
    : await page.$('.ed-bar a.ed-site');
  check(button && (await button.evaluate((el) => el !== null)), `there is no ${by === 'logout' ? 'Log out' : 'Public site'} button`);
  await button.click();
  const came = await outcome.catch((error) => `neither ${where} nor a question came (${error.message})`);
  // The prompt found here is the step's miss, said once, not again among the problems.
  if (came !== 'arrived') problems.length = 0;
  check(came === 'arrived', `${came}, instead of ${where}`);
  const last = sent.filter((s) => s.route === 'op').at(-1);
  const holds = last && last.status === 200 && Object.entries(op).every(([key, value]) => last.body?.op?.[key] === value);
  check(holds, `the last edit sent was ${JSON.stringify(last)}, not the field's ${JSON.stringify(op)}`);
}

// Waits until the element `selector` stays where it is for a moment (a transition has ended).
async function stillAt(page, selector) {
  const where = () => page.$eval(selector, (el) => JSON.stringify(el.getBoundingClientRect()));
  const deadline = Date.now() + WAIT;
  let before = await where();
  for (;;) {
    await pause(150);
    const now = await where();
    if (now === before) return;
    check(Date.now() < deadline, `${selector} keeps moving`);
    before = now;
  }
}

// Logs in on the login form the page shows.
async function logInHere(page) {
  await page.type('form.login input[type=password]', 'dev');
  await Promise.all([page.waitForNavigation(), page.click('form.login button[type=submit]')]);
  await page.waitForSelector('.ed-bar');
}

// A drag by the grip, as a hand makes it: down on the grip, moved in steps to a point of the
// target (`at`: how far down it, 0 to 1), held there while Sortable looks, then let go.
async function drag(page, gripSelector, targetSelector, at) {
  const grip = await page.$(gripSelector);
  const target = await page.$(targetSelector);
  check(grip && target, `nothing to drag: ${gripSelector} or ${targetSelector} is not on the page`);
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  const toY = to.y + to.height * at;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await pause(50);
  const steps = 15;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + 2, y + ((toY - y) * i) / steps);
    await pause(30);
  }
  await pause(200);
  await page.mouse.up();
}

// A keyword of "All keywords" dragged as a hand drags it: down on it, moved in steps to a point of
// another (`at`: how far along it, 0 to 1), held there while Sortable looks, then let go.
async function dragAcross(page, fromSelector, toSelector, at) {
  const from = await (await page.$(fromSelector))?.boundingBox();
  const to = await (await page.$(toSelector))?.boundingBox();
  check(from && to, `nothing to drag: ${fromSelector} or ${toSelector} is not on the page`);
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  const toX = to.x + to.width * at;
  const toY = to.y + to.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await pause(50);
  const steps = 15;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + ((toX - x) * i) / steps, y + ((toY - y) * i) / steps);
    await pause(30);
  }
  await pause(200);
  await page.mouse.up();
}

// The middle of the element `selector`, in the window.
async function centre(page, selector) {
  const box = await (await page.$(selector))?.boundingBox();
  check(box, `${selector} is not on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// "All keywords" as it stands: "lab" for its label, then each keyword as "<id> <count>".
const stripReads = (page) => page.$$eval('.keywords > *', (els) => els
  .map((el) => (el.matches('button[data-k]') ? `${el.dataset.k} ${el.querySelector('sup')?.textContent}` : el.className))
  .join(', '));

// Waits until "All keywords" reads as `holds(read)` wants; else fails with what it reads.
async function stripShows(page, holds, when) {
  const deadline = Date.now() + WAIT;
  let read = await stripReads(page);
  while (!holds(read) && Date.now() < deadline) {
    await pause(50);
    read = await stripReads(page);
  }
  check(holds(read), `${when}, All keywords reads ${read}`);
}

// Rows added to the draft through /edit/op, as the page sends its edits, each last in its chapter
// and called "Added row <n>"; then the page loaded again with them. A chapter as long as the real
// library's longest without thirty dialogs. `wanted`: [{ chapter, count }]. -> the new rows' ids.
async function addRows(page, base, wanted) {
  await page.goto(`${base}/edit/`); // the version the page holds is the draft's
  await page.waitForSelector('.ed-bar');
  const ids = await page.evaluate(async (wanted) => {
    const data = JSON.parse(document.getElementById('edit-data').textContent);
    let { version } = data;
    const added = [];
    for (const { chapter, count } of wanted) {
      for (let i = 0; i < count; i += 1) {
        const op = { op: 'add-row', chapter, index: null, title: `Added row ${added.length + 1}`, type: data.types[0] };
        const response = await fetch('op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, op }) });
        const body = await response.json();
        if (!response.ok) return `add-row was answered ${response.status}: ${body?.error}`;
        version = body.version;
        added.push(body.result.id);
      }
    }
    return added;
  }, wanted);
  check(Array.isArray(ids), ids);
  await page.goto(`${base}/edit/`);
  await page.waitForSelector('.ed-bar');
  return ids;
}

// Edits sent to the draft through /edit/op, as the page sends them, in turn; then the page loaded
// again with them. `ops`: the ops, as edit mode writes them.
async function sendOps(page, base, ops) {
  await page.goto(`${base}/edit/`); // the version the page holds is the draft's
  await page.waitForSelector('.ed-bar');
  const refused = await page.evaluate(async (wanted) => {
    let { version } = JSON.parse(document.getElementById('edit-data').textContent);
    for (const op of wanted) {
      const response = await fetch('op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, op }) });
      const body = await response.json();
      if (!response.ok) return `${op.op} of ${op.id} was answered ${response.status}: ${body?.error}`;
      version = body.version;
    }
    return null;
  }, ops);
  check(refused === null, refused);
  await page.goto(`${base}/edit/`);
  await page.waitForSelector('.ed-bar');
}

// Each id with its number, from place `from` on in chapter `chapter`: "r2=2.04 r3=2.05 …".
const numbered = (ids, chapter, from) => ids.map((id, i) => `${id}=${chapter}.${String(from + i).padStart(2, '0')}`).join(' ');

// Whether the element is on the screen, below the bar and the status line that stick at its top.
const inView = (page, selector) => page.$eval(selector, (el) => {
  const box = el.getBoundingClientRect();
  const top = document.querySelector('.status').getBoundingClientRect().bottom;
  return box.top >= top - 1 && box.bottom <= window.innerHeight + 1;
});

// The bar's switch "Compact", its checkbox.
async function compactSwitch(page) {
  const box = await page.evaluateHandle(() => [...document.querySelectorAll('.ed-bar label')]
    .find((label) => label.textContent.trim() === 'Compact')?.querySelector('input[type=checkbox][role=switch]') ?? null);
  check(await box.evaluate((el) => el !== null), 'the bar has no switch Compact');
  return box;
}

async function setCompact(page, on) {
  const box = await compactSwitch(page);
  if (await box.evaluate((el) => el.checked) !== on) await box.click();
  await page.waitForFunction((want) => document.querySelector('.list').classList.contains('compact') === want, { timeout: WAIT }, on)
    .catch(() => { throw new Error(`the switch did not turn the compact view ${on ? 'on' : 'off'}`); });
}

const fold = (page, chapter) => page.click(`h2.chapter[data-chapter="${chapter}"] button.ed-fold`);

// Waits until a chapter is folded with `count` on its heading and its rows out of sight, or, for
// null, unfolded with its rows in sight; else fails with what the heading and the rows show.
async function foldShows(page, chapter, count, when) {
  const read = () => page.evaluate((id) => {
    const heading = document.querySelector(`h2.chapter[data-chapter="${id}"]`);
    const button = heading?.querySelector('button.ed-fold');
    const counted = heading?.querySelector('.ed-count');
    const rows = [...document.querySelectorAll(`.list > article.row[data-chapter="${id}"]`)];
    return {
      sign: button?.textContent ?? null,
      label: button?.getAttribute('aria-label') ?? null,
      count: counted && !counted.hidden && getComputedStyle(counted).display !== 'none' ? counted.textContent : null,
      rows: rows.length,
      shown: rows.filter((row) => getComputedStyle(row).display !== 'none').length,
    };
  }, chapter);
  const holds = (s) => (count
    ? s.sign === '▸' && s.label === 'Unfold the chapter' && s.count === count && s.shown === 0
    : s.sign === '▾' && s.label === 'Fold the chapter' && s.count === null && s.shown === s.rows);
  const deadline = Date.now() + WAIT;
  let seen = await read();
  while (!holds(seen) && Date.now() < deadline) {
    await pause(50);
    seen = await read();
  }
  check(holds(seen), `${when}, chapter ${chapter} shows ${JSON.stringify(seen)}`);
}

async function main() {
  work = await mkdtemp(path.join(os.tmpdir(), 'edit-check-'));
  const root = path.join(work, 'root');
  const dataDir = path.join(work, 'db');
  const imgDir = path.join(work, 'img');
  const originalsDir = path.join(work, 'originals');
  // The fixtures as cleanRoot (test/helpers.mjs) copies them, without the deliberately broken
  // folder; helpers.mjs is not imported, since it hooks into node:test, which this is not.
  await cp(FIXTURES, root, { recursive: true, filter: (src) => path.basename(src) !== 'bad' });
  const pg = new PGlite(dataDir);
  const store = makeStore(pgliteDb(pg));
  await store.init();
  await moveIn({ root, store, putPicture: devPictures(imgDir), chapterTitles: CHAPTER_TITLES });
  // 0.01 cites 5.03, so that an open row has a Sources link to another row (lib/detail.mjs), as
  // rows of the real library do; the fixtures' entries cite none, and no edit gives a row sources.
  const draft = await store.getDraft();
  draft.doc.rows['0.01'].record.sources = ['5.03'];
  await store.saveDraft(draft.doc, draft.version);
  await pg.close();
  dev = await startDev({ port: 0, dataDir, imgDir, originalsDir, password: 'dev' });
  let base = dev.url.replace(/\/edit\/$/, '');

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.join(work, 'profile'),
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    defaultViewport: { width: 1280, height: 1600 },
  });
  const page = watch(await browser.newPage());
  page.setDefaultTimeout(WAIT);
  page.setDefaultNavigationTimeout(15000);
  record(page);
  await mkdir(SHOTS, { recursive: true });

  await step('log in with the password dev; the bar says Draft and has its five buttons', async () => {
    await logIn(page, base);
    const bar = await page.$eval('.ed-bar', (el) => ({
      label: el.querySelector('.ed-label')?.textContent,
      buttons: [...el.querySelectorAll('.ed-actions > button, .ed-actions > a')].map((b) => b.textContent.trim()),
    }));
    check(bar.label === 'Draft', `the bar's label is ${JSON.stringify(bar.label)}`);
    check(JSON.stringify(bar.buttons) === JSON.stringify(BUTTONS), `the bar's buttons are ${JSON.stringify(bar.buttons)}`);
    await listShows(page, '# c1 0.01=1.01 # c2 5.00=2.01 5.01=2.02 5.02=2.03 5.03=2.04 # c3 12.01=3.01', 'logged in');
    // Nothing is published yet: the bar counts the draft, and no row is marked as changed.
    const summary = await page.$eval('.ed-summary', (el) => el.textContent);
    check(summary === 'Nothing published yet: 6 rows in 3 chapters', `the summary reads ${JSON.stringify(summary)}`);
    check(!(await page.$('article.row[data-changed]')), 'a row is marked changed before the first publish');
  });

  await step('a title changed, with markup typed in it, is shown as typed, and again after a reload', async () => {
    const input = await typeTitle(page, '5.02', MARKED);
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the title was not saved');
    await page.waitForSelector(input, { hidden: true });
    await titleShows(page, '5.02', MARKED, 'saved');
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await titleShows(page, '5.02', MARKED, 'after a reload');
  });

  // Chapter 1 left empty has no number, and the chapters after it close up (the author's ruling
  // of 25 Nov 2026): the row typed 2.01 is 1.01 once it is there.
  await step('2.01 typed on the row of chapter 1 moves it to the head of chapter 2; chapter 1, empty, loses its number and the rest close up', async () => {
    await typeNumber(page, '0.01', '2.01');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    const want = '# c1 # c2 0.01=1.01 5.00=1.02 5.01=1.03 5.02=1.04 5.03=1.05 # c3 12.01=2.01';
    await listShows(page, want, 'after 2.01');
    await headingsRead(page, 'c1=— c2=1 c3=2', 'after 2.01');
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await listShows(page, want, 'after a reload');
    await headingsRead(page, 'c1=— c2=1 c3=2', 'after a reload');
  });

  await step('a row dragged below another stays there after a reload', async () => {
    const answered = answerTo(page, 'op');
    await drag(page, 'article.row[data-no="5.00"] .ed-grip', 'article.row[data-no="5.01"]', 0.75);
    check((await answered).status() === 200, 'the move was not saved');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-row' && move.id === '5.00' && move.chapter === 'c2' && move.index === 2,
      `the drop sent ${JSON.stringify(move)}, not move-row of 5.00 to c2 at 2`);
    const want = '# c1 # c2 0.01=1.01 5.01=1.02 5.00=1.03 5.02=1.04 5.03=1.05 # c3 12.01=2.01';
    await listShows(page, want, 'after the drop');
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await listShows(page, want, 'after a reload');
  });

  await step('a hidden row is numbered —, and the rows after it close up', async () => {
    const answered = answerTo(page, 'op');
    await page.click('article.row[data-no="5.01"] button.ed[data-ed="hide"]');
    check((await answered).status() === 200, 'the row was not hidden');
    await listShows(page, '# c1 # c2 0.01=1.01 5.01=— 5.00=1.02 5.02=1.03 5.03=1.04 # c3 12.01=2.01', 'after 👁');
    check(await page.$eval('article.row[data-no="5.01"]', (el) => el.hasAttribute('data-hidden')), 'the hidden row carries no data-hidden');
  });

  // Two clicks in one moment, before the first is answered: each edit names the one keyword or
  // picture it is about, so the second does not carry the list the first had not changed yet.
  await step('two keywords taken off a row in one moment both go, and stay gone after a reload', async () => {
    const row = 'article.row[data-no="5.03"]';
    const before = sent.length;
    const keys = await page.$$eval(`${row} .c-kw button.ed-kw-x`, (buttons) => buttons.map((b) => b.dataset.ed));
    check(keys.length === 2, `5.03 has ${keys.length} keywords to take off, not 2: ${JSON.stringify(keys)}`);
    await page.$$eval(`${row} .c-kw button.ed-kw-x`, (buttons) => buttons.forEach((b) => b.click()));
    await sentSince(before, 2);
    const two = sent.slice(before);
    check(two.every((s) => s.status === 200), `answered ${two.map((s) => s.status).join(' and ')}`);
    await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.kw === '', { timeout: WAIT }, row)
      .catch(async () => { throw new Error(`answered, 5.03 holds the keywords ${JSON.stringify(await page.$eval(row, (el) => el.dataset.kw))}`); });
    await page.reload();
    await page.waitForSelector('.ed-bar');
    const kept = await page.$eval(row, (el) => [el.dataset.kw, el.querySelectorAll('.c-kw button[data-k]').length]);
    check(kept[0] === '' && kept[1] === 0, `after a reload, 5.03 holds the keywords ${JSON.stringify(kept[0])}`);
  });

  await step('both pictures of a row taken off in one moment both go, and stay gone after a reload', async () => {
    const row = 'article.row[data-no="5.01"]';
    await page.click(`${row} .c-title button`);
    await page.waitForSelector(`${row}.open .ed-pic button[data-ed^="pic-x:"]`);
    const before = sent.length;
    const count = await page.$$eval(`${row} .ed-pic button[data-ed^="pic-x:"]`, (buttons) => {
      buttons.forEach((b) => b.click());
      return buttons.length;
    });
    check(count === 2, `5.01 has ${count} pictures to take off, not 2`);
    await sentSince(before, 2);
    const two = sent.slice(before);
    check(two.every((s) => s.status === 200), `answered ${two.map((s) => s.status).join(' and ')}`);
    await page.waitForFunction((sel) => document.querySelector(sel) && !document.querySelector(`${sel} .pics figure`), { timeout: WAIT }, row)
      .catch(async () => { throw new Error(`answered, 5.01 shows ${await page.$$eval(`${row} .pics figure`, (f) => f.length)} pictures`); });
    await page.goto(`${base}/edit/`); // without #o=5.01: the row closed again for the steps after
    await page.waitForSelector('.ed-bar');
    const left = await page.$$eval(`${row} .pics figure`, (f) => f.length);
    check(left === 0, `after a reload, 5.01 shows ${left} pictures`);
  });

  await step('a title left and a row dragged at once are both saved, in order, with no conflict', async () => {
    const before = sent.length;
    const input = await typeTitle(page, '12.01', 'Left for a drag');
    // The press on the grip takes the focus from the field, which saves it; the drop sends the
    // move while that save may still be on its way. Upward onto chapter 2's heading, the row goes
    // before it: last (and only) in chapter 1.
    await drag(page, 'article.row[data-no="0.01"] .ed-grip', 'h2.chapter[data-chapter="c2"]', 0.5);
    const deadline = Date.now() + WAIT;
    while (sent.length < before + 2 && Date.now() < deadline) await pause(50);
    const two = sent.slice(before).filter((s) => s.route === 'op');
    check(two.length === 2, `${two.length} edits were sent, not 2: ${JSON.stringify(two.map((s) => s.body?.op?.op))}`);
    const [first, second] = two;
    check(first.body.op.op === 'set-row' && first.body.op.id === '12.01', `the first edit sent was ${JSON.stringify(first.body.op)}`);
    check(second.body.op.op === 'move-row' && second.body.op.id === '0.01' && second.body.op.chapter === 'c1' && second.body.op.index === 0,
      `the second edit sent was ${JSON.stringify(second.body.op)}`);
    check(first.status === 200 && second.status === 200, `answered ${first.status} and ${second.status}`);
    check(second.body.version === first.body.version + 1, `sent with versions ${first.body.version} and ${second.body.version}`);
    await page.waitForSelector(input, { hidden: true });
    const want = '# c1 0.01=1.01 # c2 5.01=— 5.00=2.01 5.02=2.02 5.03=2.03 # c3 12.01=3.01';
    await listShows(page, want, 'after the drop');
    const line = await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent));
    check(line === '', `the bar says ${JSON.stringify(line)}`);
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await listShows(page, want, 'after a reload');
    await titleShows(page, '12.01', 'Left for a drag', 'after a reload');
  });

  await step('a chapter whose one row is hidden is numbered —, the chapters after it close up, and shown again it comes back', async () => {
    let answered = answerTo(page, 'op');
    await page.click('article.row[data-no="0.01"] button.ed[data-ed="hide"]');
    check((await answered).status() === 200, 'the row was not hidden');
    await listShows(page, '# c1 0.01=— # c2 5.01=— 5.00=1.01 5.02=1.02 5.03=1.03 # c3 12.01=2.01', 'after 👁');
    await headingsRead(page, 'c1=— c2=1 c3=2', 'after 👁');
    answered = answerTo(page, 'op');
    await page.click('article.row[data-no="0.01"] button.ed[data-ed="hide"]');
    check((await answered).status() === 200, 'the row was not shown again');
    await listShows(page, '# c1 0.01=1.01 # c2 5.01=— 5.00=2.01 5.02=2.02 5.03=2.03 # c3 12.01=3.01', 'shown again');
    await headingsRead(page, 'c1=1 c2=2 c3=3', 'shown again');
  });

  await step('a title saved after the session ended stays in its field with the logged-out line; logged in on another tab, it saves', async () => {
    const cookies = (await browser.cookies()).filter((c) => c.name === 'archivio_edit');
    check(cookies.length === 1, 'there is no session cookie to delete');
    await browser.deleteCookie(...cookies);
    const typed = 'Typed after the session ended';
    const input = await typeTitle(page, '5.03', typed);
    let answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 401, 'the save was not refused as logged out');
    await page.waitForFunction((line) => document.querySelector('article.row[data-no="5.03"] .ed-field[data-ed="title"] .ed-error')?.textContent === line,
      { timeout: WAIT }, LOGGED_OUT).catch(() => { throw new Error('the field does not say the logged-out line'); });
    check(await page.$eval(input, (el) => el.value) === typed, 'the typed title is not in the field');
    const bar = await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent));
    check(bar === LOGGED_OUT, `the bar says ${JSON.stringify(bar)}`);
    const other = watch(await browser.newPage());
    await logIn(other, base);
    await other.close();
    await page.bringToFront();
    await page.focus(input);
    answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'saved again after logging in, the title was refused');
    await page.waitForSelector(input, { hidden: true });
    await titleShows(page, '5.03', typed, 'saved again');
    await page.waitForFunction(() => document.querySelector('.ed-msg').hidden).catch(() => { throw new Error('the logged-out line stays in the bar'); });
  });

  await step('Publish asks with the exact line, publishes, and the summary says nothing differs', async () => {
    // 5.01 is hidden by now: five rows show, in the three chapters.
    const summary = await page.$eval('.ed-summary', (el) => el.textContent);
    check(summary === 'Nothing published yet: 5 rows in 3 chapters', `the summary reads ${JSON.stringify(summary)}`);
    await page.screenshot({ path: path.join(SHOTS, 'edit-page.png'), fullPage: true });
    await page.click('.ed-bar .ed-publish');
    const question = await page.waitForSelector('dialog.ed-dialog[open] .ed-question');
    const asked = await question.evaluate((el) => el.textContent);
    const want = 'Publish for the first time? 5 rows in 3 chapters.';
    check(asked === want, `asked ${JSON.stringify(asked)}, not ${JSON.stringify(want)}`);
    const answered = answerTo(page, 'publish');
    await page.click('dialog.ed-dialog[open] .ed-yes');
    check((await answered).status() === 200, 'the publish was refused');
    await page.waitForFunction((line) => document.querySelector('.ed-summary').textContent === line, { timeout: WAIT }, NOTHING)
      .catch(async () => { throw new Error(`the summary reads ${JSON.stringify(await page.$eval('.ed-summary', (el) => el.textContent))}`); });
    check(!(await page.$('article.row[data-changed]')), 'a row is still marked changed');
  });

  await step('the public page shows the chapters and the new titles, and no hidden row in any public file', async () => {
    await page.goto(`${base}/`);
    await page.waitForSelector('.list article.row');
    await listShows(page, '# c1 0.01=1.01 # c2 5.00=2.01 5.02=2.02 5.03=2.03 # c3 12.01=3.01', 'on the public page');
    const extra = await page.evaluate(() => ({
      edit: document.querySelectorAll('.ed, .ed-bar, #edit-data, link[href*="edit.css"], script[src*="edit.js"]').length,
      headings: [...document.querySelectorAll('.list > h2.chapter')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    }));
    check(extra.edit === 0, `the public page holds ${extra.edit} things of edit mode`);
    check(extra.headings.length === 3 && extra.headings.every((h, i) => h.includes(['Zero', 'Five', 'Twelve'][i])), `the headings read ${JSON.stringify(extra.headings)}`);
    await titleShows(page, '5.02', MARKED, 'on the public page');
    await titleShows(page, '12.01', 'Left for a drag', 'on the public page');
    await titleShows(page, '5.03', 'Typed after the session ended', 'on the public page');
    for (const file of ['', 'map.html', 'about.html', 'search.json']) {
      const response = await fetch(`${base}/${file}`);
      const body = await response.text();
      check(response.status === 200, `/${file} answers ${response.status}`);
      check(!body.includes(HIDDEN_TITLE) && !body.includes('"5.01"'), `/${file} holds the hidden row 5.01`);
    }
    await page.screenshot({ path: path.join(SHOTS, 'public-page.png'), fullPage: true });
  });

  await step('the public address of the hidden row opens nothing and shows the whole list', async () => {
    await page.goto(`${base}/#o=5.01`);
    await page.waitForSelector('.list article.row');
    await pause(300);
    await listShows(page, '# c1 0.01=1.01 # c2 5.00=2.01 5.02=2.02 5.03=2.03 # c3 12.01=3.01', 'at #o=5.01');
    check(!(await page.$('article.row.open')), 'a row is open');
  });

  // The click on Publish takes the focus from the field, which saves it; the question waits for
  // that save, so it counts the title just typed.
  await step('a title left by a click on Publish is counted in its question', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const before = await page.$eval('.ed-summary', (el) => el.textContent);
    check(before === NOTHING, `the summary reads ${JSON.stringify(before)}`);
    await typeTitle(page, '12.01', 'Left by Publish');
    await page.click('.ed-bar .ed-publish');
    const question = await page.waitForSelector('dialog.ed-dialog[open] .ed-question');
    const asked = await question.evaluate((el) => el.textContent);
    check(asked === 'Publish 1 change?', `asked ${JSON.stringify(asked)}`);
    await page.click('dialog.ed-dialog[open] .ed-no');
    await page.waitForSelector('dialog.ed-dialog[open]', { hidden: true });
    await titleShows(page, '12.01', 'Left by Publish', 'the question cancelled');
  });

  // Leaving by a click on Log out or Public site while a field is open: the press takes the focus
  // from the field, which saves it; the click waits for that save, then goes, with no question on
  // the page and no prompt from the browser, since nothing is left unsaved. Tried with a title,
  // whose answer draws its row anew and so takes the field off the page at once, and with a
  // chapter's title and a number, whose answers leave the field on the page until it closes.
  await step('a title left by a click on Log out is saved, with no question and no prompt, and the login follows', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await leaveBy(page, 'logout', () => typeTitle(page, '0.01', 'Left by Log out'), { op: 'set-row', id: '0.01' });
    await logInHere(page);
    await titleShows(page, '0.01', 'Left by Log out', 'logged in again');
  });

  await step('a chapter title left by a click on Log out likewise', async () => {
    const typed = 'Twelve, left by Log out';
    await leaveBy(page, 'logout', () => typeChapter(page, 'c3', typed), { op: 'rename-chapter', chapter: 'c3' });
    await logInHere(page);
    await chapterShows(page, 'c3', typed, 'logged in again');
  });

  await step('the idea left by a click on Log out likewise, though its save asks for the page again after the answer', async () => {
    const typed = 'An idea left by Log out.';
    await leaveBy(page, 'logout', () => typeIdea(page, typed), { op: 'set-idea', text: typed });
    await logInHere(page);
    const idea = await page.$eval('section.idea', (el) => el.textContent);
    check(idea.includes(typed), `logged in again, the idea reads ${JSON.stringify(idea.trim().slice(0, 200))}`);
  });

  await step('a title left by a click on Public site is saved, and the public site opens with no prompt', async () => {
    await leaveBy(page, 'site', () => typeTitle(page, '0.01', 'Left by Public site'), { op: 'set-row', id: '0.01' });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await titleShows(page, '0.01', 'Left by Public site', 'back in edit mode');
  });

  await step('a number left by a click on Public site likewise', async () => {
    await leaveBy(page, 'site', () => typeNumber(page, '5.03', '2.01'), { op: 'set-number', id: '5.03' });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    // Place 1 among the rows shown: after the hidden 5.01, which has no place of its own.
    await listShows(page, '# c1 0.01=1.01 # c2 5.01=— 5.03=2.01 5.00=2.02 5.02=2.03 # c3 12.01=3.01', 'back in edit mode');
  });

  // The phone is the author's second window (Minor 7, clean review). A touch screen has no hover to
  // show "＋ row here" under a row, so it stands under the open row; the pointer is moved away first,
  // so that only the open row can show it. A number typed with a comma, as the decimal keypad of a
  // phone set to Italy offers it (I5), moves the row.
  await step('at a phone\'s width the page fits, ＋ row here stands under the open row, and 2,01 typed moves a row', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const wider = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(wider <= 0, `the page is ${wider} px wider than the screen`);
    const outside = await page.$$eval('.ed-bar .ed-actions > button, .ed-bar .ed-actions > a', (els) => els
      .filter((el) => { const box = el.getBoundingClientRect(); return box.left < 0 || box.right > window.innerWidth; })
      .map((el) => el.textContent.trim()));
    check(outside.length === 0, `the bar's ${outside.join(', ')} stand outside the screen`);
    const row = 'article.row[data-no="5.00"]';
    const here = `${row} > .ed-here`;
    const shown = (selector) => page.$eval(selector, (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0);
    await page.tap(`${row} .c-title button`);
    await page.waitForSelector(`${row}.open`);
    await page.mouse.move(1, 1);
    check(await shown(here), '＋ row here is not shown under the open row');
    check(!(await shown('article.row[data-no="5.02"] > .ed-here')), '＋ row here is shown under a row that is not open');
    // The row opens with a transition that moves its lower rule down: tapped before it ends, the
    // tap would land where the line was.
    await stillAt(page, `${here} button.ed-add-row`);
    await page.screenshot({ path: path.join(SHOTS, 'edit-phone.png') });
    await page.tap(`${here} button.ed-add-row`);
    const question = await page.waitForSelector('dialog.ed-dialog[open] .ed-question');
    const asked = await question.evaluate((el) => el.textContent);
    check(asked === 'A new row', `＋ row here asked ${JSON.stringify(asked)}`);
    await page.tap('dialog.ed-dialog[open] .ed-no');
    await page.waitForSelector('dialog.ed-dialog[open]', { hidden: true });
    await typeNumber(page, '5.02', '2,01');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number typed with a comma was refused');
    const number = sent.at(-1).body?.op;
    check(number?.op === 'set-number' && number.number === '2.01', `the field sent ${JSON.stringify(number)}`);
    await listShows(page, '# c1 0.01=1.01 # c2 5.01=— 5.02=2.01 5.03=2.02 5.00=2.03 # c3 12.01=3.01', 'after 2,01');
    await page.setViewport({ width: 1280, height: 1600 });
  });

  // "All keywords" follows the draft and takes the author's order (design §7, 25 Nov 2026): "New
  // keywords added next to a file, do not get placed in the 'all the keywords' top field" and "the
  // keywords in the All the keywords cannot get moved. and put in an order".
  await step('a keyword new from a row is last in All keywords at once, with count 1, and a press on it filters to that row', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const row = 'article.row[data-no="5.03"]';
    check(!(await stripReads(page)).includes('covered-names'), `All keywords holds covered-names already: ${await stripReads(page)}`);
    const before = sent.length;
    await page.click(`${row} button.ed[data-ed="kw-add"]`);
    await page.waitForSelector(`${row} .ed-pick input`);
    await page.keyboard.type('Covered names');
    await page.keyboard.press('Enter'); // no keyword is called so: Enter makes it and gives it to the row
    await sentSince(before, 2);
    const two = sent.slice(before).map((s) => `${s.body?.op?.op} ${s.status}`);
    check(two.join(', ') === 'add-keyword 200, give-keyword 200', `the edits sent were ${two.join(', ')}`);
    await stripShows(page, (read) => read.endsWith(', covered-names 1') && read.startsWith('lab, '), 'the keyword given');
    await page.click('.keywords button[data-k="covered-names"]');
    await listShows(page, '# c2 5.03=2.02', 'covered-names pressed');
    const status = await page.$eval('.status .now', (el) => `${el.querySelector('.what').textContent} · ${el.querySelector('.n').textContent}`);
    check(status === 'Covered names · 1 of 6 entries', `the status line reads ${JSON.stringify(status)}`);
  });

  // Sorted by date the rows do not drag (their place in the list is not their place in the story),
  // but the strip's order is its own.
  await step('a keyword dragged to the front of All keywords, the list sorted by date, is sent before the first, filters nothing, and is first after a reload', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await page.click('.colhead button[data-sort="date"]');
    await page.waitForSelector('.list:not(.story)');
    const first = (await stripReads(page)).split(', ')[1].split(' ')[0];
    check(first !== 'covered-names', 'covered-names is first already');
    const answered = answerTo(page, 'op');
    await dragAcross(page, '.keywords button[data-k="covered-names"]', `.keywords button[data-k="${first}"]`, 0.2);
    check((await answered).status() === 200, 'the move was not saved');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-keyword' && move.id === 'covered-names' && move.before === first,
      `the drop sent ${JSON.stringify(move)}, not move-keyword of covered-names before ${first}`);
    await stripShows(page, (read) => read.startsWith('lab, covered-names 1, '), 'after the drop');
    const pressed = await page.$$eval('.keywords button[aria-pressed="true"]', (buttons) => buttons.map((b) => b.dataset.k));
    const what = await page.$eval('.status .what', (el) => el.textContent);
    check(pressed.length === 0 && what === 'All entries', `the drop filtered: ${JSON.stringify(pressed)} pressed, the status line says ${JSON.stringify(what)}`);
    await page.goto(`${base}/edit/`); // the story order again, for the steps after
    await page.waitForSelector('.ed-bar');
    await stripShows(page, (read) => read.startsWith('lab, covered-names 1, '), 'after a reload');
  });

  // A hand's press may slip a pixel between down and up; it is still a press (fallbackTolerance in
  // edit/strip.js: without it, Sortable takes the slip for a drag and swallows the click). In edit
  // mode the pointer over a keyword is a hand, closed while the keyword is held, so that the author
  // sees it can be moved; on the public page it stays the pointer of a button.
  await step('a keyword of All keywords shows a hand in edit mode only; a press still filters, one that slips a pixel too, and a second press shows every row again', async () => {
    const cursor = () => page.$eval('.keywords button[data-k="press"]', (b) => getComputedStyle(b).cursor);
    await page.goto(`${base}/`);
    await page.waitForSelector('.keywords button[data-k="press"]');
    const pub = await cursor();
    check(pub === 'pointer', `on the public page the pointer over a keyword is ${pub}`);
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const open = await cursor();
    check(open === 'grab', `in edit mode the pointer over a keyword is ${open}, not grab`);
    await listShows(page, ALL_ROWS, 'before the press');
    await page.click('.keywords button[data-k="press"]');
    await listShows(page, '# c2 5.02=2.01', 'press pressed');
    check(await page.$eval('.keywords button[data-k="press"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'press is not shown pressed');
    await page.click('.keywords button[data-k="press"]');
    await listShows(page, ALL_ROWS, 'press pressed again');
    const { x, y } = await centre(page, '.keywords button[data-k="press"]');
    await page.mouse.move(x, y);
    await page.mouse.down();
    const held = await cursor();
    check(held === 'grabbing', `while the keyword is held the pointer is ${held}, not grabbing`);
    await page.mouse.move(x + 1, y + 1);
    await page.mouse.up();
    await listShows(page, '# c2 5.02=2.01', 'press pressed with a slip of a pixel');
    await page.click('.keywords button[data-k="press"]');
    await listShows(page, ALL_ROWS, 'press pressed again');
  });

  await step('a keyword moved after the session ended goes back to where the last answer had it', async () => {
    const cookies = (await browser.cookies()).filter((c) => c.name === 'archivio_edit');
    check(cookies.length === 1, 'there is no session cookie to delete');
    await browser.deleteCookie(...cookies);
    const last = (await stripReads(page)).split(', ').at(-1).split(' ')[0];
    const answered = answerTo(page, 'op');
    await dragAcross(page, '.keywords button[data-k="covered-names"]', `.keywords button[data-k="${last}"]`, 0.8);
    check((await answered).status() === 401, 'the move was not refused as logged out');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-keyword' && move.id === 'covered-names' && move.before === null, `the drop to the end sent ${JSON.stringify(move)}`);
    await stripShows(page, (read) => read.startsWith('lab, covered-names 1, '), 'refused');
    const bar = await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent));
    check(bar === LOGGED_OUT, `the bar says ${JSON.stringify(bar)}`);
    const other = watch(await browser.newPage());
    await logIn(other, base);
    await other.close();
    await page.bringToFront();
  });

  // An edit answered while a keyword of the strip is pressed or dragged (a keyword taken off a row,
  // here by a click the page makes, since the mouse is held) must not take the keyword from under
  // the hand: its strip waits for the press to end. The keywords of 12.01 are humour and irony.
  await step('an answer that comes while a keyword is pressed or dragged waits: the press still filters, the drop still moves, then the strip follows', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const takeOff = async (keyword) => {
      const answered = answerTo(page, 'op');
      await page.$eval(`article.row[data-no="12.01"] button.ed[data-ed="kw:${keyword}"]`, (b) => b.click());
      check((await answered).status() === 200, `${keyword} was not taken off`);
      await pause(200);
    };
    const inHand = () => page.evaluate(() => window.inHand.isConnected);

    const press = await centre(page, '.keywords button[data-k="press"]');
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.evaluate(() => { window.inHand = document.querySelector('.keywords button[data-k="press"]'); });
    await takeOff('humour');
    check(await inHand(), 'the pressed keyword was taken from under the hand');
    await page.mouse.up();
    await listShows(page, '# c2 5.02=2.01', 'press let go');
    await stripShows(page, (read) => !read.includes('humour'), 'press let go');
    await page.click('.keywords button[data-k="press"]');
    await listShows(page, ALL_ROWS, 'press pressed again');

    const from = await centre(page, '.keywords button[data-k="archives"]');
    const to = await (await page.$('.keywords button[data-k="ponte-druso"]')).boundingBox();
    const toX = to.x + to.width * 0.2;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.evaluate(() => { window.inHand = document.querySelector('.keywords button[data-k="archives"]'); });
    for (let i = 1; i <= 5; i += 1) {
      await page.mouse.move(from.x + ((toX - from.x) * i) / 10, from.y);
      await pause(30);
    }
    await takeOff('irony');
    check(await inHand(), 'the dragged keyword was taken from under the hand');
    const answered = answerTo(page, 'op');
    for (let i = 6; i <= 10; i += 1) {
      await page.mouse.move(from.x + ((toX - from.x) * i) / 10, from.y);
      await pause(30);
    }
    await pause(200);
    await page.mouse.up();
    check((await answered).status() === 200, 'the move was not saved');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-keyword' && move.id === 'archives' && move.before === 'ponte-druso', `the drop sent ${JSON.stringify(move)}`);
    await stripShows(page, (read) => read === 'lab, covered-names 1, archives 1, ponte-druso 1, press 1, theory 1, typeface 1', 'after the drop');
  });

  // On the phone, the author's second window, a swipe that starts on the strip must scroll the
  // page, so a keyword drags only after a short hold (delay 150 ms, on touch only).
  await step('on a touch screen a tap on a keyword filters, a hold then a move drags, and a swipe from the strip scrolls and moves nothing', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await page.tap('.keywords button[data-k="press"]');
    await listShows(page, '# c2 5.02=2.01', 'press tapped');
    await stillAt(page, '.keywords button[data-k="press"]'); // a keyword pressed scrolls the page to the list
    await page.tap('.keywords button[data-k="press"]');
    await listShows(page, ALL_ROWS, 'press tapped again');

    await page.evaluate(() => scrollTo(0, 0));
    await stillAt(page, '.keywords button[data-k="theory"]');
    const start = await centre(page, '.keywords button[data-k="theory"]');
    const to = await (await page.$('.keywords button[data-k="covered-names"]')).boundingBox();
    const toX = to.x + to.width * 0.2;
    const toY = to.y + to.height / 2;
    const answered = answerTo(page, 'op');
    await page.touchscreen.touchStart(start.x, start.y);
    await pause(300); // the hold
    const steps = 15;
    for (let i = 1; i <= steps; i += 1) {
      await page.touchscreen.touchMove(start.x + ((toX - start.x) * i) / steps, start.y + ((toY - start.y) * i) / steps);
      await pause(30);
    }
    await pause(200);
    await page.touchscreen.touchEnd();
    check((await answered).status() === 200, 'the move was not saved');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-keyword' && move.id === 'theory' && move.before === 'covered-names', `the drop sent ${JSON.stringify(move)}`);
    await stripShows(page, (read) => read.startsWith('lab, theory 1, covered-names 1, '), 'after the hold and the move');

    const strip = await stripReads(page);
    const before = sent.length;
    const from = await centre(page, '.keywords button[data-k="archives"]');
    await page.touchscreen.touchStart(from.x, from.y);
    for (let i = 1; i <= 10; i += 1) {
      await page.touchscreen.touchMove(from.x, from.y - i * 20);
      await pause(10);
    }
    await page.touchscreen.touchEnd();
    await stillAt(page, '.keywords'); // the page glides on a while after a swipe
    check(sent.length === before, `the swipe sent ${JSON.stringify(sent.slice(before).map((s) => s.body?.op))}`);
    check(await page.evaluate(() => scrollY) > 0, 'the swipe did not scroll the page');
    check(await stripReads(page) === strip, `after the swipe, All keywords reads ${await stripReads(page)}`);
    await page.setViewport({ width: 1280, height: 1600 });
  });

  // The strip's order is not the list's, so it drags whatever narrows the list (the rows' drag
  // stops there): a keyword pressed, a kind pressed, a search typed. Each time the last keyword
  // goes to the front, and the list stays narrowed as it was.
  await step('All keywords drags with a keyword filter on, with a kind filter on, and with a search typed', async () => {
    const ways = [
      ['a keyword filter', () => page.click('.keywords button[data-k="press"]'), '.keywords button[data-k="press"][aria-pressed="true"]'],
      ['a kind filter', () => page.click('.kinds button[data-kind="press"]'), '.kinds button[data-kind="press"][aria-pressed="true"]'],
      ['a search', async () => {
        await page.click('form.find input');
        await page.keyboard.type('bridge');
      }, '.list .group'],
    ];
    for (const [way, narrow, narrowed] of ways) {
      await page.goto(`${base}/edit/`);
      await page.waitForSelector('.ed-bar');
      await narrow();
      await page.waitForSelector(narrowed);
      await page.waitForSelector('.list:not(.story)'); // the rows do not drag now
      await page.evaluate(() => scrollTo(0, 0));
      await stillAt(page, '.keywords button[data-k]');
      const read = (await stripReads(page)).split(', ');
      const [first, last] = [read[1], read.at(-1)].map((k) => k.split(' ')[0]);
      const answered = answerTo(page, 'op').catch(() => null);
      await dragAcross(page, `.keywords button[data-k="${last}"]`, `.keywords button[data-k="${first}"]`, 0.2);
      const res = await answered;
      check(res?.status() === 200, `with ${way}, ${res ? `the move was answered ${res.status()}` : 'the drop sent no move'}`);
      const move = sent.at(-1).body?.op;
      check(move?.op === 'move-keyword' && move.id === last && move.before === first, `with ${way}, the drop sent ${JSON.stringify(move)}`);
      await stripShows(page, (now) => now.startsWith(`lab, ${last} `), `with ${way}, after the drop`);
      check(Boolean(await page.$(narrowed)), `with ${way}, the list is no longer narrowed after the drop`);
    }
  });

  // Moving fast inside a chapter (design §5, 25 Nov 2026): "there is no way to move elements fast
  // inside thematic categories". A chapter as long as the real library's longest (36 rows) and a
  // window shorter than the page: the author typed 18.07 in a chapter of three, the row went to
  // 18.04 at the bottom of a long page, and it looked lost. Two rows go to the end of chapter 1
  // and 31 to the end of chapter 2, so that chapter 1 keeps a row to drag and one to type a number
  // on when 0.01 has left it, and chapter 2 holds 36 once 0.01 is in it.
  let fillers = [];
  await step('a closed row\'s number is a button: clicked, it is the number field in its place, the row still closed; 7.01 is refused in its words, and Escape puts the number back', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    fillers = await addRows(page, base, [{ chapter: 'c1', count: 2 }, { chapter: 'c2', count: 31 }]);
    check(fillers.length === 33, `${fillers.length} rows were added, not 33`);
    await listShows(page, `# c1 0.01=1.01 ${numbered(fillers.slice(0, 2), 1, 2)} # c2 5.01=— 5.02=2.01 5.03=2.02 5.00=2.03 ${numbered(fillers.slice(2), 2, 4)} # c3 12.01=3.01`, 'the rows added');
    const last = fillers.at(-1); // 2.34, the bottom of chapter 2
    const row = `article.row[data-no="${last}"]`;
    const number = `${row} .c-no button.ed-no`;
    check(await page.$eval(number, (b) => b.textContent.trim()), `the number of ${last} is not a button`);
    await page.click(number);
    const input = `${row} .ed-field[data-ed="number"] input`;
    await page.waitForSelector(input);
    const field = await page.$eval(input, (el) => ({ value: el.value, mode: el.inputMode, cls: el.className }));
    check(field.value === '2.34' && field.mode === 'decimal' && field.cls === 'ed-in-no', `the field is ${JSON.stringify(field)}`);
    check(await page.$eval(number, (b) => b.hidden), 'the number stays shown beside its field');
    check(!(await page.$eval(row, (el) => el.classList.contains('open'))), 'the click on the number opened the row');
    await page.$eval(input, (el) => el.select());
    await page.keyboard.type('7.01');
    const refused = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await refused).status() === 422, 'the number 7.01 was not refused');
    await page.waitForFunction((sel) => document.querySelector(`${sel} .row-head > .ed-error`)?.textContent === 'There is no chapter 7.', { timeout: WAIT }, row)
      .catch(async () => { throw new Error(`the field says ${JSON.stringify(await page.$eval(`${row} .row-head`, (el) => el.querySelector('.ed-error')?.textContent ?? 'nothing'))}`); });
    await page.keyboard.press('Escape');
    await page.waitForSelector(input, { hidden: true });
    const back = await page.$eval(number, (b) => ({ shown: !b.hidden, text: b.textContent }));
    check(back.shown && back.text === '2.34', `after Escape the number is ${JSON.stringify(back)}`);
    check(!(await page.$(`${row} .ed-error`)), 'the refusal stays after Escape');
  });

  await step('2.01 typed on the closed row at the bottom of chapter 2 makes it the first of chapter 2, still closed, in view and marked, and the bar says nothing more', async () => {
    const last = fillers.at(-1);
    const row = `article.row[data-no="${last}"]`;
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.click(`${row} .c-no button.ed-no`);
    const input = `${row} .ed-field[data-ed="number"] input`;
    await page.waitForSelector(input);
    await page.$eval(input, (el) => el.select());
    await page.keyboard.type('2.01');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    await listShows(page, `# c1 0.01=1.01 ${numbered(fillers.slice(0, 2), 1, 2)} # c2 5.01=— ${last}=2.01 5.02=2.02 5.03=2.03 5.00=2.04 ${numbered(fillers.slice(2, -1), 2, 5)} # c3 12.01=3.01`, 'after 2.01');
    await page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains('ed-placed'), { timeout: 1000 }, row)
      .catch(() => { throw new Error('the row is not marked'); });
    await stillAt(page, row);
    check(await inView(page, row), `the row is not in view: ${JSON.stringify(await page.$eval(row, (el) => el.getBoundingClientRect().toJSON()))}`);
    check(!(await page.$eval(row, (el) => el.classList.contains('open'))), 'the row opened');
    const line = await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent));
    check(line === '', `the bar says ${JSON.stringify(line)}, though the row is where the number said`);
    await page.waitForFunction((sel) => !document.querySelector(sel)?.classList.contains('ed-placed'), { timeout: 2500 }, row)
      .catch(() => { throw new Error('the row is still marked after 2.5 s'); });
  });

  // k, the rows of chapter 2 shown before the move, counted on the page. Typed in the open row,
  // whose number is text, as before, with ✎ beside it.
  await step('a number past the end of chapter 2, typed in an open row, puts the row last in it, follows it down the page and says Placed at 2.<k+1>, the end of chapter 2., as information', async () => {
    await page.evaluate(() => scrollTo(0, 0));
    const k = await page.$$eval('article.row[data-chapter="c2"] .c-no button.ed-no', (buttons) => buttons.filter((b) => b.textContent.trim() !== '—').length);
    check(k === 34, `chapter 2 shows ${k} rows, not 34`);
    const row = 'article.row[data-no="0.01"]';
    await page.click(`${row} .c-title button`);
    await page.waitForSelector(`${row}.open`);
    const text = await page.$eval(`${row} .c-no button.ed-no`, (b) => ({ pointer: getComputedStyle(b).pointerEvents, tab: b.tabIndex }));
    check(text.pointer === 'none' && text.tab === -1, `on the open row the number is not text: ${JSON.stringify(text)}`);
    await page.click(`${row} .c-no button.ed-edit`);
    const input = `${row} .ed-field[data-ed="number"] input`;
    await page.waitForSelector(input);
    await page.$eval(input, (el) => el.select());
    await page.keyboard.type('2.99');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    const want = `Placed at 2.${k + 1}, the end of chapter 2.`;
    await page.waitForFunction((line) => document.querySelector('.ed-msg')?.textContent === line, { timeout: WAIT }, want)
      .catch(async () => { throw new Error(`the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent)))}, not ${JSON.stringify(want)}`); });
    const said = await page.$eval('.ed-msg', (el) => ({ shown: !el.hidden, kind: el.dataset.kind, role: el.getAttribute('role'), buttons: el.querySelectorAll('button').length }));
    check(said.shown && said.kind === 'info' && said.role === 'status' && said.buttons === 0, `the line is said as ${JSON.stringify(said)}, not as information`);
    const order = await listing(page);
    check(order.includes(` 0.01=2.${k + 1} # c3 `), `0.01 is not last in chapter 2: ${order}`);
    const head = `${row} > .row-head`;
    await stillAt(page, head);
    check(await inView(page, head), `the row's head is not in view: ${JSON.stringify(await page.$eval(head, (el) => el.getBoundingClientRect().toJSON()))}`);
    check(await page.$eval(row, (el) => el.classList.contains('open')), 'the row closed');
  });

  // The switch is this browser's own (localStorage), as are the folds.
  await step('Compact on: every closed row is one line at most 32 px high, without its type, date and keywords, and the 36 rows of chapter 2 fit in 1150 px', async () => {
    await page.goto(`${base}/edit/`); // every row closed
    await page.waitForSelector('.ed-bar');
    await setCompact(page, true);
    const rows = await page.$$eval('.list > article.row:not(.open)', (els) => els.map((el) => {
      const end = el.querySelector(':scope > .ed-end');
      const hiddenCells = [...el.querySelectorAll('.row-head > .c-type, .row-head > .c-date, .row-head > .c-kw')].every((cell) => getComputedStyle(cell).display === 'none');
      const title = el.querySelector('.c-title > button:not(.ed)');
      const cut = getComputedStyle(title);
      return { id: el.dataset.no, height: el.getBoundingClientRect().height - (end ? end.getBoundingClientRect().height : 0), hiddenCells, cut: cut.textOverflow === 'ellipsis' && cut.whiteSpace === 'nowrap' };
    }));
    const tall = rows.filter((r) => r.height > 32);
    check(!tall.length, `rows higher than 32 px: ${tall.map((r) => `${r.id} ${r.height.toFixed(1)}`).join(', ')}`);
    const shownCells = rows.filter((r) => !r.hiddenCells);
    check(!shownCells.length, `rows that still show their type, date or keywords: ${shownCells.map((r) => r.id).join(', ')}`);
    const uncut = rows.filter((r) => !r.cut);
    check(!uncut.length, `rows whose title is not cut with an ellipsis: ${uncut.map((r) => r.id).join(', ')}`);
    const chapter = await page.$$eval('article.row[data-chapter="c2"]', (els) => ({ n: els.length, span: els.at(-1).getBoundingClientRect().bottom - els[0].getBoundingClientRect().top }));
    check(chapter.n === 36, `chapter 2 holds ${chapter.n} rows, not 36`);
    check(chapter.span <= 1150, `the 36 rows of chapter 2 take ${chapter.span.toFixed(0)} px, more than 1150`);
  });

  await step('a chapter folded hides its rows and its heading says how many (36 rows, 1 row); unfolded, they come back', async () => {
    await fold(page, 'c2');
    await foldShows(page, 'c2', '36 rows', 'chapter 2 folded');
    await page.$eval('.colhead', (el) => scrollTo(0, el.getBoundingClientRect().top + scrollY - 150));
    await page.screenshot({ path: path.join(SHOTS, 'edit-compact.png') });
    await fold(page, 'c3');
    await foldShows(page, 'c3', '1 row', 'chapter 3 folded');
    await fold(page, 'c3');
    await foldShows(page, 'c3', null, 'chapter 3 unfolded');
    await foldShows(page, 'c2', '36 rows', 'chapter 3 unfolded');
  });

  // Down onto the folded heading, Sortable puts the row just after it; up from the next chapter's
  // first row onto that chapter's heading, it puts the row after the folded rows, just before the
  // next heading. On the screen both are just under the folded heading.
  await step('a row dragged under a folded chapter\'s heading becomes its first, from above and from below', async () => {
    const one = fillers[0];
    let answered = answerTo(page, 'op');
    await drag(page, `article.row[data-no="${one}"] .ed-grip`, 'h2.chapter[data-chapter="c2"]', 0.75);
    check((await answered).status() === 200, 'the move from above was not saved');
    let move = sent.at(-1).body?.op;
    check(move?.op === 'move-row' && move.id === one && move.chapter === 'c2' && move.index === 0, `the drop from above sent ${JSON.stringify(move)}, not move-row of ${one} to c2 at 0`);
    await foldShows(page, 'c2', '37 rows', 'dropped from above');
    answered = answerTo(page, 'op');
    await drag(page, 'article.row[data-no="12.01"] .ed-grip', 'h2.chapter[data-chapter="c3"]', 0.5);
    check((await answered).status() === 200, 'the move from below was not saved');
    move = sent.at(-1).body?.op;
    check(move?.op === 'move-row' && move.id === '12.01' && move.chapter === 'c2' && move.index === 0, `the drop from below sent ${JSON.stringify(move)}, not move-row of 12.01 to c2 at 0`);
    await foldShows(page, 'c2', '38 rows', 'dropped from below');
    await headingsRead(page, 'c1=1 c2=2 c3=—', 'after the drops');
    // The line of the last typed number was information about that edit: the next one clears it.
    const line = await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent));
    check(line === '', `after the drops the bar still says ${JSON.stringify(line)}`);
  });

  await step('a reload keeps Compact on and chapter 2 folded', async () => {
    await page.reload();
    await page.waitForSelector('.ed-bar');
    check(await page.$eval('.list', (el) => el.classList.contains('compact')), 'after a reload the list is not compact');
    check(await compactSwitch(page).then((box) => box.evaluate((el) => el.checked)), 'after a reload the switch is off');
    await foldShows(page, 'c2', '38 rows', 'after a reload');
  });

  // The last row of chapter 1 typed into the folded chapter 2: chapter 1, empty, loses its number,
  // so the row typed 2.01 is 1.01, and the bar says so.
  await step('a number typed into a folded chapter unfolds it, follows the row there and says Placed at 1.01. when the chapter before closed up', async () => {
    const row = `article.row[data-no="${fillers[1]}"]`;
    await page.click(`${row} .c-no button.ed-no`);
    const input = `${row} .ed-field[data-ed="number"] input`;
    await page.waitForSelector(input);
    await page.$eval(input, (el) => el.select());
    await page.keyboard.type('2.01');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    await foldShows(page, 'c2', null, 'the row typed into it');
    await page.waitForFunction(() => document.querySelector('.ed-msg')?.textContent === 'Placed at 1.01.', { timeout: WAIT })
      .catch(async () => { throw new Error(`the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => (el.hidden ? '' : el.textContent)))}`); });
    await stillAt(page, row);
    check(await inView(page, row), `the row is not in view: ${JSON.stringify(await page.$eval(row, (el) => el.getBoundingClientRect().toJSON()))}`);
    const order = await listing(page);
    check(order.startsWith(`# c1 # c2 ${fillers[1]}=1.01 12.01=1.02 ${fillers[0]}=1.03 5.01=— ${fillers.at(-1)}=1.04 5.02=1.05 `), `the list reads ${order}`);
  });

  await step('at a phone\'s width a compact row is one line and the page is no wider than the screen', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.list.compact');
    const wider = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(wider <= 0, `the page is ${wider} px wider than the screen`);
    const rows = await page.$$eval('.list > article.row:not(.open)', (els) => els.map((el) => {
      const head = el.querySelector('.row-head').getBoundingClientRect();
      const title = el.querySelector('.c-title > button:not(.ed)');
      const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
      return { id: el.dataset.no, head: head.height, lines: Math.round(title.getBoundingClientRect().height / lineHeight), right: head.right };
    }));
    const tall = rows.filter((r) => r.head > 32 || r.lines !== 1 || r.right > 390);
    check(!tall.length, `rows not on one line within the screen: ${tall.slice(0, 5).map((r) => JSON.stringify(r)).join(', ')}`);
    await page.screenshot({ path: path.join(SHOTS, 'edit-compact-phone.png') });
    await page.setViewport({ width: 1280, height: 900 });
  });

  await step('Compact off: the page is as before and the folds are forgotten; on again, nothing is folded, and so after a reload', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.list.compact');
    await fold(page, 'c2');
    await foldShows(page, 'c2', '39 rows', 'folded');
    await setCompact(page, false);
    const off = await page.evaluate(() => ({
      shown: [...document.querySelectorAll('.list > article.row')].filter((el) => getComputedStyle(el).display !== 'none').length,
      all: document.querySelectorAll('.list > article.row').length,
      folds: [...document.querySelectorAll('h2.chapter .ed-fold')].filter((b) => getComputedStyle(b).display !== 'none').length,
      dates: [...document.querySelectorAll('.list > article.row .c-date')].filter((c) => getComputedStyle(c).display !== 'none').length,
    }));
    check(off.shown === off.all && off.folds === 0 && off.dates === off.all, `with Compact off: ${JSON.stringify(off)}`);
    await setCompact(page, true);
    await foldShows(page, 'c2', null, 'Compact on again');
    await page.reload();
    await page.waitForSelector('.list.compact');
    await foldShows(page, 'c2', null, 'after a reload');
    await setCompact(page, false);
  });

  // A browser that keeps nothing (storage blocked, a private window): every read and write of the
  // switch fails, and the page works the same for the visit.
  await step('with storage refused, the page works and the switch still makes the list compact', async () => {
    const other = watch(await browser.newPage());
    await other.setViewport({ width: 1280, height: 900 });
    await other.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
    await other.goto(`${base}/edit/`);
    await other.waitForSelector('.ed-bar');
    check(!(await other.$eval('.list', (el) => el.classList.contains('compact'))), 'the list is compact with nothing kept');
    await setCompact(other, true);
    await fold(other, 'c2');
    await foldShows(other, 'c2', '39 rows', 'storage refused');
    await other.close();
  });

  // Fix round 1 of Task 16. A row the page opens or adds unfolds its chapter: an open row is shown
  // in full. At this point chapters 1 and 3 are empty and chapter 2 holds every row.
  await step('＋ row here under a folded empty chapter adds the row open and in sight, and unfolds the chapter', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await setCompact(page, true);
    await fold(page, 'c3');
    await foldShows(page, 'c3', '0 rows', 'the empty chapter 3 folded');
    await page.click('h2.chapter[data-chapter="c3"] .ed-end button.ed-add-row');
    await page.waitForSelector('dialog.ed-dialog[open] input');
    await page.keyboard.type('Added under a fold');
    const answered = answerTo(page, 'op');
    await page.click('dialog.ed-dialog[open] .ed-yes');
    check((await answered).status() === 200, 'the row was not added');
    const id = await page.waitForFunction(() => [...document.querySelectorAll('.list > article.row')]
      .find((el) => el.querySelector('.c-title > button:not(.ed)')?.textContent === 'Added under a fold')?.dataset.no, { timeout: WAIT })
      .then((handle) => handle.jsonValue());
    const row = `article.row[data-no="${id}"]`;
    await foldShows(page, 'c3', null, 'the row added');
    await stillAt(page, row);
    const seen = await page.$eval(row, (el) => ({ open: el.classList.contains('open'), display: getComputedStyle(el).display }));
    check(seen.open && seen.display !== 'none', `the new row is ${JSON.stringify(seen)}`);
    check(await inView(page, `${row} > .row-head`), 'the new row is not in view');
  });

  // 0.01 cites 5.03 (set up above). 0.01 goes to chapter 3 by its number; chapter 2 is folded.
  await step('a Sources link to a row of a folded chapter opens that row in sight and unfolds its chapter; so does an address #o=', async () => {
    const from = 'article.row[data-no="0.01"]';
    await page.click(`${from} .c-no button.ed-no`);
    const input = `${from} .ed-field[data-ed="number"] input`;
    await page.waitForSelector(input);
    await page.$eval(input, (el) => el.select());
    await page.keyboard.type('2.99');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.chapter === 'c3', { timeout: WAIT }, from);
    await fold(page, 'c2');
    await foldShows(page, 'c2', '38 rows', 'chapter 2 folded');
    await page.click(`${from} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${from}.open a[data-jump="5.03"]`);
    await stillAt(page, `${from} a[data-jump="5.03"]`);
    await page.click(`${from} a[data-jump="5.03"]`);
    const target = 'article.row[data-no="5.03"]';
    await page.waitForSelector(`${target}.open`);
    await foldShows(page, 'c2', null, 'the Sources link followed');
    await stillAt(page, `${target} > .row-head`);
    check(await inView(page, `${target} > .row-head`), `5.03 is not in view: ${JSON.stringify(await page.$eval(target, (el) => ({ display: getComputedStyle(el).display, box: el.getBoundingClientRect().toJSON() })))}`);

    // Folding a chapter puts away its open rows: the address no longer opens them.
    await fold(page, 'c2');
    await foldShows(page, 'c2', '38 rows', 'chapter 2 folded again');
    check(!(await page.$eval(target, (el) => el.classList.contains('open'))), 'the open row 5.03 stays open in the folded chapter');
    check(!decodeURIComponent(await page.evaluate(() => location.hash)).includes('5.03'), 'the address still opens 5.03');
    await page.goto(`${base}/edit/#o=5.02`);
    await page.waitForSelector('article.row[data-no="5.02"].open');
    await foldShows(page, 'c2', null, 'at #o=5.02');
    await stillAt(page, 'article.row[data-no="5.02"] > .row-head');
    check(await inView(page, 'article.row[data-no="5.02"] > .row-head'), '5.02 is not in view at #o=5.02');
  });

  // While a keyword, a kind or a search narrows the list, a fold hides nothing, and its fold and
  // count are out of sight, as the grips are: both act only in the story order.
  await step('with a keyword pressed, a folded chapter\'s rows that hold it show and its fold is out of sight; the keyword let go, the chapter is folded again', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.list.compact');
    await fold(page, 'c2');
    await foldShows(page, 'c2', '38 rows', 'folded');
    await page.click('.keywords button[data-k="press"]');
    await page.waitForSelector('.list:not(.story)');
    const narrowed = await page.evaluate(() => {
      const heading = document.querySelector('h2.chapter[data-chapter="c2"]');
      const shown = (el) => el && getComputedStyle(el).display !== 'none';
      return {
        row: shown(document.querySelector('article.row[data-no="5.02"]')),
        fold: shown(heading.querySelector('.ed-fold')),
        count: shown(heading.querySelector('.ed-count')),
      };
    });
    check(narrowed.row && !narrowed.fold && !narrowed.count, `with press pressed: ${JSON.stringify(narrowed)}`);
    await page.click('.keywords button[data-k="press"]');
    await page.waitForSelector('.list.story');
    await foldShows(page, 'c2', '38 rows', 'press let go');
  });

  // The number's answer comes after the author has gone on to another field (here 400 ms of
  // latency, as online): the page stays at the field being typed in, and the bar says where the
  // row went.
  await step('a number left by a click on another row\'s ✎: answered, the page stays at the field being typed in, and the bar says where the row went', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await setCompact(page, false);
    const moved = 'article.row[data-no="12.01"]';
    const other = 'article.row[data-no="r2"]';
    await page.$eval(other, (el) => el.scrollIntoView({ block: 'center' }));
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 400 });
    try {
      await page.click(`${moved} .c-no button.ed-no`);
      const input = `${moved} .ed-field[data-ed="number"] input`;
      await page.waitForSelector(input);
      await page.$eval(input, (el) => el.select());
      await page.keyboard.type('1.99');
      const answered = answerTo(page, 'op');
      await page.click(`${other} button.ed[data-ed="title"]`); // leaves the number, which saves it
      const title = `${other} .ed-field[data-ed="title"] input`;
      await page.waitForSelector(title);
      // Where the field stands in the window: the line said in the bar makes the bar taller, and the
      // browser keeps what is on the screen in place, so the page's scroll may change by that much.
      const before = await page.$eval(title, (el) => el.getBoundingClientRect().top);
      check((await answered).status() === 200, 'the number was not taken');
      const placed = await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.chapter === 'c2'
        && document.querySelector('.ed-msg')?.textContent.startsWith('Placed at ') && document.querySelector(sel).querySelector('.c-no .ed-no').textContent,
      { timeout: WAIT }, moved).then((handle) => handle.jsonValue());
      await pause(800); // a smooth scroll would be well under way
      const after = await page.evaluate((sel) => ({
        top: document.querySelector(sel)?.getBoundingClientRect().top ?? null,
        focused: document.activeElement === document.querySelector(sel),
        line: document.querySelector('.ed-msg').textContent,
      }), title);
      check(after.top !== null && Math.abs(after.top - before) <= 2, `the title field moved in the window from ${before} to ${after.top}`);
      check(await inView(page, title), 'the title field is out of view');
      check(after.focused, 'the title field lost the focus');
      check(after.line === `Placed at ${placed}, the end of chapter 1.`, `the bar says ${JSON.stringify(after.line)}`);
      await page.keyboard.press('Escape');
      await page.waitForSelector(title, { hidden: true });
    } finally {
      await page.emulateNetworkConditions(null);
    }
  });

  // The number and its ✎ are two controls: after a row is drawn anew, the focus is back on the one
  // that had it (core.js finds it by data-ed).
  await step('the focus on ✎ beside a number is on that ✎ again once its row is drawn anew', async () => {
    const row = 'article.row[data-no="5.02"]';
    await page.$eval(row, (el) => { el.dataset.drawn = 'before'; }); // a row drawn anew is a new element
    await page.focus(`${row} .c-no button.ed-edit`);
    const answered = answerTo(page, 'op');
    await page.$eval(`${row} .c-type select`, (choice) => {
      choice.value = [...choice.options].find((option) => option.value !== choice.value).value;
      choice.dispatchEvent(new Event('change', { bubbles: true }));
    });
    check((await answered).status() === 200, 'the type was not saved');
    await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.drawn !== 'before', { timeout: WAIT }, row)
      .catch(() => { throw new Error('the row was not drawn anew'); });
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} in ${el.closest('article.row')?.dataset.no}` : 'nothing';
    });
    check(focused === 'button.ed.ed-edit in 5.02', `the focus is on ${focused}`);
  });

  // Fix round 2 of Task 16: a row that is open or holds the focus is never folded away, and a
  // folded heading counts the rows it hides. 0.01 (chapter 3, numbered 2) is typed into the
  // folded chapter 2 (numbered 1), and its title ✎ clicked before the answer, 400 ms away.
  await step('a row typed into a folded chapter while its own title field is open stays in sight with the field, and the count leaves it out', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await setCompact(page, true);
    await fold(page, 'c2');
    const hides = await page.$$eval('article.row[data-chapter="c2"]', (els) => els.length);
    await foldShows(page, 'c2', `${hides} rows`, 'chapter 2 folded');
    const row = 'article.row[data-no="0.01"]';
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 400 });
    try {
      await page.click(`${row} .c-no button.ed-no`);
      const input = `${row} .ed-field[data-ed="number"] input`;
      await page.waitForSelector(input);
      await page.$eval(input, (el) => el.select());
      await page.keyboard.type('1.01');
      const before = sent.length;
      const answered = answerTo(page, 'op');
      await page.click(`${row} button.ed[data-ed="title"]`); // leaves the number, which saves it
      const title = `${row} .ed-field[data-ed="title"] input`;
      await page.waitForSelector(title);
      await page.keyboard.press('End');
      await page.keyboard.type(' and more');
      check((await answered).status() === 200, 'the number was not taken');
      await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.chapter === 'c2', { timeout: WAIT }, row);
      await pause(800);
      const seen = await page.evaluate((rowSel, titleSel) => {
        const el = document.querySelector(rowSel);
        const field = document.querySelector(titleSel);
        const count = document.querySelector('h2.chapter[data-chapter="c2"] .ed-count');
        return {
          shown: getComputedStyle(el).display !== 'none',
          field: Boolean(field),
          focused: Boolean(field) && document.activeElement === field,
          typed: field?.value.endsWith(' and more') ?? false,
          count: count && !count.hidden ? count.textContent : null,
          hidden: [...document.querySelectorAll('article.row[data-chapter="c2"]')].filter((r) => getComputedStyle(r).display === 'none').length,
        };
      }, row, title);
      check(seen.shown && seen.field && seen.focused && seen.typed, `0.01 with its title field: ${JSON.stringify(seen)}`);
      check(seen.count === `${hides} rows` && seen.hidden === hides, `the folded chapter counts ${seen.count} and hides ${seen.hidden}, not ${hides}`);
      const titles = sent.slice(before).filter((s) => s.body?.op?.op === 'set-row');
      check(!titles.length, `the half-typed title was saved: ${JSON.stringify(titles.map((s) => s.body.op))}`);
      await page.keyboard.press('Escape');
      await page.waitForSelector(title, { hidden: true });
    } finally {
      await page.emulateNetworkConditions(null);
    }
  });

  // A row whose number is answered while another row is held by its grip, or once another row has
  // been dropped and its move is still on its way: the page does not move under the hand, nor
  // follow the row to a place the drop is about to change. The page stands at its top, the rows
  // involved all in the window, and each number is typed as the last place of chapter 2 (numbered
  // 1), which is where the row goes, so the bar says nothing and stays as tall; the answers are 1.5 s
  // away, so that the hold and the drag come before them. Unfollowed, the row would be brought to
  // the middle of the window from the bottom of the page.
  await step('a number answered while another row is held, or once another is dropped and its move is on its way, moves the page neither time', async () => {
    await page.setViewport({ width: 1280, height: 1600 });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await setCompact(page, false);
    await page.evaluate(() => scrollTo(0, 0));
    const ids = await page.$$eval('article.row[data-chapter="c2"]', (els) => els
      .filter((el) => el.querySelector('.c-no .ed-no').textContent.trim() !== '—').slice(0, 5).map((el) => el.dataset.no));
    const last = await page.$$eval('article.row[data-chapter="c2"] .c-no .ed-no', (els) => els.filter((el) => el.textContent.trim() !== '—').length);
    const typeLast = async (id) => {
      const row = `article.row[data-no="${id}"]`;
      await page.click(`${row} .c-no button.ed-no`);
      const input = `${row} .ed-field[data-ed="number"] input`;
      await page.waitForSelector(input);
      await page.$eval(input, (el) => el.select());
      await page.keyboard.type(`1.${String(last).padStart(2, '0')}`);
      await page.keyboard.press('Enter');
    };
    const top = await page.evaluate(() => scrollY);
    check(top === 0, `the page does not stand at its top (${top})`);
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 1500 });
    try {
      // Held: pressed on the grip of a row above the one typed, until the answer has come and gone.
      let answered = answerTo(page, 'op');
      await typeLast(ids[1]);
      const grip = await centre(page, `article.row[data-no="${ids[0]}"] .ed-grip`);
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.waitForSelector('.sortable-chosen');
      check((await answered).status() === 200, 'the first number was not taken');
      await pause(800);
      const held = await page.evaluate(() => scrollY);
      await page.mouse.up();
      check(held === 0, `with a row held, the page scrolled to ${held}`);
      check(!(await page.$('article.row.open')), 'a row opened');

      // Dropped before the answer: the move waits behind the number in the queue.
      answered = answerTo(page, 'op');
      const before = sent.length;
      await typeLast(ids[2]);
      await drag(page, `article.row[data-no="${ids[4]}"] .ed-grip`, `article.row[data-no="${ids[3]}"]`, 0.25);
      check(sent.length === before, 'the drop came after the number\'s answer: the latency is too short for the check');
      check((await answered).status() === 200, 'the second number was not taken');
      await sentSince(before, 2);
      await pause(800);
      const dropped = await page.evaluate(() => scrollY);
      check(dropped === 0, `with the move on its way, the page scrolled to ${dropped}`);
      const ops = sent.slice(before).map((s) => `${s.body?.op?.op} ${s.status}`);
      check(ops.join(', ') === 'set-number 200, move-row 200', `the edits answered were ${ops.join(', ')}`);
    } finally {
      await page.emulateNetworkConditions(null);
      await page.setViewport({ width: 1280, height: 900 });
    }
  });

  // ＋ picture (design §6). The files the author would choose: a photograph as a phone hands it
  // over (stored on its side, orientation 6, a GPS position in its Exif), a scan as PNG, and notes.
  const files = path.join(work, 'files');
  await mkdir(files, { recursive: true });
  const photo = path.join(files, 'IMG_2041.jpg');
  await writeFile(photo, await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#7a6a5a' } })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Make: 'Phone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '46/1 30/1 0/1' } })
    .jpeg().toBuffer());
  const scan = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#e8e0d0' } }).png().toBuffer();
  const notes = path.join(files, 'notes.txt');
  await writeFile(notes, 'Notes from the archive, not a picture.\n');
  // Every request to the picture routes, by route; and any request that leaves this computer.
  const pictureRequests = [];
  const away = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const route = url.pathname.match(/^\/edit\/(upload|original|picture)$/)?.[1];
    if (route) pictureRequests.push({ route, body: request.postData() ?? null, headers: request.headers() });
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) away.push(request.url());
  });
  const rowOf = (id) => `article.row[data-no="${id}"]`;
  // The pictures of a row as drawn: each figure's data-src, the one shown marked with *.
  const figuresOf = (id) => page.$$eval(`${rowOf(id)} .pics figure`, (figs) => figs.map((f) => `${f.hidden ? '' : '*'}${f.querySelector('img')?.dataset.src}`));
  // Opens the row and waits until it has opened in full: while it grows, the ＋ row here on its
  // lower rule passes over the line of ＋ picture.
  const openRow = async (id) => {
    if (!(await page.$(`${rowOf(id)}.open`))) await page.click(`${rowOf(id)} .c-title button`);
    await page.waitForSelector(`${rowOf(id)}.open button.ed[data-ed="pic-add"]`);
    await stillAt(page, `${rowOf(id)} > .ed-here`);
  };

  await step('＋ picture in an open row with no picture opens the chooser; the JPEG chosen is added while the line says Adding picture 1 of 1… and leaving asks first; the row shows it upright, its small one the thumb, and no metadata goes public', async () => {
    await page.setViewport({ width: 1280, height: 1600 });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await openRow('12.01');
    const row = rowOf('12.01');
    const where = await page.$eval(`${row} button.ed[data-ed="pic-add"]`, (button) => ({
      words: button.textContent.trim(),
      icon: Boolean(button.querySelector('.ed-icon-add')),
      place: button.closest('.ed-pics')?.parentElement.matches('.detail') && button.closest('.ed-pics') === button.closest('.detail').firstElementChild,
      accept: button.parentElement.querySelector('input[type=file]').accept,
    }));
    check(where.words === 'picture' && where.icon, `the button reads ${JSON.stringify(where.words)}${where.icon ? '' : ' with no ＋'}`);
    check(where.place, 'the line is not where the pictures would be, first in the open row');
    check(where.accept === 'image/jpeg,image/png,image/webp', `the chooser accepts ${where.accept}`);
    const before = sent.length;
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
    check(chooser.isMultiple(), 'the chooser takes one file at a time');
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 400 });
    try {
      await chooser.accept([photo]);
      await page.waitForFunction((sel) => document.querySelector(`${sel} .ed-adding`)?.textContent === 'Adding picture 1 of 1…', { timeout: WAIT }, row)
        .catch(async () => { throw new Error(`while adding, the line reads ${JSON.stringify(await page.$eval(`${row} .ed-add-pic`, (el) => el.textContent))}`); });
      const asked = browserAsks();
      await page.evaluate(() => { location.reload(); });
      const said = await Promise.race([asked, pause(3000).then(() => null)]);
      check(said, 'leaving while the picture was being added asked nothing');
      problems.length = 0; // the question was the point
      await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .pics figure`).length === 1, { timeout: 15000 }, row);
    } finally {
      await page.emulateNetworkConditions(null);
    }
    const shown = await figuresOf('12.01');
    check(shown.length === 1 && /^\*\/dev-img\/12\.01-[0-9a-z]+-[0-9a-f]{16}\.jpg$/.test(shown[0]), `12.01 shows ${JSON.stringify(shown)}`);
    const img = await page.$eval(`${row} .pics figure img`, (el) => new Promise((resolve) => {
      const done = () => resolve({ w: el.naturalWidth, h: el.naturalHeight, width: el.getAttribute('width'), height: el.getAttribute('height') });
      if (el.complete && el.naturalWidth) done(); else { el.addEventListener('load', done); el.addEventListener('error', done); }
    }));
    check(img.w === 1067 && img.h === 1600 && img.width === '1067' && img.height === '1600', `the picture shown is ${JSON.stringify(img)}, not 1067 × 1600 upright`);
    check(await page.$eval(`${row} .ed-add-pic`, (line) => line.parentElement.matches('.pics') && !line.querySelector('button').hidden && line.querySelector('.ed-adding').textContent === ''),
      'once added, ＋ picture is not back under the picture');
    const ops = sent.slice(before).map((s) => `${s.body?.op?.op} ${s.status}`);
    check(ops.join(', ') === 'add-picture 200', `the edits answered were ${ops.join(', ')}`);
    const added = sent.at(-1).body.op.picture;
    const routes = pictureRequests.map((r) => r.route).join(' ');
    check(routes === 'original picture', `the picture routes asked were ${routes}`);
    check(pictureRequests[0].headers['x-pathname']?.match(/^originals\/12\.01-[0-9a-z]+\.jpg$/), `the original was named ${pictureRequests[0].headers['x-pathname']}, not by the row and the time`);
    // The original is kept as it was chosen, out of the served folder; what is served has no metadata.
    const kept = await readdir(originalsDir);
    check(kept.length === 1 && (await readFile(path.join(originalsDir, kept[0]))).equals(await readFile(photo)), `the originals folder holds ${JSON.stringify(kept)}`);
    for (const src of [added.src, added.small.src]) {
      const buf = await readFile(path.join(imgDir, src.slice('/dev-img/'.length)));
      check(stripJpeg(buf).equals(buf) && !buf.includes(Buffer.from('Phone')), `${src} carries metadata`);
    }
    check(!(await readdir(imgDir)).some((name) => name.startsWith('IMG_2041') || kept.includes(name)), 'the original or its name is among the served files');
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const stored = await page.evaluate(() => JSON.parse(document.getElementById('edit-data').textContent).doc.rows['12.01']);
    check(JSON.stringify(stored.thumb) === JSON.stringify(added.small) && added.small.w === 147 && added.small.h === 220,
      `after a reload 12.01's thumb is ${JSON.stringify(stored.thumb)}, not its small picture ${JSON.stringify(added.small)}`);
  });

  await step('a picture dropped on an open row that has one goes last and shows; Side by side and then ＋ picture stand under them; files let go on a closed row or elsewhere do nothing', async () => {
    const row = rowOf('0.01');
    await openRow('0.01');
    const had = await figuresOf('0.01');
    check(had.length === 1, `0.01 has ${had.length} pictures, not 1`);
    const before = sent.length;
    const asked = pictureRequests.length;
    // Let go on a closed row and on the bar: refused, so the browser does not open the file.
    const elsewhere = await page.evaluate(async (bytes) => {
      const file = new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], 'scan.png', { type: 'image/png' });
      const results = [];
      for (const target of [document.querySelector('article.row:not(.open) .c-title'), document.querySelector('.ed-bar')]) {
        const dt = new DataTransfer();
        dt.items.add(file);
        const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(over);
        const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(drop);
        results.push({ marked: Boolean(document.querySelector('article.row.ed-drop')), kept: drop.defaultPrevented });
      }
      return results;
    }, scan.toString('base64'));
    // A synthetic drag's dropEffect cannot be read back; what shows is that no row is marked, the
    // browser is kept from opening the file, and nothing is sent.
    check(elsewhere.every((r) => !r.marked && r.kept), `files let go elsewhere: ${JSON.stringify(elsewhere)}`);
    await pause(300);
    check(pictureRequests.length === asked, 'files let go elsewhere were sent');
    const dropped = await page.evaluate(async (sel, bytes) => {
      const file = new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], 'scan.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector(`${sel} .txt`);
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(over);
      const marked = document.querySelector(sel).classList.contains('ed-drop');
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(drop);
      return { taken: over.defaultPrevented && drop.defaultPrevented, marked, unmarked: !document.querySelector(sel).classList.contains('ed-drop') };
    }, row, scan.toString('base64'));
    check(dropped.taken && dropped.marked && dropped.unmarked, `the drop on the open row: ${JSON.stringify(dropped)}`);
    await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .pics figure`).length === 2, { timeout: 15000 }, row)
      .catch(async () => { throw new Error(`0.01 shows ${JSON.stringify(await figuresOf('0.01'))}`); });
    await sentSince(before, 1);
    const shown = await figuresOf('0.01');
    check(shown[0] === had[0].replace(/^\*/, '') && /^\*\/dev-img\/0\.01-[0-9a-z]+-[0-9a-f]{16}\.jpg$/.test(shown[1]), `0.01 shows ${JSON.stringify(shown)}: not the new picture last and showing`);
    const order = await page.$$eval(`${row} .pics > *`, (els) => els.map((el) => (el.matches('figure') ? 'figure' : el.className)).join(' '));
    check(order === 'figure figure ed-switch ed-add-pic', `under 0.01's pictures: ${order}`);
    const op = sent.at(-1).body.op;
    check(op.op === 'add-picture' && op.picture.w === 600 && op.picture.h === 400 && sent.at(-1).status === 200, `the edit sent was ${JSON.stringify(op)}`);
  });

  await step('a file of another type is refused in the bar with the sentence, and nothing is sent', async () => {
    const row = rowOf('0.01');
    await openRow('0.01');
    const before = sent.length;
    const asked = pictureRequests.length;
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
    await chooser.accept([notes]);
    const line = 'notes.txt: only JPEG, PNG and WebP pictures are taken.';
    await page.waitForFunction((words) => document.querySelector('.ed-msg')?.textContent.startsWith(words), { timeout: WAIT }, line)
      .catch(async () => { throw new Error(`the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => el.textContent))}`); });
    await pause(300);
    check(pictureRequests.length === asked && sent.length === before, 'a file of another type was sent');
    check((await figuresOf('0.01')).length === 2, '0.01 changed');
    check(await page.$eval(`${row} .ed-add-pic`, (el) => !el.querySelector('button').hidden && el.querySelector('.ed-adding').textContent === ''), 'the line does not stand as before');
  });

  // Several files at once, as the author chooses a handful: they go in the order chosen, the line
  // saying which, and one the server cannot read (notes saved as .png, which the page takes by its
  // type and /edit/picture refuses) is said in the bar while the next one goes on.
  const scanFile = path.join(files, 'scan.png');
  await writeFile(scanFile, scan);
  const fakePng = path.join(files, 'notes.png');
  await writeFile(fakePng, 'Notes saved under the wrong name, not a picture.\n');
  // Records each text the line of ＋ picture of row `id` shows, through every drawing of the row.
  const watchLine = (id) => page.evaluate((rowId) => {
    window.lineSaid = [];
    const read = () => {
      const words = document.querySelector(`article.row[data-no="${rowId}"] .ed-add-pic .ed-adding`)?.textContent;
      if (words !== undefined && words !== window.lineSaid.at(-1)) window.lineSaid.push(words);
    };
    new MutationObserver(read).observe(document.querySelector('.list'), { subtree: true, childList: true, characterData: true });
  }, id);
  const lineSaid = () => page.evaluate(() => window.lineSaid.filter((words, i, all) => words !== '' || all.slice(0, i).some(Boolean)));

  await step('three files chosen at once go in their order, the line saying Adding picture 1, 2 and 3 of 3…; the one the server cannot read is said in the bar and the next goes on', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const row = rowOf('5.00');
    await openRow('5.00');
    check((await figuresOf('5.00')).length === 0, '5.00 has pictures already');
    await watchLine('5.00');
    const before = sent.length;
    const asked = pictureRequests.length;
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 200 });
    try {
      const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
      await chooser.accept([photo, fakePng, scanFile]);
      await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .pics figure`).length === 2 && document.querySelector(`${sel} .ed-adding`)?.textContent === '',
        { timeout: 20000 }, row)
        .catch(async () => { throw new Error(`5.00 shows ${JSON.stringify(await figuresOf('5.00'))}; the line said ${JSON.stringify(await lineSaid())}`); });
    } finally {
      await page.emulateNetworkConditions(null);
    }
    const said = await lineSaid();
    check(JSON.stringify(said) === JSON.stringify(['Adding picture 1 of 3…', 'Adding picture 2 of 3…', 'Adding picture 3 of 3…', '']), `the line said ${JSON.stringify(said)}`);
    const bar = await page.$eval('.ed-msg', (el) => el.textContent);
    check(bar.startsWith('That file is not a picture the site can take: JPEG, PNG or WebP.'), `the bar says ${JSON.stringify(bar)}`);
    const routes = pictureRequests.slice(asked).map((r) => r.route).join(' ');
    check(routes === 'original picture original picture original picture', `the picture routes asked were ${routes}`);
    const ops = sent.slice(before).map((s) => `${s.body?.op?.op} ${s.body?.op?.picture?.w}×${s.body?.op?.picture?.h} ${s.status}`);
    check(ops.join(', ') === 'add-picture 1067×1600 200, add-picture 600×400 200', `the edits answered were ${ops.join(', ')}`);
    const shown = await figuresOf('5.00');
    check(!shown[0].startsWith('*') && shown[1].startsWith('*'), `5.00 shows ${JSON.stringify(shown)}: the last one added is not last and showing`);
  });

  // Another window has saved: every add-picture this page sends now is refused (409), each after
  // its original and its two JPEGs are sent. The first is; those still waiting are not sent.
  await step('after another window has changed the draft, the first file is refused with the conflict line and the files still waiting are not sent', async () => {
    const other = watch(await browser.newPage());
    try {
      await other.goto(`${base}/edit/`);
      await other.waitForSelector('.ed-bar');
      const saved = await other.evaluate(async () => {
        const { version } = JSON.parse(document.getElementById('edit-data').textContent);
        const op = { op: 'set-row', id: '12.01', fields: { title: 'Changed in another window' } };
        return (await fetch('op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, op }) })).status;
      });
      check(saved === 200, `the other window's edit was answered ${saved}`);
    } finally {
      await other.close();
    }
    const row = rowOf('5.00');
    await openRow('5.00');
    const before = sent.length;
    const asked = pictureRequests.length;
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
    await chooser.accept([scanFile, photo, scanFile]);
    await page.waitForFunction(() => document.querySelector('.ed-msg')?.dataset.kind === 'conflict', { timeout: 15000 })
      .catch(async () => { throw new Error(`the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => el.textContent))}`); });
    await pause(800);
    const routes = pictureRequests.slice(asked).map((r) => r.route).join(' ');
    check(routes === 'original picture', `the picture routes asked were ${routes}: the files waiting were sent`);
    const ops = sent.slice(before).map((s) => `${s.body?.op?.op} ${s.status}`);
    check(ops.join(', ') === 'add-picture 409', `the edits answered were ${ops.join(', ')}`);
    check(await page.$eval(`${row} .ed-add-pic`, (line) => !line.querySelector('button').hidden && line.querySelector('.ed-adding').textContent === ''), 'the line still says pictures are being added');
    // Nothing waits any more: the page goes without asking (a question would count as a problem).
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
  });

  await step('with the session ended, the first file is refused, the files waiting are not sent, and the bar says to choose them again; with the server out of reach, the bar says so', async () => {
    const row = rowOf('5.00');
    await openRow('5.00');
    const cookies = (await browser.cookies()).filter((c) => c.name === 'archivio_edit');
    check(cookies.length === 1, 'there is no session cookie to delete');
    await browser.deleteCookie(...cookies);
    const asked = pictureRequests.length;
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
    await chooser.accept([scanFile, photo, scanFile]);
    const line = 'Logged out. Log in again and choose the pictures not yet added.';
    await page.waitForFunction((words) => document.querySelector('.ed-msg a')?.textContent === words, { timeout: WAIT }, line)
      .catch(async () => { throw new Error(`the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => el.textContent))}`); });
    await pause(500);
    const routes = pictureRequests.slice(asked).map((r) => r.route).join(' ');
    check(routes === 'original', `the picture routes asked were ${routes}: the files waiting were sent`);
    check(await page.$eval(`${row} .ed-add-pic`, (el) => !el.querySelector('button').hidden && el.querySelector('.ed-adding').textContent === ''), 'the line still says pictures are being added');
    await logIn(page, base);
    await openRow('5.00');
    await page.setOfflineMode(true);
    try {
      const [again] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
      await again.accept([scanFile]);
      const unreached = 'The server could not be reached. Nothing was saved; try again.';
      await page.waitForFunction((words) => document.querySelector('.ed-msg')?.textContent.startsWith(words), { timeout: WAIT }, unreached)
        .catch(async () => { throw new Error(`offline, the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => el.textContent))}`); });
    } finally {
      await page.setOfflineMode(false);
    }
    check((await figuresOf('5.00')).length === 2, '5.00 changed');
  });

  // The cloud's way, on this computer: the server's handshake as the cloud's (a token made by
  // @vercel/blob/client from a stand-in read-write token), the original put by the page's Blob
  // client (web/vendor/blob-client.esm.js), and the pictures made from the folders as above. The
  // client's one request to Vercel's Blob service is answered in the page by a stand-in, which
  // keeps the file where the folders' /edit/picture reads it; no request leaves this computer.
  await step('as in the cloud: the token asked of /edit/upload, the original put by the page\'s Blob client into the private store, then made and added', async () => {
    await dev.close();
    const folders = localStores({ originals: originalsDir, pictures: imgDir });
    const cloud = cloudStores({ originals: 'vercel_blob_rw_checkstore_standin', pictures: 'vercel_blob_rw_unused_standin' });
    dev = await startDev({ port: 0, dataDir, imgDir, originalsDir, password: 'dev', pictures: { handshake: cloud.handshake, picture: folders.picture } });
    base = dev.url.replace(/\/edit\/$/, '');
    const puts = [];
    await page.exposeFunction('blobStandIn', async (url, method, headers, bytes) => {
      const pathname = new URL(url).searchParams.get('pathname');
      const kept = pathname.replace(/\.(\w+)$/, '-St4nd1n.$1');
      const body = Buffer.from(bytes, 'base64');
      puts.push({ url, method, headers, size: body.length, pathname });
      await writeFile(path.join(originalsDir, kept.slice('originals/'.length)), body);
      const at = `https://checkstore.private.blob.vercel-storage.com/${kept}`;
      return { url: at, downloadUrl: `${at}?download=1`, pathname: kept, contentType: headers['x-content-type'] ?? '', contentDisposition: 'inline', etag: '"1"' };
    });
    // Before the page's scripts: fetch to Vercel's Blob service answered by the stand-in. The
    // Blob client takes fetch as it is when it loads, which is at the first original sent.
    await page.evaluateOnNewDocument(() => {
      const real = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!url.startsWith('https://vercel.com/api/blob')) return real(input, init);
        const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const answer = await window.blobStandIn(url, init.method, Object.fromEntries(new Headers(init.headers)), btoa(binary));
        return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
      };
    });
    await logIn(page, base);
    const originals = await page.evaluate(() => JSON.parse(document.getElementById('edit-data').textContent).originals);
    check(originals === 'upload', `the page sends its originals to ${originals}`);
    const row = rowOf('12.01');
    await openRow('12.01');
    const before = sent.length;
    const asked = pictureRequests.length;
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(`${row} button.ed[data-ed="pic-add"]`)]);
    await chooser.accept([scanFile]);
    await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .pics figure`).length === 2, { timeout: 15000 }, row)
      .catch(async () => { throw new Error(`12.01 shows ${JSON.stringify(await figuresOf('12.01'))}; the bar says ${JSON.stringify(await page.$eval('.ed-msg', (el) => el.textContent))}`); });
    await sentSince(before, 1);
    const routes = pictureRequests.slice(asked).map((r) => r.route).join(' ');
    check(routes === 'upload picture', `the picture routes asked were ${routes}`);
    const handshake = JSON.parse(pictureRequests[asked].body);
    check(handshake.type === 'blob.generate-client-token' && /^originals\/12\.01-[0-9a-z]+\.png$/.test(handshake.payload?.pathname), `the handshake asked ${JSON.stringify(handshake)}`);
    check(puts.length === 1, `${puts.length} files were put`);
    const [put] = puts;
    check(put.method === 'PUT' && put.pathname === handshake.payload.pathname, `the Blob client sent ${put.method} ${put.url}`);
    check(/^Bearer vercel_blob_client_checkstore_/.test(put.headers.authorization ?? ''), `with ${put.headers.authorization}, not the token the handshake gave`);
    check(put.headers['x-vercel-blob-access'] === 'private' && put.headers['x-content-type'] === 'image/png', `with the headers ${JSON.stringify(put.headers)}`);
    check(put.size === scan.length, `${put.size} bytes were put, not ${scan.length}`);
    const made = JSON.parse(pictureRequests.at(-1).body);
    check(made.id === '12.01' && made.pathname === put.pathname.replace(/\.png$/, '-St4nd1n.png'), `the picture was asked of ${JSON.stringify(made)}`);
    const shown = await figuresOf('12.01');
    check(/^\*\/dev-img\/12\.01-/.test(shown[1]), `12.01 shows ${JSON.stringify(shown)}`);
    check(away.length === 0, `requests left this computer: ${away.join(', ')}`);
  });

  // Links in a row's text (Task 17), given through the draft's op set-row as the text field sends
  // them: 12.01, at the foot of the list, links 5.00 far above it and 5.01, which is hidden; 5.00
  // links 5.03, so that two jumps stack; 5.01 links 5.00 from a hidden row, and the idea links 5.00
  // too. A link followed opens its row where it stands and leaves "↩ Back to <n>" at the bottom of
  // the screen; that button and the browser's Back return to where the jump started, the same rows
  // open at the same height.
  const rowAt = (id) => `article.row[data-no="${id}"]`;
  const linkTo = (from, to) => `${rowAt(from)} .txt a[data-row="${to}"]`;
  const isOpen = (id) => page.$eval(rowAt(id), (el) => el.classList.contains('open'));
  const backReads = () => page.$eval('button.way-back', (b) => {
    const box = b.getBoundingClientRect();
    return {
      shown: !b.hidden && getComputedStyle(b).display !== 'none',
      words: b.textContent,
      gap: Math.round(innerHeight - box.bottom),
      left: Math.round(box.left),
      right: Math.round(box.right),
    };
  });
  const where = () => page.evaluate(() => ({ y: scrollY, hash: decodeURIComponent(location.hash), steps: history.length }));
  // The link brought into the middle of the window and still, then where the page stands. Its row
  // first ends opening: scrolled into view meanwhile, the link would scroll the row's clipped inside
  // too (.row-inner hides what overflows), which springs back once the row is open.
  const before = async (selector) => {
    const row = await page.$eval(selector, (el) => el.closest('article.row')?.dataset.no ?? null);
    if (row) await stillAt(page, rowAt(row));
    await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
    await stillAt(page, selector);
    return where();
  };
  // The link brought into the middle of the window and clicked where it stands, as a pointer
  // clicks (page.click may scroll first, after the height was read), then the row it names waited
  // for, open and still. -> where the page stood at the click.
  const follow = async (selector, id) => {
    const at = await before(selector);
    const point = await page.$eval(selector, (el) => {
      const line = el.getClientRects()[0];
      const x = line.left + Math.min(line.width / 2, 8);
      const y = line.top + line.height / 2;
      const there = document.elementFromPoint(x, y);
      return { x, y, there: el.contains(there) ? null : there?.outerHTML.slice(0, 120) ?? 'nothing' };
    });
    check(point.there === null, `at the link ${selector} (${Math.round(point.x)}, ${Math.round(point.y)}) stands ${point.there}`);
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector(`${rowAt(id)}.open`);
    await stillAt(page, `${rowAt(id)} > .row-head`);
    return at;
  };
  // Waits until the page stands where `from` was, with the rows `open` open and the others of
  // `closed` closed, the button reading `words` or gone (null).
  const returned = async (from, open, closed, words, when) => {
    await page.waitForFunction((shut) => shut.every((id) => !document.querySelector(`article.row[data-no="${id}"]`).classList.contains('open')), { timeout: WAIT }, closed)
      .catch(() => { throw new Error(`${when}, ${closed.join(' or ')} is still open`); });
    await stillAt(page, open.length ? rowAt(open[0]) : '.list');
    const now = await where();
    check(Math.abs(now.y - from.y) <= 2, `${when}, the page stands at ${now.y}, not ${from.y}`);
    check(now.hash === from.hash, `${when}, the address is ${now.hash}, not ${from.hash}`);
    for (const id of open) check(await isOpen(id), `${when}, ${id} is not open`);
    const button = await backReads();
    check(words === null ? !button.shown : button.shown && button.words === words, `${when}, the button reads ${JSON.stringify(button)}`);
  };
  // What is pressed: the keyword, the kind and the sort.
  const pressed = () => page.evaluate(() => ({
    k: [...document.querySelectorAll('.keywords button[data-k][aria-pressed="true"]')].map((b) => b.dataset.k),
    t: [...document.querySelectorAll('.kinds button[data-kind][aria-pressed="true"]')].map((b) => b.dataset.kind),
    s: document.querySelector('.colhead button[data-sort][aria-pressed="true"]')?.dataset.sort,
  }));
  let fromNo = '';

  await step('a row\'s text given links by set-row: the link to another row drawn as a link, the one to a hidden row dotted, its sentence as its title', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await sendOps(page, base, [
      { op: 'set-row', id: '12.01', fields: { text: ['Compare [[the fixture notes|@5.00]] with [[the hidden one|@5.01]] in Quokkaland.'] } },
      { op: 'set-row', id: '5.00', fields: { text: ['Then [[the catalogue|@5.03]].'] } },
      { op: 'set-row', id: '5.01', fields: { text: ['Kept back; see [[the notes|@5.00]].'] } },
      { op: 'set-idea', text: 'The [[fixture notes|@5.00]] are where it starts.' },
      { op: 'hide-row', id: '5.01', hidden: true },
      { op: 'give-keyword', id: '12.01', keyword: 'humour' }, // which 5.00 does not carry, for a filter that leaves it out
    ]);
    await setCompact(page, false);
    await page.click(`${rowAt('12.01')} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${rowAt('12.01')}.open`);
    await stillAt(page, linkTo('12.01', '5.00'));
    const drawn = await page.$eval(`${rowAt('12.01')} .txt`, (txt) => {
      const link = txt.querySelector('a[data-row="5.00"]');
      const dead = txt.querySelector('.dead-link');
      return {
        link: link && { href: link.getAttribute('href'), words: link.textContent },
        dead: dead && { words: dead.textContent, title: dead.title, style: getComputedStyle(dead).textDecorationStyle },
        toHidden: Boolean(txt.querySelector('a[data-row="5.01"]')),
      };
    });
    check(drawn.link?.href === '#o=5.00' && drawn.link.words === 'the fixture notes', `the link to 5.00 is ${JSON.stringify(drawn.link)}`);
    check(drawn.dead?.words === 'the hidden one' && drawn.dead.title === 'The row is hidden.' && drawn.dead.style === 'dotted', `the link to 5.01 is ${JSON.stringify(drawn.dead)}`);
    check(!drawn.toHidden, 'the hidden row is linked');
    check(!(await backReads()).shown, 'the way back shows before any jump');
    fromNo = await page.$eval(`${rowAt('12.01')} .c-no`, (el) => el.textContent.trim());
    check(/^\d+\.\d+$/.test(fromNo), `12.01 is numbered ${JSON.stringify(fromNo)}`);
  });

  let start;
  await step('the link clicked: 5.00 opens and is in view, the address gains a step, and ↩ Back to <n> stands at the bottom of the screen', async () => {
    // Chrome puts the height back itself on a step back; turned off here, so that the page's own
    // return is what the steps of edit mode check. The public page's step leaves it on.
    await page.evaluate(() => { history.scrollRestoration = 'manual'; });
    await before(linkTo('12.01', '5.00'));
    check(!(await inView(page, `${rowAt('5.00')} > .row-head`)), '5.00 is in view before the jump, so the jump would show nothing');
    start = await follow(linkTo('12.01', '5.00'), '5.00');
    check(await inView(page, `${rowAt('5.00')} > .row-head`), '5.00 is not in view');
    check(await isOpen('12.01'), '12.01 closed');
    const now = await where();
    check(now.steps === start.steps + 1, `the address has ${now.steps - start.steps} more steps, not 1`);
    check(now.hash.includes('5.00') && now.hash.includes('12.01'), `the address is ${now.hash}`);
    const button = await backReads();
    check(button.shown && button.words === `↩ Back to ${fromNo}`, `the button reads ${JSON.stringify(button)}`);
    check(button.gap >= 0 && button.gap <= 40, `the button stands ${button.gap} px above the bottom of the screen`);
    await page.screenshot({ path: path.join(SHOTS, 'way-back.png') });
  });

  await step('↩ Back returns to 12.01 as it was: 5.00 closed, the same height within 2 px, the address as before, the button gone, the focus on the link', async () => {
    await page.click('button.way-back');
    await returned(start, ['12.01'], ['5.00'], null, 'after ↩ Back');
    check(await page.$eval(linkTo('12.01', '5.00'), (el) => el === document.activeElement), 'the focus is not on the link followed');
  });

  await step('the browser\'s Back does the same', async () => {
    start = await follow(linkTo('12.01', '5.00'), '5.00');
    check((await backReads()).shown, 'no way back after the jump');
    await page.goBack();
    await returned(start, ['12.01'], ['5.00'], null, 'after the browser\'s Back');
  });

  await step('jumps stack: from 12.01 to 5.00 to 5.03, back goes to 5.00, then to 12.01; Forward leaves no way back that does not fit; a reload starts with none', async () => {
    start = await follow(linkTo('12.01', '5.00'), '5.00');
    const middleNo = await page.$eval(`${rowAt('5.00')} .c-no`, (el) => el.textContent.trim());
    const middle = await follow(linkTo('5.00', '5.03'), '5.03');
    check(await inView(page, `${rowAt('5.03')} > .row-head`), '5.03 is not in view');
    let button = await backReads();
    check(button.shown && button.words === `↩ Back to ${middleNo}`, `after two jumps the button reads ${JSON.stringify(button)}`);
    await page.click('button.way-back');
    await returned(middle, ['5.00', '12.01'], ['5.03'], `↩ Back to ${fromNo}`, 'one step back');
    await page.goBack();
    await returned(start, ['12.01'], ['5.00', '5.03'], null, 'two steps back');

    // Forward from 5.00 to 5.03 again: the jump the button would undo is no longer the last step.
    await follow(linkTo('12.01', '5.00'), '5.00');
    await follow(linkTo('5.00', '5.03'), '5.03');
    await page.goBack();
    await page.waitForFunction((sel) => !document.querySelector(sel).classList.contains('open'), { timeout: WAIT }, rowAt('5.03'));
    check((await backReads()).words === `↩ Back to ${fromNo}`, 'one step back, the way back to 12.01 is not offered');
    await page.goForward();
    await page.waitForSelector(`${rowAt('5.03')}.open`);
    button = await backReads();
    check(!button.shown, `after Forward the button reads ${JSON.stringify(button)}`);

    await follow(linkTo('12.01', '5.00'), '5.00');
    check((await backReads()).shown, 'no way back after the jump');
    await page.reload();
    await page.waitForSelector(`${rowAt('5.00')}.open`);
    button = await backReads();
    check(!button.shown, `after a reload the button reads ${JSON.stringify(button)}`);
  });

  await step('with a keyword and a kind pressed and the list sorted by type, the link clears the keyword and the kind and keeps the sort; ↩ Back presses them again', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const rows = await page.evaluate(() => Object.fromEntries(['12.01', '5.00'].map((id) => {
      const el = document.querySelector(`article.row[data-no="${id}"]`);
      return [id, { kw: el.dataset.kw.split(' ').filter(Boolean), kind: el.dataset.kind }];
    })));
    const keyword = rows['12.01'].kw.find((k) => !rows['5.00'].kw.includes(k));
    const kind = rows['12.01'].kind;
    check(keyword && kind && kind !== rows['5.00'].kind, `no keyword and kind of 12.01 leave 5.00 out: ${JSON.stringify(rows)}`);
    await page.click('.colhead button[data-sort="type"]');
    await page.click(`.keywords button[data-k="${keyword}"]`);
    await page.click(`.kinds button[data-kind="${kind}"]`);
    check(await page.$eval(rowAt('5.00'), (el) => el.hidden), '5.00 shows under the keyword and the kind');
    await page.click(`${rowAt('12.01')} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${rowAt('12.01')}.open`);
    check(JSON.stringify(await pressed()) === JSON.stringify({ k: [keyword], t: [kind], s: 'type' }), `before the jump ${JSON.stringify(await pressed())} is pressed`);
    const from = await follow(linkTo('12.01', '5.00'), '5.00');
    check(await inView(page, `${rowAt('5.00')} > .row-head`), '5.00 is not in view');
    const after = await pressed();
    check(after.k.length === 0 && after.t.length === 0 && after.s === 'type', `after the jump ${JSON.stringify(after)} is pressed`);
    check(!/[#&](k|t)=/.test((await where()).hash), `the address still filters: ${(await where()).hash}`);
    await page.click('button.way-back');
    await returned(from, ['12.01'], ['5.00'], null, 'after ↩ Back');
    check(JSON.stringify(await pressed()) === JSON.stringify({ k: [keyword], t: [kind], s: 'type' }), `after ↩ Back ${JSON.stringify(await pressed())} is pressed`);
    check(await page.$eval(rowAt('5.00'), (el) => el.hidden), '5.00 shows again under the keyword and the kind');
  });

  await step('with a search typed, the link clears it; ↩ Back puts its words back in the field and the list it found', async () => {
    await page.goto(`${base}/edit/`); // the story order, nothing pressed
    await page.waitForSelector('.ed-bar');
    await page.click('form.find input');
    await page.keyboard.type('Quokkaland');
    await page.waitForFunction((hidden, found) => document.querySelector(hidden).hidden && !document.querySelector(found).hidden, { timeout: WAIT }, rowAt('5.00'), rowAt('12.01'))
      .catch(() => { throw new Error('the search did not leave 5.00 out and 12.01 in'); });
    await page.click(`${rowAt('12.01')} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${rowAt('12.01')}.open`);
    const from = await follow(linkTo('12.01', '5.00'), '5.00');
    check(from.hash.includes('q=Quokkaland'), `the address before the jump was ${from.hash}`);
    check(await inView(page, `${rowAt('5.00')} > .row-head`), '5.00 is not in view');
    check(await page.$eval('form.find input', (el) => el.value) === '', 'the search field still holds words');
    check(!(await where()).hash.includes('q='), 'the address still searches');
    await page.click('button.way-back');
    await returned(from, ['12.01'], ['5.00'], null, 'after ↩ Back');
    check(await page.$eval('form.find input', (el) => el.value) === 'Quokkaland', 'the search field lost its words');
    check(await page.$eval(rowAt('5.00'), (el) => el.hidden), 'the search no longer leaves 5.00 out');
  });

  await step('from the idea the button reads ↩ Back to the idea, from a hidden row ↩ Back, and each returns', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const idea = 'section.idea a[data-row="5.00"]';
    let from = await follow(idea, '5.00');
    let button = await backReads();
    check(button.shown && button.words === '↩ Back to the idea', `from the idea the button reads ${JSON.stringify(button)}`);
    await page.click('button.way-back');
    await returned(from, [], ['5.00'], null, 'back to the idea');

    await page.click(`${rowAt('5.01')} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${rowAt('5.01')}.open`);
    from = await follow(linkTo('5.01', '5.00'), '5.00');
    button = await backReads();
    check(button.shown && button.words === '↩ Back', `from the hidden row the button reads ${JSON.stringify(button)}`);
    await page.click('button.way-back');
    await returned(from, ['5.01'], ['5.00'], null, 'back to the hidden row');
  });

  // An edit redraws every link to what it changed, the idea's and other rows' too, at once: hidden,
  // 5.00's links are dotted with the sentence; shown again, they are links. An answer that comes
  // while the idea's field is open waits for the field to close.
  await step('5.00 hidden: the links to it in 12.01, in 5.01 and in the idea are dotted at once with The row is hidden.; shown again, links again; the idea waits for its open field', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await page.evaluate(() => { window.notReloaded = true; });
    const links = () => page.evaluate(() => ({
      live: [...document.querySelectorAll('a[data-row="5.00"]')].map((a) => a.closest('article.row')?.dataset.no ?? 'idea').sort(),
      dead: [...document.querySelectorAll('.dead-link[title="The row is hidden."]')].map((s) => `${s.closest('article.row')?.dataset.no ?? 'idea'}:${s.textContent}`).sort(),
      pencils: document.querySelectorAll('section.idea button.ed[data-ed="idea"]').length,
      same: window.notReloaded === true,
    }));
    const linksRead = async (want, when) => {
      const deadline = Date.now() + WAIT;
      let seen = await links();
      while (JSON.stringify(seen) !== JSON.stringify(want) && Date.now() < deadline) {
        await pause(50);
        seen = await links();
      }
      check(JSON.stringify(seen) === JSON.stringify(want), `${when}, the links read ${JSON.stringify(seen)}`);
    };
    const shown = { live: ['12.01', '5.01', 'idea'], dead: ['12.01:the hidden one'], pencils: 1, same: true };
    const hidden = { live: [], dead: ['12.01:the fixture notes', '12.01:the hidden one', '5.01:the notes', 'idea:fixture notes'], pencils: 1, same: true };
    await linksRead(shown, 'at first');
    let answered = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answered).status() === 200, 'the row was not hidden');
    await linksRead(hidden, '5.00 hidden');
    answered = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answered).status() === 200, 'the row was not shown again');
    await linksRead(shown, '5.00 shown again');

    // The idea's field opened before the answer comes: the idea it brings waits until Escape.
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 1500 });
    try {
      answered = answerTo(page, 'op');
      await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
      await page.click('section.idea button.ed[data-ed="idea"]');
      await page.waitForSelector('section.idea .ed-field textarea');
      check((await answered).status() === 200, 'the row was not hidden');
      await pause(300);
      const open = await page.evaluate(() => ({
        field: Boolean(document.querySelector('section.idea .ed-field textarea')),
        live: Boolean(document.querySelector('section.idea a[data-row="5.00"]')),
      }));
      check(open.field && open.live, `with the idea's field open, the idea is ${JSON.stringify(open)}`);
    } finally {
      await page.emulateNetworkConditions(null);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('section.idea .ed-field', { hidden: true });
    await linksRead(hidden, 'the idea\'s field closed');
    answered = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answered).status() === 200, 'the row was not shown again');
    await linksRead(shown, '5.00 shown again');
  });

  // A row whose links an edit elsewhere changes is not drawn anew: only those links are, so what
  // the author has open in it stays (Task 17 re-review B).
  await step('12.01, its link to 5.00 dotted by 5.00\'s hide while its keyword list is open with words typed: the list, the words, the focus and the row stay, the other link too', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    // Marked by a property, not an attribute: an attribute would make the link read otherwise.
    await page.$eval(rowAt('12.01'), (row) => {
      row.kept = true;
      row.querySelector('.txt .dead-link').kept = true; // to 5.01, which the hide leaves as it is
    });
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 1500 });
    try {
      const answered = answerTo(page, 'op');
      await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
      await page.click(`${rowAt('12.01')} button.ed[data-ed="kw-add"]`);
      await page.waitForSelector(`${rowAt('12.01')} .ed-pick input`);
      await page.keyboard.type('quok');
      check((await answered).status() === 200, 'the row was not hidden');
      await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((el) => el.textContent === 'the fixture notes'), { timeout: WAIT }, `${rowAt('12.01')} .txt .dead-link[title="The row is hidden."]`)
        .catch(() => { throw new Error('12.01\'s link to 5.00 is not dotted'); });
    } finally {
      await page.emulateNetworkConditions(null);
    }
    const kept = await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      const input = row.querySelector('.ed-pick input');
      return {
        row: row.kept === true,
        link: [...row.querySelectorAll('.txt .dead-link')].some((el) => el.kept === true && el.textContent === 'the hidden one'),
        typed: input?.value ?? null,
        focused: Boolean(input) && input === document.activeElement,
      };
    }, rowAt('12.01'));
    check(JSON.stringify(kept) === JSON.stringify({ row: true, link: true, typed: 'quok', focused: true }), `after the answer 12.01 holds ${JSON.stringify(kept)}`);
    await page.keyboard.press('Escape');
    const answered = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answered).status() === 200, 'the row was not shown again');
    await page.waitForSelector(linkTo('12.01', '5.00'));
  });

  // A drawing of 12.01 waits while a field is open in it (core.js, putRow): the page's row is then
  // older than the server's, and an edit that relinks it brings that waiting drawing up to date and
  // leaves the page as it is, so that no old words ever carry new links (Task 17 re-review, round 3).
  await step('12.01\'s keyword taken off while its title field opens waits for the field; 5.00 hidden meanwhile changes nothing there; the field left, 12.01 shows both edits', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const row = rowAt('12.01');
    const holds = () => page.$eval(row, (el) => ({
      keyword: Boolean(el.querySelector('.c-kw button[data-k="humour"]')),
      live: Boolean(el.querySelector('.txt a[data-row="5.00"]')),
      field: Boolean(el.querySelector('.ed-field[data-ed="title"]')),
    }));
    check(JSON.stringify(await holds()) === JSON.stringify({ keyword: true, live: true, field: false }), `12.01 holds ${JSON.stringify(await holds())} to begin with`);
    const before = sent.length;
    await page.emulateNetworkConditions({ offline: false, download: 100e6, upload: 100e6, latency: 1500 });
    try {
      await page.click(`${row} .c-kw button.ed[data-ed="kw:humour"]`);
      await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
      await page.click(`${row} button.ed[data-ed="title"]`);
      await page.waitForSelector(`${row} .ed-field[data-ed="title"] input`);
      await sentSince(before, 2);
      check(sent.slice(before).every((s) => s.status === 200), `answered ${sent.slice(before).map((s) => s.status).join(' and ')}`);
    } finally {
      await page.emulateNetworkConditions(null);
    }
    await pause(300);
    const meanwhile = await holds();
    check(JSON.stringify(meanwhile) === JSON.stringify({ keyword: true, live: true, field: true }), `with the title field open, 12.01 holds ${JSON.stringify(meanwhile)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return !el.querySelector('.ed-field') && !el.querySelector('.c-kw button[data-k="humour"]')
        && el.querySelector('.txt .dead-link[title="The row is hidden."]')?.textContent === 'the fixture notes';
    }, { timeout: WAIT }, row).catch(async () => { throw new Error(`the title field left, 12.01 holds ${JSON.stringify(await holds())}`); });
    const answered = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answered).status() === 200, 'the row was not shown again');
    await page.waitForSelector(linkTo('12.01', '5.00'));
  });

  // The race of the idea saved and an edit queued behind it (re-review C): the idea is changed and
  // 5.00's 👁 clicked, which leaves the field, so set-idea goes, then hide-row. Once set-idea is
  // answered, the page asks for itself again (idea.js) while hide-row goes out: here the page asked
  // for reads the draft before the hide is saved and answers only after the hide is answered. The
  // idea shown at the end is the newer, with 5.00 dotted, whatever order the two drawings came in.
  await step('the idea saved with 5.00 hidden right behind it: the page asked for after the save, older and answering last, does not cover the idea drawn after the hide', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    let read;
    let answered;
    const pageRead = new Promise((resolve) => { read = resolve; });
    const hideAnswered = new Promise((resolve) => { answered = resolve; });
    const isHide = (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/edit/op' && /"op":"hide-row"/.test(request.postData() ?? '');
    const onResponse = (response) => { if (isHide(response.request())) answered(); };
    const onRequest = async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/edit/' && request.resourceType() === 'fetch') {
        const body = await fetch(request.url(), { headers: { cookie, accept: 'text/html' } }).then((r) => r.text());
        read();
        await Promise.race([hideAnswered, pause(WAIT)]);
        return request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      }
      if (isHide(request)) await Promise.race([pageRead, pause(WAIT)]);
      return request.continue();
    };
    page.on('response', onResponse);
    page.on('request', onRequest);
    await page.setRequestInterception(true);
    try {
      await page.click('section.idea button.ed[data-ed="idea"]');
      const area = 'section.idea .ed-field[data-ed="idea"] textarea';
      await page.waitForSelector(area);
      await page.$eval(area, (el) => el.setSelectionRange(el.value.length, el.value.length));
      await page.keyboard.type(' Again.');
      await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
      await Promise.race([hideAnswered, pause(WAIT).then(() => { throw new Error('the hide was not answered'); })]);
      await page.waitForSelector('section.idea .ed-field', { hidden: true });
      await pause(500);
    } finally {
      await page.setRequestInterception(false);
      page.off('request', onRequest);
      page.off('response', onResponse);
    }
    const idea = await page.$eval('section.idea', (el) => ({
      text: [...el.querySelectorAll('p')].map((p) => p.textContent).join(' '),
      dead: el.querySelector('.dead-link[title="The row is hidden."]')?.textContent ?? null,
      live: Boolean(el.querySelector('a[data-row="5.00"]')),
      pencils: el.querySelectorAll('button.ed[data-ed="idea"]').length,
    }));
    check(idea.text.endsWith('Again.') && idea.dead === 'fixture notes' && !idea.live && idea.pencils === 1, `the idea shows ${JSON.stringify(idea)}`);
    const answeredShow = answerTo(page, 'op');
    await page.click(`${rowAt('5.00')} button.ed[data-ed="hide"]`);
    check((await answeredShow).status() === 200, 'the row was not shown again');
    await page.waitForSelector('section.idea a[data-row="5.00"]');
  });

  await step('at a phone\'s width the way back stands at the bottom, inside the screen, and returns', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await page.evaluate(() => { history.scrollRestoration = 'manual'; });
    await page.click(`${rowAt('12.01')} .c-title > button:not(.ed)`);
    await page.waitForSelector(`${rowAt('12.01')}.open`);
    const from = await follow(linkTo('12.01', '5.00'), '5.00');
    check(await inView(page, `${rowAt('5.00')} > .row-head`), '5.00 is not in view');
    const button = await backReads();
    check(button.shown && button.words === `↩ Back to ${fromNo}`, `the button reads ${JSON.stringify(button)}`);
    check(button.gap >= 0 && button.gap <= 40 && button.left >= 0 && button.right <= 390, `the button stands at ${JSON.stringify(button)}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the page is wider than the screen');
    await page.click('button.way-back');
    await returned(from, ['12.01'], ['5.00'], null, 'after ↩ Back at a phone\'s width');
    await page.setViewport({ width: 1280, height: 900 });
  });

  await step('on the public site, once published: the link to the hidden row is its words alone, the other opens its row, and ↩ Back returns', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    await page.click('.ed-bar .ed-publish');
    await page.waitForSelector('dialog.ed-dialog[open] .ed-yes');
    const answered = answerTo(page, 'publish');
    await page.click('dialog.ed-dialog[open] .ed-yes');
    check((await answered).status() === 200, 'the publish was refused');
    await page.goto(`${base}/`);
    await page.click(`${rowAt('12.01')} .c-title button`);
    await page.waitForSelector(`${rowAt('12.01')}.open`);
    const words = await page.$eval(`${rowAt('12.01')} .txt p`, (p) => ({ text: p.textContent, html: p.innerHTML }));
    check(words.text === 'Compare the fixture notes with the hidden one in Quokkaland.', `the text reads ${JSON.stringify(words.text)}`);
    check(!words.html.includes('5.01') && !words.html.includes('dead-link'), `the text holds ${words.html}`);
    start = await follow(linkTo('12.01', '5.00'), '5.00');
    check(await inView(page, `${rowAt('5.00')} > .row-head`), '5.00 is not in view');
    const publicNo = await page.$eval(`${rowAt('12.01')} .c-no`, (el) => el.textContent.trim());
    const button = await backReads();
    check(button.shown && button.words === `↩ Back to ${publicNo}`, `the button reads ${JSON.stringify(button)}`);
    await page.click('button.way-back');
    await returned(start, ['12.01'], ['5.00'], null, 'after ↩ Back on the public page');
  });

  // 🔗 and the legend (Task 18). In an open row's text field: words selected, 🔗, part of another
  // row's title typed, and Enter write the link around them, which the row shows once saved;
  // Escape in the finder leaves the text as it was, the field open with the same words selected.
  // The legend stands under the field while it is open and goes with it. About and the idea have
  // their own legends; About's finder closes on Escape and leaves the dialog open.
  const LEGEND = [
    '[[the bridge|Ponte Druso]] — the words filter the Library by that keyword',
    '[[the postcard|@1.09]] — the words open that row (the code is its id, kept when it moves)',
    '[[more|page:on-the-bridge]] — the words open that page',
    '🔗 writes these for you; you can also type them.',
  ];
  const PARAGRAPHS = 'An empty line starts a paragraph.';
  const MARKDOWN = 'An empty line starts a paragraph · *italic* · **bold** · [words](https://…) a web link';
  // The legend's lines as they read, its drawn 🔗 read as 🔗.
  const legendIn = (within) => page.$$eval(`${within} .ed-legend li`, (lines) => lines.map((li) => (li.querySelector('svg.ed-icon-link') ? '🔗' : '') + li.textContent));
  // The text field, what it holds and where its selection is, whether it has the focus, and
  // whether its finder is closed.
  const fieldIs = (area) => page.$eval(area, (el) => ({
    value: el.value,
    selection: [el.selectionStart, el.selectionEnd],
    focused: el === document.activeElement,
    finderClosed: el.closest('.ed-linker')?.querySelector('.ed-finder')?.hidden ?? 'no finder',
  }));
  const textOf = (id) => `${rowAt(id)} .ed-field[data-ed="text"] textarea`;
  // Opens the row, if it is not, and its text's field, once the row has ended opening and ✎ is
  // still. -> the field's textarea, as a selector.
  const openText = async (id) => {
    if (!(await isOpen(id))) await page.click(`${rowAt(id)} .c-title > button:not(.ed)`);
    const pencil = `${rowAt(id)}.open button.ed[data-ed="text"]`;
    await page.waitForSelector(pencil);
    await stillAt(page, pencil);
    await page.click(pencil);
    await page.waitForSelector(textOf(id));
    return textOf(id);
  };

  await step('in an open row\'s text, words selected, 🔗, part of another row\'s title typed and Enter write [[words|@<id>]]; saved, the row shows the link; the legend stands under the field while it is open and not after', async () => {
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const row = rowAt('12.01');
    const target = await page.$eval(rowAt('5.03'), (el) => ({ no: el.querySelector('.c-no').textContent.trim(), title: el.querySelector('.c-title > button:not(.ed)').textContent }));
    check(!(await page.$(`${row} .ed-legend`)), 'the legend shows before the field is open');
    const area = await openText('12.01');
    const before = (await fieldIs(area)).value;
    check(before.endsWith(' in Quokkaland.'), `the field holds ${JSON.stringify(before)}`);
    const placed = await page.$eval(`${row} .ed-field[data-ed="text"]`, (box) => {
      const [link, text, legend] = ['button.ed-link', 'textarea', '.ed-legend'].map((sel) => box.querySelector(sel)?.getBoundingClientRect());
      return { label: box.querySelector('button.ed-link')?.getAttribute('aria-label'), above: Boolean(link && text) && link.bottom <= text.top, under: Boolean(text && legend) && legend.top >= text.bottom };
    });
    check(placed.label === 'Link the selected words' && placed.above && placed.under, `🔗 and the legend stand ${JSON.stringify(placed)}`);
    const legend = await legendIn(row);
    check(JSON.stringify(legend) === JSON.stringify([...LEGEND, PARAGRAPHS]), `the legend reads ${JSON.stringify(legend, null, 1)}`);

    const words = 'Quokkaland';
    const at = before.lastIndexOf(words);
    await page.$eval(area, (el, from, to) => el.setSelectionRange(from, to), at, at + words.length);
    const count = sent.length;
    await page.click(`${row} button.ed-link`);
    const find = `${row} .ed-finder input`;
    await page.waitForSelector(find, { visible: true });
    check(await page.$eval(find, (el) => el === document.activeElement && el.getAttribute('aria-label') === 'Row number or title, keyword, page'), 'the finder\'s field is not in focus, or not so named');
    await page.keyboard.type(target.title.slice(0, 9).trim());
    await page.waitForSelector(`${row} .ed-finder li[aria-selected="true"]`);
    const first = await page.$eval(`${row} .ed-finder li[aria-selected="true"]`, (li) => li.textContent);
    check(first === `${target.no} · ${target.title}`, `the first match reads ${JSON.stringify(first)}, not ${target.no} · ${target.title}`);
    await page.screenshot({ path: path.join(SHOTS, 'linker.png') });
    await page.keyboard.press('Enter');
    const link = `[[${words}|@5.03]]`;
    const want = `${before.slice(0, at)}${link}${before.slice(at + words.length)}`;
    const caret = at + link.length;
    const after = await fieldIs(area);
    check(JSON.stringify(after) === JSON.stringify({ value: want, selection: [caret, caret], focused: true, finderClosed: true }), `after Enter the field is ${JSON.stringify(after)}`);
    await pause(200);
    check(sent.length === count, 'Enter in the finder saved the field');
    // In the field's own history: undone, the words are as they were; done again, the link is back.
    await page.evaluate(() => document.execCommand('undo'));
    check((await fieldIs(area)).value === before, `undone, the field holds ${JSON.stringify((await fieldIs(area)).value)}`);
    await page.evaluate(() => document.execCommand('redo'));
    check((await fieldIs(area)).value === want, `done again, the field holds ${JSON.stringify((await fieldIs(area)).value)}`);

    const answered = answerTo(page, 'op');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    check((await answered).status() === 200, 'the text was not saved');
    check(JSON.stringify(sent.at(-1).body.op) === JSON.stringify({ op: 'set-row', id: '12.01', fields: { text: [want] } }), `the edit sent was ${JSON.stringify(sent.at(-1).body.op)}`);
    await page.waitForSelector(`${row} .ed-field`, { hidden: true });
    await page.waitForSelector(linkTo('12.01', '5.03'));
    check(await page.$eval(linkTo('12.01', '5.03'), (a) => a.textContent) === words, 'the link does not read its words');
    check(!(await page.$(`${row} .ed-legend`)) && !(await page.$(`${row} button.ed-link`)), 'the legend or 🔗 stays after the field closed');
  });

  await step('from the keyboard, ⇧Tab and Enter on 🔗 open the finder and save nothing; ↓ and ↑ move along the matches; Escape leaves the text as it was, the same words selected, and Escape again closes the field', async () => {
    const row = rowAt('12.01');
    const shown = await page.$eval(`${row} .txt > p`, (p) => p.innerHTML);
    const area = await openText('12.01');
    const before = (await fieldIs(area)).value;
    await page.$eval(area, (el) => el.setSelectionRange(0, 7)); // Compare
    const count = sent.length;
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    check(await page.$eval(`${row} button.ed-link`, (el) => el === document.activeElement), '⇧Tab from the field does not reach 🔗');
    await page.keyboard.press('Enter');
    const find = `${row} .ed-finder input`;
    await page.waitForSelector(find, { visible: true });
    check(await page.$eval(find, (el) => el === document.activeElement), 'the finder\'s field is not in focus');
    check(await page.$(area) !== null, 'Enter on 🔗 closed the field');
    await page.keyboard.type('a'); // more rows than eight, and the keyword Archives, which they leave room for
    const options = () => page.$$eval(`${row} .ed-finder li`, (lis) => lis.map((li) => `${li.getAttribute('aria-selected')}:${li.textContent}`));
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 1, { timeout: WAIT }, `${row} .ed-finder li`)
      .catch(async () => { throw new Error(`a lists ${JSON.stringify(await options())}`); });
    let listed = await options();
    const rowsListed = listed.filter((line) => /^(true|false):(\d+\.\d+|—) · /.test(line)).length;
    check(listed[0].startsWith('true:') && rowsListed === 5 && listed.includes('false:Keyword · Archives') && listed.length <= 8, `a lists ${JSON.stringify(listed)}`);
    await page.keyboard.press('ArrowDown');
    listed = await options();
    check(listed[1].startsWith('true:') && !listed[0].startsWith('true:'), `↓ leaves ${JSON.stringify(listed)}`);
    await page.keyboard.press('ArrowUp');
    listed = await options();
    check(listed[0].startsWith('true:') && !listed[1].startsWith('true:'), `↑ leaves ${JSON.stringify(listed)}`);
    await page.keyboard.press('Escape');
    const after = await fieldIs(area);
    check(JSON.stringify(after) === JSON.stringify({ value: before, selection: [0, 7], focused: true, finderClosed: true }), `after Escape the field is ${JSON.stringify(after)}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`${row} .ed-field`, { hidden: true });
    check(await page.$eval(`${row} .txt > p`, (p) => p.innerHTML) === shown, 'the text shows otherwise');
    check(sent.length === count, `${sent.length - count} edits were sent`);
  });

  await step('the finder says Nothing found. when nothing is, and of words inside a link that they cannot be linked; a press on its frame or beside 🔗 keeps it open, the focus in it; nothing is written or sent', async () => {
    const row = rowAt('12.01');
    const area = await openText('12.01');
    const before = (await fieldIs(area)).value;
    const count = sent.length;
    const find = `${row} .ed-finder input`;
    const finder = () => page.$eval(`${row} .ed-finder`, (el) => {
      const say = el.querySelector('.ed-finder-say');
      return { open: !el.hidden, says: say.hidden ? '' : say.textContent, listed: el.querySelectorAll('li').length, focused: el.querySelector('input') === document.activeElement };
    });
    await page.$eval(area, (el) => el.setSelectionRange(0, 7)); // Compare
    await page.click(`${row} button.ed-link`);
    await page.waitForSelector(find, { visible: true });
    await page.keyboard.type('2.99');
    const nothing = { open: true, says: 'Nothing found.', listed: 0, focused: true };
    let seen = await finder();
    check(JSON.stringify(seen) === JSON.stringify(nothing), `2.99 typed, the finder is ${JSON.stringify(seen)}`);
    await page.keyboard.press('Enter');
    seen = await finder();
    check(JSON.stringify(seen) === JSON.stringify(nothing), `after Enter the finder is ${JSON.stringify(seen)}`);
    const points = await page.$eval(`${row} .ed-linker`, (el) => {
      const frame = el.querySelector('.ed-finder').getBoundingClientRect();
      const bar = el.querySelector('.ed-link-bar').getBoundingClientRect();
      const link = el.querySelector('button.ed-link').getBoundingClientRect();
      return [{ at: 'the finder\'s frame', x: frame.left + 3, y: frame.bottom - 3 }, { at: 'the bar beside 🔗', x: link.right + 40, y: bar.top + bar.height / 2 }];
    });
    for (const { at, x, y } of points) {
      await page.mouse.click(x, y);
      seen = await finder();
      check(JSON.stringify(seen) === JSON.stringify(nothing), `after a press on ${at} the finder is ${JSON.stringify(seen)}`);
    }
    await page.keyboard.press('Escape');
    let now = await fieldIs(area);
    check(JSON.stringify(now) === JSON.stringify({ value: before, selection: [0, 7], focused: true, finderClosed: true }), `after Escape the field is ${JSON.stringify(now)}`);

    const words = 'fixture notes'; // the words of the link to 5.00
    const at = before.indexOf(words);
    await page.$eval(area, (el, from, to) => el.setSelectionRange(from, to), at, at + words.length);
    await page.click(`${row} button.ed-link`);
    await page.waitForSelector(find, { visible: true });
    const refused = { open: true, says: 'Select words inside one paragraph, outside any other link.', listed: 0, focused: true };
    seen = await finder();
    check(JSON.stringify(seen) === JSON.stringify(refused), `with words inside a link selected the finder is ${JSON.stringify(seen)}`);
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    seen = await finder();
    check(JSON.stringify(seen) === JSON.stringify(refused), `a typed and Enter, the finder is ${JSON.stringify(seen)}`);
    await page.keyboard.press('Escape');
    now = await fieldIs(area);
    check(JSON.stringify(now) === JSON.stringify({ value: before, selection: [at, at + words.length], focused: true, finderClosed: true }), `after Escape the field is ${JSON.stringify(now)}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`${row} .ed-field`, { hidden: true });
    check(sent.length === count, `${sent.length - count} edits were sent`);
  });

  await step('About and the idea have 🔗 and their legends; in About a keyword chosen by a click is written at the caret, and Escape in its finder closes the finder and leaves the dialog open', async () => {
    await page.click('.ed-bar .ed-about');
    const dialog = 'dialog.ed-about-dialog[open]';
    const area = `${dialog} textarea`;
    await page.waitForSelector(area);
    const legend = await legendIn(dialog);
    check(JSON.stringify(legend) === JSON.stringify([...LEGEND, MARKDOWN, '## a heading']), `About's legend reads ${JSON.stringify(legend, null, 1)}`);
    const before = (await fieldIs(area)).value;
    await page.click(`${dialog} button.ed-link`);
    await page.waitForSelector(`${dialog} .ed-finder input`, { visible: true });
    await page.keyboard.type('zz');
    await page.keyboard.press('Escape');
    await pause(200);
    const kept = await fieldIs(area).catch(() => null);
    check(kept !== null && JSON.stringify(kept) === JSON.stringify({ value: before, selection: [0, 0], focused: true, finderClosed: true }), `after Escape in About's finder the field is ${JSON.stringify(kept)}`);
    await page.click(`${dialog} button.ed-link`);
    await page.keyboard.type('druso');
    const option = `${dialog} .ed-finder li[aria-selected="true"]`;
    await page.waitForSelector(option);
    check(await page.$eval(option, (li) => li.textContent) === 'Keyword · Ponte Druso', 'druso does not list Keyword · Ponte Druso first');
    await page.click(option);
    const link = '[[Ponte Druso|Ponte Druso]]';
    const after = await fieldIs(area);
    check(JSON.stringify(after) === JSON.stringify({ value: link + before, selection: [link.length, link.length], focused: true, finderClosed: true }), `after a click About's field is ${JSON.stringify({ ...after, value: after.value.slice(0, 60) })}`);
    await page.keyboard.press('Escape'); // from the field, Escape is the dialog's
    await page.waitForSelector(dialog, { hidden: true });

    await page.click('section.idea button.ed[data-ed="idea"]');
    await page.waitForSelector('section.idea .ed-field textarea');
    const idea = await legendIn('section.idea');
    check(JSON.stringify(idea) === JSON.stringify([...LEGEND, PARAGRAPHS]), `the idea's legend reads ${JSON.stringify(idea, null, 1)}`);
    check(await page.$('section.idea .ed-field button.ed-link') !== null, 'the idea has no 🔗');
    await page.keyboard.press('Escape');
    await page.waitForSelector('section.idea .ed-field', { hidden: true });
  });

  await step('at a phone\'s width 🔗\'s finder and the legend stand inside the screen', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/edit/`);
    await page.waitForSelector('.ed-bar');
    const row = rowAt('12.01');
    await openText('12.01');
    await page.click(`${row} button.ed-link`);
    await page.waitForSelector(`${row} .ed-finder input`, { visible: true });
    await page.keyboard.type('a');
    await page.waitForSelector(`${row} .ed-finder li`);
    const boxes = await page.$eval(`${row} .ed-field`, (box) => [box.querySelector('.ed-finder'), box.querySelector('.ed-legend')].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right) };
    }));
    check(boxes.every((b) => b.left >= 0 && b.right <= 390), `the finder and the legend stand at ${JSON.stringify(boxes)}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the page is wider than the screen');
    await page.screenshot({ path: path.join(SHOTS, 'linker-phone.png') });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForSelector(`${row} .ed-field`, { hidden: true });
    await page.setViewport({ width: 1280, height: 900 });
  });

  console.log(`All ${n} steps hold. Screenshots: ${['edit-page.png', 'public-page.png', 'edit-phone.png', 'edit-compact.png', 'edit-compact-phone.png', 'way-back.png', 'linker.png', 'linker-phone.png'].map((name) => path.join(SHOTS, name)).join(', ')}`);
}

try {
  await main();
} catch (error) {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
