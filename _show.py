import sys
path = sys.argv[1]
start = int(sys.argv[2]) - 1
end = int(sys.argv[3])
L = open(path, encoding="utf-8").read().splitlines()
out = "\n".join(f"{i+1}: {L[i]}" for i in range(start, min(end, len(L))))
open(r"C:\Users\USER\AppData\Local\Temp\_show_out.txt", "w", encoding="utf-8").write(out)
print("lines", start + 1, "to", min(end, len(L)))
