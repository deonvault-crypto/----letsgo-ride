const enc = new TextEncoder();
export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const emailValue = value => String(value || '').trim().toLowerCase();
export const allowedName = value => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
export const allowedEmail = value => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) && value.length <= 254;
export const allowedPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export const hex = buffer => Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join('');
export const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(value) {
 return hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}
export async function passwordHash(password, salt) {
 const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:210000,hash:'SHA-256'},key,256));
}
export function constantEqual(a,b) {
 if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
 let mismatch = 0;
 for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch === 0;
}
export function json(status, payload) {
 return new Response(JSON.stringify(payload),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'",'X-LetsGoRide-Fresh-Staging':'true'
 }});
}
export const ok = (data,status=200) => json(status,{success:true,data});
export const error = (status,message) => json(status,{success:false,error:message});
export async function bodyJson(request,maxBytes=8192) {
 const len = Number(request.headers.get('content-length') || 0);
 if (Number.isFinite(len) && len > maxBytes) throw new HttpError(413,'Request too large.');
 if (!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw new HttpError(415,'JSON request required.');
 const text = await request.text();
 if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413,'Request too large.');
 try { const data=JSON.parse(text); if(!data || Array.isArray(data) || typeof data !== 'object') throw Error(); return data; }
 catch { throw new HttpError(400,'Invalid JSON body.'); }
}
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export async function rateLimit(db,key,limit,periodMs) {
 const timestamp=now(), window=Math.floor(timestamp/periodMs)*periodMs;
 const result=await db.prepare(`INSERT INTO auth_limits(key,window_ms,hits) VALUES(?1,?2,1)
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN window_ms = excluded.window_ms THEN hits+1 ELSE 1 END,
 window_ms=excluded.window_ms RETURNING hits`).bind(key,window).first();
 if(result.hits>limit) throw new HttpError(429,'Too many requests. Try again later.');
}
export async function currentUser(request,env) {
 const header=request.headers.get('authorization') || '';
 if (!/^Bearer [0-9a-f]{64}$/i.test(header)) throw new HttpError(401,'Authentication required.');
 const token=header.slice(7);
 const hash=await sha256(token);
 const u=await env.DB.prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
 WHERE s.token_hash=? AND s.revoked_ms IS NULL AND s.expires_ms>? AND u.status='active' AND u.email_verified=1`).bind(hash,now()).first();
 if(!u) throw new HttpError(401,'Session expired.');
 return u;
}
export function publicUser(u) {
 return {id:u.id,name:u.name,email:u.email,city:u.city||undefined,role:u.role,
   email_verified:!!u.email_verified,verification_status:u.role==='driver'?'pending':'not_started'};
}
export async function requireAdmin(request,env) {
 const u=await currentUser(request,env);
 if(u.role!=='admin') throw new HttpError(403,'Admin permission required.');
 return u;
}
export async function makeSession(env,userId) {
 const token=randomHex(32);
 await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_ms,expires_ms) VALUES(?,?,?,?)')
 .bind(await sha256(token),userId,now(),now()+30*86400000).run();
 return token;
}
export async function sendEmailCode(env,email,code) {
 if(!env.RESEND_API_KEY || !env.MAIL_FROM) throw new HttpError(503,'Email verification is not configured.');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
 'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'
 },body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'LetsGoRide verification code',
 text:`Your LetsGoRide sign-in verification code is ${code}. It expires in 10 minutes. Do not share it.`})});
 if(!r.ok) throw new HttpError(503,'Email verification could not be sent.');
}
export async function issueCode(env,user) {
 if(!env.AUTH_PEPPER || env.AUTH_PEPPER.length<32) throw new HttpError(503,'Authentication is not configured.');
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
 const hash=await sha256(env.AUTH_PEPPER+':'+user.id+':'+code);
 await env.DB.prepare(`INSERT INTO email_challenges(user_id,code_hash,expires_ms,sent_ms)
 VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
 code_hash=excluded.code_hash,expires_ms=excluded.expires_ms,sent_ms=excluded.sent_ms,failed_attempts=0`)
 .bind(user.id,hash,now()+600000,now()).run();
 await sendEmailCode(env,user.email,code);
}
