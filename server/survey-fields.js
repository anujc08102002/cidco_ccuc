export const priorities=['Normal','High','Urgent'];
export const legalSections=['53','54','55','56'];
export function validateSurveyFields({priority,violationDescription,applicableSections}){
 if(priority!=null&&!priorities.includes(priority))return 'Choose Normal, High or Urgent priority.';
 if(violationDescription!=null&&(typeof violationDescription!=='string'||violationDescription.length>10000))return 'Violation description must be at most 10000 characters.';
 if(applicableSections!=null&&(!Array.isArray(applicableSections)||applicableSections.length>4||applicableSections.some(section=>!legalSections.includes(section))||new Set(applicableSections).size!==applicableSections.length))return 'Choose valid sections: 53, 54, 55 or 56.';
 return null;
}
export function parseSections(value){try{const parsed=JSON.parse(value??'[]');return Array.isArray(parsed)?parsed.filter(section=>legalSections.includes(section)):[];}catch{return [];}}
