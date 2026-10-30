import {useEffect,useRef} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {EnforcementCase} from "../../types";
import "./OperationalMap.css";
import {severityLegend,severityFor,groupSeverity,pinHtml} from "./mapSeverity";

export const hasSiteCoordinates=(item:EnforcementCase)=>item.latitude!==null&&item.latitude!==undefined&&item.longitude!==null&&item.longitude!==undefined&&Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))&&Math.abs(Number(item.latitude))<=90&&Math.abs(Number(item.longitude))<=180;
function details(items:EnforcementCase[]){
 const panel=document.createElement("div");panel.className="geographic-case-details";
 for(const item of items){
  const entry=document.createElement("section");
  const title=document.createElement("strong");title.textContent=item.id;entry.append(title);
  for(const [label,value] of [["Priority / severity",item.priority??"Not recorded"],["Violation description",item.violationDescription],["Applicable sections",item.applicableSections?.map(section=>`Sec. ${section}`).join(", ")],["Sector",item.sector],["Property",item.property],["Node",item.node],["Owner / occupier",item.owner],["Status",item.status],["Stage",item.stage],["Surveyor",item.surveyor],["CUC",item.assignedCuc],["Officer",item.officer],["Next action",item.updated],["Survey",item.survey],["Notice",item.notice],["Address",item.siteAddress],["Coordinates",`${item.latitude}, ${item.longitude}`]]){
   if(!value)continue;
   const row=document.createElement("div"),key=document.createElement("b");key.textContent=label+": ";
   row.append(key,document.createTextNode(value));entry.append(row);
  }
  const link=document.createElement("a");link.href=`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;link.target="_blank";link.rel="noreferrer";link.textContent="Open in Google Maps";entry.append(link);panel.append(entry);
 }
 return panel;
}
export function OperationalMap({cases}:{cases:EnforcementCase[]}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),markers=useRef<L.LayerGroup|null>(null),previousCoordinates=useRef("");
 const located=cases.filter(hasSiteCoordinates),missing=cases.length-located.length;
 useEffect(()=>{
  if(!container.current)return;
  const instance=L.map(container.current,{scrollWheelZoom:false}).setView([19.04,73.06],12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(instance);
  map.current=instance;markers.current=L.layerGroup().addTo(instance);
  const resize=new ResizeObserver(()=>instance.invalidateSize({pan:false}));resize.observe(container.current);
  return()=>{resize.disconnect();instance.remove();map.current=null;markers.current=null;previousCoordinates.current=""};
 },[]);
 useEffect(()=>{
  if(!map.current||!markers.current)return;
  markers.current.clearLayers();
  const groups=new Map<string,EnforcementCase[]>();
  for(const item of located){const key=`${item.latitude},${item.longitude}`;groups.set(key,[...(groups.get(key)??[]),item]);}
  for(const items of groups.values()){
   const first=items[0];
   const severity=groupSeverity(items);
   const marker=L.marker([Number(first.latitude),Number(first.longitude)],{icon:L.divIcon({className:"severity-map-pin",html:pinHtml(severity.colour,items.length),iconSize:[36,48],iconAnchor:[18,46],popupAnchor:[0,-42],tooltipAnchor:[18,-30]}),title:`${items.length>1?`${items.length} cases at this location`:first.id} · ${severity.label}`,alt:`${severity.label} case location`})
    .bindTooltip(details(items),{direction:"auto",className:"case-geographic-tooltip",interactive:true})
    .bindPopup(details(items),{maxWidth:360,maxHeight:220}).addTo(markers.current);
   marker.on("popupopen",()=>marker.closeTooltip());
  }
  const signature=[...groups.keys()].sort().join("|");
  if(signature!==previousCoordinates.current&&located.length){
   map.current.fitBounds(L.latLngBounds(located.map(item=>[Number(item.latitude),Number(item.longitude)])),{padding:[45,55],maxZoom:16,animate:false});
  }
  previousCoordinates.current=signature;
 },[cases]);
 return <section className="operations-map-card"><header><div><span className="section-index">SITE LOCATIONS · ALL NODES</span><h3>Cases by location <small>({located.length})</small></h3></div></header><div className="severity-map-layout"><div className="operations-map"><div ref={container} className="geospatial-canvas" aria-label="Registered case locations"/>{!located.length&&<div className="map-no-cases">{cases.length?"These cases do not have saved site coordinates.":"No registered case locations yet."}</div>}</div><aside className="severity-map-legend" aria-label="Map severity legend"><h4>Severity legend</h4><p>Pin colour follows the survey priority.</p>{severityLegend.map(level=><div className="severity-legend-row" key={level.label}><svg viewBox="0 0 36 48" width="20" height="27" aria-hidden="true"><path d="M18 46C14 39 2 27 2 18a16 16 0 1 1 32 0c0 9-12 21-16 28Z" fill={level.colour}/><circle cx="18" cy="18" r="7" fill="white"/></svg><span>{level.label}</span><b>{located.filter(item=>severityFor(item).priority===level.priority).length}</b></div>)}<small>Shared locations show the highest severity and the number of cases. Select a pin to see the full case information.</small></aside></div><div className="geographic-map-summary"><span>{located.length} mapped case{located.length===1?"":"s"} · Updated automatically</span>{missing>0&&<span>{missing} case{missing===1?"":"s"} without site coordinates</span>}</div></section>;

}
