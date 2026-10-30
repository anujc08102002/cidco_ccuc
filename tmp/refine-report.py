from pathlib import Path
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8').replace("key={(selected.caseKey??selected.id)+detailTab}","key={selected.caseKey??selected.id}");p.write_text(s,encoding='utf-8')
p=Path('src/features/cases/CaseDetail.tsx');s=p.read_text(encoding='utf-8').replace("import {useState}","import {useEffect,useState}");s=s.replace(' const selectTab=', " useEffect(()=>{if(tabs.some(t=>t.label===initialTab))setTab(initialTab);},[initialTab]);\n const selectTab=");s=s.replace("<CaseWorkflowPanel item={item} role={role} section={section}/>","<CaseWorkflowPanel item={item} role={role} section={section} onChanged={changed=>onCaseChanged?.(changed)}/>");p.write_text(s,encoding='utf-8')
p=Path('server/site-report.js');s=p.read_text(encoding='utf-8')
s=s.replace(" const manifest=[];", " const ownPages=new Set(pdf.getPages());\n const manifest=[];")
s=s.replace(" for(const file of files.filter(f=>f.MimeType?.startsWith('image/'))){", """ for(const file of files.filter(f=>f.MimeType==='application/pdf')){
  newPage();ownPages.add(page);line('Original document - print copy',16);line(file.FileName||file.DocumentType,11);line('The following pages reproduce an attached original. Extract the embedded file to verify any original signature.',10,muted);
  const original=await PDFDocument.load(file.FileContent);const copies=await pdf.copyPages(original,original.getPageIndices());for(const copy of copies)pdf.addPage(copy);
 }
 for(const file of files.filter(f=>f.MimeType?.startsWith('image/'))){""")
s=s.replace("newPage();line('Evidence photograph'", "newPage();ownPages.add(page);line('Evidence photograph'")
s=s.replace("pages.forEach((p,i)=>{p.drawLine", "pages.forEach((p,i)=>{if(!ownPages.has(p))return;p.drawLine")
p.write_text(s,encoding='utf-8')
p=Path('src/features/cases/SiteReport.tsx');s=p.read_text(encoding='utf-8').replace('Printing produces the report and evidence photographs; open the PDF attachments to print original notices and other supporting PDFs.', 'Printing includes the report, supporting PDF pages and evidence photographs.');p.write_text(s,encoding='utf-8')
