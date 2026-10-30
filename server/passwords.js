import crypto from 'node:crypto';
export function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');return `scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(stored,password){
 if(typeof stored!=='string'||typeof password!=='string')return false;
 const [scheme,salt,hash]=stored.split('$');
 const expected=scheme==='scrypt'?Buffer.from(hash??'','hex'):Buffer.from(stored.toUpperCase(),'utf8');
 const actual=scheme==='scrypt'?crypto.scryptSync(password,salt,64):Buffer.from(crypto.createHash('sha512').update(password,'utf16le').digest('hex').toUpperCase(),'utf8');
 return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
