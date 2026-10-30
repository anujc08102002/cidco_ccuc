from pathlib import Path
for f in ['src/App.tsx','src/components/AppShell.tsx','src/features/workspaces/WorkspacePage.tsx','src/features/workspaces/WorkspaceEditButton.tsx','src/features/auth/SignIn.tsx','src/experience.css','server/password-recovery.js','shared/password-mail.js']:
 s=Path(f).read_text(encoding='utf-8')
 for i,line in enumerate(s.splitlines(),1):
  if '\ufffd' in line or '\u00c2\u00b7' in line: print(f,i,repr(line[max(0,line.find('\ufffd')-30):line.find('\ufffd')+30]))
