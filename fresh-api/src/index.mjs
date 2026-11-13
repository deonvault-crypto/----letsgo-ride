import {now,uid,emailValue,allowedEmail,allowedPassword,allowedName,sha256,randomHex,passwordHash,
 constantEqual,json,ok,error,bodyJson,HttpError,rateLimit,currentUser,publicUser,requireAdmin,makeSession,issueCode} from './security.mjs';
import {createQuote,requestTrip,getTrip,driverOnline,driverOffer,acceptOffer,cancelTrip,validCoordinate,dispatchOffer} from './hailing.mjs';
const iso=x=>new Date(x).toISOString();
const safeEmailPayload=email=>({email,email_verified:false,message:'If your address is eligible, check your email for a verification code.'});
async function authRegister(request,env,ip) {
 const b=await bodyJson(request),email=emailValue(b.email);
 if(!allowedEmail(email)||!allowedPassword(b.password)||b.password!==b.confirm_password||!allowedName(b.name))
 throw new HttpError(400,'Check your name, email and password (12 or more characters).');
 await rateLimit(env.DB,'register-ip:'+await sha256(ip),5,3600000);
 await rateLimit(env.DB,'register-email:'+await sha256(email),3,3600000);
 const existing=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
 if(existing)return safeEmailPayload(email);
 const salt=randomHex(16),timestamp=now(),userId=uid();
 await env.DB.prepare(`INSERT INTO users(id,name,email,password_salt,password_hash,city,created_ms,updated_ms)
 VALUES(?,?,?,?,?,?,?,?)`).bind(userId,b.name.trim(),email,salt,await passwordHash(b.password,salt),
 typeof b.city==='string'?b.city.slice(0,80):null,timestamp,timestamp).run();
 await issueCode(env,{id:userId,email});
 return safeEmailPayload(email);
}
async function resendCode(request,env,ip) {
 const b=await bodyJson(request),email=emailValue(b.email);
 if(!allowedEmail(email))throw new HttpError(400,'Valid email required.');
 await rateLimit(env.DB,'resend-ip:'+await sha256(ip),5,3600000);
 await rateLimit(env.DB,'resend-email:'+await sha256(email),3,3600000);
 const user=await env.DB.prepare('SELECT id,email FROM users WHERE email=? AND email_verified=0 AND status=?').bind(email,'active').first();
 if(user)await issueCode(env,user);
 return safeEmailPayload(email);
}
async function verifyEmail(request,env,ip) {
 const b=await bodyJson(request),email=emailValue(b.email),code=String(b.code||'');
 if(!allowedEmail(email)||!/^[0-9]{6}$/.test(code))throw new HttpError(400,'Invalid or expired verification code.');
 await rateLimit(env.DB,'verify-ip:'+await sha256(ip),20,3600000);
 const row=await env.DB.prepare(`SELECT u.id,u.email,c.code_hash,c.expires_ms,c.failed_attempts FROM users u
 JOIN email_challenges c ON c.user_id=u.id WHERE u.email=? AND u.email_verified=0 AND u.status='active'`).bind(email).first();
 if(!row||row.expires_ms<=now()||row.failed_attempts>=5)throw new HttpError(400,'Invalid or expired verification code.');
 // Increment before comparison so even racing wrong attempts are bounded by SQL.
 const limited=await env.DB.prepare(`UPDATE email_challenges SET failed_attempts=failed_attempts+1
 WHERE user_id=? AND failed_attempts<5 AND expires_ms>? RETURNING failed_attempts`).bind(row.id,now()).first();
 if(!limited)throw new HttpError(400,'Invalid or expired verification code.');
 const candidate=await sha256(env.AUTH_PEPPER+':'+row.id+':'+code);
 if(!constantEqual(candidate,row.code_hash))throw new HttpError(400,'Invalid or expired verification code.');
 await env.DB.batch([
  env.DB.prepare('UPDATE users SET email_verified=1,updated_ms=? WHERE id=? AND status=?').bind(now(),row.id,'active'),
  env.DB.prepare('DELETE FROM email_challenges WHERE user_id=?').bind(row.id)
 ]);
 const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.id).first();
 return {email,email_verified:true,message:'Email verified.',token:await makeSession(env,row.id),user:publicUser(user)};
}
async function emailLogin(request,env,ip) {
 const b=await bodyJson(request),email=emailValue(b.email);
 if(!allowedEmail(email)||typeof b.password!=='string'||b.password.length>128||b.password.length===0)throw new HttpError(401,'Invalid email or password.');
 await rateLimit(env.DB,'login-ip:'+await sha256(ip),20,3600000);
 await rateLimit(env.DB,'login-email:'+await sha256(email),10,3600000);
 const user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
 const salt=user?.password_salt||'00000000000000000000000000000000';
 const h=await passwordHash(b.password,salt);
 if(!user||!constantEqual(h,user.password_hash)||user.status!=='active')
 throw new HttpError(401,'Invalid email or password.');
 if(!user.email_verified)throw new HttpError(403,'Please verify your email before logging in.');
 return {token:await makeSession(env,user.id),user:publicUser(user)};
}
async function submitDriverApplication(request,env,user) {
 const b=await bodyJson(request);
 const make=String(b.vehicle_make||'').trim(),model=String(b.vehicle_model||'').trim();
 const plate=String(b.plate_number||'').trim().toUpperCase();
 if(make.length<2||make.length>80||model.length<1||model.length>80||
 plate.length<3||plate.length>20||!['ECONOMY','COMFORT','XL'].includes(b.ride_class))
 throw new HttpError(400,'Valid vehicle details are required.');
 const existing=await env.DB.prepare('SELECT status FROM driver_applications WHERE user_id=?').bind(user.id).first();
 if(existing && existing.status==='approved')throw new HttpError(409,'Driver already approved.');
 await env.DB.prepare(`INSERT INTO driver_applications(user_id,status,vehicle_make,vehicle_model,plate_number,ride_class,city_id,submitted_ms)
 VALUES(?,'pending_documents',?,?,?,?,'ZW-HRE',?)
 ON CONFLICT(user_id) DO UPDATE SET status='pending_documents',vehicle_make=excluded.vehicle_make,
 vehicle_model=excluded.vehicle_model,plate_number=excluded.plate_number,
 ride_class=excluded.ride_class,documents_verified=0,reviewed_by=NULL,reviewed_ms=NULL,submitted_ms=excluded.submitted_ms`)
 .bind(user.id,make,model,plate,b.ride_class,now()).run();
 return {user_id:user.id,status:'pending_documents',message:'Documents and review are required before driving.'};
}
async function adminOverview(db) {
 const [users,drivers,pending,rides]=await Promise.all([
  db.prepare("SELECT count(*) n FROM users WHERE status!='deleted'").first(),
  db.prepare("SELECT count(*) n FROM driver_applications WHERE status='approved' AND documents_verified=1").first(),
  db.prepare("SELECT count(*) n FROM driver_applications WHERE status IN ('pending_documents','needs_review')").first(),
  db.prepare("SELECT count(*) n FROM trips").first()
 ]);
 return {users:users.n,total_users:users.n,verified_drivers:drivers.n,pending_driver_verifications:pending.n,
 rides:rides.n,active_rides:0,requests:0,pending_ride_requests:0,confirmed_bookings:0,
 pending_verifications:pending.n,support_messages:0,open_support_cases:0,safety_reports:0,
 open_safety_reports:0,unread_admin_notifications:0,recent_activity:[]};
}
async function listVerifications(db) {
 const {results}=await db.prepare(`SELECT a.*,u.name,u.email FROM driver_applications a JOIN users u ON u.id=a.user_id
 WHERE a.status IN ('pending_documents','needs_review') ORDER BY a.submitted_ms DESC LIMIT 100`).all();
 return {count:results.length,items:results.map(r=>({id:r.user_id,driver_id:r.user_id,user_id:r.user_id,
 name:r.name,email:r.email,verification_status:r.status,verified:false,submitted_at:iso(r.submitted_ms)}))};
}
async function adminReview(request,env,admin,id) {
 if(admin.id===id)throw new HttpError(403,'Cannot review own application.');
 const b=await bodyJson(request);
 if(!['approved','rejected','needs_review','needs_resubmission'].includes(b.status))
 throw new HttpError(400,'Unsupported review status.');
 const profile=await env.DB.prepare('SELECT * FROM driver_applications WHERE user_id=?').bind(id).first();
 if(!profile)throw new HttpError(404,'Driver application not found.');
 if(b.status==='approved' && (!profile.documents_verified || profile.status==='pending_documents'))
 throw new HttpError(409,'Documents must be securely received and reviewed before approval.');
 const status=b.status==='needs_resubmission'?'pending_documents':b.status;
 const stamp=now();
 await env.DB.batch([
  env.DB.prepare(`UPDATE driver_applications SET status=?,review_notes=?,reviewed_by=?,reviewed_ms=?
  WHERE user_id=?`).bind(status,String(b.admin_verification_notes||b.rejection_reason||'').slice(0,500),admin.id,stamp,id),
  env.DB.prepare(`INSERT INTO admin_audit(id,actor_user_id,action,target_id,details_json,created_ms)
  VALUES(?,?,?,?,?,?)`).bind(uid(),admin.id,'driver.verification.review',id,JSON.stringify({status}),stamp)
 ]);
 if(status==='approved')await env.DB.prepare("UPDATE users SET role='driver',updated_ms=? WHERE id=?").bind(stamp,id).run();
 return {driver_id:id,user_id:id,verification_status:status,verified:status==='approved'};
}
export default {
 async fetch(request,env) {
  try {
   const path=new URL(request.url).pathname,method=request.method;
   if(method==='GET'&&path==='/health/live')return ok({service:'LetsGoRide fresh-start staging',status:'alive',production_ready:false});
   if(method==='GET'&&path==='/health/ready')return json(503,{success:false,
    data:{service:'LetsGoRide fresh-start staging',status:'blocked',production_ready:false,
    reason:'api_contract_security_routing_payment_and_mobile_gates_not_complete'}});
   // All business routes fail closed without explicit staging configuration.
   if(!env?.DB || typeof env.DB.prepare!=='function'||env.FRESH_START_STAGING!=='true'
   ||!env.AUTH_PEPPER||env.AUTH_PEPPER.length<32)throw new HttpError(503,'Fresh-start staging is not configured.');
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   if(method==='POST'&&path==='/auth/email-register')return ok(await authRegister(request,env,ip),201);
   if(method==='POST'&&path==='/auth/resend-email-verification')return ok(await resendCode(request,env,ip));
   if(method==='POST'&&path==='/auth/verify-email')return ok(await verifyEmail(request,env,ip));
   if(method==='POST'&&path==='/auth/email-login')return ok(await emailLogin(request,env,ip));
   if(method==='GET'&&path==='/hailing/config')return ok({enabled:env.SIMULATED_RIDES==='true',
    currency:'USD',ride_classes:['ECONOMY','COMFORT','XL'].map(id=>({id,label:id,enabled:true})),
    cash_enabled:true,digital_payments:[]});
   if(method==='GET'&&path==='/payments/config')return ok({card_enabled:false,provider:null,currency:'USD'});
   const user=await currentUser(request,env);
   if(method==='GET'&&path==='/auth/me')return ok(publicUser(user));
   if(method==='POST'&&path==='/auth/logout'){
    const hash=await sha256(request.headers.get('authorization').slice(7));
    await env.DB.prepare('UPDATE sessions SET revoked_ms=? WHERE token_hash=?').bind(now(),hash).run();
    return ok({logged_out:true});
   }
   if(method==='POST'&&path==='/auth/work-mode'){
    const b=await bodyJson(request);
    if(b.role!=='driver')throw new HttpError(403,'This work mode is not yet available.');
    const p=await env.DB.prepare(`SELECT 1 as ok FROM driver_applications WHERE user_id=? AND status='approved' AND documents_verified=1`).bind(user.id).first();
    if(!p)throw new HttpError(403,'Verified driver approval required.');
    await env.DB.prepare("UPDATE users SET role='driver' WHERE id=?").bind(user.id).run();
    return ok(publicUser({...user,role:'driver'}));
   }
   if(method==='POST'&&path==='/drivers/application')return ok(await submitDriverApplication(request,env,user),201);
   if(method==='POST'&&path==='/hailing/quotes')return ok(await createQuote(env,user,await bodyJson(request)),201);
   if(method==='POST'&&path==='/hailing/trips')return ok(await requestTrip(env,user,await bodyJson(request)),201);
   if(method==='GET'&&path==='/hailing/trips/active'){
    const row=await env.DB.prepare(`SELECT id FROM trips WHERE (passenger_id=? OR driver_id=?)
    AND status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS') ORDER BY created_ms DESC LIMIT 1`).bind(user.id,user.id).first();
    if(!row)return ok(null);
    const timestamp=now();
    await env.DB.prepare(`UPDATE trips SET status='NO_DRIVER_FOUND',payment_status='cancelled',updated_ms=?
     WHERE id=? AND status='SEARCHING' AND search_expires_ms<=?`).bind(timestamp,row.id,timestamp).run();
    const active=await getTrip(env.DB,user,row.id);
    if(active.status==='NO_DRIVER_FOUND')return ok(null);
    if(active.status==='SEARCHING'&&env.SIMULATED_RIDES==='true')await dispatchOffer(env.DB,row.id,timestamp);
    return ok(active);
   }
   const trip=path.match(new RegExp('^/hailing/trips/([0-9a-f-]+)$'));
   if(method==='GET'&&trip)return ok(await getTrip(env.DB,user,trip[1]));
   const cancel=path.match(new RegExp('^/hailing/trips/([0-9a-f-]+)/cancel$'));
   if(method==='POST'&&cancel)return ok(await cancelTrip(env,user,cancel[1]));
   if(method==='POST'&&path==='/hailing/driver/online')return ok(await driverOnline(env,user,await bodyJson(request)));
   if(method==='GET'&&path==='/hailing/driver/offer')return ok(await driverOffer(env,user));
   const accept=path.match(new RegExp('^/hailing/offers/([0-9a-f-]+)/accept$'));
   if(method==='POST'&&accept)return ok(await acceptOffer(env,user,accept[1]));
   if(method==='POST'&&path==='/hailing/driver/offline'){
    const active=await env.DB.prepare("SELECT 1 FROM trips WHERE driver_id=? AND status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')").bind(user.id).first();
    if(active)throw new HttpError(409,'Cannot go offline during an active ride.');
    await env.DB.prepare("UPDATE driver_presence SET status='offline' WHERE user_id=?").bind(user.id).run();
    return ok({status:'offline'});
   }
   if(method==='POST'&&path==='/hailing/driver/presence'){
    const b=await bodyJson(request);
    if(!validCoordinate(b.location))throw new HttpError(400,'Invalid location.');
    await env.DB.prepare(`UPDATE driver_presence SET latitude=?,longitude=?,last_seen_ms=?
    WHERE user_id=? AND status='available'`).bind(b.location.latitude,b.location.longitude,now(),user.id).run();
    return ok({status:'available',last_seen_at:iso(now())});
   }
   if(path.startsWith('/admin/')) {
    if(user.role!=='admin')throw new HttpError(403,'Admin permission required.');
    if(method==='GET'&&path==='/admin/overview')return ok(await adminOverview(env.DB));
    if(method==='GET'&&path==='/admin/verifications')return ok(await listVerifications(env.DB));
    const review=path.match(new RegExp('^/admin/verifications/([0-9a-f-]+)/status$'));
    if(method==='PATCH'&&review)return ok(await adminReview(request,env,user,review[1]));
    if(method==='GET'&&path==='/admin/hailing/drivers'){
     const {results}=await env.DB.prepare(`SELECT a.*,u.name FROM driver_applications a JOIN users u ON u.id=a.user_id LIMIT 100`).all();
     return ok(results.map(r=>({id:r.user_id,user_id:r.user_id,name:r.name,city:'Harare',
     verified:r.status==='approved'&&!!r.documents_verified,verification_status:r.status,
     hailing_enabled:r.status==='approved'&&!!r.documents_verified,
     approved_hailing_city_ids:r.status==='approved'? [r.city_id]:[],
     approved_hailing_classes:r.status==='approved'?[r.ride_class]:[]})));
    }
    if(method==='GET'&&path==='/admin/audit-logs'){
     const {results}=await env.DB.prepare('SELECT * FROM admin_audit ORDER BY created_ms DESC LIMIT 100').all();
     return ok({count:results.length,items:results.map(x=>({id:x.id,actor_user_id:x.actor_user_id,
     action:x.action,target_type:'driver',target_id:x.target_id,metadata:JSON.parse(x.details_json),created_at:iso(x.created_ms)}))});
    }
   }
   throw new HttpError(503,'Endpoint not migrated. Do not connect production mobile clients.');
  } catch(e) {
   if(e instanceof HttpError)return error(e.status,e.message);
   // Fail closed and do not leak SQL, tokens, or email provider responses.
   return error(500,'Staging request failed.');
  }
 }
};
