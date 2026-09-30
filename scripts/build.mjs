import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())collect(file);else{const key='/'+path.relative('public',file).split(path.sep).join('/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',content:fs.readFileSync(file).toString('base64')};}}}
collect('public');
const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,12);
for(const [key,asset] of Object.entries(assets)){
 if(!/\.(html|js|css)$/.test(key))continue;let content=Buffer.from(asset.content,'base64').toString('utf8');
 if(key.endsWith('.html'))content=content.replace(/(src|href)="((?:assets|fonts)\/[^"]+|(?:app|i18n|guides)\.js|(?:styles|cartoon|live)\.css)"/g,(_,attr,url)=>attr+'="'+url+'?v='+version+'"');
 if(key.endsWith('.js'))content=content.replace(/from '\.\/(i18n|guides)\.js'/g,(_,name)=>"from './"+name+".js?v="+version+"'");
 if(key.endsWith('.css'))content=content.replace(/url\("fonts\/([^"]+)"\)/g,(_,name)=>'url("fonts/'+name+'?v='+version+'")');
 asset.content=Buffer.from(content).toString('base64');
}
for(const [key,asset] of Object.entries(assets)){const target=path.join('dist',key.slice(1));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(asset.content,'base64'));}
const api=fs.readFileSync('src/api.mjs','utf8');
const worker=`${api}\nconst assets=${JSON.stringify(assets)};\nconst headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"};\nexport default{async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env);const key=url.pathname==='/'?'/index.html':url.pathname;const asset=assets[key];if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404,headers});const bytes=Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':asset.type,'Cache-Control':key==='/index.html'?'no-cache':'public, max-age=3600'}});}};`;
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/index.js',worker);
const manifest={...JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'))};delete manifest.static;manifest.d1='DB';manifest.r2=null;
fs.writeFileSync('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Built Worker with ${Object.keys(assets).length} assets (${Buffer.byteLength(worker)} bytes).`);
