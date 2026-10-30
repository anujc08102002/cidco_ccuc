from pathlib import Path
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8');needle=" else if(view==='register'||view==='archived'"
replacement=""" else if(view==='detail'&&!selected&&!casesLoading&&!caseError&&readRoute().key)content=<div className="portal-message is-warning" role="status"><div><b>This case is unavailable</b><p>It may have been removed, archived or assigned outside your access. Return to the register to find an accessible case.</p></div><button className="action-primary" onClick={()=>navigate('register')}>Open case register</button></div>;
 else if(view==='register'||view==='archived'"""
s=s.replace(needle,replacement);p.write_text(s,encoding='utf-8')
p=Path('src/components/AppShell.tsx');s=p.read_text(encoding='utf-8');s=s.replace("const navigate=(view:View)=>{props.onNavigate(view);", "const navigate=(view:View)=>{setHelp(false);props.onNavigate(view);")
p.write_text(s,encoding='utf-8')
