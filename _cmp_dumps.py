import sys, subprocess
sys.path.insert(0, r'C:\xampp\htdocs\kindred')
from _dumpparse import table_rows, unquote

MYSQL = r'c:\xampp\mysql\bin\mysql.exe'
MAIN = r'C:\xampp\htdocs\kindred\database\main.sql'
D10 = r'C:\xampp\htdocs\kindred\database\wayrusc1_labdatacraft (10).sql'
BCK = r'C:\xampp\htdocs\kindred\backup_labdatacraft_20261020.sql'
DB_COLS = ['id', 'project_id', 'test_key', 'status', 'data_points',
           'key_results_json', 'payload_json', 'sample_key', 'sample_label',
           'sample_depth', 'sort_order']


def q(sql):
    p = subprocess.run([MYSQL, '-u', 'root', '-P', '3308',
                        '--default-character-set=utf8mb4', '-N', '-B', '-e', sql],
                       capture_output=True)
    if p.returncode != 0:
        print('SQLERR', p.stderr.decode('utf-8', 'replace')[:600])
    out = []
    for line in p.stdout.decode('utf-8', 'replace').split('\n'):
        if line.strip():
            out.append(line.split('\t'))
    return out


def db_rows(db, cols):
    sel = ', '.join('`%s`' % c for c in cols)
    res = {}
    for f in q("SELECT %s FROM `%s`.test_results ORDER BY id;" % (sel, db)):
        res[int(f[0])] = dict(zip(cols, f))
    return res


def compare(dump_rows, dbmap, label):
    print('=== %s ===' % label)
    print('dump ids=%d db ids=%d' % (len(dump_rows), len(dbmap)))
    dump_ids = {int(unquote(r['id'])) for r in dump_rows}
    db_ids = set(dbmap)
    print('dump-not-in-db: %s' % sorted(dump_ids - db_ids)[:12])
    print('db-not-in-dump: %s' % sorted(db_ids - dump_ids)[:12])
    mism = 0
    checked = 0
    cols = [c for c in DB_COLS if c in dump_rows[0]]
    for r in dump_rows:
        rid = int(unquote(r['id']))
        if rid not in dbmap:
            continue
        checked += 1
        d = dbmap[rid]
        for c in cols:
            a = unquote(r[c])
            b = d.get(c)
            if c in ('data_points', 'sort_order'):
                a = str(a) if a is not None else None
                b = str(b) if b is not None else None
            if (a or '') != (b or ''):
                mism += 1
                if mism <= 6:
                    print('  MISMATCH id=%d %s\n    dump=%r\n    db  =%r' % (rid, c, a, b))
    print('compared=%d mismatches=%d' % (checked, mism))
    print()
    return mism


def main():
    for label, path in [('main', MAIN), ('d10', D10), ('bck', BCK)]:
        rows = table_rows(path, 'test_results')
        cols = list(rows[0].keys()) if rows and isinstance(rows[0], dict) else []
        print('%-5s rows=%-4d cols=%s' % (label, len(rows), cols))

    print()
    d10rows = table_rows(D10, 'test_results')
    compare(d10rows, db_rows('kindred_d10_check', DB_COLS),
            'd10 dump (17 cols) vs kindred_d10_check DB')

    bckrows = table_rows(BCK, 'test_results')
    compare(bckrows, db_rows('wayrusc1_labdatacraft',
                              [c for c in DB_COLS if c in bckrows[0]]),
            'bck dump vs live DB')

    mainrows = table_rows(MAIN, 'test_results')
    compare(mainrows, db_rows('wayrusc1_labdatacraft',
                              [c for c in DB_COLS if c in mainrows[0]]),
            'main.sql dump vs live DB')


main()
