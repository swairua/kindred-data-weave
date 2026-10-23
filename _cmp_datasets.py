"""Compare live wayrusc1_labdatacraft test_results against kindred_d10_check.

Read-only. Emits:
  - per-project newest live row vs d10 sample rows
  - whether the d10 sample_key set equals the record ids in the live payload
  - aggregate agreement (status / data_points / key_results_json)
"""
import subprocess, json, sys

MYSQL = r'c:\xampp\mysql\bin\mysql.exe'
LIVE = 'wayrusc1_labdatacraft'
REF = 'kindred_d10_check'


def q(sql):
    p = subprocess.run([MYSQL, '-u', 'root', '-P', '3308',
                        '--default-character-set=utf8mb4', '-N', '-B', '-e', sql],
                       capture_output=True)
    if p.returncode != 0:
        print('SQLERR', p.stderr.decode('utf-8', 'replace')[:800], file=sys.stderr)
    return p.stdout.decode('utf-8', 'replace')


def rows(sql):
    out = []
    for line in q(sql).split('\n'):
        if line.strip():
            out.append(line.split('\t'))
    return out


def live_rows():
    sql = ("SELECT id, project_id, status, data_points, key_results_json, payload_json "
           "FROM `%s`.test_results WHERE test_key='atterberg' "
           "ORDER BY project_id, updated_at, id;" % LIVE)
    return rows(sql)


def d10_rows():
    sql = ("SELECT id, project_id, sample_key, sample_label, sample_depth, sort_order, "
           "status, data_points, key_results_json, payload_json "
           "FROM `%s`.test_results WHERE test_key='atterberg' "
           "ORDER BY project_id, sort_order, id;" % REF)
    return rows(sql)


def records(payload):
    try:
        data = json.loads(payload)
    except Exception as exc:
        return None, 'parse: %s' % exc
    proj = data.get('project') or {}
    recs = proj.get('records') or []
    ids = [r.get('id') for r in recs]
    labels = [(r.get('label'), r.get('sampleNumber')) for r in recs]
    return (ids, labels), None


def main():
    lv = live_rows()
    d10 = d10_rows()

    # newest live row per project
    newest = {}
    for r in lv:
        pid = int(r[1])
        if pid not in newest:
            newest[pid] = r
    newest_ids = {int(r[0]) for r in newest.values()}

    by_project_d10 = {}
    for r in d10:
        by_project_d10.setdefault(int(r[1]), []).append(r)

    print('live atterberg rows        : %d' % len(lv))
    print('live distinct projects     : %d' % len(newest))
    print('d10 atterberg rows          : %d' % len(d10))
    print('d10 distinct projects       : %d' % len(by_project_d10))
    print()

    total_match = 0
    total_mismatch = 0
    for pid in sorted(set(newest) | set(by_project_d10)):
        live = newest.get(pid)
        drows = by_project_d10.get(pid, [])
        lrec, lerr = records(live[5]) if live else (None, 'no live row')
        if lerr:
            print('project %-3d LIVE PARSE FAIL %s' % (pid, lerr))
            continue
        l_ids, l_labels = lrec
        d_keys = [r[2] for r in drows]
        d_labels = [(r[3], r[4]) for r in drows]
        ids_match = set(l_ids) == set(d_keys)
        labels_match = set(l_labels) == set(d_labels)
        if ids_match and labels_match:
            verdict = 'IDENTICAL'
            total_match += 1
        else:
            verdict = 'DIFFERENT'
            total_mismatch += 1
        print('project %-3d live_records=%-3d d10_rows=%-3d %s' %
              (pid, len(l_ids), len(drows), verdict))
        if not ids_match:
            print('    live-only ids: %s' % sorted(set(l_ids) - set(d_keys))[:6])
            print('    d10-only  ids: %s' % sorted(set(d_keys) - set(l_ids))[:6])
        if not labels_match:
            print('    live-only labels: %s' % sorted(set(l_labels) - set(d_labels))[:6])
            print('    d10-only  labels: %s' % sorted(set(d_labels) - set(l_labels))[:6])
        # aggregates
        if live and drows:
            l_status = live[2]
            d_statuses = {r[6] for r in drows}
            l_dp = live[3]
            d_dp = {r[7] for r in drows}
            l_kr = live[4]
            d_kr = {r[8] for r in drows}
            if l_status not in d_statuses or l_dp not in d_dp or l_kr not in d_kr:
                print('    AGG DIFF status live=%s d10=%s | dp live=%s d10=%s | kr live=%.60s d10=%.60s'
                      % (l_status, d_statuses, l_dp, d_dp, l_kr, list(d_kr)[0][:60]))
    print()
    print('projects identical: %d   different: %d' % (total_match, total_mismatch))

    # which live rows are NOT the newest per project (i.e. superseded)
    superseded = [r for r in lv if int(r[0]) not in newest_ids]
    print('superseded live rows: %d' % len(superseded))
    print('  their ids: %s' % sorted(int(r[0]) for r in superseded))

    # do d10 sample rows carry the SAME payload as their live source?
    print()
    print('--- payload identity check (d10 row payload vs live newest payload) ---')
    for pid in sorted(by_project_d10):
        live = newest.get(pid)
        if not live:
            continue
        lrec, _ = records(live[5])
        l_ids = lrec[0]
        bad = 0
        for r in by_project_d10[pid]:
            drec, err = records(r[9])
            if err:
                bad += 1
                continue
            d_ids = drec[0]
            # d10 row should hold exactly one record, whose id == sample_key
            if len(d_ids) != 1 or d_ids[0] != r[2]:
                bad += 1
        if bad:
            print('project %-3d rows whose payload != single record matching sample_key: %d/%d'
                  % (pid, bad, len(by_project_d10[pid])))


main()
