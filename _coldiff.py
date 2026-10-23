import subprocess
def q(sql):
    o=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True,text=True,encoding="utf-8",errors="replace")
    if o.returncode!=0: raise SystemExit(o.stderr)
    lines=o.stdout.splitlines()
    body=lines[1:] if lines else []
    return [ (l.split("\t") if l!="" else [""]) for l in body ]
cols=["id","user_id","project_id","test_key","sample_key","sample_label","sample_depth","name","category","status","data_points","sort_order","key_results_json","payload_json","created_at","updated_at","last_saved_at"]
for c in cols:
    a=q(f"SELECT COALESCE(CAST(`{c}` AS CHAR),'<NULL>') FROM kindred_mig_test.test_results WHERE id=406")[0][0]
    b=q(f"SELECT COALESCE(CAST(`{c}` AS CHAR),'<NULL>') FROM kindred_d10_check.test_results WHERE id=406")[0][0]
    if a!=b:
        print("DIFFERS:",c)
        print("  candidate:",repr(a[:400]))
        print("  reference:",repr(b[:400]))
    else:
        print("same:",c,"len",len(a))
