from pathlib import Path
p=Path('src/features/workspaces/WorkspacePage.tsx');s=p.read_text(encoding='utf-8')
s=s.replace('useEffect,useState,type FormEvent','useEffect,useRef,useState,type FormEvent',1)
s=s.replace(' const load=async()=>', ' const focusApplied=useRef<string|null>(null);\n const load=async()=>',1)
s=s.replace("useEffect(()=>{if(focusUserId){const user=users.find(u=>u.id===focusUserId);setQuery(user?.username??focusUserId);}},[focusUserId,users]);", "useEffect(()=>{if(focusUserId&&!loading&&focusApplied.current!==focusUserId){const user=users.find(u=>u.id===focusUserId);setQuery(user?.username??focusUserId);focusApplied.current=focusUserId;}},[focusUserId,users,loading]);")
p.write_text(s,encoding='utf-8')
p=Path('server/verify-experience.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("await page.screenshot({path:'output/ui/password-delivery.png',fullPage:true});", "await page.screenshot({path:'output/ui/password-delivery.png',fullPage:true});await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Password delivery fits mobile');await page.setViewportSize({width:1440,height:1000});",1)
p.write_text(s,encoding='utf-8')
