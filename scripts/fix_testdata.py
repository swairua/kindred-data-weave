import sys
with open(r"C:\xampp\htdocs\kindred\src\context\TestDataContext.tsx", "r", encoding="utf8") as f:
    content = f.read()

old = '  cbr: { id: "cbr", name: "CBR", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },'

new = '  cbr: { id: "cbr", name: "CBR", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },\n  schmidt_rock: { id: "schmidt_rock", name: "Schmidt Hammer Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },\n  ndt: { id: "ndt", name: "NDT (Rebound Hammer)", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },'

if old in content:
    content = content.replace(old, new)
    with open(r"C:\xampp\htdocs\kindred\src\context\TestDataContext.tsx", "w", encoding="utf8") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("PATTERN NOT FOUND")
    # Show what cbr line looks like
    import re
    m = re.search(r'cbr.*?\]\},', content)
    if m:
        print("Found cbr:", m.group())