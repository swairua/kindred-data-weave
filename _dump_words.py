import pymupdf, sys
path = sys.argv[1]
pno = int(sys.argv[2]) - 1
page = pymupdf.open(path)[pno]
words = page.get_text("words")
words.sort(key=lambda w: (round(w[1], 0), w[0]))
for w in words:
    print(f"x0={w[0]:7.2f} y0={w[1]:7.2f} x1={w[2]:7.2f} y1={w[3]:7.2f}  {w[4]}")
