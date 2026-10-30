from pathlib import Path
import re
p=Path('src/experience.css');s=p.read_text(encoding='utf-8');sizes={7:9,8:9,9:10,10:11,11:12,12:13,13:14};s=re.sub(r'font-size:(7|8|9|10|11|12|13)px',lambda m:'font-size:'+str(sizes[int(m.group(1))])+'px',s);p.write_text(s,encoding='utf-8')
p=Path('src/features/auth/SignIn.css');s=p.read_text(encoding='utf-8').replace("linear-gradient(180deg,#23243c 5%,#23243cbb 45%,#23243c99 100%),url('../../assets/cidco_background.jpg') center bottom/auto 60%", "linear-gradient(180deg,#23243c 0%,#23243cf5 27%,#23243c88 70%,#23243cbb 100%),url('../../assets/cidco_background.jpg') center bottom/auto 100%")
s=s.replace('.ef-auth-story h2 br:first-child{display:none}', '.ef-auth-story h2 br:first-child{display:block}')
p.write_text(s,encoding='utf-8')
