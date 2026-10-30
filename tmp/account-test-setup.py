from pathlib import Path
p=Path('package.json');s=p.read_text(encoding='utf-8').replace('server/site-report-routes.test.js"','server/site-report-routes.test.js server/account-workspace.test.js"').replace('"typecheck":', '"restore:login": "node backups/login-before-congress-blue-20261021/restore-login.mjs",\n    "typecheck":');p.write_text(s,encoding='utf-8')
p=Path('backups/login-before-congress-blue-20261021/restore-login.mjs');p.write_text("""import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// Restore only presentation. Preserve current authentication and account identity logic.
const original=new URL('./SignIn.css',import.meta.url);
const destination=new URL('../../src/features/auth/SignIn.css',import.meta.url);
await copyFile(original,destination);
console.log('Original login appearance restored: '+fileURLToPath(destination));
console.log('Authentication, account preferences and the rest of the application are preserved.');
""",encoding='utf-8')
p=Path('backups/login-before-congress-blue-20261021/README.md');p.write_text("""# Login appearance backup

Saved before Congress Blue and the enlarged logo on 21 October 2026. This directory preserves the original SignIn.tsx, SignIn.css, experience.css and main.tsx. The skyline and CIDCO logo assets are unchanged.

Run `npm run restore:login` from the project root to restore the saved login appearance. The command restores SignIn.css only: the rendered layout was not changed in this update, and current authentication/account identity logic must be retained. Vite refreshes the appearance automatically; rebuild for production.

The other files are a reference snapshot. Do not copy main.tsx or experience.css over the live application when restoring only the login.
""",encoding='utf-8')
