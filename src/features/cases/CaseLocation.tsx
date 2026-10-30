import { MapPin } from 'lucide-react';
import type { EnforcementCase } from '../../types';
import { hasLocation, mapsUrl } from './caseWorkflow';
export function CaseLocation({item,preview=false}:{item:EnforcementCase;preview?:boolean}){
 if(!hasLocation(item))return <span className="case-location-missing">Location not recorded</span>;
 const coordinates=`${Number(item.latitude).toFixed(7)}, ${Number(item.longitude).toFixed(7)}`;
 return <div className="case-location"><span>{coordinates}</span>{item.siteAddress&&<small>{item.siteAddress}</small>}<a href={mapsUrl(item)} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()}><MapPin size={14}/> Google Maps</a>{preview&&<iframe title={`Site location for ${item.id}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${encodeURIComponent(coordinates)}&z=17&output=embed`}/>}</div>;
}
