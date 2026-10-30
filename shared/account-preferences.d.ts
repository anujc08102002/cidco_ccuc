export type PersonalPreferences={theme:'light'|'dark';accent:'congress'|'regal';density:'comfortable'|'compact';textSize:'normal'|'large'|'extra-large';sidebarSide:'left'|'right';sidebarCollapsed:boolean;contentWidth:'fluid'|'focused';cardStyle:'soft'|'outlined';motion:'system'|'reduced';singleKeys:boolean;homePage:string;navOrder:string[];hiddenNav:string[];dashboardOrder:string[];hiddenWidgets:string[];dashboardLayout:'split'|'stacked';dashboardTitle:string;notificationRetentionMinutes:number;desktopNotificationSeconds:number};
export type PersonalWorkspace={preferences:PersonalPreferences;avatar:string|null;revision:string};
export const widgetIds:string[];
export const accountPages:string[];
export const rolePages:Record<string,string[]>;
export function defaultPreferences():PersonalPreferences;
export function validatePreferences(value:unknown,role:string):PersonalPreferences;
