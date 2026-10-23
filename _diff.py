import sys, pymupdf

def lines(path, page=0):
    d = pymupdf.open(path); p = d[page]
    out = []
    for dr in p.get_drawings():
        r = dr["rect"]
        if r.height < 2 and r.width >= 3:
            out.append(("H", round(r.y0,1), round(r.x0,1), round(r.x1,1)))
        elif r.width < 2 and r.height >= 3:
            out.append(("V", round(r.x0,1), round(r.y0,1), round(r.y1,1)))
    return out

def diff(a, b, tol=1.0):
    A = lines(a); B = lines(b)
    sb = set(B)
    print(f"--- in {a} but not in {b} (tol {tol}) ---")
    for it in A:
        if it not in sb:
            near = [o for o in B if o[0]==it[0] and abs(o[1]-it[1])<=tol and abs(o[2]-it[2])<=tol]
            print("  ", it, " near:", near[:2])
    print(f"--- in {b} but not in {a} ---")
    sa = set(A)
    for it in B:
        if it not in sa:
            near = [o for o in A if o[0]==it[0] and abs(o[1]-it[1])<=tol and abs(o[2]-it[2])<=tol]
            print("  ", it, " near:", near[:2])

if __name__ == "__main__":
    a = sys.argv[1]; b = sys.argv[2]
    pa = int(sys.argv[3]) if len(sys.argv)>3 else 0
    pb = int(sys.argv[4]) if len(sys.argv)>4 else 0
    print("A count", len(lines(a,pa)), "B count", len(lines(b,pb)))
    diff(a if pa==pb else a, b, 1.0)
