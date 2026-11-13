import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import worker from '../src/index.mjs';
import {allowedEmail,allowedPassword,sha256,passwordHash,makeSession,uid} from '../src/security.mjs';
import {distanceKm} from '../src/hailing.mjs';

test('normalization and geographic validation',()=>{
 assert.equal(allowedEmail('test@example.com'),true);
 assert.equal(allowedEmail('missing-at'),false);
 assert.equal(allowedEmail('bad name@example.com'),false);
 assert.equal(allowedPassword('long-secure-password'),true);
 assert.equal(allowedPassword('short'),false);
 assert.equal(distanceKm({latitude:-17.8292,longitude:31.0522},{latitude:-17.8292,longitude:31.0522}),0);
});
test('the staging Worker never signals production readiness',async()=>{
 const live=await worker.fetch(new Request('https://local/health/live'),{});
 const ready=await worker.fetch(new Request('https://local/health/ready'),{});
 assert.equal(live.status,200);
 assert.equal(ready.status,503);
 assert.equal((await ready.json()).data.production_ready,false);
 const protectedRoute=await worker.fetch(new Request('https://local/auth/me'),{});
 assert.equal(protectedRoute.status,503);
});
let runtime, db, env;
const secret='this-test-pepper-is-long-and-not-a-production-secret';
const appRequest=(path,method='GET',data=null,token=null)=>{
 const headers={};
 if(data!==null)headers['content-type']='application/json';
 if(token)headers.authorization='Bearer '+token;
 return worker.fetch(new Request('https://local'+path,{method,headers,
 body:data===null?undefined:JSON.stringify(data)}),env);
};
const asUser=async ({email,role='passenger',name='Test Rider',verified=1})=>{
 const id=uid(),salt='a'.repeat(32),hash=await passwordHash('large-valid-password',salt);
 await db.prepare(`INSERT INTO users(id,name,email,password_salt,password_hash,email_verified,role,status,created_ms,updated_ms)
 VALUES(?,?,?,?,?,?,?,'active',?,?)`).bind(id,name,email,salt,hash,verified,role,Date.now(),Date.now()).run();
 return {id,email,token:verified?await makeSession(env,id):null};
};
before(async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 runtime=new Miniflare({scriptPath:root+'src/index.mjs',modules:true,
 modulesRoot:root,compatibilityDate:'2026-07-29',d1Databases:['DB']});
 db=await runtime.getD1Database('DB');
 const sql=(await readFile(new URL('../migrations/0001_fresh_start.sql',import.meta.url),'utf8'))
 .replace(/^PRAGMA foreign_keys = ON;\s*/m,'');
 // The statements contain no triggers and are safe to split at semicolons.
 for(const statement of sql.split(/;\n(?=\s*(?:--|CREATE|$))/).map(x=>x.trim()).filter(Boolean))
 await db.prepare(statement).run();
 await db.prepare(await readFile(new URL('../migrations/0002_offer_expiry.sql',import.meta.url),'utf8')).run();
 env={DB:db,AUTH_PEPPER:secret,FRESH_START_STAGING:'true',SIMULATED_RIDES:'true'};
});
after(async()=>{await runtime?.dispose();});
test('registration verification is required and admin role cannot self-register',async()=>{
 const email='new@example.com',p=await asUser({email,verified:0});
 const loginBefore=await appRequest('/auth/email-login','POST',{email,password:'large-valid-password'});
 assert.equal(loginBefore.status,403);
 const challenge='123456',challengeHash=await sha256(secret+':'+p.id+':'+challenge);
 await db.prepare('INSERT INTO email_challenges(user_id,code_hash,expires_ms,sent_ms) VALUES(?,?,?,?)')
 .bind(p.id,challengeHash,Date.now()+300000,Date.now()).run();
 const bad=await appRequest('/auth/verify-email','POST',{email,code:'222222'});
 assert.equal(bad.status,400);
 const verified=await appRequest('/auth/verify-email','POST',{email,code:challenge});
 assert.equal(verified.status,200);
 const data=(await verified.json()).data;
 assert.equal(data.user.role,'passenger');
 assert.ok(data.token.length===64);
 const me=await appRequest('/auth/me','GET',null,data.token);
 assert.equal((await me.json()).data.email,email);
 const logout=await appRequest('/auth/logout','POST',{},data.token);
 assert.equal(logout.status,200);
 assert.equal((await appRequest('/auth/me','GET',null,data.token)).status,401);
});
test('cash-only passenger-driver offer and admin approval guard',async()=>{
 const passenger=await asUser({email:'passenger@example.com'});
 const driver=await asUser({email:'driver@example.com',role:'driver',name:'Test Driver'});
 const admin=await asUser({email:'admin@example.com',role:'admin',name:'Test Admin'});
 const stranger=await asUser({email:'stranger@example.com'});
 await db.prepare(`INSERT INTO driver_applications(user_id,status,vehicle_make,vehicle_model,plate_number,ride_class,
 city_id,documents_verified,submitted_ms)
 VALUES(?,'pending_documents','Toyota','Corolla','A123BC','ECONOMY','ZW-HRE',0,?)`).bind(driver.id,Date.now()).run();
 assert.equal((await appRequest('/admin/overview','GET',null,passenger.token)).status,403);
 const approval=await appRequest('/admin/verifications/'+driver.id+'/status','PATCH',{status:'approved'},admin.token);
 assert.equal(approval.status,409,'Driver cannot be approved without document verification');
 // Test-only fixture: simulate an independently completed private-document review.
 await db.prepare(`UPDATE driver_applications SET status='needs_review',documents_verified=1 WHERE user_id=?`).bind(driver.id).run();
 const approved=await appRequest('/admin/verifications/'+driver.id+'/status','PATCH',{status:'approved'},admin.token);
 assert.equal(approved.status,200);
 const online=await appRequest('/hailing/driver/online','POST',{city_id:'ZW-HRE',ride_class:'ECONOMY',
 location:{latitude:-17.8292,longitude:31.0522}},driver.token);
 assert.equal(online.status,200);
 const pickup={latitude:-17.8292,longitude:31.0522,formatted_address:'Harare test pickup'};
 const dropoff={latitude:-17.84,longitude:31.06,formatted_address:'Harare test dropoff'};
 const q=await appRequest('/hailing/quotes','POST',{pickup,dropoff,ride_class:'ECONOMY'},passenger.token);
 assert.equal(q.status,201);
 const quote=(await q.json()).data;
 assert.equal(quote.simulated,true);
 const invalidCard=await appRequest('/hailing/trips','POST',{quote_id:quote.quote_id,
 client_request_id:'card-fails',payment_method:'card'},passenger.token);
 assert.equal(invalidCard.status,503);
 const request={quote_id:quote.quote_id,client_request_id:'one-idempotent-request',payment_method:'cash'};
 const tripResponse=await appRequest('/hailing/trips','POST',request,passenger.token);
 assert.equal(tripResponse.status,201);
 const trip=(await tripResponse.json()).data;
 assert.equal(trip.status,'SEARCHING');
 const retry=await appRequest('/hailing/trips','POST',request,passenger.token);
 assert.equal((await retry.json()).data.id,trip.id);
 assert.equal((await appRequest('/hailing/trips/'+trip.id,'GET',null,stranger.token)).status,404);
 const offerRes=await appRequest('/hailing/driver/offer','GET',null,driver.token);
 assert.equal(offerRes.status,200);
 const offer=(await offerRes.json()).data;
 assert.equal(offer.trip.id,trip.id);
 const acceptPath='/hailing/offers/'+offer.offer.id+'/accept';
 await db.prepare("UPDATE driver_applications SET documents_verified=0 WHERE user_id=?").bind(driver.id).run();
 assert.equal((await appRequest(acceptPath,'POST',{},driver.token)).status,409);
 await db.prepare("UPDATE driver_applications SET documents_verified=1 WHERE user_id=?").bind(driver.id).run();
 const accepts=await Promise.all([1,2].map(()=>appRequest(acceptPath,'POST',{},driver.token)));
 assert.deepEqual(accepts.map(response=>response.status).sort(),[200,409]);
 const accepted=accepts.find(response=>response.status===200);
 assert.equal(accepted.status,200);
 assert.equal((await accepted.json()).data.driver_user_id,driver.id);
 const replay=await appRequest('/hailing/offers/'+offer.offer.id+'/accept','POST',{},driver.token);
 assert.equal(replay.status,409);
 const cancellation=await appRequest('/hailing/trips/'+trip.id+'/cancel','POST',{},passenger.token);
 assert.equal(cancellation.status,200);
 assert.equal((await cancellation.json()).data.status,'CANCELLED_BY_PASSENGER');
 assert.equal(await db.prepare("SELECT status FROM driver_presence WHERE user_id=?").bind(driver.id).first('status'),'available');
 await db.prepare("UPDATE quotes SET expires_ms=created_ms WHERE id=?").bind(quote.quote_id).run();
 const afterExpiry=await appRequest('/hailing/trips','POST',request,passenger.token);
 assert.equal((await afterExpiry.json()).data.id,trip.id);
 const conflict=await appRequest('/hailing/trips','POST',{...request,quote_id:'different'},passenger.token);
 assert.equal(conflict.status,409);
 const next=await appRequest('/hailing/quotes','POST',{pickup,dropoff,ride_class:'ECONOMY'},passenger.token);
 const nextQuote=(await next.json()).data.quote_id;
 const nextTrip=await appRequest('/hailing/trips','POST',{...request,quote_id:nextQuote,client_request_id:'next-ride'},passenger.token);
 const nextId=(await nextTrip.json()).data.id;
 await db.prepare("UPDATE dispatch_offers SET expires_ms=0 WHERE trip_id=?").bind(nextId).run();
 await appRequest('/hailing/trips/active','GET',null,passenger.token);
 assert.equal(await db.prepare("SELECT status FROM dispatch_offers WHERE trip_id=?").bind(nextId).first('status'),'expired');
 await db.prepare("UPDATE trips SET search_expires_ms=0 WHERE id=?").bind(nextId).run();
 assert.equal((await (await appRequest('/hailing/trips/active','GET',null,passenger.token)).json()).data,null);
 const audits=await appRequest('/admin/audit-logs','GET',null,admin.token);
 assert.equal((await audits.json()).data.count,1);
});
