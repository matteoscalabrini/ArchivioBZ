"""Point a row's long read at its reader's text and give that text its title.
usage: point.py <no> <title>"""
import glob, json, os, re, sys
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
no, title = sys.argv[1], sys.argv[2]
files = glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '**', 'entries.json'), recursive=True) + [os.path.join(REPO, 'library', 'content', 'entries.json')]
done = False
for f in files:
    t = open(f, encoding='utf8').read()
    at = re.search(r'"no":\s*"' + re.escape(no) + '"', t)
    if not at:
        continue
    m = re.compile(r'"more":\s*\{[^{}]*\}').search(t, at.end())
    nxt = re.compile(r'"no":\s*"').search(t, at.end())
    assert m and (not nxt or m.start() < nxt.start()), 'no more block in this row'
    block = m.group(0)
    indent = re.search(r'\n([ \t]*)"more"', t[:m.start() + 7]).group(1)
    inner = indent + (indent[:len(indent)] if False else '')
    step = re.search(r'\{\n([ \t]*)"', block)
    pad = step.group(1) if step else indent + ' '
    target = os.path.relpath(os.path.join(REPO, 'library', 'content', 'reads', no + '.md'), os.path.dirname(f))
    new = '"more": {\n' + pad + '"kind": "read",\n' + pad + '"target": ' + json.dumps(target, ensure_ascii=False) + ',\n' + pad + '"title": ' + json.dumps(title, ensure_ascii=False) + '\n' + indent + '}'
    t = t[:m.start()] + new + t[m.end():]
    json.loads(t)
    open(f, 'w', encoding='utf8').write(t)
    print(os.path.relpath(f, REPO)); print(new)
    done = True
assert done, 'row not found'
