import forge from 'node-forge';
export function testCertificate(name='Acceptance CCUC'){
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01';cert.validity.notBefore=new Date(Date.now()-60000);cert.validity.notAfter=new Date(Date.now()+86400000);
 cert.setSubject([{name:'commonName',value:name}]);cert.setIssuer(cert.subject.attributes);cert.setExtensions([{name:'basicConstraints',cA:false},{name:'keyUsage',digitalSignature:true,nonRepudiation:true}]);cert.sign(keys.privateKey,forge.md.sha256.create());
 const password='test-only-password',p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],password,{algorithm:'3des'});
 return {pfxBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),pfxPassword:password,pem:forge.pki.certificateToPem(cert)};
}
