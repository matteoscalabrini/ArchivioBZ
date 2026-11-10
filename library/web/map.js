// The Map page in the browser: the dot field of the centre after BolzanoDot, drawn black on white,
// a stem and a label for every place with rows, a panel with a place's rows, the places beyond the
// field, and the address (#p=<place id>&k=<keyword id>) kept in step. Without WebGL the places
// and their rows stay as a plain list.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

THREE.ColorManagement.enabled = false; // the greys below are written out as they are

const FOV = 35;
const HOME = { polar: 0.92, azimuth: -0.28 };
const STEM = 60; // metres from the ground to the foot of a label
const VISIT = 700; // camera distance when a place opens
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

// Every place on the page: drawn ones have a label button and a section in the panel, the ones
// beyond the field a button and a list of their own.
const drawn = [...root.querySelectorAll('button.place')].map((el) => {
  const section = panel.querySelector(`section[data-for="${CSS.escape(el.dataset.place)}"]`);
  return { id: el.dataset.place, el, toggle: el, list: section, count: el.querySelector('.n'), rows: [...section.querySelectorAll('li')],
    x: Number(el.dataset.x), y: Number(el.dataset.y), z: Number(el.dataset.z) };
});
const far = [...beyond.querySelectorAll('li[data-beyond]')].map((el) => {
  const toggle = el.querySelector('button');
  return { id: el.dataset.beyond, el, toggle, list: el.querySelector('ol'), count: toggle.querySelector('.n'), rows: [...el.querySelectorAll('li')] };
});
const places = new Map([...drawn, ...far].map((place) => [place.id, place]));

let state = readState();
let view = null; // the dot field, once drawn
apply();

addEventListener('hashchange', () => {
  state = readState();
  apply({ fly: true });
});

root.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
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

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.p) open(null);
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
  const p = places.has(values.p) ? values.p : null;
  let k = Object.hasOwn(labels, values.k ?? '') ? values.k : null;
  if (p && k && !places.get(p).rows.some((li) => hasKeyword(li, k))) k = null; // the place asked for wins
  return { p, k };
}

function writeState() {
  const parts = [];
  if (state.p) parts.push(`p=${encodeURIComponent(state.p)}`);
  if (state.k) parts.push(`k=${encodeURIComponent(state.k)}`);
  const hash = parts.length ? `#${parts.join('&')}` : '';
  if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
}

// From a label, a place beyond, Close or Escape: one place open at most. Focus goes into the
// panel when it opens, and back to the place's button when what held it closes.
function open(id) {
  const before = state.p ? places.get(state.p) : null;
  const hadFocus = before && (drawn.includes(before) ? panel : before.list).contains(document.activeElement);
  state.p = id;
  apply({ fly: true });
  const now = id ? places.get(id) : null;
  if (now && drawn.includes(now) && view) now.list.querySelector('h2').focus({ preventScroll: true });
  else if (hadFocus && before !== now) before.toggle.focus({ preventScroll: true });
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

  for (const place of drawn) {
    place.el.setAttribute('aria-expanded', String(place === current));
    place.list.hidden = flat ? place.n === 0 : place !== current;
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

  // A thin black stem from the ground under each place up to its label, drawn under every label.
  for (const place of drawn) {
    place.stem = document.createElement('span');
    place.stem.className = 'stem';
    place.el.parentElement.prepend(place.stem);
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
  controls.maxDistance = 7000;
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

  // Each label stands with its lower left corner on the top of its stem, STEM metres above the
  // ground. Where labels would cover each other, the open place and then the places with more
  // rows keep their spot and the others rise, their stems growing to reach them.
  const screen = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, seen: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  };
  function pin() {
    const items = [];
    for (const place of drawn) {
      const foot = place.el.hidden ? null : screen(place.x, place.z, -place.y);
      const top = foot?.seen ? screen(place.x, place.z + STEM, -place.y) : null;
      const seen = Boolean(top?.seen);
      place.el.style.visibility = seen ? 'visible' : 'hidden';
      place.stem.style.visibility = seen ? 'visible' : 'hidden';
      if (seen) items.push({ place, x: foot.x, foot: foot.y, bottom: Math.min(top.y, foot.y - 12), w: place.el.offsetWidth, h: place.el.offsetHeight });
    }
    items.sort((a, b) => (b.place.id === state.p) - (a.place.id === state.p) || b.place.n - a.place.n);
    const GAP = 4;
    const placed = [];
    for (const item of items) {
      for (let i = 0; i <= placed.length; i++) {
        const hit = placed.find((o) => item.x < o.x + o.w + GAP && o.x < item.x + item.w + GAP
          && item.bottom - item.h < o.bottom + GAP && o.bottom - o.h < item.bottom + GAP);
        if (!hit) break;
        item.bottom = hit.bottom - hit.h - GAP;
      }
      placed.push(item);
      item.place.el.style.transform = `translate(${item.x.toFixed(1)}px, ${(item.bottom - item.h).toFixed(1)}px)`;
      item.place.stem.style.transform = `translate(${item.x.toFixed(1)}px, ${item.bottom.toFixed(1)}px)`;
      item.place.stem.style.height = `${Math.max(0, item.foot - item.bottom).toFixed(1)}px`;
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
    if (controls.update()) dirty = true;
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
