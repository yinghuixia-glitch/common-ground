const panes=new Set(['guide','toolbox','situations','takeaways','workspace','spaces','support','study','agreements']);
export function readRoute(hash){
 if(hash==='#home')return {view:'home'};
 if(hash==='#community')return {view:'community'};
 if(hash==='#ask'||hash==='#respond')return {view:'community',intent:hash.slice(1)};
 if(hash==='#resources'||hash==='#guide')return {view:'resources',pane:'guide'};
 if(hash.startsWith('#resources=')&&panes.has(hash.slice(11)))return {view:'resources',pane:hash.slice(11)};
 if(hash==='#conversations')return {view:'conversations'};
 if(hash.startsWith('#question=')){try{const parts=hash.slice(10).split('&answer=');if(parts.length>2)return null;const id=decodeURIComponent(parts[0]),answerId=parts.length===2?decodeURIComponent(parts[1]):null,valid=value=>/^[A-Za-z0-9_-]{1,200}$/.test(value);if(valid(id)&&(answerId===null||valid(answerId)))return {view:'discussion',questionId:id,...(answerId?{answerId}:{})};}catch{}}
 return null;
}
export function routeHash(route){
 if(route.view==='discussion')return '#question='+encodeURIComponent(route.questionId)+(route.answerId?'&answer='+encodeURIComponent(route.answerId):'');
 if(route.view==='resources')return route.pane==='guide'||!route.pane?'#guide':'#resources='+route.pane;
 if(route.view==='community')return route.intent?'#'+route.intent:'#community';
 return '#'+route.view;
}
export const defaultRoute=hasProfile=>({view:hasProfile?'community':'home'});
export const requiresMember=route=>route.view==='discussion'||route.view==='conversations'||route.view==='community'&&!!route.intent;
