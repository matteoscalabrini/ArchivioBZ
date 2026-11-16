#!/bin/sh
# publish.sh <row no> <title>: point the row at library/content/reads/<no>.md, give the text its
# title, rebuild and check. Run make.py first.
here="$(cd "$(dirname "$0")" && pwd)"
python3 "$here/point.py" "$1" "$2" | head -1
cd "$here/../.." && npm run build 2>&1 | tail -1 && npm run check 2>&1 | tail -1
