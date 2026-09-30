import fs from 'node:fs';
import path from 'node:path';

// Derive the shipped browser components from esbuild's actual dependency graph.
export function thirdPartyNotices(inputs){
 const packages=new Map();
 for(const input of inputs){
  if(!input.includes('node_modules/'))continue;
  let directory=path.dirname(path.resolve(input));
  while(directory!==path.dirname(directory)){
   const manifest=path.join(directory,'package.json');
   if(fs.existsSync(manifest)){
    const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
    if(p.name&&p.version&&p.license){packages.set(p.name,{...p,directory});break;}
   }
   directory=path.dirname(directory);
  }
 }
 for(const name of ['jose','drizzle-orm']){
  const directory=path.resolve('node_modules',name);
  packages.set(name,{...JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),directory});
 }
 let notice='DrFrog third-party software notices\n第三方软件许可声明\n\n'+
  'The project reservation of rights does not replace these licences.\n'+
  'Browser components below are identified from the build dependency graph; jose and drizzle-orm run in the Worker.\n'+
  'The built JavaScript retains upstream legal comments. Fonts have separate OFL files in /fonts/.\n\n';
 for(const p of [...packages.values()].sort((a,b)=>a.name.localeCompare(b.name))){
  notice+='='.repeat(60)+'\n'+p.name+' '+p.version+'\nLicence: '+p.license+'\n';
  const repository=typeof p.repository==='string'?p.repository:p.repository?.url;
  if(repository)notice+='Repository: '+repository+'\n';
  let found=false;
  for(const name of fs.readdirSync(p.directory).filter(n=>/^(license|copying|copyrightnotice|notice)(\.|$)/i.test(n))){
   const file=path.join(p.directory,name);
   if(fs.statSync(file).isFile()){notice+='\n'+name+'\n'+fs.readFileSync(file,'utf8')+'\n';found=true;}
  }
  if(!found&&p.license==='Apache-2.0')notice+='\n'+fs.readFileSync('scripts/licenses/Apache-2.0.txt','utf8')+'\n';
  else if(!found)throw Error('Missing licence text for '+p.name);
  notice+='\n';
 }
 return notice;
}
