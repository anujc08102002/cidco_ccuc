from pathlib import Path
p=Path('server/enforcement-workflow.js');s=p.read_text(encoding='utf-8')
s=s.replace("import sql from 'mssql';", "import sql from 'mssql';\nimport {createSiteReport,reportFilename} from './site-report.js';")
start=s.index(" app.get('/api/workflow/cases/:key',wrap")
end=s.index(" app.post('/api/workflow/cases/:key/actions'",start)
block=s[start:end]
a=block.index('   const c=await loadCase');b=block.index('   return result;')
body=block[a:b].replace('req.params.key,req.user','key,user').replace('toUiCase(c,req.user)','toUiCase(c,user)')
body=body.replace('rowVersion:version(c),RecipientDefaults', 'rowVersion:version(c),closedAt:c.ClosedAt,RecipientDefaults')
body=body.replace('WHERE d.CaseId=@id`', "WHERE d.CaseId=@id AND d.DocumentType<>'CaseReport' ORDER BY d.CreatedAt,d.DocumentId`")
body=body.replace("['Hearings','LegalUpdates','DemolitionDrives','CaseReferences','CaseActions']", "['Surveys','Hearings','LegalUpdates','DemolitionDrives','CaseReferences','CaseActions','ChargeTransfers']")
body+="""   result.CaseActions=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT a.*,u.DisplayName AS PerformedByName FROM enforcement.CaseActions a LEFT JOIN enforcement.Users u ON a.PerformedByUserId=u.UserId WHERE a.CaseId=@id ORDER BY a.OccurredAt,a.ActionId')).recordset;
   result.ChargeTransfers=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT t.*,f.DisplayName AS FromName,u.DisplayName AS ToName FROM enforcement.ChargeTransfers t LEFT JOIN enforcement.Users f ON f.UserId=t.FromUserId LEFT JOIN enforcement.Users u ON u.UserId=t.ToUserId WHERE t.CaseId=@id ORDER BY t.StartsAt')).recordset;
"""
replacement=""" async function caseSnapshot(tx,key,user){
"""+body+"""   return result;
 }
 async function storeSiteReport(tx,c,user){
  const snapshot=await caseSnapshot(tx,c.CaseNumber,user);
  const files=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT DocumentId,DocumentType,FileName,MimeType,FileContent FROM enforcement.Documents WHERE CaseId=@id AND DocumentType<>'CaseReport' AND FileContent IS NOT NULL ORDER BY CreatedAt,DocumentId")).recordset;
  const report=await createSiteReport(snapshot,{actor:user.DisplayName,files});
  const id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(report.bytes).digest('hex');
  await request(tx).input('id',sql.UniqueIdentifier,id).input('case',sql.UniqueIdentifier,c.CaseId).input('ref',sql.NVarChar,report.reportId).input('name',sql.NVarChar,reportFilename(c.CaseNumber)).input('bytes',sql.VarBinary(sql.MAX),report.bytes).input('actor',sql.UniqueIdentifier,user.UserId).query("INSERT enforcement.Documents(DocumentId,CaseId,DocumentType,ReferenceNumber,FileName,MimeType,FileContent,CreatedByUserId) VALUES(@id,@case,'CaseReport',@ref,@name,'application/pdf',@bytes,@actor)");
  await audit(tx,user,c.CaseId,'SiteReportGenerated',{reportId:report.reportId,documentId:id,sha256:hash,caseVersion:snapshot.rowVersion,status:snapshot.case.status,pages:report.pageCount});
  return report.bytes;
 }
 app.get('/api/workflow/cases/:key',wrap(async(req,res)=>{
  const p=await getPool();res.json(await transaction(p,tx=>caseSnapshot(tx,req.params.key,req.user)));
 }));
 app.get('/api/workflow/cases/:key/report',wrap(async(req,res)=>{
  const p=await getPool();let filename;
  const bytes=await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);filename=reportFilename(c.CaseNumber);
   if(c.Status==='Closed'){
    const saved=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT TOP(1) FileContent FROM enforcement.Documents WHERE CaseId=@id AND DocumentType='CaseReport' ORDER BY CreatedAt DESC,DocumentId DESC")).recordset[0];
    if(saved)return saved.FileContent;
   }
   return storeSiteReport(tx,c,req.user);
  });
  res.set({'Content-Disposition':`inline; filename="${filename}"`,'Cache-Control':'no-store'}).type('application/pdf').send(bytes);
 }));
"""
s=s[:start]+replacement+s[end:]
s=s.replace("  });publishChange();res.json({saved:true});\n }));\n app.post('/api/workflow/cases/:key/survey'", "   if(b.action==='close')await storeSiteReport(tx,c,req.user);\n  });publishChange();res.json({saved:true});\n }));\n app.post('/api/workflow/cases/:key/survey'",1)
p.write_text(s,encoding='utf-8')
p=Path('src/features/cases/CaseDetail.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("import {useState}","import {useState}")
s=s.replace("import {AdminCaseControls}", "import {SiteReport} from './SiteReport';\nimport {routeTo} from '../../components/navigation';\nimport {AdminCaseControls}")
s=s.replace("section:WorkflowSection;", "section:WorkflowSection|'report';")
s=s.replace("{label:'Audit history',section:'history',icon:History}]", "{label:'Audit history',section:'history',icon:History},{label:'Site report',section:'report',icon:FileText}]")
s=s.replace(" const section=", " const selectTab=(label:string)=>{setTab(label);routeTo('detail',item.caseKey??item.id,label);};\n const section=")
s=s.replace("setTab('Legal & routing')", "selectTab('Legal & routing')").replace("setTab(t.label)","selectTab(t.label)").replace("setTab(tabs[next].label)","selectTab(tabs[next].label)")
s=s.replace('<div className="portal-case-tabs"', '''{item.status==='Closed'&&<div className="report-completion"><CheckCircle2 size={22}/><div><b>Case completed. Your site report is ready.</b><p>Print the full record or save the PDF with its original attachments.</p></div><button className="action-primary" onClick={()=>selectTab('Site report')}>Open final report <FileText size={16}/></button></div>}
  <div className="portal-case-tabs"''')
s=s.replace('<CaseWorkflowPanel item={item} role={role} section={section}/>', "{section==='report'?<SiteReport item={item}/>:<CaseWorkflowPanel item={item} role={role} section={section}/>}" )
p.write_text(s,encoding='utf-8')
