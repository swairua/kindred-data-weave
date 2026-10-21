import pymupdf

def spans(path):
    d = pymupdf.open(path)
    p = d[0]
    out = []
    for b in p.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].strip()
                if t:
                    out.append((t, round(s["bbox"][0],1), round(s["bbox"][1],1),
                                round(s["bbox"][2],1), round(s["bbox"][3],1), round(s["size"],1)))
    return out

def diff(a, b, label):
    A = spans(a); B = spans(b)
    rem = list(B); res = []
    for t, x0, y0, x1, y1, sz in A:
        best = None
        for i in range(len(rem)):
            if rem[i][0] == t:
                best = i; break
        if best is None:
            continue
        t2, x02, y02, x12, y12, sz2 = rem.pop(best)
        res.append((t, x0, y0, x02, y02, x02 - x0, y02 - y0, sz, sz2))
    print("==", label, "matched", len(res), "of ref", len(A))
    bad = [r for r in res if abs(r[5]) > 0.6 or abs(r[6]) > 0.6]
    for r in bad:
        print("  %-30s dx=%+7.1f dy=%+7.1f sz %.0f->%.0f" % (r[0], r[5], r[6], r[7], r[8]))
    print("  only in fresh:", [r[0] for r in rem][:40])

diff("Additional docs/PSD (5).pdf", "_fresh_psd_now.pdf", "PSD")
