// Where a place stands on the dot map: latitude and longitude to the map's grid (EPSG:25832,
// ETRS89 / UTM zone 32N), then metres east and north of the map's origin, and the ground height
// there. Ported from BolzanoDot (public/js/photometa.js, public/js/height.js).

// Geographic (ETRS89, as good as WGS84 here) to UTM zone 32N metres; sub-metre in Bolzano.
export function toUtm32(lat, lon) {
  const a = 6378137;
  const f = 1 / 298.257222101; // GRS80
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180;
  const dl = ((lon - 9) * Math.PI) / 180;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * s * s);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * c * c;
  const A = c * dl;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi));
  const e = 500000 + k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const n = k0 * (M + N * Math.tan(phi) * ((A * A) / 2
    + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { e, n };
}

// {x, y}: metres east and north of meta.origin; inside when within meta.extent. A place without
// numeric coordinates is not located: {x: null, y: null, inside: false}.
export function locate(place, meta) {
  const { lat, lon } = place ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { x: null, y: null, inside: false };
  const { e, n } = toUtm32(lat, lon);
  const x = e - meta.origin.e;
  const y = n - meta.origin.n;
  const { e: [west, east], n: [south, north] } = meta.extent;
  return { x, y, inside: x >= west && x <= east && y >= south && y <= north };
}

// Ground height in local metres at (x, y), read between the four nearest points of the grid
// (`meta.height`: step, cols, rows, e0, n0, unit; `data`: its Int16 values, row by row from the
// south-west). Points off the grid take the height at its edge.
export function heightAt({ step, cols, rows, e0, n0, unit }, data, x, y) {
  const c = Math.min(Math.max((x - e0) / step, 0), cols - 1.001);
  const r = Math.min(Math.max((y - n0) / step, 0), rows - 1.001);
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const fc = c - c0;
  const fr = r - r0;
  const i = r0 * cols + c0;
  return (data[i] * (1 - fc) * (1 - fr) + data[i + 1] * fc * (1 - fr)
    + data[i + cols] * (1 - fc) * fr + data[i + cols + 1] * fc * fr) * unit;
}
