import re
data=open(r"database/wayrusc1_labdatacraft (10) mariadb.sql","rb").read()
i=data.find(b"Standard MDD")
while i!=-1:
    seg=data[max(0,i-200):i+200]
    if b"1909 kg/m" in seg:
        print("offset",i)
        print(repr(seg))
        print()
    i=data.find(b"Standard MDD", i+1)
