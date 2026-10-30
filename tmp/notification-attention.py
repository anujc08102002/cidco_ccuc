from pathlib import Path
p=Path('server/index.js');s=p.read_text(encoding='utf-8').replace('registerRecoveryRoutes(app,{getPool,publishChange});','registerRecoveryRoutes(app,{getPool,publishChange,holdSql:propertyHoldSql()});');p.write_text(s,encoding='utf-8')
p=Path('src/components/AppShell.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("(props.attentionKeys===undefined||props.attentionKeys.includes(c.caseKey??c.id))&&!c.archived&&c.status!=='Closed'&&(c.legal||(c.overdueDays??0)>0)","!c.archived&&c.status!=='Closed'&&(props.attentionKeys===undefined?(c.legal||(c.overdueDays??0)>0):props.attentionKeys.includes(c.caseKey??c.id))")
s=s.replace("c.legal?'Legal restriction requires review':`${c.overdueDays} days overdue", "c.legal?'Legal restriction requires review':(c.overdueDays??0)>0?`${c.overdueDays} days overdue")
s=s.replace("${c.property}`}</small></span><ArrowRight size={14}/></button>):!props.continuityCount", "${c.property}`:`${c.status==='Awaiting approval'?'Approval or verification required':'Action required'} - ${c.property}`}</small></span><ArrowRight size={14}/></button>):!props.continuityCount")
p.write_text(s,encoding='utf-8')
