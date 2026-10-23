import subprocess, hashlib

MYSQL = r'c:\xampp\mysql\bin\mysql.exe'
LIVE = 'wayrusc1_labdatacraft'

def q(sql):
    p = subprocess.run([MYSQL, '-u', 'root', '-P', '3308',
                        '--default-character-set=utf8mb4', '-N', '-B', '-e', sql],
                       capture_output=True)
    if p.returncode != 0:
        print('SQLERR', p.stderr.decode('utf-8', 'replace')[:600])
    return p.stdout.decode('utf-8', 'replace')

def tables(db):
    return [r.strip() for r in q("SELECT TABLE_NAME FROM information_schema.TABLES "
                                 "WHERE TABLE_SCHEMA='%s' ORDER BY TABLE_NAME;" % db).split('\n') if r.strip()]

def cols(db, t):
    sql = ("SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA "
           "FROM information_schema.COLUMNS "
           "WHERE TABLE_SCHEMA='%s' AND TABLE_NAME='%s' ORDER BY ORDINAL_POSITION;" % (db, t))
    out = []
    for r in q(sql).split('\n'):
        if not r.strip():
            continue
        parts = r.split('\t')
        while len(parts) < 5:
            parts.append('')
        out.append(tuple(parts[:5]))
    return out


def colnames(db, t):
    return [c[0] for c in cols(db, t)]


def typeinfo(db, t):
    return {c[0]: (c[1], c[2], c[3], c[4]) for c in cols(db, t)}

def rowset(db, table, collist):
    sel = ','.join('IFNULL(`%s`,"~N~")' % c for c in collist)
    out = q("SELECT %s FROM `%s`.`%s`;" % (sel, db, table))
    return [l for l in out.split('\n') if l.strip()]

def compare(db, label):
    print('########## COMPARE live vs %s (%s)' % (db, label))
    lt, rt = set(tables(LIVE)), set(tables(db))
    print('tables only in live:', sorted(lt - rt))
    print('tables only in %s  : %s' % (label, sorted(rt - lt)))
    for t in sorted(lt & rt):
        lc, rc = colnames(LIVE, t), colnames(db, t)
        if not rc:
            continue
        # column-level drift
        missing = [c for c in rc if c not in lc]   # in ref, absent from live
        extra = [c for c in lc if c not in rc]     # in live, absent from ref
        if missing or extra:
            print('  COLDIFF %-22s missing_in_live=%s  extra_in_live=%s' % (t, missing, extra))
        lti, rti = typeinfo(LIVE, t), typeinfo(db, t)
        tdiff = [(c, lti[c], rti[c]) for c in rc if c in lti and lti[c] != rti[c]]
        for c, l, r in tdiff:
            print('  TYPEDIFF %-22s %-20s live=%s %s=%s' % (t, c, l, label, r))
        common = [c for c in rc if c in lc]
        if not common:
            print('  %-22s no common columns' % t)
            continue
        a = rowset(LIVE, t, common)
        b = rowset(db, t, common)
        sa, sb = set(a), set(b)
        same = len(sa & sb)
        print('  %-22s live=%-4d %s=%-4d identical_rows=%-4d live_only=%-4d %s_only=%d'
              % (t, len(a), label, len(b), same, len(sa - sb), label, len(sb - sa)))
        if sa - sb and len(sa - sb) <= 12:
            for r in sorted(sa - sb):
                print('       live-only: %s' % r[:160])
        if sb - sa and len(sb - sa) <= 12:
            for r in sorted(sb - sa):
                print('       %-6s-only: %s' % (label, r[:160]))

for db, label in [('kindred_ref_check', 'REF'), ('kindred_snap_check', 'SNAP')]:
    compare(db, label)

