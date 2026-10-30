const fs=require('fs');const p='server/enforcement-workflow.js';let s=fs.readFileSync(p,'utf8');
const needle="  fail(typeof req.query.q!=='string'||req.query.q.trim().length<2||req.query.q.length>160,'Enter 2 to 160 characters.');";
s=s.replace(needle,needle+`
  const recipientField={name:'owner',plot:'plot',survey:null}[req.query.field];
  const recipientMatch=recipientField?\` OR EXISTS (SELECT 1 FROM OPENJSON(CASE WHEN ISJSON(d.Content)=1 THEN d.Content ELSE '{}' END,'$.recipients') WITH (Value nvarchar(240) '$.\${recipientField}') recipient WHERE recipient.Value LIKE @q)\`:'';`);
s=s.replace("AND c.${column} LIKE @q ORDER BY", "AND (c.${column} LIKE @q${recipientMatch}) ORDER BY");
fs.writeFileSync(p,s);
