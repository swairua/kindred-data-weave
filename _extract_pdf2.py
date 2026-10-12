import pdfplumber
import pymupdf

PDF = r'C:\xampp\htdocs\kindred\Density-moisture content relationship.pdf'

# 1. Raw chars in the table region to catch anything words() missed
pdf = pdfplumber.open(PDF)
page = pdf.pages[0]
chars = [c for c in page.chars if 220 <= c['top'] <= 380 and c['x0'] >= 255]
rows = {}
for c in chars:
    key = round(c['top'] / 3)
    rows.setdefault(key, []).append(c)
print('=== raw chars in table data region (x>=255, y 220-380) ===')
for key in sorted(rows):
    cs = sorted(rows[key], key=lambda c: c['x0'])
    line = ''.join(c['text'] for c in cs)
    print('y=%.0f: %r' % (cs[0]['top'], line))

# 2. Vector drawings in the chart region to derive Gs from zero-air-voids line
doc = pymupdf.open(PDF)
pg = doc[0]
print()
print('=== drawings in chart region (x 150-420, y 410-580) ===')
for d in pg.get_drawings():
    r = d['rect']
    if r.x0 >= 140 and r.x1 <= 430 and r.y0 >= 400 and r.y1 <= 590:
        for item in d['items']:
            if item[0] == 'l':
                p1, p2 = item[1], item[2]
                print('line (%.1f,%.1f)->(%.1f,%.1f)' % (p1.x, p1.y, p2.x, p2.y))
            elif item[0] == 'c':
                print('curve', ['(%.1f,%.1f)' % (p.x, p.y) for p in item[1:]])
            elif item[0] == 're':
                print('rect', item[1])
