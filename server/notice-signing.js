import crypto from 'node:crypto';
import forge from 'node-forge';
import {SignPdf} from '@signpdf/signpdf';
import {P12Signer} from '@signpdf/signer-p12';
import {pdflibAddPlaceholder} from '@signpdf/placeholder-pdf-lib';
import {renderNoticePdf} from './notice-pdf.js';
import {fail,WorkflowError} from './workflow-policy.js';

export function publicCertificate(bytes){
 let cert;try{cert=new crypto.X509Certificate(bytes);}catch{throw new WorkflowError('Upload a valid public X.509 certificate (.cer, .crt or .pem).');}
 fail(cert.ca,'Use the officer signing certificate, not a CA certificate.');
 fail(Date.now()<Date.parse(cert.validFrom)||Date.now()>Date.parse(cert.validTo),'The signing certificate is expired or not yet valid.');
 return {fingerprint:cert.fingerprint256.replaceAll(':','').toLowerCase(),subject:cert.subject,issuer:cert.issuer,validTo:cert.validTo,pem:cert.toString()};
}
export function inspectPfx(bytes,passphrase,pinnedFingerprint){
 try{
  const p12=forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')),false,passphrase||'');
  const keyBags=p12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||[];
  const plain=p12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag]||[];
  const key=[...keyBags,...plain].find(b=>b.key)?.key;fail(!key,'The PFX does not contain a signing private key.');
  const certs=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[];
  const cert=certs.map(b=>b.cert).find(c=>c?.publicKey?.n?.compareTo(key.n)===0&&c.publicKey.e?.compareTo(key.e)===0);
  fail(!cert,'The PFX certificate does not match its private key.');
  const usage=cert.getExtension('keyUsage');fail(!usage||(!usage.digitalSignature&&!usage.nonRepudiation),'Certificate must permit digital signatures.');
  const info=publicCertificate(Buffer.from(forge.pki.certificateToPem(cert)));
  fail(!pinnedFingerprint||info.fingerprint!==pinnedFingerprint,'This certificate is not registered for your CCUC account. Ask the administrator to register its public certificate.',403);
  return info;
 }catch(e){if(e instanceof WorkflowError)throw e;throw new WorkflowError('The PFX could not be opened. Check the certificate and password.');}
}
export async function signNotice(d,user,b,pin){
 fail(typeof b.pfxBase64!=='string'||b.pfxBase64.length>1400000||!b.pfxBase64,'Select your PFX/P12 certificate.');
 fail(typeof b.pfxPassword!=='string'||b.pfxPassword.length>500,'Invalid certificate password.');
 const bytes=Buffer.from(b.pfxBase64,'base64');
 try{
  const cert=inspectPfx(bytes,b.pfxPassword,pin),at=new Date();
  const pdf=await renderNoticePdf(d.Content,{reference:d.ReferenceNumber,createdAt:d.CreatedAt,signer:{name:user.DisplayName,at,fingerprint:cert.fingerprint}});
  pdflibAddPlaceholder({pdfDoc:pdf,reason:b.reason,name:user.DisplayName,location:'CIDCO, Navi Mumbai',contactInfo:'',signingTime:at,signatureLength:24000});
  const unsigned=Buffer.from(await pdf.save({useObjectStreams:false}));
  const signed=await new SignPdf().sign(unsigned,new P12Signer(bytes,{passphrase:b.pfxPassword}),at);
  return {pdf:signed,hash:crypto.createHash('sha256').update(signed).digest(),certificate:cert,name:user.DisplayName,at};
 }finally{bytes.fill(0);delete b.pfxBase64;delete b.pfxPassword;}
}
