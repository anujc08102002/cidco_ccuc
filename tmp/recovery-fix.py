from pathlib import Path
p=Path('src/features/workspaces/PasswordDelivery.tsx');s=p.read_text().replace('finally{setBusy(false);}}><Mail','finally{setBusy(false);}}}><Mail');p.write_text(s)
p=Path('src/App.tsx');s=p.read_text().replace('<WorkspacePage kind="staff"','<WorkspacePage focusUserId={focusStaff} kind="staff"');p.write_text(s)
p=Path('.gitignore');s=p.read_text();s+='\n.npm-cache/\n';p.write_text(s)
p=Path('src/experience.css');s=p.read_text();s+='''
/* Account recovery and delivery controls share the workspace palette. */
.recovery-dialog{max-width:520px;color:#17324d;background:#fff;border:1px solid #bdd2e4}
.recovery-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px}
.recovery-dialog form{display:grid;gap:20px;margin-top:24px}
.recovery-dialog p{line-height:1.65}
.password-delivery-actions{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 12px}
.password-delivery-actions a{text-decoration:none;display:inline-flex;align-items:center}
.password-delivery details{margin-top:16px}.password-delivery summary{cursor:pointer;color:var(--primary,#025299);font-weight:600;margin-bottom:14px}
.account-notification{border-bottom:1px solid var(--line,#dce5ee)}
.account-notification>button:first-child{display:flex;align-items:center;gap:12px;width:100%;padding:16px;text-align:left;background:transparent;border:0;color:inherit}
.account-notification span{min-width:0;overflow-wrap:anywhere}.account-notification small{display:block;font-size:11px;margin-top:6px;line-height:1.6}
.account-notification .notification-dismiss{margin:0 16px 12px;padding:6px 12px;border:1px solid var(--line,#dce5ee);border-radius:6px;background:transparent;color:inherit}
.notification-load-error{padding:16px}.notification-load-error button{width:auto}
''';p.write_text(s)
