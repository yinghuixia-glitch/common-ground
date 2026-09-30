import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function localDatabase(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys = ON');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  if(!sqlite.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(f)){sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES(?)').run(f);}
 }
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const r=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}
 }
 return {prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}
