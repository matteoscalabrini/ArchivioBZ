"""Show where the research base says something. usage: find.py <width> <limit> <pattern> [file-substring]"""
import glob, re, sys, os
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
width, limit, pat = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
only = sys.argv[4] if len(sys.argv) > 4 else ''
files = sorted(glob.glob(os.path.join(REPO, 'research_notes', '*', '*.md')) + glob.glob(os.path.join(REPO, 'reports', '*.md')))
n = 0
for f in files:
    if only and only not in f:
        continue
    t = open(f, encoding='utf8').read()
    for m in re.finditer(pat, t, re.I):
        a, b = max(0, m.start() - width), min(len(t), m.end() + width)
        print(f'[{os.path.basename(f)[:28]}] …' + t[a:b].replace('\n', ' ') + '…')
        n += 1
        if n >= limit:
            sys.exit()
