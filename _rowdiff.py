import subprocess
def q(sql):
    o=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True,text=True,encoding="utf-8",errors="replace")
    if o.returncode!=0: raise SystemExit(o.stderr)
    lines=[l for l in o.stdout.splitlines() if l]
    return [l.split("\t") for l in lines[1:]]
cols=["id","user_id","project_id","test_key","sample_key","sample_label","sample_depth","name","category","status","data_points","sort_order","key_results_json","payload_json","created_at","updated_at","last_saved_at"]
flat=", ".join(f"COALESCE(CAST(`{c}` AS CHAR),'<N>')" for c in cols)
a=q(f"SELECT id, MD5(CONCAT_WS(CHAR(1),{flat})) h FROM kindred_mig_test.test_results ORDER BY id")
b={r[0]:r[1] for r in q(f"SELECT id, MD5(CONCAT_WS(CHAR(1),{flat})) h FROM kindred_d10_check.test_results ORDER BY id")}
diff=[r for r in a if b.get(r[0])!=r[1]]
print("differing ids:",[r[0] for r in diff][:20], "count",len(diff))
missing=set(b)-{r[0] for r in a}
print("missing in candidate:",sorted(missing)[:20], len(missing))
