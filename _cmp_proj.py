import collections,subprocess,json
def q(sql):
    out=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True,text=True,encoding="utf-8",errors="replace")
    rows=[l.split("\t") for l in out.stdout.splitlines()]
    return rows[1:] if rows else []
L=q("SELECT id,project_id,test_key,data_points,key_results_json,created_at,updated_at FROM wayrusc1_labdatacraft.test_results ORDER BY created_at")
C=q("SELECT id,project_id,test_key,data_points,key_results_json,created_at,updated_at FROM kindred_d10_check.test_results ORDER BY created_at")
# latest live per (proj,test_key)
latest={}
for l in L:
    k=(l[1],l[2])
    if k not in latest or l[6]>=latest[k][6]: latest[k]=l
cgroup=collections.defaultdict(list)
for c in C: cgroup[(c[1],c[2])].append(c)
print("projects with live data:",len(latest),"canonical groups:",len(cgroup))
print("\n== per-project: latest live vs canonical group (key_results equality)")
for k in sorted(latest, key=lambda x:(int(x[0]),x[1])):
    l=latest[k]; g=cgroup.get(k)
    if not g:
        print("  proj",k[0],k[1],"-> NO CANONICAL ROWS  (live id",l[0],"dp",l[3],"created",l[5],")")
        continue
    match=[c for c in g if c[4]==l[4]]
    tag = "EQUAL" if match else "DIFFERENT"
    newest_c=max(g,key=lambda c:c[6])
    print("  proj",k[0],k[1],"live(id",l[0],"created",l[5],"upd",l[6],"dp",l[3],") vs canon n=",len(g),"->",tag,"| canon newest created",newest_c[5],"upd",newest_c[6],"dp",newest_c[3])
    if not match:
        print("     live kr :",l[4][:150])
        print("     canon kr:",newest_c[4][:150])
