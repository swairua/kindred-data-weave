import subprocess
tables=["admin_images","admin_images_audit","atterberg_instances","atterberg_rows","atterberg_save_audit","company_info","compressive_cubes","compressive_tests","projects","sessions","test_definitions","test_results","users","user_allowed_tables"]
for t in tables:
    out=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",
      f"SELECT (SELECT COUNT(*) FROM wayrusc1_labdatacraft.{t}),(SELECT COUNT(*) FROM kindred_d10_check.{t});"],capture_output=True,text=True,encoding="utf-8",errors="replace")
    print(f"{t:28s}", out.stdout.splitlines()[1] if len(out.stdout.splitlines())>1 else out.stderr.strip())
