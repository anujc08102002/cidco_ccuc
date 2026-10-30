// No API contract has been supplied. A configured URL alone is not sufficient to safely interpret legal restrictions.
export async function retrieveLegalRecord(){
 return {available:false,source:'LTS',lastSynchronizedAt:null,error:'LTS API contract, authentication credentials and authoritative restriction mapping have not been supplied. Record verified legal information manually with its source.'};
}
