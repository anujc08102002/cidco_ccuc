from pathlib import Path
p=Path('src/features/account/DesktopNotifications.tsx');s=p.read_text(encoding='utf-8')
a=s.index(' const sound=async(value:boolean)=>')
b=s.index('\n return <div',a)
s=s[:a]+''' const sound=async(value:boolean)=>{
  if(!saved)return;const previous=saved,next={...saved,sound:value},authToken=sessionStorage.getItem('enforceflow-session-token');
  const current=()=>active.current&&device()?.binding===previous.binding&&sessionStorage.getItem('enforceflow-session-token')===authToken;
  setSaved(next);setBusy(true);setError('');
  try{void unlockAudio().catch(()=>{});await request('/me/push/subscription',{method:'PUT',body:JSON.stringify({subscription:next.subscription,binding:next.binding,sound:next.sound})});if(!current())return;await message(await worker(),{type:'sound',binding:next.binding,sound:value});if(current())localStorage.setItem(storageKey,JSON.stringify(next));}
  catch(error){if(active.current){setSaved(previous);setError((error as Error).message);}}finally{if(active.current)setBusy(false);}
 };
''' +s[b:]
p.write_text(s,encoding='utf-8')
