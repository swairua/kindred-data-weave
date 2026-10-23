import re, sys

paths = {
    'main': r'C:\xampp\htdocs\kindred\database\main.sql',
    'd10': r'C:\xampp\htdocs\kindred\database\wayrusc1_labdatacraft (10).sql',
}
out = []
for label, p in paths.items():
    d = open(p, encoding='utf-8', errors='replace').read()
    i = d.find('CREATE TABLE `test_results`')
    if i < 0:
        out.append(label + ': NOT FOUND')
        continue
    j = d.find(';', i)
    out.append('===== %s =====' % label)
    out.append(d[i:j+1])

open(r'C:\xampp\htdocs\kindred\_tr_dump.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len('\n'.join(out)))
