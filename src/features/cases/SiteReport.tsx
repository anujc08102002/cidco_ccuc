import {FileCheck2,FolderDown,Printer,ShieldCheck} from 'lucide-react';
import type {EnforcementCase} from '../../types';
import {PdfPreview} from './NoticeDocuments';

export function SiteReport({item}:{item:EnforcementCase}){
 return <section className="site-report-panel" aria-labelledby="site-report-heading">
  <div className="report-intro"><span className="report-emblem"><FileCheck2 size={30}/></span><span className="section-index">PRINT & PRESERVE</span><h3 id="site-report-heading">The complete site record.</h3><p>{item.status==='Closed'?'The final report was saved with the case at closure.':'Generate an interim report now. A final report is generated and saved automatically when the case is closed.'}</p></div>
  <div className="report-benefits"><div><Printer size={21}/><b>Ready for paper</b><p>A4 pages with property details, proceedings, outcomes and audit history.</p></div><div><FolderDown size={21}/><b>Ready to archive</b><p>Save the PDF to a computer, USB drive or approved secondary storage. Original files and case data are embedded.</p></div><div><ShieldCheck size={21}/><b>Traceable records</b><p>A report ID and audit hash identify the saved copy. Recorded orders establish the findings; this compilation does not certify site legality.</p></div></div>
  <div className="portal-message"><div><b>Keep the complete file</b><p>Download the PDF to retain embedded originals. Printing includes the report, supporting PDF pages and evidence photographs. Use a reader with an attachments panel to extract originals and case-record.json.</p></div></div>
  <PdfPreview path={`/workflow/cases/${encodeURIComponent(item.caseKey??item.id)}/report`} title={`${item.id} · ${item.status==='Closed'?'Final':'Interim'} site report`} downloadName={`CIDCO-${item.id.replace(/[^a-z0-9_-]/gi,'-')}-site-report.pdf`}/>
 </section>;
}
