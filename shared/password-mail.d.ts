export function passwordMail(user:{name:string;username:string},password:string,loginUrl?:string):{subject:string;text:string};
export function passwordMailLinks(email:string,message:{subject:string;text:string}):{gmail:string;outlook:string;mailto:string};
