// The Map page in the browser: the dot field after BolzanoDot, drawn black on white; on every
// place with rows its name and its rows' pictures in small pointed frames, one from far and more
// from closer; a panel with a place's rows and, from a picture or a row, the row itself; the
// places beyond the field; and the address (#p=<place id>&e=<row number>&k=<keyword id>) kept in
// step. Without WebGL the places and their rows stay as a plain list.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { load, stepPicture } from './pictures.js';
import './lightbox.js';

THREE.ColorManagement.enabled = false; // the greys below are written out as they are

const FOV = 35;
const HOME = { polar: 0.92, azimuth: -0.28 };
const VISIT = 700; // camera distance when a place opens
// The pictures, in px: a picture is 60 high (map.css) and data-w wide, in a frame of 2 of paper
// and a hairline, with a point underneath; several stand side by side in rows.
const IMG_H = 60;
const EDGE = 3;
const TAIL = 6;
const GAP = 6;
const PER_ROW = 7;
const HEAD_H = 18; // the line with the place's name
const ONE_FROM = 0.6; // of the whole-field viewing distance: from there out, one picture per place
const ALL_FROM = 900; // metres: from there in, all of them (a visit stops at 700)
const MAX_RISE = 150; // px a crowded place may rise on its stem before it waits for a closer view
const FLIGHT = 1400; // ms
// Per layer: grey at shade 0 and at shade 1, dot diameter in metres, opacity.
const STYLE = {
  ground: { a: '#c8c8c8', b: '#8a8a8a', size: 0.95, opacity: 0.95 },
  streets: { a: '#9a9a9a', b: '#5a5a5a', size: 1.05 },
  water: { a: '#d6d6d6', b: '#b4b4b4', size: 0.95 },
  trees: { a: '#b0b0b0', b: '#707070', size: 0.85, opacity: 0.9 },
  rails: { a: '#6a6a6a', b: '#3a3a3a', size: 0.42 },
  roofs: { a: '#3a3a3a', b: '#000000', size: 0.66 },
  walls: { a: '#8a8a8a', b: '#1e1e1e', size: 0.5 },
  bridges: { a: '#4a4a4a', b: '#000000', size: 0.6 },
  // The ground each place with rows stands for, at the survey's own 0.5 m grid (dots.json
  // `focus`): smaller dots, since they stand closer, the walls a little darker.
  focus_ground: { a: '#c8c8c8', b: '#8a8a8a', size: 0.5, opacity: 0.95 },
  focus_roofs: { a: '#3a3a3a', b: '#000000', size: 0.38 },
  focus_walls: { a: '#6a6a6a', b: '#101010', size: 0.34 },
  focus_bridges: { a: '#4a4a4a', b: '#000000', size: 0.4 },
};

const VERT = /* glsl */ `
attribute float shade;
uniform float uScale;
uniform float uPxPerM;
uniform float uSize;
uniform float uOpacity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFogNear;
uniform float uFogFar;
varying vec4 vColor;

void main() {
  vec3 p = vec3(position.x * uScale, position.z * uScale, -position.y * uScale);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 1.0);
  float px = uSize * uPxPerM / depth;
  vec3 col = mix(uColorA, uColorB, shade);
  col = mix(col, vec3(1.0), 0.7 * smoothstep(uFogNear, uFogFar, depth)); // distance fades to the paper
  // Sub-pixel dots fade instead of vanishing, so density stays honest when zoomed out.
  gl_PointSize = clamp(px, 1.0, 22.0);
  vColor = vec4(col, uOpacity * clamp(px, 0.0, 1.0));
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float a = vColor.a * (1.0 - smoothstep(0.14, 0.25, r2));
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const root = document.getElementById('map');
const canvas = document.getElementById('scene');
const panel = document.getElementById('panel');
const beyond = document.getElementById('beyond');
const filterLine = document.getElementById('filter');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const labels = readJson('keyword-labels');

// Every place on the page: drawn ones have a name button, their rows' pictures and a section in
// the panel (the list of rows, and each row as an article); the ones beyond the field a button
// and a list of their own.
const drawn = [...root.querySelectorAll('button.place')].map((el) => {
  const section = panel.querySelector(`section[data-for="${CSS.escape(el.dataset.place)}"]`);
  const place = { id: el.dataset.place, el, toggle: el, list: section, count: el.querySelector('.n'),
    rows: [...section.querySelectorAll('ol.rows > li')],
    entries: new Map([...section.querySelectorAll('article.entry')].map((article) => [article.dataset.no, article])),
    pins: [], // the pictures, once the dot field is drawn
    x: Number(el.dataset.x), y: Number(el.dataset.y), z: Number(el.dataset.z) };
  // Around a row in the panel: the way back to the list above it, the steps to its neighbours below.
  place.back = make('p', 'e-nav', [make('button', 'e-back', `← ${el.querySelector('.name').textContent}`)]);
  place.prev = make('button', 'e-prev', '← Previous');
  place.next = make('button', 'e-next', 'Next →');
  place.at = make('span', 'n');
  place.step = make('p', 'e-step', [place.prev, place.at, place.next]);
  place.back.hidden = place.step.hidden = true;
  section.prepend(place.back);
  section.append(place.step);
  return place;
});
const far = [...beyond.querySelectorAll('li[data-beyond]')].map((el) => {
  const toggle = el.querySelector('button');
  return { id: el.dataset.beyond, el, toggle, list: el.querySelector('ol'), count: toggle.querySelector('.n'), rows: [...el.querySelectorAll('li')] };
});
const places = new Map([...drawn, ...far].map((place) => [place.id, place]));
const placeOf = new Map(drawn.flatMap((place) => [...place.entries.keys()].map((no) => [no, place]))); // row number -> its place
const rowOf = (place, no) => place.rows.find((li) => li.dataset.no === no);

let state = readState();
let view = null; // the dot field, once drawn
apply();

addEventListener('hashchange', () => {
  state = readState();
  apply({ fly: true });
});

root.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const picture = target?.closest('button.pin');
  if (picture) return showEntry(places.get(picture.dataset.for), picture.dataset.no);
  if (target?.closest('.e-back')) return leaveEntry();
  const step = target?.closest('.e-prev, .e-next');
  if (step) return showEntry(places.get(state.p), step.dataset.no);
  const arrow = target?.closest('.entry .pic-nav button[data-step]');
  if (arrow) return stepPicture(arrow, Number(arrow.dataset.step));
  // A row in a place's list opens here, in the panel; with a modifier key, or without the dot
  // field, the link leads to the Library as it is written.
  const row = view ? target?.closest('.panel ol.rows a')?.closest('li') : null;
  if (row && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
    event.preventDefault();
    return showEntry(places.get(row.closest('section').dataset.for), row.dataset.no);
  }
  const toggle = target?.closest('button.place, li[data-beyond] > button');
  if (toggle) {
    const id = toggle.dataset.place ?? toggle.parentElement.dataset.beyond;
    return open(state.p === id ? null : id);
  }
  if (target?.closest('.close')) return open(null);
  if (target?.closest('.show-all')) {
    state.k = null;
    apply();
  }
});

// Escape goes back one step: from a row to its place's list, from the list to the closed map.
addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (state.e) leaveEntry();
  else if (state.p) open(null);
});

try {
  view = await draw();
  apply({ fly: true, first: true });
} catch (err) {
  console.error(err);
  view = null;
  root.classList.add('flat');
  apply({ first: true });
}

// ------------------------------------------------------------------ the address and the lists

function readState() {
  const values = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    try {
      values[part.slice(0, at)] = decodeURIComponent(part.slice(at + 1));
    } catch {
      // an unreadable value is dropped
    }
  }
  let p = places.has(values.p) ? values.p : null;
  let e = placeOf.has(values.e) ? values.e : null;
  if (e && !p) p = placeOf.get(e).id; // a row alone opens its place
  if (e && placeOf.get(e).id !== p) e = null; // the place asked for wins over a row of another
  let k = Object.hasOwn(labels, values.k ?? '') ? values.k : null;
  if (e && k && !hasKeyword(rowOf(placeOf.get(e), e), k)) k = null; // the row asked for wins
  if (p && k && !places.get(p).rows.some((li) => hasKeyword(li, k))) k = null; // the place asked for wins
  return { p, k, e };
}

function writeState() {
  const parts = [];
  if (state.p) parts.push(`p=${encodeURIComponent(state.p)}`);
  if (state.e) parts.push(`e=${encodeURIComponent(state.e)}`);
  if (state.k) parts.push(`k=${encodeURIComponent(state.k)}`);
  const hash = parts.length ? `#${parts.join('&')}` : '';
  if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

// From a place's name, a place beyond, Close or Escape: one place open at most, on its list of
// rows. Focus goes into the panel when it opens, and back to the place's button when what held
// it closes.
function open(id) {
  const before = state.p ? places.get(state.p) : null;
  const hadFocus = before && (drawn.includes(before) ? panel : before.list).contains(document.activeElement);
  state.p = id;
  state.e = null;
  apply({ fly: true });
  const now = id ? places.get(id) : null;
  if (now && drawn.includes(now) && view) now.list.querySelector('h2').focus({ preventScroll: true });
  else if (hadFocus && before !== now) before.toggle.focus({ preventScroll: true });
}

// From a picture on the map, a row in a place's list, or Previous and Next: that row in the
// panel, its place open (the camera flies only when the place changes).
function showEntry(place, no) {
  const moved = state.p !== place.id;
  state.p = place.id;
  state.e = no;
  apply({ fly: moved });
  if (state.e !== no) return;
  panel.scrollTop = 0;
  place.entries.get(no).querySelector('h3').focus({ preventScroll: true });
}

// Back from a row to the list of its place; focus returns to that row's line in the list.
function leaveEntry() {
  const place = places.get(state.p);
  const no = state.e;
  state.e = null;
  apply();
  (rowOf(place, no)?.querySelector('a') ?? place.list.querySelector('h2')).focus({ preventScroll: true });
}

function apply({ fly = false, first = false } = {}) {
  const flat = root.classList.contains('flat');
  for (const place of places.values()) {
    let n = 0;
    for (const li of place.rows) {
      li.hidden = Boolean(state.k) && !hasKeyword(li, state.k);
      if (!li.hidden) n++;
    }
    place.n = n;
    if (place.count.textContent !== String(n)) place.count.textContent = String(n);
    place.el.hidden = n === 0;
  }
  if (state.p && places.get(state.p).n === 0) state.p = null;
  const current = state.p ? places.get(state.p) : null;
  // A row shows only in its own, open, drawn place, and only while the keyword leaves it in.
  if (state.e && (flat || !drawn.includes(current) || !current.entries.has(state.e) || rowOf(current, state.e).hidden)) state.e = null;

  for (const place of drawn) {
    place.el.setAttribute('aria-expanded', String(place === current));
    place.list.hidden = flat ? place.n === 0 : place !== current;
    read(place, place === current ? state.e : null);
  }
  for (const place of far) {
    place.toggle.setAttribute('aria-expanded', String(flat || place === current));
    place.list.hidden = !(flat || place === current);
  }
  panel.hidden = !(flat ? drawn.some((place) => place.n) : drawn.includes(current));
  beyond.hidden = far.every((place) => place.n === 0);
  filterLine.hidden = !state.k;
  filterLine.querySelector('.what').textContent = state.k ? labels[state.k] ?? state.k : '';
  writeState();

  if (flat && current && first) (drawn.includes(current) ? current.list : current.el).scrollIntoView();
  if (!view) return;
  view.refresh();
  if (first) view.home();
  if (fly && drawn.includes(current)) view.visit(current);
}

// A place's section shows its list, or with `no` that row: its pictures fetched, its picture on
// the map outlined, Previous and Next set to its neighbours among the rows the keyword leaves in.
function read(place, no) {
  place.list.classList.toggle('reading', Boolean(no));
  place.back.hidden = place.step.hidden = !no;
  for (const [number, article] of place.entries) article.hidden = number !== no;
  for (const pin of place.pins) pin.el.classList.toggle('cur', pin.no === no);
  if (!no) return;
  for (const img of place.entries.get(no).querySelectorAll('figure:not([hidden]) img[data-src]')) load(img);
  const shown = place.rows.filter((li) => !li.hidden).map((li) => li.dataset.no);
  const at = shown.indexOf(no);
  place.at.textContent = `${at + 1} / ${shown.length}`;
  for (const [button, to] of [[place.prev, shown[at - 1]], [place.next, shown[at + 1]]]) {
    button.disabled = to === undefined;
    button.dataset.no = to ?? '';
  }
}

function make(tag, className, content = '') {
  const el = Object.assign(document.createElement(tag), { className });
  if (tag === 'button') el.type = 'button';
  el.append(...[content].flat());
  return el;
}

function hasKeyword(li, k) {
  return li.dataset.kw.split(' ').includes(k);
}

function readJson(id) {
  try {
    return JSON.parse(document.getElementById(id)?.textContent ?? '{}');
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ the dot field

async function draw() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 1);
  const [meta, bytes] = await Promise.all([fetch('map-data/dots.json').then(ok).then((r) => r.json()), fetchBytes('map-data/dots.bin.gz')]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  const shared = { uPxPerM: { value: 800 }, uFogNear: { value: 1500 }, uFogFar: { value: 5000 } };
  const count = meta.count;
  const positions = new Int16Array(bytes.buffer, bytes.byteOffset, count * 3);
  const shades = new Uint8Array(bytes.buffer, bytes.byteOffset + count * 6, count);
  for (const layer of meta.layers) {
    const style = STYLE[layer.name];
    if (!style) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(layer.offset * 3, (layer.offset + layer.count) * 3), 3));
    geometry.setAttribute('shade', new THREE.BufferAttribute(shades.subarray(layer.offset, layer.offset + layer.count), 1, true));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...shared,
        uScale: { value: meta.scale },
        uSize: { value: style.size },
        uOpacity: { value: style.opacity ?? 1 },
        uColorA: { value: new THREE.Color(style.a) },
        uColorB: { value: new THREE.Color(style.b) },
      },
      transparent: true,
      depthWrite: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
  }

  // On each place a group: a point that pin() moves onto the place, from which hang its name,
  // its pictures, a hairline from each picture's point, and the stem a crowded group rises on.
  const layer = document.getElementById('labels');
  for (const place of drawn) {
    const el = make('div', 'group');
    const rise = el.appendChild(make('span', 'rise'));
    const lifted = el.appendChild(make('div', 'lifted'));
    const who = [...place.el.children]; // the name and the count
    const cap = place.el.appendChild(make('span', 'cap'));
    cap.hidden = true;
    const say = (text) => { // over a picture, its row's number and title in place of the name
      cap.textContent = text ?? '';
      cap.hidden = !text;
      for (const part of who) part.hidden = Boolean(text);
    };
    place.pins = [...layer.querySelectorAll('button.pin')].filter((pin) => pin.dataset.for === place.id).map((pin) => {
      const iw = Number(pin.dataset.w) || 46;
      pin.style.setProperty('--w', `${iw}px`);
      const label = pin.getAttribute('aria-label');
      pin.addEventListener('pointerenter', () => say(label));
      pin.addEventListener('pointerleave', () => say(null));
      pin.addEventListener('focus', () => say(label));
      pin.addEventListener('blur', () => say(null));
      return { el: pin, no: pin.dataset.no, li: rowOf(place, pin.dataset.no), leader: make('span', 'leader'), iw };
    });
    lifted.append(...place.pins.map((pin) => pin.leader), ...place.pins.map((pin) => pin.el), place.el);
    place.group = { el, rise, lifted, sig: '', hw: 0, h: 0 };
    layer.append(el);
  }

  // Orbit, pan and zoom as in BolzanoDot: left drag pans along the ground, right drag turns, the
  // wheel zooms to the pointer. Keys, with the map focused: arrows pan, Shift + arrows turn,
  // + and - zoom, R returns to the whole field.
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduced.matches;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.minDistance = 20;
  controls.maxDistance = 30000; // until home() knows how far the whole field needs
  controls.maxPolarAngle = 1.38;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.listenToKeyEvents(canvas);
  reduced.addEventListener('change', () => (controls.enableDamping = !reduced.matches));

  const ext = meta.extent;
  const corners = [[ext.e[0], ext.n[0]], [ext.e[1], ext.n[0]], [ext.e[0], ext.n[1]], [ext.e[1], ext.n[1]]]
    .map(([e, n]) => new THREE.Vector3(e, 0, -n));
  const centre = new THREE.Vector3((ext.e[0] + ext.e[1]) / 2, 0, -(ext.n[0] + ext.n[1]) / 2);
  const probe = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  const v = new THREE.Vector3();
  const sph = new THREE.Spherical();
  let flight = null;
  let homeR = 3000; // the distance of the whole-field view, set by home()
  let dirty = true;
  let W = 0;
  let H = 0;

  // The closest distance at which the whole field stays on screen, found by projecting its
  // corners: a tilted view makes the near edge loom larger, so no fixed factor fits.
  function fitDistance(target, polar, azimuth, margin = 0.94) {
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    const fits = (r) => {
      probe.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(r, polar, azimuth));
      probe.lookAt(target);
      probe.updateMatrixWorld();
      return corners.every((c) => {
        v.copy(c).project(probe);
        return v.z < 1 && Math.abs(v.x) <= margin && Math.abs(v.y) <= margin;
      });
    };
    let lo = 100;
    let hi = 20000;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function jump(to) {
    controls.target.copy(to.target);
    camera.position.copy(to.target).add(new THREE.Vector3().setFromSphericalCoords(to.r, to.phi, to.theta));
    camera.lookAt(to.target);
    dirty = true;
  }

  // Eases there, or jumps when motion is reduced.
  function flyTo({ target, distance, polar, azimuth }) {
    sph.setFromVector3(v.subVectors(camera.position, controls.target));
    let theta = azimuth ?? sph.theta;
    while (theta - sph.theta > Math.PI) theta -= 2 * Math.PI;
    while (theta - sph.theta < -Math.PI) theta += 2 * Math.PI;
    const from = { target: controls.target.clone(), r: sph.radius, phi: sph.phi, theta: sph.theta };
    const to = { target, r: distance ?? sph.radius, phi: polar ?? Math.min(sph.phi, 1.05), theta };
    flight = null;
    if (reduced.matches) jump(to);
    else flight = { t0: performance.now(), from, to };
  }
  controls.addEventListener('start', () => (flight = null));
  // The controls move the camera inside their own wheel, key and pointer handlers, so a later
  // update() finds nothing new: every change they make has to ask for a frame itself.
  controls.addEventListener('change', () => (dirty = true));

  // A wheel or a pinch over a label zooms the map as it would over the dots.
  document.getElementById('labels').addEventListener('wheel', (event) => {
    event.preventDefault();
    canvas.dispatchEvent(new WheelEvent('wheel', event));
  }, { passive: false });

  // Safari sends a trackpad pinch as gesture events, not as wheel events, and zooms the page
  // unless they are stopped. Each step of the pinch becomes the wheel step OrbitControls turns
  // into the same change of distance (0.95 per 100 of delta), towards the pointer; a browser
  // that also sends the pinch as Ctrl + wheel has those dropped while the gesture lasts.
  const WHEEL_PER_LN = -100 / Math.log(0.95);
  let pinch = 0; // the gesture's scale so far; 0 when no gesture is under way
  const overMap = (event) => !(event.target instanceof Element && event.target.closest('.panel, .beyond, .filter, .credit'));
  root.addEventListener('gesturestart', (event) => {
    if (!overMap(event)) return;
    event.preventDefault();
    pinch = 1;
  });
  root.addEventListener('gesturechange', (event) => {
    if (!pinch) return;
    event.preventDefault();
    const ratio = event.scale / pinch;
    if (!(ratio > 0) || ratio === 1) return;
    pinch = event.scale;
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -Math.log(ratio) * WHEEL_PER_LN, clientX: event.clientX, clientY: event.clientY, bubbles: true, cancelable: true }));
  });
  root.addEventListener('gestureend', (event) => {
    if (!pinch) return;
    event.preventDefault();
    pinch = 0;
  });
  root.addEventListener('wheel', (event) => {
    if (pinch && event.ctrlKey && event.isTrusted) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true, passive: false });

  // The whole field, as large as it fits, with as much paper above it as below: the target moves
  // along the line of sight until the field's top and bottom edges sit evenly on the screen.
  function home() {
    const ahead = new THREE.Vector3(-Math.sin(HOME.azimuth), 0, -Math.cos(HOME.azimuth));
    const frame = (s) => {
      const target = centre.clone().addScaledVector(ahead, s);
      const r = fitDistance(target, HOME.polar, HOME.azimuth);
      probe.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(r, HOME.polar, HOME.azimuth));
      probe.lookAt(target);
      probe.updateMatrixWorld();
      const ys = corners.map((c) => v.copy(c).project(probe).y);
      return { target, r, middle: (Math.min(...ys) + Math.max(...ys)) / 2 };
    };
    let lo = -1000;
    let hi = 1000;
    for (let i = 0; i < 24; i++) {
      const s = (lo + hi) / 2;
      if (frame(s).middle > 0) lo = s; // the field sits high: look further ahead
      else hi = s;
    }
    const { target, r } = frame((lo + hi) / 2);
    homeR = r;
    controls.maxDistance = Math.max(7000, r * 2.2); // far enough back to see the whole field, whatever its size
    flight = null;
    jump({ target, r, phi: HOME.polar, theta: HOME.azimuth });
  }

  function zoom(factor) {
    flight = null;
    v.subVectors(camera.position, controls.target).multiplyScalar(factor);
    v.setLength(THREE.MathUtils.clamp(v.length(), controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(v);
    dirty = true;
  }

  canvas.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-' || event.key === '_') zoom(1.25);
    else if (event.key === 'r' || event.key === 'R') home();
    else return;
    event.preventDefault();
  });

  // The canvas fills the map; an open panel shifts the centre of the view into the space left.
  function resize() {
    W = root.clientWidth;
    H = root.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const offset = panel.hidden || W < 800 ? 0 : panel.offsetWidth;
    if (offset) camera.setViewOffset(W, H, offset / 2, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    shared.uPxPerM.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    dirty = true;
  }
  new ResizeObserver(resize).observe(root);
  resize();

  const screen = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, seen: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  };

  // How many of a place's n pictures show: one from ONE_FROM of the whole-field distance and
  // beyond, all of them from ALL_FROM in, more and more in between.
  function wanted(place, n) {
    const d = camera.position.distanceTo(v.set(place.x, place.z, -place.y));
    const from = homeR * ONE_FROM;
    const t = THREE.MathUtils.clamp((from - d) / (from - ALL_FROM), 0, 1);
    return 1 + Math.round((n - 1) * t ** 1.3);
  }

  // Stands the first k of a place's pictures (`active`: those the keyword leaves in) side by side
  // in rows of up to PER_ROW, centred over the place's point, with a hairline from each frame's
  // point down to it; one picture alone stands with its point on the place. The others wait
  // behind the first. Measured from the group's base point: x right, y down, so all is at
  // negative y. Sets the half width and the height the group takes, for pin().
  function arrange(place, active, k) {
    const g = place.group;
    const frameH = IMG_H + 2 * EDGE;
    const step = frameH + TAIL + 5;
    const shown = active.slice(0, k);
    const rows = [];
    for (let i = 0; i < shown.length; i += PER_ROW) rows.push(shown.slice(i, i + PER_ROW));
    const widths = rows.map((row) => row.reduce((sum, pin) => sum + pin.iw + 2 * EDGE, 0) + GAP * (row.length - 1));
    const lift = shown.length < 2 ? 0 : THREE.MathUtils.clamp(widths[0] * 0.16, 22, 70);
    const at = new Map();
    rows.forEach((row, j) => {
      let x = -widths[j] / 2;
      const tipY = -(lift + j * step);
      for (const pin of row) {
        const w = pin.iw + 2 * EDGE;
        at.set(pin, { x, y: tipY - TAIL - frameH, tipX: x + w / 2, tipY });
        x += w + GAP;
      }
    });
    const top = rows.length ? -(lift + (rows.length - 1) * step + TAIL + frameH) : 0;
    const first = at.get(shown[0]);
    for (const pin of place.pins) {
      const here = at.get(pin);
      const spot = here ?? first; // a picture not shown waits behind the first
      pin.el.classList.toggle('on', Boolean(here));
      pin.el.tabIndex = here ? 0 : -1;
      if (spot) pin.el.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
      if (here) load(pin.el.querySelector('img'));
      const strung = Boolean(here) && here.tipY < -0.5;
      pin.leader.style.opacity = strung ? '1' : '0';
      pin.leader.style.height = strung ? `${Math.hypot(here.tipX, here.tipY).toFixed(1)}px` : '0';
      if (strung) pin.leader.style.transform = `rotate(${Math.atan2(-here.tipX, here.tipY).toFixed(4)}rad)`;
    }
    place.el.style.transform = `translate(-50%, ${(top - 4 - HEAD_H).toFixed(1)}px)`;
    g.hw = Math.max(rows.length ? Math.max(...widths) / 2 : 0, place.el.offsetWidth / 2) + 2;
    g.h = -top + 4 + HEAD_H;
  }

  // Each group stands with its point on its place. Where two would cover each other, the open
  // place and then the places with more rows keep their spot and the others rise on a stem; one
  // that would have to rise more than MAX_RISE, or past the top of the map, waits for a closer view.
  function pin() {
    const items = [];
    for (const place of drawn) {
      const g = place.group;
      const foot = place.el.hidden ? null : screen(place.x, place.z, -place.y);
      const seen = Boolean(foot?.seen);
      g.el.style.visibility = seen ? 'visible' : 'hidden';
      if (!seen) continue;
      const active = place.pins.filter((p) => !p.li?.hidden);
      const k = active.length ? wanted(place, active.length) : 0;
      const sig = `${k}|${active.length}|${state.k ?? ''}`;
      if (sig !== g.sig) {
        g.sig = sig;
        arrange(place, active, k);
      }
      items.push({ place, g, x: foot.x, y: foot.y, lift: 0 });
    }
    items.sort((a, b) => (b.place.id === state.p) - (a.place.id === state.p) || b.place.n - a.place.n);
    const SPACE = 4;
    const placed = [];
    for (const item of items) {
      for (let i = 0; i <= placed.length; i++) {
        const hit = placed.find((o) => Math.abs(item.x - o.x) < item.g.hw + o.g.hw + SPACE
          && item.y - item.lift - item.g.h < o.y - o.lift + SPACE && o.y - o.lift - o.g.h < item.y - item.lift + SPACE);
        if (!hit) break;
        item.lift = item.y - (hit.y - hit.lift - hit.g.h) + SPACE;
      }
      const { g } = item;
      if (item.lift > MAX_RISE || (item.lift > 0 && item.y - item.lift - g.h < 4)) {
        g.el.style.visibility = 'hidden';
        continue;
      }
      placed.push(item);
      g.el.style.transform = `translate(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px)`;
      g.el.style.zIndex = String((item.place.id === state.p ? 20000 : 0) + 2000 + Math.round(item.y));
      g.lifted.style.transform = `translateY(${(-item.lift).toFixed(1)}px)`;
      g.rise.style.height = `${item.lift.toFixed(1)}px`;
    }
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  renderer.setAnimationLoop(() => {
    if (flight) {
      const k = ease(Math.min((performance.now() - flight.t0) / FLIGHT, 1));
      const { from, to } = flight;
      controls.target.lerpVectors(from.target, to.target, k);
      sph.set(from.r + (to.r - from.r) * k, from.phi + (to.phi - from.phi) * k, from.theta + (to.theta - from.theta) * k);
      camera.position.copy(controls.target).add(v.setFromSpherical(sph));
      if (k >= 1) flight = null;
      dirty = true;
    }
    controls.update(); // carries damping on; a change marks the frame dirty
    const t = controls.target;
    t.x = Math.min(Math.max(t.x, ext.e[0]), ext.e[1]);
    t.z = Math.min(Math.max(t.z, -ext.n[1]), -ext.n[0]);
    if (!dirty) return;
    dirty = false;
    const distance = camera.position.distanceTo(controls.target);
    shared.uFogNear.value = distance * 0.8;
    shared.uFogFar.value = distance * 3.2;
    renderer.render(scene, camera);
    pin();
  });

  return {
    home,
    visit: (p) => flyTo({ target: new THREE.Vector3(p.x, p.z, -p.y), distance: VISIT }),
    refresh: resize,
  };
}

async function fetchBytes(url) {
  const bytes = new Uint8Array(await (await ok(await fetch(url))).arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // already unpacked on the way
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function ok(response) {
  if (!response.ok) throw new Error(`${response.url}: HTTP ${response.status}`);
  return response;
}
