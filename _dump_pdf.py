import pymupdf, sys
path = sys.argv[1]
doc = pymupdf.open(path)
for pno, page in enumerate(doc):
    print(f"===== PAGE {pno+1} =====")
    print(page.get_text("text"))
