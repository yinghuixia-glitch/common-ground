import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {thirdPartyNotices} from './third-party-notices.mjs';
const cloudflare=process.argv.includes('--cloudflare'),output=cloudflare?'cloudflare-dist':'dist';
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
const assets={};
function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())collect(file);else{const key='/'+path.relative('public',file).split(path.sep).join('/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',content:fs.readFileSync(file).toString('base64')};}}}
collect('public');
if(cloudflare){const page=assets['/index.html'];page.content=Buffer.from(Buffer.from(page.content,'base64').toString('utf8').replaceAll('data-i18n="signin"','data-i18n="emailSignin"').replaceAll('data-i18n="welcomeText"','data-i18n="emailWelcome"').replaceAll('/signin-with-chatgpt?return_to=%2F','#signin').replaceAll('/signout-with-chatgpt?return_to=%2F','#signout').replaceAll(' target="_top"','').replaceAll('Sign in with ChatGPT','Sign in with email')).toString('base64');}
const client=await build({stdin:{contents:"export {initializeApp} from 'firebase/app'; export {initializeAuth,browserLocalPersistence,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,reload,signOut} from 'firebase/auth';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',minify:true,metafile:true,write:false});
const notices=thirdPartyNotices(Object.keys(client.metafile.inputs));
fs.writeFileSync('public/third-party-notices.txt',notices);
assets['/third-party-notices.txt']={type:types['.txt'],content:Buffer.from(notices).toString('base64')};
assets['/firebase-client.js']={type:types['.js'],content:Buffer.from(client.outputFiles[0].contents).toString('base64')};
const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,12);
for(const [key,asset] of Object.entries(assets)){
 if(!/\.(html|js|css)$/.test(key))continue;let content=Buffer.from(asset.content,'base64').toString('utf8');
 if(key.endsWith('.html'))content=content.replace(/(src|href)="((?:assets|fonts)\/[^"]+|(?:app|i18n|guides)\.js|(?:styles|cartoon|live|discussion|tablet|home)\.css)"/g,(_,attr,url)=>attr+'="'+url+'?v='+version+'"');
 if(key.endsWith('.js'))content=content.replace(/(['"])\.\/(i18n|guides|auth|firebase-client|features|campus-content|discussion|navigation)\.js\1/g,(_,quote,name)=>quote+'./'+name+'.js?v='+version+quote);
 if(key.endsWith('.css'))content=content.replace(/url\("((?:fonts|assets)\/[^"]+)"\)/g,(_,url)=>'url("'+url+'?v='+version+'")');
 asset.content=Buffer.from(content).toString('base64');
}
for(const [key,asset] of Object.entries(assets)){const target=path.join(output,key.slice(1));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(asset.content,'base64'));}
const worker=`import {handleApi} from './src/api.mjs';\nconst assets=${JSON.stringify(assets)};\nconst headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"};\nexport default{async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,${cloudflare?"{...env,AUTH_PROVIDER:'firebase'}":'env'});const key=url.pathname==='/'?'/index.html':url.pathname;const asset=assets[key];if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404,headers});const bytes=Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':asset.type,'Cache-Control':key==='/index.html'?'no-cache':'public, max-age=3600'}});}};`;
const target=cloudflare?path.join(output,'_worker.js'):path.join(output,'server/index.js');fs.mkdirSync(path.dirname(target),{recursive:true});
await build({stdin:{contents:worker,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:target});
if(!cloudflare){fs.mkdirSync('dist/.openai',{recursive:true});const manifest={...JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'))};delete manifest.static;manifest.d1='DB';manifest.r2=null;fs.writeFileSync('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');}
console.log(`Built ${cloudflare?'Cloudflare Pages':'Sites'} Worker with ${Object.keys(assets).length} assets (${fs.statSync(target).size} bytes).`);
