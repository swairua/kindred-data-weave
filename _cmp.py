import sys, pymupdf

def spans(path, page=0):
    d = pymupdf.open(path); p = d[page]
    out = []
    for b in p.get_text("dict")["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    out.append((round(s["bbox"][0],1), round(s["bbox"][1],1), round(s["bbox"][2],1), round(s["bbox"][3],1), s["size"], s["font"], t))
    return out

def show(path, page=0):
    print("=====", path, "page", page)
    for s in spans(path, page):
        print(f"  x0={s[0]:7.1f} y0={s[1]:7.1f} x1={s[2]:7.1f} sz={s[4]:5.1f} {s[5][:22]:24s} {s[6][:70]!r}")

if __name__ == "__main__":
    for a in sys.argv[1:]:
        if "::" in a:
            f, pg = a.split("::"); show(f, int(pg))
        else:
            show(a)
