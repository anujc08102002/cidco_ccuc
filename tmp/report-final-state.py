from pathlib import Path
p=Path('server/enforcement-workflow.js');s=p.read_text(encoding='utf-8')
s=s.replace(".input('bytes',sql.VarBinary(sql.MAX),report.bytes).input('actor'", ".input('bytes',sql.VarBinary(sql.MAX),report.bytes).input('state',sql.NVarChar,snapshot.case.status==='Closed'?'FinalReport':'InterimReport').input('actor'")
s=s.replace('FileContent,CreatedByUserId) VALUES(@id,@case,\'CaseReport\',@ref,@name,\'application/pdf\',@bytes,@actor)', 'FileContent,ApprovalState,CreatedByUserId) VALUES(@id,@case,\'CaseReport\',@ref,@name,\'application/pdf\',@bytes,@state,@actor)')
s=s.replace("DocumentType='CaseReport' ORDER BY", "DocumentType='CaseReport' AND ApprovalState='FinalReport' ORDER BY")
p.write_text(s,encoding='utf-8')
