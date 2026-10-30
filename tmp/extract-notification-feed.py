from pathlib import Path
p=Path('server/password-recovery.js');s=p.read_text(encoding='utf-8')
a=s.index(" app.get('/api/me/attention'")
b=s.index(" app.post('/api/me/notifications/:id/dismiss'",a)
block=s[a:b]
attention=block[block.index('  const rows='):block.index("  res.json(rows.map(row=>row.CaseNumber));")]
attention=attention.replace('(await getPool())','pool').replace('req.user.UserId','user.UserId').replace('req.user.RoleCode','user.RoleCode').replace('SELECT c.CaseNumber FROM','SELECT c.CaseNumber,c.WorkflowStep,c.Status,c.NextActionAt,'+'${holdSql} AS EffectiveHold FROM')
c=block.index(" app.get('/api/me/notifications'")
account=block[c:]
account=account[account.index('  const rows='):account.rindex('\n }));')]
account=account.replace('(await getPool())','pool').replace('req.user.UserId','user.UserId').replace('isAdmin(req.user)','isAdmin(user)').replace('res.json(rows.map(', 'return rows.map(')
# Remove one closing parenthesis belonging to res.json.
account=account.replace(': {})})));', ': {})}));')
helpers="export async function readAttentionRows(pool,user,holdSql='c.LegalHold'){\n"+attention+"  return rows;\n}\nexport async function readAccountNotifications(pool,user){\n"+account+"\n}\n\n"
s=s[:a]+" app.get('/api/me/attention',wrap(async(req,res)=>res.json((await readAttentionRows(await getPool(),req.user,holdSql)).map(row=>row.CaseNumber))));\n app.get('/api/me/notifications',wrap(async(req,res)=>res.json(await readAccountNotifications(await getPool(),req.user))));\n"+s[b:]
pos=s.index('export function registerRecoveryRoutes')
s=s[:pos]+helpers+s[pos:]
p.write_text(s,encoding='utf-8')
