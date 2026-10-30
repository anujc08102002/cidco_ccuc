Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FileLockInfo {
 [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public int Id; public System.Runtime.InteropServices.ComTypes.FILETIME Start; }
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo {
  public UniqueProcess Process;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string App;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string Service;
  public int Type; public uint Status;public uint Session;[MarshalAs(UnmanagedType.Bool)]public bool Restartable;
 }
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] public static extern int RmStartSession(out uint handle,int flags,string key);
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] public static extern int RmRegisterResources(uint handle,uint files,string[] names,uint apps,UniqueProcess[] processes,uint services,string[] serviceNames);
 [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint handle,out uint required,ref uint count,[In,Out] ProcessInfo[] entries,ref uint reasons);
 [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint handle);
}
'@
$lockSession=0
$result=[FileLockInfo]::RmStartSession([ref]$lockSession,0,[Guid]::NewGuid().ToString('N'))
if($result -ne 0){throw "Restart Manager query failed: $result"}
try{
 $files=@('D:\CIDCO\enforcement_project\node_modules\body-parser\package.json','D:\CIDCO\enforcement_project\server\node_modules\body-parser\package.json')
 $result=[FileLockInfo]::RmRegisterResources($lockSession,$files.Count,$files,0,$null,0,$null)
 $needed=0;$count=0;$reasons=0
 $result=[FileLockInfo]::RmGetList($lockSession,[ref]$needed,[ref]$count,$null,[ref]$reasons)
 if($needed -gt 0){
  $entries=[FileLockInfo+ProcessInfo[]]::new($needed);$count=$needed
  $result=[FileLockInfo]::RmGetList($lockSession,[ref]$needed,[ref]$count,$entries,[ref]$reasons)
  $entries | ForEach-Object {[pscustomobject]@{ProcessId=$_.Process.Id;Application=$_.App;Service=$_.Service}}
 }else{Write-Output "No ordinary user-process file lock reported. Result: $result"}
}finally{[void][FileLockInfo]::RmEndSession($lockSession)}
