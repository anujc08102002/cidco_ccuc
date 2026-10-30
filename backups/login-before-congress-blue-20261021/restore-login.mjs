import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// Restore only presentation. Preserve current authentication and account identity logic.
const original=new URL('./SignIn.css',import.meta.url);
const destination=new URL('../../src/features/auth/SignIn.css',import.meta.url);
await copyFile(original,destination);
console.log('Original login appearance restored: '+fileURLToPath(destination));
console.log('Authentication, account preferences and the rest of the application are preserved.');
