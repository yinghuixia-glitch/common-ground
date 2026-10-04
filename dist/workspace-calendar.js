const escapeText=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
// RFC 5545 lines are limited by UTF-8 octets, including the continuation space.
function fold(line){const encoder=new TextEncoder();let chunk='',bytes=0,out=[];for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){out.push(chunk);chunk=' ';bytes=1;}chunk+=char;bytes+=size;}out.push(chunk);return out.join('\r\n');}
export function parseReminder(value,now=Date.now()){
 if(!value)return null;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!match)throw Error('workspaceInvalidReminder');
 const [,y,m,d,h,min]=match.map(Number),date=new Date(y,m-1,d,h,min,0,0);
 if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d||date.getHours()!==h||date.getMinutes()!==min||!Number.isFinite(date.getTime())||date.getTime()<=now)throw Error('workspaceInvalidReminder');
 return date.getTime();
}
export function localDateTime(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
export function calendarForPlan(plan,{language='en',now=Date.now()}={}){
 if(!Number.isFinite(plan.remindAt)||!Number.isFinite(now)||![0,10,30,60,1440].includes(plan.remindMinutes))throw Error('workspaceInvalidReminder');
 const description=plan.steps.map((step,index)=>`${index+1}. ${step.done?'✓':'○'} ${step.text}`).join('\n');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DrFrog//Small Steps//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${escapeText(plan.id)}@drfrog.pages.dev`,`DTSTAMP:${utc(now)}`,`DTSTART:${utc(plan.remindAt)}`,`DTEND:${utc(plan.remindAt+5*60000)}`,`SUMMARY:${escapeText(plan.title)}`,`DESCRIPTION:${escapeText(description)}`,'BEGIN:VALARM',`TRIGGER:-PT${plan.remindMinutes}M`,'ACTION:DISPLAY',`DESCRIPTION:${escapeText(language==='zh'?'下一小步：'+plan.title:'Your next small step: '+plan.title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR'];
 return lines.map(fold).join('\r\n')+'\r\n';
}
