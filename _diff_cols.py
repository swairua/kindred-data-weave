import csv,collections
def load(p):
    d=collections.defaultdict(dict)
    with open(p,encoding="utf-16") as f:
        r=csv.reader(f,delimiter="\t"); next(r)
        for row in r:
            if not row: continue
            d[row[0]][row[1]]=tuple(row[2:])
    return d
L=load("_live_cols_all.tsv"); C=load("_canon_cols_all.tsv")
print("TABLES live-only:",sorted(set(L)-set(C)))
print("TABLES canon-only:",sorted(set(C)-set(L)))
for t in sorted(set(L)&set(C)):
    lonly=set(L[t])-set(C[t]); conly=set(C[t])-set(L[t])
    diffs=[c for c in set(L[t])&set(C[t]) if L[t][c]!=C[t][c]]
    if lonly or conly or diffs:
        print("== "+t)
        for c in sorted(lonly): print("   live-only col:",c,L[t][c])
        for c in sorted(conly): print("   canon-only col:",c,C[t][c])
        for c in sorted(diffs): print("   differs:",c,"live=",L[t][c],"canon=",C[t][c])
