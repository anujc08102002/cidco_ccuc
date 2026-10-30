from pathlib import Path
files=['src/App.tsx','src/components/AppShell.tsx','src/features/workspaces/WorkspacePage.tsx','src/features/workspaces/WorkspaceEditButton.tsx','src/features/auth/SignIn.tsx','src/experience.css','src/services/enforcementApi.ts','server/index.js','server/enforcement-workflow.js','server/verify-experience.mjs','.gitignore','package.json']
for f in files:
 p=Path(f);s=p.read_bytes().decode('utf-8',errors='surrogateescape');bad=[c for c in s if 0xdc80<=ord(c)<=0xdcff]
 if bad:
  s=''.join(bytes([ord(c)-0xdc00]).decode('cp1252') if 0xdc80<=ord(c)<=0xdcff else c for c in s);p.write_text(s,encoding='utf-8');print(f,'UTF-8 normalized:',len(bad))
