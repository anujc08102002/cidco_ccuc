from pathlib import Path
p=Path('src/experience.css');s=p.read_text(encoding='utf-8');replacements={'#615bd3':'#025299','#504bb9':'#004770','#eeecfb':'#e2edf7','#f7f8fc':'#edf3f9','#f5f5fa':'#eaf1f7','#8881df':'#2872b1','#ada4ff':'#8fc5ef','#c1baff':'#b3d8f4','#35314e':'#163c5a','#1b1c2b':'#102536','#222335':'#173348','#292a3e':'#1b3a51','#34354c':'#2b4a60'}
for old,new in replacements.items():s=s.replace(old,new)
p.write_text(s,encoding='utf-8')
p=Path('src/features/auth/SignIn.css');s=p.read_text(encoding='utf-8');replacements={'#615bd3':'#025299','#514bc1':'#004770','#b4b1d9':'#87a9c6','#8881df':'#2872b1','#8881de':'#2872b1','#eeecfb':'#e2edf7','#f7f8fc':'#edf3f9','#23243c':'#063a63','#bdb6ff':'#bddff9','#b8b0ff':'#a9d7fa','#8e86ef':'#4995cf','#c4c0ed':'#bfd9ed','#a9a8c1':'#b4d0e4','#c3c3d3':'#c7deee','#b9b9cd':'#bfd5e5','#e6e5ef':'#e2eef7','#89859f':'#a9c9df','#74768c':'#657b8e','#6d68ad':'#025299','#c4c0ed':'#c4deef'}
for old,new in replacements.items():s=s.replace(old,new)
s+='\n/* Larger department mark, retained in the reversible login snapshot. */\n.ef-auth-header{min-height:110px;padding-top:10px;padding-bottom:10px}.ef-auth-logo{width:120px;height:86px}.ef-auth-story{background:#063a63}.ef-auth-input:focus-within{border-color:#4385bc;box-shadow:0 0 0 4px #0252990c}@media(max-width:760px){.ef-auth-header{min-height:90px}.ef-auth-logo{width:88px;height:68px}}\n';p.write_text(s,encoding='utf-8')
p=Path('src/main.tsx');s=p.read_text(encoding='utf-8');s+='\nimport "./features/account/account.css";\n';p.write_text(s,encoding='utf-8')
