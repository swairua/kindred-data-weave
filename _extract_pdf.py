import pdfplumber

pdf = pdfplumber.open(r'C:\xampp\htdocs\kindred\Density-moisture content relationship.pdf')
page = pdf.pages[0]
print('page size:', page.width, page.height)
words = page.extract_words()
lines = {}
for w in words:
    key = round(w['top'] / 3)
    lines.setdefault(key, []).append(w)
for key in sorted(lines):
    ws = sorted(lines[key], key=lambda w: w['x0'])
    out = 'y=%.0f: ' % ws[0]['top'] + ' | '.join('%s@%.0f' % (w['text'], w['x0']) for w in ws)
    print(out)
