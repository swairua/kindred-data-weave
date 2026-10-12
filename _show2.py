import sys
# usage: _show2.py <path> <start> <end> <outfile>
path, start, end, out = sys.argv[1], int(sys.argv[2]) - 1, int(sys.argv[3]), sys.argv[4]
L = open(path, encoding="utf-8").read().splitlines()
txt = "\n".join(f"{i+1}: {L[i]}" for i in range(start, min(end, len(L))))
open(out, "w", encoding="utf-8").write(txt)
print("wrote", out, start + 1, "to", min(end, len(L)))
