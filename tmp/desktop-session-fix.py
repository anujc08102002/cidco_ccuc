from pathlib import Path
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8')
s=s.replace(' useDesktopNotifications(authenticated?', " const sessionIdentity=useRef<string|undefined>(undefined);sessionIdentity.current=authenticated?accounts[role].id:undefined;\n useDesktopNotifications(authenticated?",1)
s=s.replace('const expired=()=>{void disconnectDesktop();', 'const expired=()=>{if(sessionIdentity.current)void disconnectDesktop(sessionIdentity.current);',1)
p.write_text(s,encoding='utf-8')
