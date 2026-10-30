from pathlib import Path
p=Path('server/index.js');s=p.read_text(encoding='utf-8');s="import {createDesktopNotifications} from './desktop-notifications.js';\n"+s
s=s.replace("const publishChange=()=>{for(const response of clients)response.write('data: changed\\n\\n');};", "let desktopNotifications;\nconst publishChange=()=>{for(const response of clients)response.write('data: changed\\n\\n');void desktopNotifications?.dispatch().catch(()=>{});};",1)
s=s.replace('registerRecoveryRoutes(app,{getPool,publishChange,holdSql:propertyHoldSql()});', 'desktopNotifications=createDesktopNotifications({getPool,holdSql:propertyHoldSql()});\ndesktopNotifications.register(app);\nif(hasDatabaseConfig)desktopNotifications.start();\nregisterRecoveryRoutes(app,{getPool,publishChange,holdSql:propertyHoldSql()});',1)
p.write_text(s,encoding='utf-8')
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8');s="import {useDesktopNotifications,disconnectDesktop} from './features/account/DesktopNotifications';\n"+s
s=s.replace(' const accountEpoch=useRef(0)', " useDesktopNotifications(authenticated?accounts[role].id:undefined);\n const accountEpoch=useRef(0)",1)
s=s.replace('const signOut=()=>{++accountEpoch.current;', 'const signOut=()=>{void disconnectDesktop(accounts[role].id);++accountEpoch.current;',1)
# Event listener is created once; disconnect the device saved in browser storage on session expiry.
s=s.replace('const expired=()=>{++accountEpoch.current;', 'const expired=()=>{void disconnectDesktop();++accountEpoch.current;',1)
p.write_text(s,encoding='utf-8')
p=Path('src/components/AppShell.tsx');s=p.read_text(encoding='utf-8');s="import {DesktopNotificationControls} from '../features/account/DesktopNotifications';\n"+s
s=s.replace('{props.notificationError&&<div className="notification-load-error">', '<DesktopNotificationControls userId={accounts[props.role].id}/>{props.notificationError&&<div className="notification-load-error">',1)
p.write_text(s,encoding='utf-8')
p=Path('src/features/account/account.css');s=p.read_text(encoding='utf-8');s+='''
.desktop-notification-controls{padding:17px 18px;border-bottom:1px solid var(--line,#d5e2ef);background:var(--surface-soft,#edf4fa)}
.desktop-notification-controls>div:first-child{display:flex;align-items:center;gap:9px}
.desktop-notification-controls p{font-size:12px;line-height:1.65;margin:10px 0}
.desktop-notification-controls>small{display:block;line-height:1.6;font-size:10px;margin-top:12px;opacity:.8}
.desktop-notification-controls>label{display:flex;align-items:center;gap:9px;font-size:12px}
.desktop-notification-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.desktop-notification-actions button{width:auto!important;padding:8px 12px!important;border:1px solid var(--line,#d5e2ef)!important;border-radius:8px;font-size:11px}
.desktop-notification-controls>.action-primary{width:auto;padding:9px 12px}
.notice-drawer{max-height:calc(100dvh - 90px);overflow-y:auto}
''';p.write_text(s,encoding='utf-8')
