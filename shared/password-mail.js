export function passwordMail(user,password,loginUrl='') {
 return {subject:'EnforceFlow — your temporary password',text:`Hello ${user.name},\n\nYour EnforceFlow password has been reset by the Master Administrator.\n\nUsername: ${user.username}\nTemporary password: ${password}\n${loginUrl?`Sign in: ${loginUrl}\n`:''}\nSign in with this temporary password and choose a new personal password when prompted. Do not forward this message or share your password.\n\nIf you did not request this change, contact your department administrator.\n\nCIDCO Enforcement Administration`};
}
export function passwordMailLinks(email,message) {
 const query=new URLSearchParams({to:email,subject:message.subject,body:message.text});
 return {gmail:`https://mail.google.com/mail/?view=cm&fs=1&${new URLSearchParams({to:email,su:message.subject,body:message.text})}`,outlook:`https://outlook.office.com/mail/deeplink/compose?${query}`,mailto:`mailto:${encodeURIComponent(email)}?${new URLSearchParams({subject:message.subject,body:message.text})}`};
}
