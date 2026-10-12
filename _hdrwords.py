import fitz, io

path = r"Additional docs/Correct design compressive strength.pdf"
d = fitz.open(path)
p = d[0]
words = p.get_text("words")
rows = [w for w in words if 283 <= w[1] <= 322]
rows.sort(key=lambda w:(round(w[1]), w[0]))
out=[]
for w in rows:
    out.append(f"y0={w[1]:.1f} x0={w[0]:.1f} x1={w[2]:.1f}  '{w[4]}'")
io.open("C:/Users/USER/AppData/Local/Temp/cs_hdr_words.txt","w",encoding="utf-8").write("\n".join(out))
print("done", len(out))
