import sys, subprocess, re
sys.path.insert(0, r'C:\xampp\htdocs\kindred')
from _dumpparse import read_dump, extract_inserts, split_tuples, split_fields, unquote

MYSQL = r'c:\xampp\mysql\bin\mysql.exe'
D10 = r'C:\xampp\htdocs\kindred\database\wayrusc1_labdatacraft (10).sql'
BCK = r'C:\xampp\htdocs\kindred\backup_labdatacraft_20261020.sql'


def dump_tables(path):
    d = read_dump(path)
    tables = []
    for m in re.finditer(r"CREATE TABLE `([^`]+)`", d):
        tables.append(m.group(1))
    counts = {}
    for t in tables:
        try:
            n = 0
            for _cols, body in extract_inserts(d, t):
                n += len(split_tuples(body))
            counts[t] = n
        except Exception:
            counts[t] = -1
    return tables, counts


def q(sql):
    p = subprocess.run([MYSQL, '-u', 'root', '-P', '3308',
                        '--default-character-set=utf8mb4', '-N', '-B', '-e', sql],
                       capture_output=True)
    if p.returncode != 0:
        print('SQLERR', p.stderr.decode('utf-8', 'replace')[:400])
        return []
    return [l.split('\t') for l in p.stdout.decode('utf-8', 'replace').split('\n') if l.strip()]


def main():
    for label, path in [('d10', D10), ('bck', BCK)]:
        tables, counts = dump_tables(path)
        print('==== %s dump: %d tables ====' % (label, len(tables)))
        rows = []
        for t in tables:
            live_n = len(q("SELECT 1 FROM `wayrusc1_labdatacraft`.`%s` LIMIT 1;" % t))
            if not live_n:
                ln = 'MISSING'
            else:
                ln = len(q("SELECT 1 FROM `wayrusc1_labdatacraft`.`%s`;" % t))
            stmt_count = counts[t]
            rows.append((t, stmt_count, ln))
        for t, sc, ln in rows:
            flag = ''
            if sc != ln and not (sc == 0 and ln == 0):
                flag = '   <-- DIFF'
            print('  %-34s dump_stmts=%-4s live_rows=%-6s%s' % (t, sc, ln, flag))
        print()


main()
