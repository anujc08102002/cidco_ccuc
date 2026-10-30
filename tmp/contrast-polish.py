from pathlib import Path
p=Path('src/experience.css');s=p.read_text(encoding='utf-8').replace('--muted:#85889b','--muted:#6d7185');p.write_text(s,encoding='utf-8')
p=Path('src/features/auth/SignIn.css');s=p.read_text(encoding='utf-8');s=s.replace('#85869a','#6d7185').replace('#7c7e92','#6d7185').replace('#8a8ba1','#74768c').replace('#9293a6','#6d7185');p.write_text(s,encoding='utf-8')
