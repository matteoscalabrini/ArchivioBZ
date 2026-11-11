# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "pyproj"]
# ///
"""Download the raw inputs for the dot map into library/.cache/map-raw/ (cached: delete a file
to fetch it again). Adapted from BolzanoDot, scripts/fetch_data.py.

The area is the bbox in area.json beside this file (EPSG:25832 metres). focus.json, written by
focus.mjs, lists the places with rows; the OpenStreetMap object each one names is fetched too,
whatever its tags.

1. OpenStreetMap (ODbL) via Overpass: buildings, streets and paths, railways, bridges, water.
2. LiDAR of the Provincia autonoma di Bolzano (CC0) via WCS, native 0.5 m grid:
   DSM (surface: roofs, bridge decks, tree canopy) and DTM (bare earth).
   The 2.5 m models are from the 2004-05 flights and miss two decades of construction.

Run: npm run map-data   (focus.mjs, then this, then build.py)
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / ".cache" / "map-raw"
AREA = json.loads((HERE / "area.json").read_text())
FOCUS = json.loads((RAW / "focus.json").read_text())
UA = {"User-Agent": "dot-map-builder/0.1"}

OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
WCS = "https://geoservices9.civis.bz.it/geoserver/ows"
RASTERS = {
    "dsm": "p_bz-Elevation__DigitalElevationModel-0.5m",
    "dtm": "p_bz-Elevation__DigitalTerrainModel-0.5m",
}
RES = 0.5
TILE = 500  # metres; 1000x1000 px per request
MARGIN = 150  # metres of OSM context around the bbox, so edge features are complete


def overpass(query: str, cache: Path) -> dict:
    if cache.exists():
        return json.loads(cache.read_text())
    for attempt in range(10):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = requests.post(url, data={"data": query}, headers=UA, timeout=400)
            if r.ok and r.text.lstrip().startswith("{"):
                data = r.json()
                if data.get("remark") and not data.get("elements"):
                    raise RuntimeError(data["remark"])
                cache.write_text(r.text)
                print(f"  overpass ok via {url}: {len(data['elements'])} elements")
                return data
            print(f"  {url}: HTTP {r.status_code} (busy)")
        except Exception as e:  # noqa: BLE001 - any failure means: try the next mirror
            print(f"  {url}: {e}")
        time.sleep(5 * (attempt + 1))
    sys.exit("overpass: all attempts failed")


def fetch_osm() -> None:
    x0, y0, x1, y1 = AREA["bbox"]
    to_ll = Transformer.from_crs(25832, 4326, always_xy=True)
    w, s = to_ll.transform(x0 - MARGIN, y0 - MARGIN)
    e, n = to_ll.transform(x1 + MARGIN, y1 + MARGIN)
    bb = f"{s:.6f},{w:.6f},{n:.6f},{e:.6f}"
    refs = {"node": [], "way": [], "relation": []}
    for place in FOCUS.values():  # the object each place with rows names, whatever its tags
        if place["osm"]:
            refs[place["osm"]["kind"]].append(str(place["osm"]["id"]))
    by_id = " ".join(f"{'rel' if kind == 'relation' else kind}(id:{','.join(ids)});" for kind, ids in refs.items() if ids)
    q = f"""[out:json][timeout:300];
    (
      way["building"]({bb});
      rel["building"]({bb});
      way["highway"]({bb});
      way["area:highway"]({bb});
      way["railway"~"^(rail|light_rail|tram|narrow_gauge|platform)$"]({bb});
      way["man_made"="bridge"]({bb});
      rel["man_made"="bridge"]({bb});
      way["natural"="water"]({bb});
      rel["natural"="water"]({bb});
      way["waterway"]({bb});
      way["landuse"="reservoir"]({bb});
      {by_id}
    );
    out geom;"""
    overpass(q, RAW / "osm.json")


def fetch_tile(kind: str, x0: int, y0: int) -> Path:
    out = RAW / "lidar" / f"{kind}_{RES:g}m_{x0}_{y0}.tif"
    if out.exists() and out.stat().st_size > 1000:
        return out
    params = [
        ("service", "WCS"), ("version", "2.0.1"), ("request", "GetCoverage"),
        ("coverageId", RASTERS[kind]), ("format", "image/tiff"),
        ("subset", f"E({x0},{x0 + TILE})"), ("subset", f"N({y0},{y0 + TILE})"),
        ("geotiff:compression", "DEFLATE"),
    ]
    for attempt in range(5):
        try:
            r = requests.get(WCS, params=params, headers=UA, timeout=400)
            if r.ok and r.headers.get("content-type", "").startswith("image/tiff"):
                out.write_bytes(r.content)
                return out
            print(f"  {out.name}: HTTP {r.status_code} {r.text[:200]!r}")
        except Exception as e:  # noqa: BLE001
            print(f"  {out.name}: {e}")
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"tile failed: {out.name}")


def lidar_tiles() -> list[tuple[int, int]]:
    x0, y0, x1, y1 = AREA["bbox"]
    return [
        (x, y)
        for x in range(x0 // TILE * TILE, x1, TILE)
        for y in range(y0 // TILE * TILE, y1, TILE)
    ]


def main() -> None:
    (RAW / "lidar").mkdir(parents=True, exist_ok=True)
    print(f"area: {AREA['name']} {AREA['bbox']}")
    print("OSM")
    fetch_osm()
    tiles = lidar_tiles()
    jobs = [(k, x, y) for k in RASTERS for x, y in tiles]
    print(f"LiDAR: {len(tiles)} tiles x {len(RASTERS)} models @ {RES} m")
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, _ in enumerate(pool.map(lambda j: fetch_tile(*j), jobs), 1):
            if i % 8 == 0 or i == len(jobs):
                print(f"  {i}/{len(jobs)}")
    print("done")


if __name__ == "__main__":
    main()
