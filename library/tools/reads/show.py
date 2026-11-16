"""Print a notes file for reading, each address shortened to the key make.py resolves,
or to row:N.NN where the address is the source of exactly one row.
usage: show.py <notes file> [from-line] [to-line]"""
import glob, json, os, re, sys
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
f = sys.argv[1]
a = int(sys.argv[2]) if len(sys.argv) > 2 else 1
b = int(sys.argv[3]) if len(sys.argv) > 3 else 10**9
notes = glob.glob(os.path.join(REPO, 'reports', '*.md')) + glob.glob(os.path.join(REPO, 'research_notes', '*', '*.md'))
base = '\n'.join(open(x, encoding='utf8', errors='replace').read() for x in notes)
def addresses(text):
    found = set()
    for m in re.finditer(r'\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)', text):
        found.add(m.group(1))
    for m in re.finditer(r'https?://[^\s|<>\]"\\]+', text):
        u = m.group(0).rstrip('.,;:')
        while u.endswith(')') and u.count('(') < u.count(')'):
            u = u[:-1]
        found.add(u)
    return found
near = addresses(base)
by_source = {}
for e in glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '**', 'entries.json'), recursive=True) + [os.path.join(REPO, 'library', 'content', 'entries.json')]:
    d = json.load(open(e, encoding='utf8'))
    for r in d.get('entries', []):
        u = str((r.get('source') or {}).get('url') or '').strip().rstrip('/')
        if u.startswith('http'):
            by_source.setdefault(u, []).append(r['no'])
memo = {}
def key(u):
    if u in memo:
        return memo[u]
    held = by_source.get(u.rstrip('/'), [])
    if len(held) == 1:
        memo[u] = 'row:' + held[0]
        return memo[u]
    core = u.rstrip('/')
    for n in list(range(14, 60, 6)) + [len(core)]:
        k = core[-n:] if n < len(core) else core
        if '(' in k or ')' in k:
            continue
        hits = [v for v in near if k in v]
        if len({v.rstrip('/') for v in hits}) == 1 or len({v.rstrip('/') for v in hits if v.rstrip('/').endswith(k)}) == 1 and all(v.rstrip('/').endswith(k) or True for v in hits) and len([v for v in hits if v.rstrip('/').endswith(k)]) >= 1 and len({v.rstrip('/') for v in hits if v.rstrip('/').endswith(k)}) == 1 and False:
            memo[u] = '@' + k
            return memo[u]
    memo[u] = '@' + core
    return memo[u]
lines = open(f, encoding='utf8').read().split('\n')
text = '\n'.join(lines[a - 1:b])
def md(m):
    return '](' + key(m.group(1)) + ')'
text = re.sub(r'\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)', md, text)
def bare(m):
    u = m.group(0)
    tail = ''
    while u and u[-1] in '.,;:':
        tail = u[-1] + tail; u = u[:-1]
    while u.endswith(')') and u.count('(') < u.count(')'):
        tail = ')' + tail; u = u[:-1]
    return '<' + key(u) + '>' + tail
text = re.sub(r'(?<!\()https?://[^\s|<>\]"\\]+', bare, text)
print(f'[lines {a}-{min(b, len(lines))} of {len(lines)}]')
print(text)
