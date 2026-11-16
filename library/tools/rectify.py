# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "opencv-python-headless", "pillow"]
# ///
"""Cut a flat thing (a poster, a page, a framed print) out of a photograph taken at an angle and
set it upright and square, at its own proportions.

  uv run library/tools/rectify.py look PHOTO OUT.jpg X,Y [X,Y ...] [--r 45] [--zoom 8]
  uv run library/tools/rectify.py cut JOBS.json [--only NAME] [--debug DIR]

`look` writes gridded close-ups around the given points, to read a sheet's corners off to the
pixel: start from rough points taken from the whole picture (--r 200 --zoom 2), then go close.
Coordinates are always full-size pixels of the upright photograph. It also prints the lens.

`cut` reads JOBS.json, a list of jobs:
  name      a short name
  photo     the photograph, path relative to JOBS.json
  out       the picture to write, path relative to JOBS.json
  corners   the sheet's four corners: top left, top right, bottom right, bottom left
  bow       optional, [top, right, bottom, left]: how many pixels each edge of the sheet sags
            inward at its midpoint in the squared-up picture (a print that does not lie quite
            flat: its corners stand proud of its middle); the edge is pulled straight
  trim      optional, pixels to shave off the result, one number or [top, right, bottom, left]:
            the blurred rim of the sheet
  aspect    optional, width / height to force; otherwise it is worked out from the lens
  fill      optional, {"photo": ..., "corners": [...], "bow": [...]}: a second photograph of the
            same sheet, used only where the first has no picture (a corner that fell outside
            the frame); its colour is matched to the first and the seam is feathered

With --debug DIR each job also writes NAME_corners.jpg (the four corners, enlarged, with the cut
drawn), NAME_edges.jpg (the four edges as long strips stretched six times across, the cut line
drawn: top, right, bottom, left, the sheet below the line; read `bow` off it) and NAME_view.jpg.

How the proportions are found. A rectangle seen in perspective fixes its own width-to-height
ratio once the lens is known. With the camera matrix K (focal length from the photograph's EXIF,
principal point at the centre) and the homography H that carries the unit square onto the four
corners, the ratio is |K^-1 h1| / |K^-1 h2|. The angle between those two vectors should come out
at 90 degrees; it is printed as a check on the corners and the lens.

What was ruled out, 14 November 2026: the sagging edges are not lens distortion. On an iPhone 14
Pro every sheet's edges bowed the same way with all three lenses, which looks like pincushion
distortion; but a steel frame edge 1,000 px off the picture's centre and 2,500 px long was straight
to 3 px where the distortion fitted to the sheets would have bent it by 20. The prints bow; the
lens does not. So there is no lens correction here, only `bow`.
"""
import io
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageCms, ImageOps

SQUARE = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])


def load(path):
    """The upright photograph as sRGB, and its focal length as a 35 mm equivalent."""
    im = Image.open(path)
    f35 = im.getexif().get_ifd(ExifTags.IFD.Exif).get(0xA405)  # FocalLengthIn35mmFilm
    icc = im.info.get("icc_profile")
    im = ImageOps.exif_transpose(im).convert("RGB")
    if icc:  # phones write Display P3; the web expects sRGB
        im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)),
                                       ImageCms.createProfile("sRGB"), outputMode="RGB")
    return np.asarray(im), f35


def proportions(corners, f35, size):
    """Width / height of the rectangle behind the four corners, and the angle between its sides."""
    w, h = size
    f = (f35 / 43.2666) * math.hypot(w, h)  # a 35 mm frame has a 43.27 mm diagonal
    Ki = np.linalg.inv(np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1.0]]))
    H = cv2.getPerspectiveTransform(SQUARE, np.float32(corners))
    r1, r2 = Ki @ H[:, 0], Ki @ H[:, 1]
    cos = r1 @ r2 / (np.linalg.norm(r1) * np.linalg.norm(r2))
    return float(np.linalg.norm(r1) / np.linalg.norm(r2)), math.degrees(math.acos(np.clip(cos, -1, 1)))


def warp(rgb, corners, ow, oh, bow=(0, 0, 0, 0), margin=0):
    """The sheet set square, ow x oh, plus `margin` pixels of its surroundings on every side, and
    which of those pixels the photograph actually holds.

    The four corners fix the perspective. `bow` then takes out the sheet's own warp: each edge is
    pulled straight along a parabola, and the pull fades linearly to nothing at the opposite edge.
    """
    bt, br, bb, bl = bow
    u, v = np.meshgrid(np.arange(-margin, ow + margin, dtype=np.float32) + 0.5,
                       np.arange(-margin, oh + margin, dtype=np.float32) + 0.5)
    s, t = np.clip(u / ow, 0, 1), np.clip(v / oh, 0, 1)
    ps, pt = 4 * s * (1 - s), 4 * t * (1 - t)
    u2 = u + (1 - s) * bl * pt - s * br * pt
    v2 = v + (1 - t) * bt * ps - t * bb * ps
    H = cv2.getPerspectiveTransform(np.float32(SQUARE * [ow, oh]), np.float32(corners))
    den = H[2, 0] * u2 + H[2, 1] * v2 + H[2, 2]
    mx = ((H[0, 0] * u2 + H[0, 1] * v2 + H[0, 2]) / den - 0.5).astype(np.float32)
    my = ((H[1, 0] * u2 + H[1, 1] * v2 + H[1, 2]) / den - 0.5).astype(np.float32)
    out = cv2.remap(rgb, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    h, w = rgb.shape[:2]
    return out, (mx >= 0) & (my >= 0) & (mx <= w - 1) & (my <= h - 1)


def fill_gap(out, ok, out2, ok2):
    """Where the first photograph has no picture, take the second, colour-matched and feathered."""
    near = cv2.dilate((~ok).astype(np.uint8), np.ones((81, 81), np.uint8)).astype(bool) & ok & ok2
    patch = out2.astype(np.float32)
    for ch in range(3):  # a straight line per channel, fitted where both photographs show the sheet
        gain, offset = np.polyfit(patch[..., ch][near], out[..., ch][near].astype(np.float32), 1)
        patch[..., ch] = patch[..., ch] * gain + offset
    reach = cv2.distanceTransform(ok.astype(np.uint8), cv2.DIST_L2, 3)  # 0 in the gap, growing into the picture
    weight = np.clip(1 - reach / 14.0, 0, 1)[..., None] * ok2[..., None]
    return (out * (1 - weight) + np.clip(patch, 0, 255) * weight).astype(np.uint8)


def tile(rgb, x, y, r, zoom, interpolation=cv2.INTER_CUBIC):
    """A square of the photograph, r pixels each way from (x, y), enlarged; and its origin."""
    h, w = rgb.shape[:2]
    x0, y0 = int(round(x)) - r, int(round(y)) - r
    piece = np.full((2 * r, 2 * r, 3), 128, np.uint8)
    sx0, sy0, sx1, sy1 = max(x0, 0), max(y0, 0), min(x0 + 2 * r, w), min(y0 + 2 * r, h)
    if sx1 > sx0 and sy1 > sy0:
        piece[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = rgb[sy0:sy1, sx0:sx1]
    return cv2.resize(piece, None, fx=zoom, fy=zoom, interpolation=interpolation), x0, y0


def save(rgb, path, quality=92):
    path.parent.mkdir(parents=True, exist_ok=True)
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    Image.fromarray(rgb).save(path, quality=quality, subsampling=0, icc_profile=srgb)


def look(photo, out, points, r, zoom):
    rgb, f35 = load(photo)
    h, w = rgb.shape[:2]
    step = 50 if r > 80 else 10
    yellow, red = (255, 255, 0), (255, 0, 0)
    tiles = []
    for x, y in points:
        piece, x0, y0 = tile(rgb, x, y, r, zoom)
        for gx in range((x0 // step + 1) * step, x0 + 2 * r, step):
            px = (gx - x0) * zoom
            cv2.line(piece, (px, 0), (px, piece.shape[0]), yellow, 1)
            cv2.putText(piece, str(gx), (px + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, yellow, 1)
        for gy in range((y0 // step + 1) * step, y0 + 2 * r, step):
            py = (gy - y0) * zoom
            cv2.line(piece, (0, py), (piece.shape[1], py), yellow, 1)
            cv2.putText(piece, str(gy), (2, py - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, yellow, 1)
        cv2.drawMarker(piece, (r * zoom, r * zoom), red, cv2.MARKER_CROSS, 24, 1)
        tiles.append(piece)
    while len(tiles) % 2:
        tiles.append(np.zeros_like(tiles[0]))
    save(np.vstack([np.hstack(tiles[i:i + 2]) for i in range(0, len(tiles), 2)]), Path(out), 88)
    print(f"{out}: {w} x {h} upright, lens {f35} mm (35 mm equivalent), grid every {step} px")


def cut(job, base, debug):
    rgb, f35 = load(base / job["photo"])
    h, w = rgb.shape[:2]
    pts = np.array(job["corners"], float)
    bow = job.get("bow", [0, 0, 0, 0])
    if "aspect" in job:
        ratio, check = job["aspect"], "forced"
    else:
        ratio, angle = proportions(pts, f35, (w, h))
        check = f"sides meet at {angle:.1f} deg, lens {f35} mm"
    side = lambda i, j: float(np.hypot(*(pts[i] - pts[j])))
    oh = round(max(side(0, 3), side(1, 2)))  # as many pixels as the photograph gives the longer upright
    ow = round(oh * ratio)
    if ow < max(side(0, 1), side(2, 3)):
        ow = round(max(side(0, 1), side(2, 3)))
        oh = round(ow / ratio)
    out, ok = warp(rgb, pts, ow, oh, bow)
    note = ""
    if not ok.all() and "fill" in job:
        rgb2, _ = load(base / job["fill"]["photo"])
        out2, ok2 = warp(rgb2, np.array(job["fill"]["corners"], float), ow, oh, job["fill"].get("bow", bow))
        out = fill_gap(out, ok, out2, ok2)
        note = f", {int((~ok & ok2).sum())} px filled from {job['fill']['photo']}"
        ok = ok | ok2
    t = job.get("trim", 0)
    tt, tr, tb, tl = t if isinstance(t, list) else [t] * 4
    final = out[tt:oh - tb, tl:ow - tr]
    save(final, base / job["out"])
    print(f"{job['name']}: {final.shape[1]} x {final.shape[0]}, width/height {ratio:.4f} ({check}), "
          f"{int((~ok).sum())} px outside the photograph{note}")
    if not debug:
        return
    magenta = (255, 0, 255)
    corner_tiles = []
    for x, y in pts:
        piece, x0, y0 = tile(rgb, x, y, 60, 5, cv2.INTER_NEAREST)
        q = [(int((p[0] - x0) * 5), int((p[1] - y0) * 5)) for p in pts]
        for i in range(4):
            cv2.line(piece, q[i], q[(i + 1) % 4], magenta, 1)
        corner_tiles.append(piece)
    save(np.vstack([np.hstack(corner_tiles[:2]), np.hstack(corner_tiles[:1:-1])]), debug / f"{job['name']}_corners.jpg", 88)
    m = 16
    wide, _ = warp(rgb, pts, ow, oh, bow, margin=m)
    strips = [wide[:2 * m], np.rot90(wide[:, -2 * m:], 1), wide[-2 * m:][::-1], np.rot90(wide[:, :2 * m], -1)]
    rows = []
    for strip in strips:  # outside above, the sheet below
        strip = cv2.resize(np.ascontiguousarray(strip), (1500, 2 * m * 6), interpolation=cv2.INTER_AREA)
        cv2.line(strip, (0, m * 6), (1500, m * 6), magenta, 1)
        rows.append(strip)
    save(np.vstack(rows), debug / f"{job['name']}_edges.jpg", 88)
    small = Image.fromarray(final)
    small.thumbnail((1400, 1400))
    save(np.asarray(small), debug / f"{job['name']}_view.jpg", 88)


def option(args, name, default):
    if name not in args:
        return default
    i = args.index(name)
    value = args[i + 1]
    del args[i:i + 2]
    return value


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) >= 4 and args[0] == "look":
        r, zoom = int(option(args, "--r", 45)), int(option(args, "--zoom", 8))
        look(args[1], args[2], [tuple(float(n) for n in p.split(",")) for p in args[3:]], r, zoom)
    elif len(args) >= 2 and args[0] == "cut":
        only, debug = option(args, "--only", None), option(args, "--debug", None)
        jobs_path = Path(args[1]).resolve()
        for job in json.loads(jobs_path.read_text()):
            if only is None or job["name"] == only:
                cut(job, jobs_path.parent, Path(debug).resolve() if debug else None)
    else:
        sys.exit(__doc__)
