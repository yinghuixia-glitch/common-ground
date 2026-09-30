// Local development only. The deployed Worker never imports this file.
import http from 'node:http';
import fs from 'node:fs';
import {localDatabase} from './local-db.mjs';
import {handleApi} from '../src/api.mjs';
import worker from '../dist/server/index.js';
fs.mkdirSync('.local',{recursive:true});
const DB=localDatabase('.local/community.sqlite'),origin='http://127.0.0.1:4173';
const identities={alice:{id:'local-alice',email:'alice@example.test'},bob:{id:'local-bob',email:'bob@example.test'},eve:{id:'local-eve',email:'eve@example.test'}};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),headers=new Headers(req.headers);
  // Never accept authenticated-user headers from a browser in local development.
  for(const h of ['oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);
  const cookie=req.headers.cookie?.match(/(?:^|; )cg_dev_user=(alice|bob|eve)(?:;|$)/),user=cookie?identities[cookie[1]]:null;
  if(user){headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);}
  if(url.pathname==='/__dev/signin'&&req.method==='GET'){
   const name=url.searchParams.get('user');if(!identities[name]){res.writeHead(400);res.end('Unknown local test identity');return;}
   res.writeHead(302,{'Set-Cookie':'cg_dev_user='+name+'; Path=/; HttpOnly; SameSite=Strict','Location':'/'});res.end();return;
  }
  if(url.pathname==='/signin-with-chatgpt'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<h1>Local development identities only</h1><p>Production uses ChatGPT sign-in. These identities exist only on localhost.</p><a href="/__dev/signin?user=alice">Alice (question author)</a><br><a href="/__dev/signin?user=bob">Bob (helper)</a><br><a href="/__dev/signin?user=eve">Eve (outsider)</a>');return;
  }
  if(url.pathname==='/signout-with-chatgpt'){res.writeHead(302,{'Set-Cookie':'cg_dev_user=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict','Location':'/'});res.end();return;}
  const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>20000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await worker.fetch(request,{DB,MODERATOR_EMAIL:'alice@example.test'});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.writeHead(500);res.end('Local server error');}
}).listen(4173,'127.0.0.1',()=>console.log('Local live preview: '+origin+' (test identities only; not deployed)'));
