import crypto from 'node:crypto';

// Compare calendar days in the department's timezone, including drives earlier today.
const day=value=>Math.floor((new Date(value).getTime()+330*60000)/86400000);
export const driveDateInput=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)?value+'+05:30':value;
export function driveAnnouncements(rows,user,now=Date.now()){
 const drives=rows.filter(d=>Number.isFinite(day(d.PlannedAt))&&day(d.PlannedAt)>=day(now)).sort((a,b)=>new Date(a.PlannedAt)-new Date(b.PlannedAt));
 const notifications=[];
 for(const d of drives){
  const revision=crypto.createHash('sha256').update(JSON.stringify([d.PlannedAt,d.Details])).digest('hex').slice(0,20);
  const days=day(d.PlannedAt)-day(now),phase=days===0?'today':days===1?'tomorrow':'announced';
  // The publishing CCUC can see the plan on their dashboard without their own announcement popup.
  if(phase==='announced'&&String(d.CreatedBy).toLowerCase()===String(user.UserId).toLowerCase())continue;
  notifications.push({id:`drive:${d.DriveId}:${revision}:${phase}`,kind:'drive',status:phase,createdAt:d.CreatedAt,
   title:`Demolition drive ${phase==='today'?'today':phase==='tomorrow'?'tomorrow':'announced'}: ${d.SerialNumber}`,
   driveId:d.DriveId,serial:d.SerialNumber,plannedAt:d.PlannedAt,node:d.Node,details:d.Details});
 }
 return {drives,notifications};
}
export async function readDriveAnnouncements(pool,user,now=Date.now()){
 const rows=(await pool.request().query('SELECT DriveId,SerialNumber,PlannedAt,Node,Details,CreatedBy,CreatedAt FROM enforcement.DrivePlans')).recordset;
 return driveAnnouncements(rows,user,now);
}
export function registerDriveAnnouncementRoutes(app,{getPool}){
 app.get('/api/me/drive-announcements',async(req,res,next)=>{
  try{res.set('Cache-Control','no-store').json(await readDriveAnnouncements(await getPool(),req.user));}catch(error){next(error);}
 });
}
