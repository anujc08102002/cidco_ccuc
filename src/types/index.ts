export type CaseStatus = "Overdue" | "In progress" | "Awaiting approval" | "Closed" | "Review hold";
export type EnforcementCase = {
  id: string; caseKey?:string; currentStage?:number; canVerify?:boolean; property: string; sector?: string; node: string; owner: string; stage: string; status: CaseStatus;
  updated: string; legal: boolean; notice: string; survey: string; officer: string;
  surveyor: string; assignedCuc: string;
  latitude?: number | null; longitude?: number | null; siteAddress?: string | null;
  locationSource?: string | null; locationAccuracyMetres?: number | null; locationCapturedAt?: string | null;
  archived?:boolean; archivedAt?:string|null; archiveUntil?:string|null; archiveReason?:string|null;
  surveyorId?:string|null; cucId?:string|null; responsibleUserId?:string|null; nextActionAt?:string|null; rowVersion?:string;
  priority?:'Normal'|'High'|'Urgent'|null; violationDescription?:string|null; applicableSections?:string[]; createdAt?:string|null;
  plotNumber?:string|null; village?:string|null; workflowStep?:string|null; escalatedAt?:string|null; overdueDays?:number;
  constructionType?:string|null;
};
export type RegisterRow = { id: string; title: string; node: string; owner: string; status: string; due: string; tag?: string };
