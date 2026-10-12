import fitz, io, sys

path = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(path)
p = d[0]
words = p.get_text("words")  # x0,y0,x1,y1,word,block,line,wordno

# group words into lines by rounding y0
from collections import defaultdict
lines = defaultdict(list)
for w in words:
    x0,y0,x1,y1,txt = w[0],w[1],w[2],w[3],w[4]
    lines[round(y0,0)].append((x0,txt))

out = []
for y in sorted(lines):
    row = sorted(lines[y])
    line = " ".join(t for _,t in row)
    xs = " ".join(f"{int(x)}" for x,_ in row)
    out.append(f"y={int(y)} | {line}   [x: {xs}]")

io.open("C:/Users/USER/AppData/Local/Temp/cs_desired_lines.txt","w",encoding="utf-8").write("\n".join(out))
print("wrote", len(out), "lines")
