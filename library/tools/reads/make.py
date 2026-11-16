"""Make a reader's text from its draft, or check one that is already published.
The draft is Markdown in which a link may be written [words](@key): key is any piece of an address
that the research base (reports, notes, rows, manifests, tables) holds exactly once. This turns
each key into its address, writes library/content/reads/<no>.md, lists what every row link is hung
on, and names the numbers and quotations in the text that the base does not have.
usage: make.py <row no> [draft.md] [-q]     (without a draft: check the published text in place)"""
import glob, json, os, re, sys, urllib.parse
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
no = sys.argv[1]
quiet = '-q' in sys.argv
out = os.path.join(REPO, 'library', 'content', 'reads', no + '.md')
drafts = [a for a in sys.argv[2:] if not a.startswith('-')]
template = drafts[0] if drafts else out

notes = glob.glob(os.path.join(REPO, 'reports', '*.md')) + glob.glob(os.path.join(REPO, 'research_notes', '*', '*.md'))
records = glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '**', 'entries.json'), recursive=True) + [os.path.join(REPO, 'library', 'content', 'entries.json')]
manifests = glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '*', 'manifest.md')) + glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', '*', '*.csv'))
base = '\n'.join(open(f, encoding='utf8', errors='replace').read() for f in notes)
rows = {}
rowtext = []
for f in records:
    d = json.load(open(f, encoding='utf8'))
    for r in (d.get('entries', []) if isinstance(d, dict) else d):
        if isinstance(r, dict) and 'no' in r:
            rows[r['no']] = r
            rowtext.append(json.dumps(r, ensure_ascii=False))
wide = base + '\n' + '\n'.join(rowtext) + '\n' + '\n'.join(open(f, encoding='utf8', errors='replace').read() for f in manifests)

def addresses(text, stop=''):
    found = set()
    for m in re.finditer(r'\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)', text):
        found.add(m.group(1))
    for m in re.finditer(r'https?://[^\s|<>\]"\\' + stop + r']+', text):
        u = m.group(0).rstrip('.,;:')
        while u.endswith(')') and u.count('(') < u.count(')'):
            u = u[:-1]
        found.add(u)
    return found
near = addresses(base)            # what the notes and reports cite
far = addresses(wide, stop=',')   # and what the rows, manifests and tables hold
urls = near | far
by_source = {}
for r in rows.values():
    u = str((r.get('source') or {}).get('url') or '').strip().rstrip('/')
    if u.startswith('http'):
        by_source.setdefault(u, []).append(r['no'])

problems = []
def pick(key):
    if key.startswith('img:'):
        rel = key[4:]
        hits = glob.glob(os.path.join(REPO, 'research_notes', '*', 'files', glob.escape(rel)))
        if len(hits) != 1:
            problems.append(f'img {rel}: {len(hits)} files')
            return '@' + key
        return '../../../' + urllib.parse.quote(os.path.relpath(hits[0], REPO))
    hits = sorted(u for u in near if key in u) or sorted(u for u in far if key in u)
    if len(hits) > 1:
        ends = [u for u in hits if u.rstrip('/').endswith(key.rstrip('/'))]
        if ends:
            hits = sorted(set(ends), key=len)[:1] if len({u.rstrip('/') for u in ends}) == 1 else ends
    if len(hits) != 1:
        problems.append(f'{key}: {len(hits)} addresses {hits[:5]}')
        return '@' + key
    return hits[0]

text = open(template, encoding='utf8').read()
used = []
def sub(m):
    u = pick(m.group(1))
    used.append((m.group(1), u))
    return '](' + u + ')'
text = re.sub(r'\]\(@((?:[^()\s]|\([^()\s]*\))+)\)', sub, text)
if not quiet:
    for k, u in used:
        if k.startswith('img:'):
            continue
        held = by_source.get(u.rstrip('/'), [])
        print(f'{k[:40]:40} -> {u[:90]}' + (f'   = row {held[0]}' if len(held) == 1 else (f'   = rows {held}' if held else '')))
# what each row link is hung on
print('\nROW LINKS')
for m in re.finditer(r'\[((?:[^\[\]]|\[[^\]]*\])*)\]\(row:(\d{1,2}\.\d{2})\)', text):
    words, n = m.group(1), m.group(2)
    r = rows.get(n)
    if not r:
        problems.append(f'row:{n} is not a row')
        continue
    if not quiet:
        print(f'{n:6} {words[:44]:44} | {r.get("date","")[:14]:14} | {r["title"][:70]}')
if problems:
    print('\nPROBLEMS'); print('\n'.join(problems)); sys.exit(1)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf8').write(text)
bad = [u for u in re.findall(r'\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)', text) if u not in urls]
print('\nlinks:', len(used), '| outside addresses not in the base:', bad)

# numbers and quotations of the text that the base does not have
plain = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', text)
plain = re.sub(r'\]\([^)]*\)', ']', plain)
digits = lambda s: re.sub(r'[^\d]', '', s)
have = set(digits(m.group(0)) for m in re.finditer(r'\d[\d.,’\'  ]*\d|\d', wide))
have |= set(re.findall(r'\d+', wide))
missing = []
for m in re.finditer(r'\d[\d,.]*\d|\d', plain):
    tok = m.group(0)
    d = digits(tok)
    if len(d) < 2:
        continue
    if d not in have and not all(part in have for part in re.findall(r'\d+', tok)):
        missing.append(tok)
squash = lambda s: re.sub(r'\s+', ' ', s.replace('’', "'").replace('“', '"').replace('”', '"')).lower()
wide_s = squash(wide)
quotes = re.findall(r'"([^"\n]{3,})"', plain.replace('“', '"').replace('”', '"'))
unq = [q for q in quotes if squash(q).strip(' .,;') not in wide_s]
print('numbers not in the base:', sorted(set(missing)))
print('quotations not in the base:')
for q in unq:
    print('   ', q[:140])
parts = re.split(r'(?m)^# ', plain)
for p in parts[1:] if len(parts) > 1 else parts:
    head = p.split('\n', 1)[0]
    print(f'{len(p.split()):6} words  {head[:60]}')
print('figures:', len(re.findall(r'(?m)^!\[', text)), '| row links:', len(re.findall(r'\]\(row:', text)), '| @links:', len([k for k, _ in used if not k.startswith('img:')]))
