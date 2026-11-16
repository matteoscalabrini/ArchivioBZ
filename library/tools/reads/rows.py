"""List rows compactly. usage: rows.py <section numbers or row numbers, comma separated> [width]"""
import glob, json, os, sys
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
want = sys.argv[1].split(',')
w = int(sys.argv[2]) if len(sys.argv) > 2 else 78
out = []
for f in glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '**', 'entries.json'), recursive=True):
    for r in json.load(open(f, encoding='utf8'))['entries']:
        if r['no'].split('.')[0] in want or r['no'] in want:
            img = ''
            if r.get('images'):
                p = os.path.normpath(os.path.join(os.path.dirname(f), r['images'][0]['file']))
                img = os.path.relpath(p, os.path.join(REPO, 'research_notes')).split('/files/', 1)[-1]
            out.append((tuple(int(x) for x in r['no'].split('.')), f"{r['no']} | {r.get('type','')[:10]} | {str(r.get('date',''))[:16]} | {r['title'][:w]} | {img}"))
for _, line in sorted(out):
    print(line)
