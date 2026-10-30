// A template has one approval signature. Legacy duplicate regions resolve to the
// last region added, matching the region the administrator most recently placed.
export const isSignatureRegion = text => /\{\{\s*(?:signature|signature[\s_-]*image)\s*\}\}/i.test(String(text));
export function signatureRegionPages(pages = []) {
 let last;
 pages.forEach((p,pi)=>p.blocks.forEach((b,bi)=>{if(isSignatureRegion(b.text))last={pi,bi};}));
 return pages.map((p,pi)=>({...p,blocks:p.blocks.filter((b,bi)=>!isSignatureRegion(b.text)||(last.pi===pi&&last.bi===bi))}));
}
