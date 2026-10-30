import crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();
const secretFile=new URL('./.session-secret',import.meta.url);
let secret=process.env.SESSION_SECRET;
if(!secret){
 try{secret=readFileSync(secretFile,'utf8').trim();}
 catch(error){
  if(error.code!=='ENOENT')throw error;
  secret=crypto.randomBytes(48).toString('hex');
  try{writeFileSync(secretFile,secret,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;secret=readFileSync(secretFile,'utf8').trim();}
 }
}
const fingerprint=hash=>crypto.createHash('sha256').update(hash??'').digest('hex');
export function issueSession(user){
 const body=Buffer.from(JSON.stringify({username:user.Username,role:user.RoleCode,exp:Date.now()+12*60*60*1000,password:fingerprint(user.PasswordHash)})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
}
export function readSession(token){
 try{
  const [body,signature,...extra]=String(token??'').split('.');
  if(!body||!signature||extra.length)return null;
  const expected=crypto.createHmac('sha256',secret).update(body).digest();
  const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  const session=JSON.parse(Buffer.from(body,'base64url').toString());
  return typeof session.username==='string'&&session.exp>Date.now()?session:null;
 }catch{return null;}
}
export const matchesSessionPassword=(session,user)=>session.role===user.RoleCode&&session.password===fingerprint(user.PasswordHash);
