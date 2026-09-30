import assert from 'node:assert/strict';
import worker from '../cloudflare-dist/_worker.js';
import {localDatabase} from './local-db.mjs';
const DB=localDatabase();
try{
 const base='https://drfrog.example';
 const missing=await worker.fetch(new Request(base+'/api/auth-config'),{DB});assert.equal(missing.status,503);
 const env={DB,AUTH_PROVIDER:'chatgpt',FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-test-key',FIREBASE_APP_ID:'test-app'};
 const config=await worker.fetch(new Request(base+'/api/auth-config'),env);assert.equal((await config.json()).provider,'firebase');
 const forged=await worker.fetch(new Request(base+'/api/me',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}}),env);assert.equal((await forged.json()).signedIn,false);
 const page=await worker.fetch(new Request(base+'/'),env);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self' https:\/\/identitytoolkit.googleapis.com https:\/\/securetoken.googleapis.com/);
 const sdk=await worker.fetch(new Request(base+'/firebase-client.js'),env);assert.equal(sdk.status,200);assert.match(await sdk.text(),/sendEmailVerification/);
 console.log('Cloudflare bundle verified: Firebase required; forged platform headers ignored; client SDK and CSP available.');
}finally{DB.close();}
