// The request logic of the two functions. `site` answers the four public files of the latest
// publish, which Vercel's edge keeps until a publish clears them; `edit` answers the edit mode at
// /edit/: the login, the Library drawn from the draft, and the requests its page sends. Everything
// they use is given (the store, the environment, the lists, the purge, the wait), so the tests run
// them on PGlite, the local server runs them on its own, and api/ only wires them to Neon.
// The route is a query parameter because vercel.json rewrites /index.html to /api/site?path=… and
// /edit/<route> to /api/edit?route=<route>; a request without it is read by its own path (/,
// /map.html, /edit/op), which names the same file or route. The pictures the author adds go through
// stores given as `pictures` (cloud/pictures.mjs, which this file never imports, so that the public
// site's function does not carry sharp): the cloud's, or this computer's.
import { createHash } from 'node:crypto';
import { applyOp, OpError } from './ops.mjs';
import { ConflictError } from './store.mjs';
import { numbering, chapterNumbers } from './doc.mjs';
import { renderSite, renderEditPage, renderEditRow, renderEditStrip, renderRelinked, editSearch, summaryOf, publishLine } from './render.mjs';
import { verifyPassword, makeSession, readSession, sessionCookie, clearedCookie } from './auth.mjs';
import { page, esc } from '../lib/shell.mjs';

const PUBLIC_FILES = ['index.html', 'map.html', 'about.html', 'search.json'];
// The browser asks again every time, and is answered 304 while its copy's ETag is the file's;
// Vercel's edge keeps the file for a year, or until a publish deletes everything tagged `site`. Vercel documents the tag's header as Vercel-Cache-Tag;
// Cache-Tag, the name the design gives, is sent beside it.
const PUBLIC_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=31536000',
  'Cache-Tag': 'site',
  'Vercel-Cache-Tag': 'site',
};
// Every answer but a public file: never kept, never sniffed for another type, never shown in a frame
// (a second layer under the cookie's SameSite=Strict), and its address not sent to another site.
const NO_STORE = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'same-origin',
};
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';
// The largest body that comes in is one op with a long text; a whole document never does.
const MAX_BODY = 2 * 1024 * 1024;
// Once this many wrong passwords fall within the window, every login (the eleventh try and on) is
// refused until the oldest of them leaves it. A try counts itself, so it is checked only while the
// count is at most the limit.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MINUTES = 15;
const FAILURE_WAIT_MS = 1000;
const CONFLICT = 'Changed in another window. Reload to see it.';
const NOT_PURGED = 'Published, but the public site may still show the old version. Publish again to refresh it.';
// The ops after which the page swaps in the row as drawn again, and holds the row as stored.
const ROW_OPS = ['set-row', 'set-pictures', 'add-row', 'hide-row', 'give-keyword', 'remove-keyword', 'remove-picture', 'move-picture', 'set-caption', 'add-picture'];
const NO_PICTURES = 'Pictures cannot be added: BLOB_READ_WRITE_TOKEN and PICTURES_READ_WRITE_TOKEN are needed in the environment.';

// A request refused with a status and a sentence, answered as { error }.
class Refused extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const answer = (status, body, type, headers = {}) => new Response(body, { status, headers: { 'Content-Type': type, ...NO_STORE, ...headers } });
const json = (status, value, headers) => answer(status, JSON.stringify(value), JSON_TYPE, headers);
const html = (status, body) => answer(status, body, HTML);
const text = (status, body) => answer(status, body, TEXT);
const seeOther = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...NO_STORE, ...headers } });

export function makeHandlers({
  store,
  env = {},
  lists,
  // The stores of the pictures added (cloud/pictures.mjs): cloudStores in the cloud, with the
  // client-upload handshake; localStores on this computer, which takes the original itself.
  // Without them, pictures cannot be added.
  pictures = null,
  purge = async () => {},
  secure = true,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  // Runs a task after the answer has gone: in the cloud a few seconds later, kept alive with
  // waitUntil (api/edit.mjs); by default at once, so that the tests see it done.
  later = (task) => task(),
}) {
  // The tables are made once per instance, before its first query; a failure is tried again on
  // the next request.
  let ready = null;
  const init = () => (ready ??= store.init().catch((error) => { ready = null; throw error; }));

  const theDraft = async () => {
    const draft = await store.getDraft();
    if (!draft) throw new Refused(503, 'There is no draft yet.');
    return draft;
  };
  const publishedDoc = async () => (await store.latestPublish())?.doc ?? null;

  // Tried once more after a second, as Vercel asks when a purge is refused for its rate.
  const purgeSite = async () => {
    try {
      await purge();
      return true;
    } catch (first) {
      console.error('purge, first try:', first);
      await wait(FAILURE_WAIT_MS);
      try {
        await purge();
        return true;
      } catch (second) {
        console.error('purge, second try:', second);
        return false;
      }
    }
  };

  const loginPage = (line = '') => page({
    title: 'Log in',
    tab: null,
    depth: 1,
    css: ['web/login.css'],
    head: '<meta name="robots" content="noindex">',
    body: `<form class="login" method="post" action="login">
<label for="password">Password</label>
<input type="password" id="password" name="password" autocomplete="current-password" required autofocus>
<button type="submit">Log in</button>
${line ? `<p class="login-line" role="alert">${esc(line)}</p>\n` : ''}</form>`,
  });

  // A try is recorded as a failure before its password is checked, then the tries in the window are
  // counted: tries sent at once each count every one recorded before them, so no more are checked
  // than the limit leaves room for, however many arrive during the check of the first. A try that
  // proves right, or is refused, is forgotten again, so refused tries cannot keep the window open.
  async function login(request) {
    if (!env.EDIT_PASSWORD_HASH || !env.SESSION_SECRET) {
      return text(500, 'Edit mode is not set up: EDIT_PASSWORD_HASH and SESSION_SECRET are needed in the environment.');
    }
    // As typed: the form's encoding undone and nothing else; auth.mjs normalises it itself. Read
    // first, so a body too large is refused before it is counted.
    const password = new URLSearchParams((await readBody(request)).toString('utf8')).get('password') ?? '';
    const tried = await store.recordLoginFailure();
    if ((await store.recentLoginFailures(LOGIN_WINDOW_MINUTES)) > LOGIN_LIMIT) {
      await store.forgetLoginFailure(tried);
      await wait(FAILURE_WAIT_MS);
      return html(429, loginPage(`Too many wrong passwords. Try again in ${LOGIN_WINDOW_MINUTES} minutes.`));
    }
    if (await verifyPassword(password, env.EDIT_PASSWORD_HASH)) {
      await store.forgetLoginFailure(tried);
      return seeOther('/edit/', { 'Set-Cookie': sessionCookie(makeSession(env.SESSION_SECRET), { secure }) });
    }
    await wait(FAILURE_WAIT_MS);
    return html(401, loginPage('Wrong password.'));
  }

  async function editPage(request, loggedIn) {
    if (!loggedIn) return html(200, loginPage());
    const [draft, published] = await Promise.all([theDraft(), publishedDoc()]);
    return html(200, renderEditPage(draft.doc, { version: draft.version, published, lists, originals: originalsRoute() }));
  }

  // Where the page sends an original: through the handshake at upload to the private store, or,
  // on this computer, to original; null when pictures cannot be added.
  const originalsRoute = () => (!pictures ? null : pictures.receive ? 'original' : 'upload');
  const thePictures = () => {
    if (!pictures) throw new Refused(500, NO_PICTURES);
    return pictures;
  };

  // The client-upload handshake (@vercel/blob/client): a token for one original, in the cloud only.
  async function upload(request) {
    const { handshake } = thePictures();
    if (!handshake) throw new Refused(404, 'Not found.');
    return json(200, await handshake(await readObject(request), request));
  }

  // On this computer, the original itself, as the browser sends a file: its type in Content-Type,
  // the name the page gives it in X-Pathname. Answered with the name it is kept under.
  async function original(request) {
    const { receive, largest } = thePictures();
    if (!receive) throw new Refused(404, 'Not found.');
    const type = request.headers.get('content-type') ?? '';
    const pathname = request.headers.get('x-pathname') ?? '';
    const bytes = await readBody(request, largest);
    return json(200, await receive({ pathname, type, bytes }));
  }

  // The site's two JPEGs made from an original kept under `pathname`, for the row `id`, and put
  // where the public sees them: { picture: { src, w, h, small } }. The draft is untouched; the page
  // sends add-picture with the picture through its queue.
  async function picture(request) {
    const stores = thePictures();
    const { id, pathname } = await readObject(request);
    const { doc } = await theDraft();
    if (typeof id !== 'string' || !Object.hasOwn(doc.rows, id)) throw new Refused(422, `There is no row ${id}.`);
    return json(200, { picture: await stores.picture(id, pathname) });
  }

  async function search() {
    return json(200, editSearch((await theDraft()).doc, lists));
  }

  // One edit of the draft. A stale version is refused before the op is tried, so the author reads
  // the conflict and not an error about a row another window has removed.
  async function op(request) {
    const { version, op: wanted } = await readJson(request);
    const [draft, published] = await Promise.all([theDraft(), publishedDoc()]);
    if (draft.version !== version) throw new ConflictError(draft.version);
    const { doc, result } = applyOp(draft.doc, wanted);
    const saved = await store.saveDraft(doc, version);
    const chapterNo = chapterNumbers(doc);
    const reply = {
      version: saved,
      numbers: Object.fromEntries(numbering(doc)),
      chapters: doc.chapters.map((chapter) => ({ id: chapter.id, no: chapterNo.get(chapter.id), title: chapter.title, rows: chapter.rows })),
      summary: summaryOf(published, doc),
      strip: renderEditStrip(doc), // "All keywords" as the edit page would now draw it
      result, // the new id after add-row, add-chapter and add-keyword
    };
    const skip = [];
    if (ROW_OPS.includes(wanted.op)) {
      const id = result.id ?? wanted.id;
      reply.row = renderEditRow(doc, id, lists, { published });
      reply.stored = doc.rows[id]; // what the page's fields then start from: the server's own words
      skip.push(id);
    }
    // The other rows and the idea whose links now read otherwise (a row hidden, retitled, removed).
    const relinked = renderRelinked(draft.doc, doc, lists, { published, skip });
    if (Object.keys(relinked.rows).length || relinked.idea) reply.relinked = relinked;
    return json(200, reply);
  }

  // The draft drawn as the public site, stored as a publish with its four files, then the edge's
  // copies deleted, at once and once more later. A page that cannot be drawn without an error
  // publishes nothing.
  async function publish(request) {
    const { version } = await readJson(request);
    const [draft, published] = await Promise.all([theDraft(), publishedDoc()]);
    if (draft.version !== version) throw new ConflictError(draft.version);
    const { files, problems } = renderSite(draft.doc, lists);
    const errors = problems.filter((problem) => problem.level === 'error');
    if (errors.length) {
      return json(422, { error: `Not published: ${errors.map(({ where, message }) => `${where}: ${message}`).join('; ')}.` });
    }
    for (const { where, message } of problems) console.warn(`publish: ${where}: ${message}`);
    const { id } = await store.publish(version, files, publishLine(published, draft.doc));
    const purged = await purgeSite();
    // A visit that read the old files just before the publish committed can reach the edge after
    // the purge above and be kept for a year; a second purge, after the answer, deletes it.
    await later(async () => {
      try {
        await purge();
      } catch (error) {
        console.error('purge, after the publish:', error);
      }
    });
    if (!purged) return json(500, { error: NOT_PURGED, id });
    return json(200, { id });
  }

  async function discard(request) {
    const { version } = await readJson(request);
    if (!(await store.latestPublish())) throw new Refused(422, 'Nothing has been published yet.');
    return json(200, { version: await store.discard(version) });
  }

  async function logout() {
    return seeOther('/edit/', { 'Set-Cookie': clearedCookie({ secure }) });
  }

  // route -> method -> handler. Only '' (the page or the login form) and login answer without a
  // session.
  const ROUTES = {
    '': { GET: editPage },
    'search.json': { GET: search },
    login: { POST: login, GET: async () => seeOther('/edit/') },
    logout: { POST: logout },
    op: { POST: op },
    publish: { POST: publish },
    discard: { POST: discard },
    upload: { POST: upload },
    picture: { POST: picture },
    original: { POST: original },
  };
  const OPEN = ['', 'login'];

  return {
    // One query and no tables made: the move-in and edit mode make them, and a database without
    // them has nothing published. A browser that holds the file as it is gets 304 and no body.
    async site(request) {
      const path = fileOf(new URL(request.url));
      if (!PUBLIC_FILES.includes(path)) return text(404, 'Not found');
      try {
        const file = await store.siteFile(path);
        if (!file) return text(503, 'Not published yet');
        const tag = etagOf(file);
        const headers = { ...PUBLIC_HEADERS, ETag: tag };
        // A 304 goes to the browser only, with no CDN header and no tag, so the edge can never keep an empty 304 as the page.
        if (holds(request.headers.get('if-none-match'), tag)) {
          return new Response(null, { status: 304, headers: { 'Cache-Control': PUBLIC_HEADERS['Cache-Control'], ETag: tag } });
        }
        return new Response(file.body, { status: 200, headers: { 'Content-Type': file.type, ...headers } });
      } catch (error) {
        if (error?.code === UNDEFINED_TABLE) return text(503, 'Not published yet');
        console.error(`site ${path}:`, error);
        return text(500, 'Server error');
      }
    },

    async edit(request) {
      const route = routeOf(new URL(request.url));
      if (!Object.hasOwn(ROUTES, route)) return json(404, { error: 'Not found.' });
      const run = Object.hasOwn(ROUTES[route], request.method) ? ROUTES[route][request.method] : null;
      if (!run) return json(405, { error: 'Not allowed.' }, { Allow: Object.keys(ROUTES[route]).join(', ') });
      if (request.method === 'POST' && !sameOrigin(request)) return json(403, { error: 'Refused: the request comes from another site.' });
      const loggedIn = readSession(request.headers.get('cookie'), env.SESSION_SECRET);
      if (!loggedIn && !OPEN.includes(route)) return json(401, { error: 'logged-out' });
      try {
        await init();
        return await run(request, loggedIn);
      } catch (error) {
        if (error instanceof ConflictError) return json(409, { error: CONFLICT, version: error.version });
        if (error instanceof OpError) return json(422, { error: error.message });
        if (error instanceof Refused) return json(error.status, { error: error.message });
        console.error(`edit ${route}:`, error);
        return json(500, { error: 'Something went wrong on the server.' });
      }
    },
  };
}

// Postgres's code for a table that does not exist.
const UNDEFINED_TABLE = '42P01';

// A public file's ETag: the publish it was drawn from and a digest of what was drawn, since the
// same publish is drawn again after a deploy of new page code (npm run draft -- rerender).
const etagOf = (file) => `"${file.publishId}-${createHash('sha256').update(file.body).digest('base64url').slice(0, 16)}"`;

// Whether an If-None-Match header names `tag` (a weak W/ tag counts, as a GET compares weakly).
function holds(header, tag) {
  if (!header) return false;
  return header.split(',').map((t) => t.trim().replace(/^W\//, '')).some((t) => t === '*' || t === tag);
}

const fileOf = (url) => url.searchParams.get('path') ?? (url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
const routeOf = (url) => url.searchParams.get('route') ?? /^\/edit\/(.*)$/.exec(url.pathname)?.[1] ?? '';

// Whether the page that sent this POST is on this site: its Origin's host is the Host asked for.
// A browser sends Origin with every POST; a request without one, or with "null", is refused.
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = (request.headers.get('host') ?? new URL(request.url).host).toLowerCase();
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// The body's bytes, refused with 413 once they pass `max` (MAX_BODY, or the largest original): at
// once when its declared length does, else as it arrives, so a large body is never held whole.
async function readBody(request, max = MAX_BODY) {
  if (Number(request.headers.get('content-length')) > max) throw new Refused(413, 'The request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Refused(413, 'The request is too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// A JSON body that is an object.
async function readObject(request) {
  let body;
  try {
    body = JSON.parse((await readBody(request)).toString('utf8'));
  } catch (error) {
    if (error instanceof Refused) throw error;
    throw new Refused(400, 'The request is not JSON.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Refused(400, 'The request is not an object.');
  return body;
}

// A JSON body with the draft's version the page holds, a whole number.
async function readJson(request) {
  const body = await readObject(request);
  if (!Number.isInteger(body.version)) throw new Refused(400, 'The request does not say which version of the draft it was made on.');
  return body;
}
