// Isolated component test: these fixtures are not inserted into the database.
import React from "react";
import {createRoot} from "react-dom/client";
import {OperationalMap} from "../src/features/dashboard/OperationalMap";
import "../src/styles.css";
import "../src/enterprise.css";
const cases=Array.from({length:13},(_,i)=>({id:'CASE/2026/'+String(i+1).padStart(6,'0'),property:'Map verification site '+(i+1),node:'Kharghar',owner:'Test fixture',stage:'1. Site Survey & Enforcement Case Creation',status:'In progress' as const,updated:'Action required',legal:false,notice:'Draft',survey:'Test',officer:'CUC',surveyor:'Surveyor',assignedCuc:'CUC',latitude:19.04+i*.001,longitude:73.1+i*.001}));
createRoot(document.getElementById("root")!).render(<div style={{padding:24,maxWidth:1100}}><OperationalMap cases={cases}/></div>);
