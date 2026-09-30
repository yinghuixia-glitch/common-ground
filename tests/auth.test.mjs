import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {authConfig,authenticatedUser,verifyFirebaseToken} from '../src/auth.mjs';
import {handleApi} from '../src/api.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const project='drfrog-test',env={AUTH_PROVIDER:'firebase',FIREBASE_PROJECT_ID:project,FIREBASE_API_KEY:'public-test-key',FIREBASE_APP_ID:'test-app'};
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test';
const keys=createLocalJWKSet({keys:[jwk]});
async function token(overrides={}){const now=Math.floor(Date.now()/1000);return new SignJWT({sub:'member-123',email:'member@example.test',email_verified:true,iat:now,auth_time:now,exp:now+3600,iss:'https://securetoken.google.com/'+project,aud:project,...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(privateKey);}
test('verified Firebase identity uses signed claims and an isolated ID namespace',async()=>{assert.deepEqual(await verifyFirebaseToken(await token(),project,keys),{id:'firebase:member-123',email:'member@example.test'});});
test('wrong Firebase project, expired tokens, and future authentication times are rejected',async()=>{for(const override of [{aud:'other'},{iss:'https://securetoken.google.com/other'},{exp:1},{iat:Math.floor(Date.now()/1000)+100},{auth_time:Math.floor(Date.now()/1000)+100},{sub:''}])await assert.rejects(()=>token(override).then(value=>verifyFirebaseToken(value,project,keys)));});
test('email verification is required before accessing community data',async()=>{await assert.rejects(()=>token({email_verified:false}).then(value=>verifyFirebaseToken(value,project,keys)),error=>error.status===403&&error.code==='verifyEmail');});
test('a forged signature cannot establish an identity',async()=>{const other=await generateKeyPair('RS256');const forged=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(other.privateKey);await assert.rejects(()=>verifyFirebaseToken(forged,project,keys));});
test('independent authentication fails closed and ignores all platform identity headers',async()=>{assert.throws(()=>authConfig({AUTH_PROVIDER:'firebase'}),error=>error.status===503);const request=new Request('https://drfrog.example/api/me',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}});assert.equal(await authenticatedUser(request,env),null);const DB=localDatabase();try{const me=await handleApi(request,{...env,DB});assert.equal((await me.json()).signedIn,false);const questions=await handleApi(new Request('https://drfrog.example/api/questions',{headers:request.headers}),{...env,DB});assert.equal(questions.status,401);}finally{DB.close();}});
test('the public auth config contains only client identifiers',()=>{assert.deepEqual(authConfig(env),{provider:'firebase',firebase:{projectId:project,apiKey:'public-test-key',appId:'test-app',authDomain:project+'.firebaseapp.com'}});});
