import csv,collections,json,subprocess
def q(sql,db="wayrusc1_labdatacraft"):
    out=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True,text=True,encoding="utf-8",errors="replace")
    rows=[l.split("\t") for l in out.stdout.splitlines()]
    return rows[1:] if rows else []
live=q("SELECT id,project_id,test_key,data_points,key_results_json,CHAR_LENGTH(payload_json),created_at,updated_at FROM wayrusc1_labdatacraft.test_results ORDER BY id")
canon=q("SELECT id,project_id,test_key,data_points,key_results_json,CHAR_LENGTH(payload_json),created_at,updated_at FROM kindred_d10_check.test_results ORDER BY id")
print("live rows",len(live),"canon rows",len(canon))
# group canon by (project,test_key,created_at)
g=collections.defaultdict(list)
for c in canon: g[(c[1],c[2],c[6])].append(c)
unmatched=[]
for l in live:
    k=(l[1],l[2],l[6])
    if k not in g: unmatched.append(l)
print("\nLIVE rows with NO canonical group (same project+test_key+created_at):",len(unmatched))
for l in unmatched: print("  id",l[0],"proj",l[1],"dp",l[3],"plen",l[5],"created",l[6],"updated",l[7])
# compare key_results_json equality within group
mismatch=[]
for l in live:
    k=(l[1],l[2],l[6])
    grp=g.get(k)
    if not grp: continue
    if all(c[4]!=l[4] for c in grp):
        mismatch.append((l,grp))
print("\nlive rows whose key_results_json differs from ALL canonical rows in group:",len(mismatch))
for l,grp in mismatch[:10]:
    print("  live id",l[0],"proj",l[1],"dp",l[3],"plen",l[5]); print("    live kr:",l[4][:120]); print("    canon kr:",grp[0][4][:120])
# data_points consistency
dp=[(l,g[(l[1],l[2],l[6])]) for l in live if (l[1],l[2],l[6]) in g and l[3]!=g[(l[1],l[2],l[6])][0][3]]
print("\nrows where data_points differs from canonical group head:",len(dp))
for l,grp in dp[:15]: print("  live id",l[0],"proj",l[1],"live dp",l[3],"canon dp",grp[0][3],"group size",len(grp))
