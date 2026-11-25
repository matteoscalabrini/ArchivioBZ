// node library/test/browser/edit.check.mjs   (npm run check:edit)
//
// Edit mode as the author meets it, in a browser: the local server (tools/dev.mjs) on a draft made
// afresh from the test fixtures in a temporary folder, the installed Chrome driven headless by
// puppeteer-core with a profile of its own, and each step below checked on the page. Each step
// that holds is printed; the first that does not stops the check with what the page showed
// instead, and the exit code is 1. The server, the browser and the temporary folders go in every
// outcome. Screenshots of the edit page and of the public page after Publish are written to
// library/.cache/check-edit/. Not part of npm test, since it needs Chrome.
//
// The fixtures' draft, by row id: chapter c1 "Zero" [0.01], c2 "Five" [5.00 5.01 5.02 5.03],
// c3 "Twelve" [12.01]; numbered 1.01, 2.01 to 2.04 and 3.01 to begin with. The steps build on
// each other, so each one names the order it expects in full.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDb } from '../../cloud/db.mjs';
import { makeStore } from '../../cloud/store.mjs';
import { moveIn, devPictures } from '../../tools/move-in.mjs';
import { startDev } from '../../tools/dev.mjs';
import { changesIn, publishQuestion } from '../../web/editmodel.js';

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

async function main() {
  work = await mkdtemp(path.join(os.tmpdir(), 'edit-check-'));
  const root = path.join(work, 'root');
  const dataDir = path.join(work, 'db');
  const imgDir = path.join(work, 'img');
  // The fixtures as cleanRoot (test/helpers.mjs) copies them, without the deliberately broken
  // folder; helpers.mjs is not imported, since it hooks into node:test, which this is not.
  await cp(FIXTURES, root, { recursive: true, filter: (src) => path.basename(src) !== 'bad' });
  const pg = new PGlite(dataDir);
  const store = makeStore(pgliteDb(pg));
  await store.init();
  await moveIn({ root, store, putPicture: devPictures(imgDir), chapterTitles: CHAPTER_TITLES });
  await pg.close();
  dev = await startDev({ port: 0, dataDir, imgDir, password: 'dev' });
  const base = dev.url.replace(/\/edit\/$/, '');

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

  await step('2.01 typed on the row of chapter 1 moves it to the head of chapter 2, and the numbers follow', async () => {
    await typeNumber(page, '0.01', '2.01');
    const answered = answerTo(page, 'op');
    await page.keyboard.press('Enter');
    check((await answered).status() === 200, 'the number was not taken');
    const want = '# c1 # c2 0.01=2.01 5.00=2.02 5.01=2.03 5.02=2.04 5.03=2.05 # c3 12.01=3.01';
    await listShows(page, want, 'after 2.01');
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await listShows(page, want, 'after a reload');
  });

  await step('a row dragged below another stays there after a reload', async () => {
    const answered = answerTo(page, 'op');
    await drag(page, 'article.row[data-no="5.00"] .ed-grip', 'article.row[data-no="5.01"]', 0.75);
    check((await answered).status() === 200, 'the move was not saved');
    const move = sent.at(-1).body?.op;
    check(move?.op === 'move-row' && move.id === '5.00' && move.chapter === 'c2' && move.index === 2,
      `the drop sent ${JSON.stringify(move)}, not move-row of 5.00 to c2 at 2`);
    const want = '# c1 # c2 0.01=2.01 5.01=2.02 5.00=2.03 5.02=2.04 5.03=2.05 # c3 12.01=3.01';
    await listShows(page, want, 'after the drop');
    await page.reload();
    await page.waitForSelector('.ed-bar');
    await listShows(page, want, 'after a reload');
  });

  await step('a hidden row is numbered —, and the rows after it close up', async () => {
    const answered = answerTo(page, 'op');
    await page.click('article.row[data-no="5.01"] button.ed[data-ed="hide"]');
    check((await answered).status() === 200, 'the row was not hidden');
    await listShows(page, '# c1 # c2 0.01=2.01 5.01=— 5.00=2.02 5.02=2.03 5.03=2.04 # c3 12.01=3.01', 'after 👁');
    check(await page.$eval('article.row[data-no="5.01"]', (el) => el.hasAttribute('data-hidden')), 'the hidden row carries no data-hidden');
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
    const summary = await page.$eval('.ed-summary', (el) => el.textContent);
    await page.screenshot({ path: path.join(SHOTS, 'edit-page.png'), fullPage: true });
    await page.click('.ed-bar .ed-publish');
    const question = await page.waitForSelector('dialog.ed-dialog[open] .ed-question');
    const asked = await question.evaluate((el) => el.textContent);
    const want = publishQuestion(changesIn(summary));
    check(asked === want, `asked ${JSON.stringify(asked)}, not ${JSON.stringify(want)} (the summary read ${JSON.stringify(summary)})`);
    check(changesIn(summary) > 0, `the summary ${JSON.stringify(summary)} counts no change`);
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

  console.log(`All ${n} steps hold. Screenshots: ${path.join(SHOTS, 'edit-page.png')} and ${path.join(SHOTS, 'public-page.png')}`);
}

try {
  await main();
} catch (error) {
  console.error(`not ok - ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
