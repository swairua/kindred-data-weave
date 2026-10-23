import subprocess
def q(sql):
    o=subprocess.run([r"C:\xampp\mysql\bin\mysql.exe","-u","root","--protocol=TCP","-P","3308","--batch","--raw","-e",sql],capture_output=True,text=True,encoding="utf-8",errors="replace")
    return o.stdout
print("projects live-only ids:"); print(q("SELECT p.id,p.name FROM wayrusc1_labdatacraft.projects p LEFT JOIN kindred_d10_check.projects c ON c.id=p.id WHERE c.id IS NULL;"))
print("projects canon-only ids:"); print(q("SELECT c.id,c.name FROM kindred_d10_check.projects c LEFT JOIN wayrusc1_labdatacraft.projects p ON p.id=c.id WHERE p.id IS NULL;"))
print("test_definitions live-only:"); print(q("SELECT t.id,t.test_key FROM wayrusc1_labdatacraft.test_definitions t LEFT JOIN kindred_d10_check.test_definitions c ON c.test_key=t.test_key WHERE c.test_key IS NULL;"))
print("compressive_tests live:"); print(q("SELECT id,project_id FROM wayrusc1_labdatacraft.compressive_tests;")); print("canon:"); print(q("SELECT id,project_id FROM kindred_d10_check.compressive_tests;"))
print("compressive_cubes live:"); print(q("SELECT id,compressive_test_id FROM wayrusc1_labdatacraft.compressive_cubes;")); print("canon:"); print(q("SELECT id,compressive_test_id FROM kindred_d10_check.compressive_cubes;"))
print("audit live-only ids:"); print(q("SELECT a.id FROM wayrusc1_labdatacraft.atterberg_save_audit a LEFT JOIN kindred_d10_check.atterberg_save_audit c ON c.id=a.id WHERE c.id IS NULL;"))
print("admin_images live:"); print(q("SELECT id,file_path FROM wayrusc1_labdatacraft.admin_images;")); print("canon:"); print(q("SELECT id,file_path FROM kindred_d10_check.admin_images;"))
