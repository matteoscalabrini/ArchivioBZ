# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "shapely>=2", "pyproj", "tifffile"]
# ///
"""Turn library/.cache/map-raw/ into what the Map page draws, in library/map-data/. Adapted from
BolzanoDot, scripts/build_points.py: the same layers and spacings, without the walk graph, plus
the four focus layers and no dots where the survey has no data.

  dots.bin.gz / dots.json   the dot cloud, one contiguous range per layer
  height.bin.gz             ground height grid, 2 m (the site's build stands each place on it)

Layers:
  ground   hex grid on the bare-earth DTM; shade = hillshade
  streets  the same grid inside OSM street corridors and pedestrian areas
  water    denser hex grid inside OSM water areas
  trees    LiDAR canopy (surface minus terrain, away from buildings); shade = canopy hillshade
  rails    two rails per OSM track
  roofs    square grid inside every OSM footprint at the LiDAR surface height, so pitched
           roofs, towers and spires keep their measured shape; shade = roof hillshade
  walls    dot columns along each footprint ring, ground to roof edge; shade = height fraction
  bridges  deck rows at the measured deck height plus raised railings
  focus_ground, focus_roofs, focus_walls, focus_bridges
           the same four kinds on the ground each place with rows stands for (focus.json), as
           close as the survey's own 0.5 m grid; those footprints are left out of the layers above
Binary: Int16 xyz (east, north, up) in `scale`-metre units around `origin`, then Uint8 shade.

Run: npm run map-data   (focus.mjs, then fetch.py, then this)
"""

import gzip
import json
import math
import os
import re
from pathlib import Path

import numpy as np
import shapely
import tifffile
from pyproj import Transformer
from scipy import ndimage
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import polygonize, unary_union

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / ".cache" / "map-raw"
OUT = Path(os.environ.get("DOTS_OUT", HERE.parent / "map-data"))  # DOTS_OUT, DOTS_AREA: for a trial elsewhere
AREA = json.loads(Path(os.environ.get("DOTS_AREA", HERE / "area.json")).read_text())
FOCUS = json.loads((RAW / "focus.json").read_text())
RES, TILE = 0.5, 500

# Dot spacing in metres: the density budget of the whole map lives here.
GROUND_STEP = 2.6
WATER_STEP = 2.2
TREE_STEP = 2.2
ROOF_STEP = 1.6
WALL_STEP = 1.6  # along each footprint ring
WALL_RISE = 2.2  # vertical
BRIDGE_STEP = 0.9
BRIDGE_ROW = 1.3  # lateral spacing between deck rows
RAIL_STEP = 1.2
GAUGE = 1.435
# Around the object each place with rows names, the dots are as close as the survey's own grid:
# every 0.5 m cell of a roof, walls to match, the ground between at 1 m.
FINE_ROOF = 0.5
FINE_WALL_STEP = 0.5
FINE_WALL_RISE = 0.7
FINE_GROUND = 1.0
FINE_BRIDGE_STEP = 0.45
FINE_BRIDGE_ROW = 0.65

LAYERS = ["ground", "streets", "water", "trees", "rails", "roofs", "walls", "bridges",
          "focus_ground", "focus_roofs", "focus_walls", "focus_bridges"]
BRIDGE_NAME = re.compile(r"ponte|brücke|brucke|viadott|passerella|steg", re.I)
STREET_WIDTH = {
    "motorway": 11, "trunk": 10, "primary": 10, "secondary": 9, "tertiary": 8,
    "motorway_link": 6, "trunk_link": 6, "primary_link": 6, "secondary_link": 6, "tertiary_link": 6,
    "residential": 7, "unclassified": 6, "living_street": 6, "service": 4.5, "pedestrian": 7,
    "cycleway": 3, "footway": 3, "path": 2.5, "steps": 3, "track": 3, "bridleway": 2.5,
}

to_utm = Transformer.from_crs(4326, 25832, always_xy=True)


# ---------------------------------------------------------------- rasters
class Raster:
    """Mosaic of the LiDAR tiles, sampled bilinearly in EPSG:25832 metres."""

    def __init__(self, kind: str):
        x0, y0, x1, y1 = AREA["bbox"]
        xs = list(range(x0 // TILE * TILE, x1, TILE))
        ys = list(range(y0 // TILE * TILE, y1, TILE))
        n = round(TILE / RES)
        self.x0, self.y1, self.res = xs[0], ys[-1] + TILE, RES
        a = np.full((len(ys) * n, len(xs) * n), np.nan, np.float32)
        for x in xs:
            for y in ys:
                img = tifffile.imread(RAW / "lidar" / f"{kind}_{RES:g}m_{x}_{y}.tif").astype(np.float32)[:n, :n]
                img[img < -1000] = np.nan
                r0, c0 = round((self.y1 - (y + TILE)) / RES), round((x - self.x0) / RES)
                a[r0 : r0 + img.shape[0], c0 : c0 + img.shape[1]] = img
        hole = np.isnan(a)
        self.hole = hole  # where the survey has nothing: no dot is drawn there (see main)
        if hole.any():  # survey gaps: nearest valid cell
            idx = ndimage.distance_transform_edt(hole, return_distances=False, return_indices=True)
            a = a[tuple(idx)]
        self.a = a
        print(f"  {kind}: {a.shape[1]}x{a.shape[0]} px, {hole.mean() * 100:.2f}% filled, "
              f"z {a.min():.1f}..{a.max():.1f} m")

    def sample(self, x, y, grid=None):
        g = self.a if grid is None else grid
        c = (np.asarray(x, float) - self.x0) / self.res - 0.5
        r = (self.y1 - np.asarray(y, float)) / self.res - 0.5
        c0 = np.clip(np.floor(c).astype(np.int64), 0, g.shape[1] - 2)
        r0 = np.clip(np.floor(r).astype(np.int64), 0, g.shape[0] - 2)
        fc, fr = np.clip(c - c0, 0, 1), np.clip(r - r0, 0, 1)
        return (g[r0, c0] * (1 - fc) * (1 - fr) + g[r0, c0 + 1] * fc * (1 - fr)
                + g[r0 + 1, c0] * (1 - fc) * fr + g[r0 + 1, c0 + 1] * fc * fr)

    def known(self, x, y):
        """True where the survey measured the cell under (x, y)."""
        c = np.clip(((np.asarray(x, float) - self.x0) / self.res).astype(np.int64), 0, self.a.shape[1] - 1)
        r = np.clip(((self.y1 - np.asarray(y, float)) / self.res).astype(np.int64), 0, self.a.shape[0] - 1)
        return ~self.hole[r, c]

    def hillshade(self, z=None, smooth_m=0.0, azimuth=315.0, altitude=40.0):
        z = self.a if z is None else z
        if smooth_m:
            z = ndimage.gaussian_filter(z, smooth_m / self.res)
        dz_drow, dz_de = np.gradient(z, self.res)
        dz_dn = -dz_drow  # rows run southwards
        az, alt = math.radians(azimuth), math.radians(altitude)
        lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
        hs = (-dz_de * lx - dz_dn * ly + lz) / np.sqrt(dz_de**2 + dz_dn**2 + 1)
        return np.clip(hs, 0, 1).astype(np.float32)


# ---------------------------------------------------------------- OSM geometry
def utm_xy(geometry):
    return to_utm.transform([p["lon"] for p in geometry], [p["lat"] for p in geometry])


def line_of(geometry) -> LineString | None:
    if not geometry or len(geometry) < 2:
        return None
    return LineString(list(zip(*utm_xy(geometry))))


def polygon_of(el) -> Polygon | MultiPolygon | None:
    if el["type"] == "way":
        g = el.get("geometry")
        if not g or len(g) < 4 or g[0] != g[-1]:
            return None
        poly = Polygon(list(zip(*utm_xy(g))))
    else:
        outer, inner = [], []
        for m in el.get("members", []):
            if m["type"] == "way" and m.get("geometry"):
                ln = line_of(m["geometry"])
                if ln is not None:
                    (inner if m.get("role") == "inner" else outer).append(ln)
        if not outer:
            return None
        poly = unary_union(list(polygonize(unary_union(outer))))
        if inner:
            poly = poly.difference(unary_union(list(polygonize(unary_union(inner)))))
    poly = shapely.make_valid(poly)
    if poly.geom_type == "GeometryCollection":
        poly = unary_union([g for g in poly.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
    return poly if not poly.is_empty and poly.area > 1 else None


def parts(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def num(value) -> float | None:
    """Leading number of an OSM tag value ("12", "12.5 m", "3,5"), or None."""
    m = re.match(r"\s*(\d+(?:[.,]\d+)?)", str(value or ""))
    return float(m.group(1).replace(",", ".")) if m else None


def width_of(tags, default):
    return num(tags.get("width")) or default


def is_bridge(tags):
    return tags.get("bridge", "no") != "no"


# ---------------------------------------------------------------- grids
def hex_grid(geom, step):
    if geom.is_empty:
        return np.empty(0), np.empty(0)
    xmin, ymin, xmax, ymax = geom.bounds
    dy = step * math.sqrt(3) / 2
    ys = np.arange(math.floor(ymin / dy) * dy, ymax + dy, dy)
    xs = np.arange(math.floor(xmin / step) * step, xmax + step, step)
    gx, gy = np.meshgrid(xs, ys)
    gx = gx + (np.round(gy / dy).astype(np.int64) % 2) * (step / 2)
    gx, gy = gx.ravel(), gy.ravel()
    keep = shapely.contains_xy(geom, gx, gy)
    return gx[keep], gy[keep]


def square_grid(poly, step):
    xmin, ymin, xmax, ymax = poly.bounds
    xs = np.arange(math.floor(xmin / step) * step + step / 2, xmax, step)
    ys = np.arange(math.floor(ymin / step) * step + step / 2, ymax, step)
    gx, gy = np.meshgrid(xs, ys)
    gx, gy = gx.ravel(), gy.ravel()
    keep = shapely.contains_xy(poly, gx, gy)
    return gx[keep], gy[keep]


def ring_samples(ring, step):
    """Points every ~step metres along a ring, always including the corners, with the unit
    normal to the left of travel (the polygon interior, after orient())."""
    c = np.asarray(ring.coords)[:, :2]
    seg = np.diff(c, axis=0)
    ln = np.hypot(seg[:, 0], seg[:, 1])
    ok = ln > 0.2
    c0, seg, ln = c[:-1][ok], seg[ok], ln[ok]
    k = np.maximum(1, np.round(ln / step).astype(np.int64))
    i = np.repeat(np.arange(len(k)), k)
    t = (np.arange(k.sum()) - np.repeat(np.cumsum(k) - k, k)) / k[i]
    tangent = seg[i] / ln[i, None]
    return c0[i] + seg[i] * t[:, None], np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)


def along(line, step):
    d = np.linspace(0, line.length, max(2, int(line.length / step) + 1))
    pts = shapely.get_coordinates(shapely.line_interpolate_point(line, d))
    tan = np.gradient(pts, axis=0)
    tan /= np.maximum(np.hypot(tan[:, 0], tan[:, 1]), 1e-9)[:, None]
    return pts, np.stack([-tan[:, 1], tan[:, 0]], axis=1)


def columns(x, y, bottom, top, rise):
    """Vertical dot columns from bottom to top, always ending exactly on the top edge."""
    h = np.maximum(top - bottom, 0.0)
    n = np.floor(h / rise - 0.35).astype(np.int64).clip(0) + 2
    n[h < 0.5] = 1
    i = np.repeat(np.arange(len(x)), n)
    k = np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)
    z = np.where(k == n[i] - 1, top[i], bottom[i] + k * rise)
    frac = (z - bottom[i]) / np.maximum(h[i], 1e-6)
    return x[i], y[i], z, np.clip(frac, 0, 1)


def pack(x, y, z, s):
    return np.stack([x, y, z, np.broadcast_to(s, np.shape(x))], axis=1)


# ---------------------------------------------------------------- focus
def focus_area(els, clip):
    """The ground each place with rows stands for: the outline of its OSM object and 8 m around
    it; 15 m either side of a line; 45 m around a point."""
    by_id = {(el["type"], el["id"]): el for el in els}
    shapes = []
    for pid, place in FOCUS.items():
        ref = place["osm"]  # {"kind", "id"}, or None when the record names no object
        el = by_id.get((ref["kind"], ref["id"])) if ref else None
        x, y = to_utm.transform(place["lon"], place["lat"])
        geom, how = shapely.Point(x, y).buffer(45), "45 m around its point"
        if el is not None and el["type"] != "node":
            poly = polygon_of(el)
            if poly is not None:
                geom, how = poly.buffer(8), f"outline, {poly.area / 1e4:.2f} ha"
            else:
                lines = [line_of(el.get("geometry"))] if el["type"] == "way" else [line_of(m.get("geometry")) for m in el.get("members", [])]
                lines = [ln for ln in lines if ln is not None]
                if lines:
                    geom, how = unary_union(lines).buffer(15), f"line, {unary_union(lines).length:.0f} m"
        elif el is None:
            how += " (no object named)" if not ref else " (object not found)"
        print(f"  focus {pid}: {how}")
        shapes.append(geom)
    return unary_union(shapes).intersection(clip)


# ---------------------------------------------------------------- layers
def fallback_height(tags) -> float:
    if h := num(tags.get("height")):
        return h
    if levels := num(tags.get("building:levels")):
        return levels * 3.0 + 1.0
    return 4.0


def build_buildings(els, clip, dsm, dtm, hs_roof, focus):
    roofs, walls, footprints = [], [], []
    fine_roofs, fine_walls = [], []
    no_lidar = []
    for el in els:
        tags = el.get("tags", {})
        if tags.get("building", "no") == "no":
            continue
        poly = polygon_of(el)
        if poly is None or not poly.intersects(clip):
            continue
        for part in parts(poly.intersection(clip)):
            if part.geom_type != "Polygon" or part.area < 3:
                continue
            part = orient(part, sign=1.0)
            footprints.append(part)
            fine = part.intersects(focus)
            roof_out, wall_out = (fine_roofs, fine_walls) if fine else (roofs, walls)
            rx, ry = square_grid(part, FINE_ROOF if fine else ROOF_STEP)
            if rx.size == 0:
                pt = part.representative_point()
                rx, ry = np.array([pt.x]), np.array([pt.y])
            ground = dtm.sample(rx, ry)
            above = dsm.sample(rx, ry) - ground
            h90 = float(np.percentile(above, 90))
            lidar = h90 >= 2.0
            if lidar:
                floor = 0.45 * h90  # roof dots that hit a courtyard or an edge stay on the roof
                roof_out.append(pack(rx, ry, ground + np.maximum(above, floor), dsm.sample(rx, ry, hs_roof)))
            else:  # footprint newer than the survey (or offset): trust the OSM tags
                no_lidar.append(tags.get("name") or el["id"])
                h90 = fallback_height(tags)
                base = float(np.median(ground))
                roof_out.append(pack(rx, ry, np.full(rx.shape, base + h90), 0.55))
            if tags.get("building") == "roof":  # canopies: no walls
                continue
            for ring in [part.exterior, *part.interiors]:
                p, nrm = ring_samples(ring, FINE_WALL_STEP if fine else WALL_STEP)
                inside, outside = p + nrm * 0.8, p - nrm * 0.6
                bottom = dtm.sample(outside[:, 0], outside[:, 1])
                if lidar:
                    gi = dtm.sample(inside[:, 0], inside[:, 1])
                    top = np.maximum(dsm.sample(inside[:, 0], inside[:, 1]), gi + floor)
                else:
                    top = np.full(len(p), base + h90)
                wall_out.append(pack(*columns(p[:, 0], p[:, 1], bottom, np.maximum(top, bottom + 2.5), FINE_WALL_RISE if fine else WALL_RISE)))
    print(f"  buildings: {len(footprints)} footprints; {len(no_lidar)} with no LiDAR return use tag heights")
    if no_lidar:
        print(f"    e.g. {no_lidar[:8]}")
    stack = lambda chunks: np.concatenate(chunks) if chunks else np.empty((0, 4))
    print(f"  of them in focus: {len(fine_roofs)} roofs")
    return stack(roofs), stack(walls), stack(fine_roofs), stack(fine_walls), footprints


def deck_profile(pts, nrm, width, dsm, dtm):
    """Deck height along a bridge: 75th percentile of the surface across the deck (tolerates
    a metre or two of OSM offset), then a rolling median that drops cars, posts and wires."""
    across = np.linspace(-width / 2, width / 2, 5)
    probe = np.stack([dsm.sample(pts[:, 0] + nrm[:, 0] * o, pts[:, 1] + nrm[:, 1] * o) for o in across])
    deck = np.percentile(probe, 75, axis=0)
    if len(deck) >= 5:
        deck = ndimage.median_filter(deck, size=min(15, len(deck) | 1), mode="nearest")
    ground = dtm.sample(pts[:, 0], pts[:, 1])
    return np.clip(deck, ground + 0.3, ground + 60)


def build_bridges(els, clip, dsm, dtm, focus):
    out, fine_out, labels, corridors = [], [], {}, []
    count = 0
    for el in els:
        tags = el.get("tags", {})
        name = tags.get("bridge:name") or (tags.get("name") if tags.get("man_made") == "bridge" else None)
        if not name and BRIDGE_NAME.search(tags.get("name", "")):
            name = tags["name"]
        if tags.get("man_made") == "bridge":
            poly = polygon_of(el)
            if name and poly is not None and poly.intersects(clip):
                c = poly.intersection(clip).representative_point()
                labels.setdefault(name, [0.0, c.x, c.y, None])
            continue
        if el["type"] != "way" or not is_bridge(tags) or not ("highway" in tags or "railway" in tags):
            continue
        if tags.get("railway") == "platform":
            continue
        line = line_of(el.get("geometry"))
        if line is None or not line.intersects(clip):
            continue
        kind = tags.get("highway") or "rail"
        width = width_of(tags, STREET_WIDTH.get(kind, 6.0 if kind == "rail" else 4.0))
        for seg in parts(line.intersection(clip)):
            if seg.geom_type != "LineString" or seg.length < 2:
                continue
            count += 1
            corridors.append(seg.buffer(width / 2 + 1.0, cap_style="flat"))
            fine = seg.intersects(focus)
            dst = fine_out if fine else out
            pts, nrm = along(seg, FINE_BRIDGE_STEP if fine else BRIDGE_STEP)
            deck = deck_profile(pts, nrm, width, dsm, dtm)
            nrows = max(2, int(round(width / (FINE_BRIDGE_ROW if fine else BRIDGE_ROW))) + 1)
            for j, o in enumerate(np.linspace(-width / 2, width / 2, nrows)):
                edge = j in (0, nrows - 1)
                x, y = pts[:, 0] + nrm[:, 0] * o, pts[:, 1] + nrm[:, 1] * o
                dst.append(pack(x, y, deck, 0.85 if edge else 0.55))
                if edge:  # railing
                    dst.append(pack(x, y, deck + 1.1, 1.0))
                    dst.append(pack(x, y, deck + 0.55, 0.7))
            if name and (name not in labels or labels[name][0] < seg.length):
                m = len(pts) // 2
                labels[name] = [seg.length, pts[m, 0], pts[m, 1], float(deck[m])]
    final = []
    for name, (_, x, y, z) in labels.items():
        final.append({"name": name, "e": x, "n": y, "z": z if z is not None else float(dsm.sample([x], [y])[0])})
    print(f"  bridges: {count} deck segments; named: {[l['name'] for l in final]}")
    stack = lambda chunks: np.concatenate(chunks) if chunks else np.empty((0, 4))
    return stack(out), stack(fine_out), final, unary_union(corridors)


def build_rails(els, clip, dsm, dtm):
    out = []
    for el in els:
        tags = el.get("tags", {})
        if tags.get("railway") not in ("rail", "light_rail", "tram", "narrow_gauge") or el["type"] != "way":
            continue
        if tags.get("tunnel", "no") != "no":
            continue
        line = line_of(el.get("geometry"))
        if line is None or not line.intersects(clip):
            continue
        for seg in parts(line.intersection(clip)):
            if seg.geom_type != "LineString" or seg.length < 1:
                continue
            pts, nrm = along(seg, RAIL_STEP)
            z = deck_profile(pts, nrm, 5.0, dsm, dtm) if is_bridge(tags) else dtm.sample(pts[:, 0], pts[:, 1])
            for o in (-GAUGE / 2, GAUGE / 2):
                out.append(pack(pts[:, 0] + nrm[:, 0] * o, pts[:, 1] + nrm[:, 1] * o, z + 0.25, 0.8))
    print(f"  rails: {sum(len(o) for o in out) // 2:,} sleepers' worth of track")
    return np.concatenate(out) if out else np.empty((0, 4))


def street_areas(els, clip):
    """Corridors of every street and path at ground level, plus mapped pedestrian areas."""
    shapes = []
    for el in els:
        tags = el.get("tags", {})
        hw = tags.get("highway") or tags.get("area:highway")
        if not hw or hw in ("proposed", "construction", "platform", "bus_stop", "elevator"):
            continue
        if is_bridge(tags) or tags.get("tunnel", "no") not in ("no", "building_passage"):
            continue
        if "area:highway" in tags or tags.get("area") == "yes":
            p = polygon_of(el)
            if p is not None:
                shapes.append(p)
            continue
        line = line_of(el.get("geometry"))
        if line is not None:
            shapes.append(line.buffer(width_of(tags, STREET_WIDTH.get(hw, 4.0)) / 2, cap_style="round"))
    return unary_union(shapes).intersection(clip)


def build_water(els, clip):
    polys = []
    for el in els:
        tags = el.get("tags", {})
        if (tags.get("natural") == "water" or tags.get("waterway") == "riverbank"
                or tags.get("landuse") == "reservoir"):
            p = polygon_of(el)
            if p is not None:
                polys.append(p)
    area = unary_union(polys).intersection(clip) if polys else Polygon()
    print(f"  water: {len(polys)} areas, {area.area / 1e4:.1f} ha in view")
    return area


def build_trees(dsm, dtm, blocked):
    """Canopy = surface well above terrain, opened to drop poles, wires and cars."""
    ndsm = dsm.a - dtm.a
    canopy = ndimage.binary_opening(ndsm > 2.5, structure=np.ones((5, 5), bool))
    tx, ty = hex_grid(box(*AREA["bbox"]), TREE_STEP)
    c = np.clip(((tx - dsm.x0) / RES).astype(np.int64), 0, canopy.shape[1] - 1)
    r = np.clip(((dsm.y1 - ty) / RES).astype(np.int64), 0, canopy.shape[0] - 1)
    keep = canopy[r, c] & ~shapely.contains_xy(blocked, tx, ty)
    tx, ty = tx[keep], ty[keep]
    hs = dsm.hillshade(z=ndimage.gaussian_filter(dsm.a, 1.5), altitude=45)
    print(f"  trees: {len(tx):,} canopy dots")
    return pack(tx, ty, dsm.sample(tx, ty), dsm.sample(tx, ty, hs))


# ---------------------------------------------------------------- main
def main():
    x0, y0, x1, y1 = AREA["bbox"]
    clip = box(x0, y0, x1, y1)
    shapely.prepare(clip)
    print(f"area: {AREA['name']} {(x1 - x0) / 1000:.2f} x {(y1 - y0) / 1000:.2f} km")
    print("rasters")
    dtm, dsm = Raster("dtm"), Raster("dsm")
    hs_ground = dtm.hillshade(smooth_m=2.0)
    hs_roof = dsm.hillshade(smooth_m=0.4, altitude=50)

    els = json.loads((RAW / "osm.json").read_text())["elements"]
    print(f"OSM: {len(els):,} elements")
    focus = focus_area(els, clip)
    shapely.prepare(focus)
    print(f"focus: {focus.area / 1e4:.1f} ha of {clip.area / 1e4:.0f}")
    roofs, walls, fine_roofs, fine_walls, footprints = build_buildings(els, clip, dsm, dtm, hs_roof, focus)
    bridges, fine_bridges, labels, bridge_area = build_bridges(els, clip, dsm, dtm, focus)
    rails = build_rails(els, clip, dsm, dtm)
    water_area = build_water(els, clip)
    streets_area = street_areas(els, clip)
    houses = unary_union(footprints)

    # One hex grid for all ground-level dots, classified by where it falls.
    gx, gy = hex_grid(clip, GROUND_STEP)
    shapely.prepare(houses)
    shapely.prepare(streets_area)
    open_ground = ~shapely.contains_xy(houses, gx, gy) & ~shapely.contains_xy(water_area, gx, gy)
    gx, gy = gx[open_ground], gy[open_ground]
    coarse = ~shapely.contains_xy(focus, gx, gy)  # the focus has a closer grid of its own
    gx, gy = gx[coarse], gy[coarse]
    fx, fy = hex_grid(focus.difference(houses).difference(water_area), FINE_GROUND)
    focus_ground = pack(fx, fy, dtm.sample(fx, fy), dtm.sample(fx, fy, hs_ground))
    on_street = shapely.contains_xy(streets_area, gx, gy)
    gz, gs = dtm.sample(gx, gy), dtm.sample(gx, gy, hs_ground)
    ground = pack(gx[~on_street], gy[~on_street], gz[~on_street], gs[~on_street])
    streets = pack(gx[on_street], gy[on_street], gz[on_street], gs[on_street])
    wx, wy = hex_grid(water_area, WATER_STEP)
    water = pack(wx, wy, dtm.sample(wx, wy), np.random.default_rng(7).random(len(wx)))
    trees = build_trees(dsm, dtm, unary_union([houses.buffer(1.5), bridge_area, water_area.buffer(-1)]))

    layers = dict(ground=ground, streets=streets, water=water, trees=trees, rails=rails,
                  roofs=roofs, walls=walls, bridges=bridges, focus_ground=focus_ground,
                  focus_roofs=fine_roofs, focus_walls=fine_walls, focus_bridges=fine_bridges)
    # The 0.5 m survey stops short of the mountain in the south-east corner: no dots there.
    before = sum(len(v) for v in layers.values())
    layers = {k: v[dtm.known(v[:, 0], v[:, 1])] if len(v) else v for k, v in layers.items()}
    print(f"  outside the survey: {before - sum(len(v) for v in layers.values()):,} dots dropped")
    allp = np.concatenate([layers[k] for k in LAYERS])
    origin = [round((x0 + x1) / 2), round((y0 + y1) / 2), math.floor(float(dtm.sample([(x0 + x1) / 2], [(y0 + y1) / 2])[0]))]
    span = max(np.abs(allp[:, 0] - origin[0]).max(), np.abs(allp[:, 1] - origin[1]).max(),
               np.abs(allp[:, 2] - origin[2]).max())
    scale = next(s for s in (0.02, 0.025, 0.05, 0.1, 0.25) if span / s < 32000)
    q = np.empty((len(allp), 3), np.int16)
    for i in range(3):
        q[:, i] = np.round((allp[:, i] - origin[i]) / scale)
    shade = np.round(np.clip(allp[:, 3], 0, 1) * 255).astype(np.uint8)

    OUT.mkdir(parents=True, exist_ok=True)
    blob = gzip.compress(q.tobytes() + shade.tobytes(), 9)
    (OUT / "dots.bin.gz").write_bytes(blob)

    # Ground height grid, 2 m, decimetres above origin: the site's build reads a place's height off it.
    gstep = 2.0
    hx = np.arange(x0, x1 + gstep, gstep)
    hy = np.arange(y0, y1 + gstep, gstep)
    hxx, hyy = np.meshgrid(hx, hy)
    hgrid = np.round((dtm.sample(hxx.ravel(), hyy.ravel()) - origin[2]) * 10).astype(np.int16)
    (OUT / "height.bin.gz").write_bytes(gzip.compress(hgrid.tobytes(), 9))

    offset, ranges = 0, []
    for k in LAYERS:
        ranges.append({"name": k, "offset": offset, "count": len(layers[k])})
        offset += len(layers[k])
    lon, lat = Transformer.from_crs(25832, 4326, always_xy=True).transform(origin[0], origin[1])
    meta = {
        "name": AREA["name"],
        "count": int(len(allp)),
        "scale": scale,
        "origin": {"e": origin[0], "n": origin[1], "z": origin[2], "crs": "EPSG:25832",
                   "lon": round(lon, 6), "lat": round(lat, 6)},
        "extent": {"e": [x0 - origin[0], x1 - origin[0]], "n": [y0 - origin[1], y1 - origin[1]],
                   "z": [round(float(allp[:, 2].min()) - origin[2], 2), round(float(allp[:, 2].max()) - origin[2], 2)]},
        "height": {"step": gstep, "cols": len(hx), "rows": len(hy), "e0": x0 - origin[0], "n0": y0 - origin[1],
                   "unit": 0.1},
        "layers": ranges,
        "focus": {"places": sorted(FOCUS), "roofs": FINE_ROOF, "walls": [FINE_WALL_STEP, FINE_WALL_RISE],
                  "ground": FINE_GROUND, "bridges": [FINE_BRIDGE_STEP, FINE_BRIDGE_ROW]},
        "labels": [{"name": l["name"], "e": round(l["e"] - origin[0], 1), "n": round(l["n"] - origin[1], 1),
                    "z": round(l["z"] - origin[2], 1)} for l in labels],
        "buildings": len(footprints),
        "sources": [
            {"text": "Buildings, streets, bridges, water: © OpenStreetMap contributors (ODbL)",
             "url": "https://www.openstreetmap.org/copyright"},
            {"text": "LiDAR DTM/DSM 0.5 m: Provincia autonoma di Bolzano – Alto Adige (CC0)",
             "url": "https://geokatalog.buergernetz.bz.it/geokatalog/"},
        ],
    }
    (OUT / "dots.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print("layers: " + ", ".join(f"{r['name']} {r['count']:,}" for r in ranges))
    print(f"total {len(allp):,} dots, scale {scale} m, {len(blob) / 1e6:.1f} MB gz "
          f"({len(allp) * 7 / 1e6:.1f} MB raw)")


if __name__ == "__main__":
    main()
