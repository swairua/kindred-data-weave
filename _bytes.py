import subprocess,sys
def q(sql):
    o=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True)
    return o.stdout
for db in ["kindred_mig_test","kindred_d10_check"]:
    raw=q(f"SELECT key_results_json FROM {db}.test_results WHERE id=406").split(b"\r\n")[1]
    print(db,"len",len(raw))
    print("  hex:",raw.hex())
    print("  repr:",repr(raw))
