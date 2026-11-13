import {HttpError, uid, now} from './security.mjs';
const classes=['ECONOMY','COMFORT','XL'];
const EARTH_RADIUS=6371.0088;
const toRad=x=>x*Math.PI/180;
export function distanceKm(a,b) {
 const dlat=toRad(b.latitude-a.latitude), dlon=toRad(b.longitude-a.longitude);
 const h=Math.sin(dlat/2)**2+Math.cos(toRad(a.latitude))*Math.cos(toRad(b.latitude))*Math.sin(dlon/2)**2;
 return 2*EARTH_RADIUS*Math.asin(Math.sqrt(Math.min(h,1)));
}
export function validCoordinate(c) {
 return c && typeof c==='object' && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)
 && c.latitude>=-90 && c.latitude<=90 && c.longitude>=-180 && c.longitude<=180;
}
function place(p) {
 if(!validCoordinate(p) || typeof p.formatted_address!=='string' || !p.formatted_address.trim()
 || p.formatted_address.length>200) throw new HttpError(400,'Invalid pickup or dropoff.');
 return {formatted_address:p.formatted_address,latitude:p.latitude,longitude:p.longitude,
 place_id:typeof p.place_id==='string'?p.place_id:null};
}
const parse=x=>JSON.parse(x);
const iso=x=>new Date(x).toISOString();
export function publicTrip(row,quote) {
 const q=quote || row;
 return {id:row.id,status:row.status,city_id:'ZW-HRE',passenger_user_id:row.passenger_id,
  driver_user_id:row.driver_id||null,ride_class:q.ride_class,payment_method:'cash',
  payment_status:row.payment_status,verify_ride_with_pin:true,
  pickup:parse(q.pickup_json),dropoff:parse(q.dropoff_json),route:parse(q.route_json),
  fare:parse(q.fare_json),search_expires_at:iso(row.search_expires_ms),
  created_at:iso(row.created_ms),updated_at:iso(row.updated_ms),
  assigned_at:row.assigned_ms?iso(row.assigned_ms):null,
  completed_at:row.completed_ms?iso(row.completed_ms):null};
}
async function tripRow(db,id) {
 return db.prepare('SELECT t.*,q.ride_class,q.pickup_json,q.dropoff_json,q.route_json,q.fare_json FROM trips t JOIN quotes q ON q.id=t.quote_id WHERE t.id=?').bind(id).first();
}
export async function getTrip(db,user,id) {
 const row=await tripRow(db,id);
 if(!row || (user.role!=='admin' && row.passenger_id!==user.id && row.driver_id!==user.id))
 throw new HttpError(404,'Trip not found.');
 return publicTrip(row);
}
export async function createQuote(env,user,data) {
 // Estimates are synthetic; never use straight-line distances as real road quotes.
 if(env.FRESH_START_STAGING!=='true' || env.SIMULATED_RIDES!=='true')
 throw new HttpError(503,'Road pricing is not connected.');
 const pickup=place(data.pickup), dropoff=place(data.dropoff), rideClass=data.ride_class;
 if(!classes.includes(rideClass)) throw new HttpError(400,'Unsupported ride class.');
 const distance=distanceKm(pickup,dropoff);
 if(distance<0.25 || distance>100) throw new HttpError(400,'Trip distance outside staging bounds.');
 const quoteId=uid(),timestamp=now();
 const duration=Math.ceil(distance/0.45);
 const rate={ECONOMY:0.75,COMFORT:1.2,XL:1.6}[rideClass];
 const total=Number((2+distance*rate).toFixed(2));
 const fare={currency:'USD',ride_class:rideClass,base_fare:2,distance_fare:total-2,time_fare:0,
 booking_fee:0,surge_multiplier:1,total_fare:total,estimated_driver_earnings:total,
 platform_commission:0,platform_commission_percent:0,high_demand:false};
 const route={distance_km:Number(distance.toFixed(2)),duration_minutes:duration};
 await env.DB.prepare(`INSERT INTO quotes(id,passenger_id,ride_class,pickup_json,dropoff_json,route_json,fare_json,created_ms,expires_ms)
 VALUES(?,?,?,?,?,?,?,?,?)`).bind(quoteId,user.id,rideClass,JSON.stringify(pickup),JSON.stringify(dropoff),
 JSON.stringify(route),JSON.stringify(fare),timestamp,timestamp+300000).run();
 return {quote_id:quoteId,city_id:'ZW-HRE',currency:'USD',ride_class:rideClass,
 pickup,dropoff,route,fare,expires_at:iso(timestamp+300000),simulated:true};
}
export async function dispatchOffer(db,tripId,timestamp) {
 const trip=await tripRow(db,tripId);
 if(!trip || trip.status!=='SEARCHING' || trip.search_expires_ms<=timestamp)return null;
 await db.prepare("UPDATE dispatch_offers SET status='expired' WHERE status='pending' AND expires_ms<=?").bind(timestamp).run();
 const pickup=parse(trip.pickup_json), candidates=await db.prepare(`
 SELECT p.user_id,p.latitude,p.longitude FROM driver_presence p
 JOIN driver_applications a ON a.user_id=p.user_id JOIN users u ON u.id=p.user_id
 WHERE p.status='available' AND p.last_seen_ms>? AND a.status='approved'
 AND a.documents_verified=1 AND a.ride_class=? AND u.status='active' AND u.email_verified=1
 AND NOT EXISTS(SELECT 1 FROM trips t WHERE t.driver_id=p.user_id AND t.status IN
 ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))
 AND NOT EXISTS(SELECT 1 FROM dispatch_offers o WHERE o.driver_id=p.user_id AND (o.status='pending' OR o.trip_id=?))
 ORDER BY p.last_seen_ms DESC LIMIT 40`).bind(timestamp-75000,trip.ride_class,tripId).all();
 const ranked=(candidates.results||[]).map(d=>({...d,distance:distanceKm(pickup,d)}))
 .filter(d=>d.distance<=20).sort((a,b)=>a.distance-b.distance);
 for(const d of ranked) {
  const id=uid();
  const r=await db.prepare(`INSERT OR IGNORE INTO dispatch_offers(id,trip_id,driver_id,status,expires_ms)
 SELECT ?,?,?, 'pending',? WHERE EXISTS
 (SELECT 1 FROM trips WHERE id=? AND status='SEARCHING' AND search_expires_ms>?)`)
 .bind(id,tripId,d.user_id,Math.min(timestamp+25000,trip.search_expires_ms),tripId,timestamp).run();
  if(r.meta.changes===1)return id;
 }
 return null;
}
export async function requestTrip(env,user,data) {
 if(env.FRESH_START_STAGING!=='true' || env.SIMULATED_RIDES!=='true')
 throw new HttpError(503,'Ride creation is disabled.');
 if(data.payment_method && data.payment_method!=='cash') throw new HttpError(503,'Card payments are disabled.');
 const key=String(data.client_request_id||'');
 if(!key || key.length>100) throw new HttpError(400,'A client request ID is required.');
 const prior=await env.DB.prepare('SELECT id,quote_id FROM trips WHERE passenger_id=? AND client_request_id=?').bind(user.id,key).first();
 if(prior){
  if(prior.quote_id!==data.quote_id)throw new HttpError(409,'Client request ID belongs to a different quote.');
  return getTrip(env.DB,user,prior.id);
 }
 const quote=await env.DB.prepare('SELECT * FROM quotes WHERE id=? AND passenger_id=? AND expires_ms>?')
  .bind(data.quote_id,user.id,now()).first();
 if(!quote) throw new HttpError(400,'Quote is missing or expired.');
 const timestamp=now(),id=uid();
 const r=await env.DB.prepare(`INSERT INTO trips(id,passenger_id,quote_id,client_request_id,status,created_ms,updated_ms,search_expires_ms)
 VALUES(?,?,?,?,'SEARCHING',?,?,?)
 ON CONFLICT DO NOTHING RETURNING id`)
 .bind(id,user.id,quote.id,key,timestamp,timestamp,timestamp+90000).first();
 if(r){
  await dispatchOffer(env.DB,id,timestamp);
  return getTrip(env.DB,user,id);
 }
 const winner=await env.DB.prepare('SELECT id,quote_id FROM trips WHERE passenger_id=? AND client_request_id=?').bind(user.id,key).first();
 if(winner?.quote_id===quote.id)return getTrip(env.DB,user,winner.id);
 throw new HttpError(409,'An active trip or conflicting request already exists.');
}
export async function driverOnline(env,user,data) {
 const profile=await env.DB.prepare(`SELECT * FROM driver_applications WHERE user_id=? AND status='approved' AND documents_verified=1`).bind(user.id).first();
 if(!profile) throw new HttpError(403,'Verified driver approval required.');
 if(!validCoordinate(data.location)||data.city_id!==profile.city_id||data.ride_class!==profile.ride_class)
 throw new HttpError(400,'Invalid driver service area or location.');
 await env.DB.prepare(`INSERT INTO driver_presence(user_id,status,latitude,longitude,last_seen_ms)
 VALUES(?,'available',?,?,?) ON CONFLICT(user_id) DO UPDATE SET status='available',
 latitude=excluded.latitude,longitude=excluded.longitude,last_seen_ms=excluded.last_seen_ms`)
 .bind(user.id,data.location.latitude,data.location.longitude,now()).run();
 return {status:'available',city_id:profile.city_id,ride_class:profile.ride_class,last_seen_at:iso(now())};
}
export async function driverOffer(env,user) {
 const offer=await env.DB.prepare(`SELECT o.*,t.quote_id FROM dispatch_offers o
 JOIN trips t ON t.id=o.trip_id WHERE o.driver_id=? AND o.status='pending'
 AND o.expires_ms>? AND t.status='SEARCHING' ORDER BY o.expires_ms LIMIT 1`).bind(user.id,now()).first();
 if(!offer)return null;
 return {offer:{id:offer.id,trip_id:offer.trip_id,status:offer.status,expires_at:iso(offer.expires_ms)},
 trip:await getTrip(env.DB,user,offer.trip_id).catch(async()=>{const t=await tripRow(env.DB,offer.trip_id);return publicTrip(t);})};
}
export async function acceptOffer(env,user,offerId) {
 const timestamp=now();
 const [trip,marked]=await env.DB.batch([
  env.DB.prepare(`UPDATE trips SET driver_id=?,status='DRIVER_ASSIGNED',assigned_ms=?,updated_ms=?
 WHERE status='SEARCHING' AND search_expires_ms>?
 AND id=(SELECT trip_id FROM dispatch_offers WHERE id=? AND driver_id=? AND status='pending' AND expires_ms>?)
 AND EXISTS (SELECT 1 FROM driver_presence p JOIN driver_applications a ON a.user_id=p.user_id
 JOIN users u ON u.id=p.user_id JOIN quotes q ON q.id=trips.quote_id
 WHERE p.user_id=? AND p.status='available' AND p.last_seen_ms>?
 AND a.status='approved' AND a.documents_verified=1 AND a.ride_class=q.ride_class
 AND u.status='active' AND u.email_verified=1)
 AND NOT EXISTS (SELECT 1 FROM trips active WHERE active.driver_id=? AND active.status IN
 ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')) RETURNING id`).bind(user.id,timestamp,timestamp,timestamp,offerId,user.id,timestamp,user.id,timestamp-75000,user.id),
  env.DB.prepare(`UPDATE dispatch_offers SET status='accepted'
 WHERE id=? AND driver_id=? AND status='pending' AND changes()=1`).bind(offerId,user.id),
  env.DB.prepare("UPDATE driver_presence SET status='on_trip' WHERE user_id=? AND changes()=1").bind(user.id)
 ]);
 if(!trip.results?.length || marked.meta.changes!==1)throw new HttpError(409,'Offer is no longer available.');
 return getTrip(env.DB,user,trip.results[0].id);
}
export async function cancelTrip(env,user,id) {
 const timestamp=now();
 const [cancelled]=await env.DB.batch([
  env.DB.prepare(`UPDATE trips SET status='CANCELLED_BY_PASSENGER',payment_status='cancelled',updated_ms=?
 WHERE id=? AND passenger_id=? AND status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED') RETURNING id`)
 .bind(timestamp,id,user.id),
  env.DB.prepare(`UPDATE driver_presence SET status='available' WHERE status='on_trip' AND changes()=1
 AND user_id=(SELECT driver_id FROM trips WHERE id=?)`).bind(id),
  env.DB.prepare(`UPDATE dispatch_offers SET status='cancelled' WHERE trip_id=? AND status='pending'
 AND EXISTS (SELECT 1 FROM trips WHERE id=? AND passenger_id=? AND status='CANCELLED_BY_PASSENGER')`).bind(id,id,user.id)
 ]);
 if(!cancelled.results.length)throw new HttpError(409,'Trip cannot be cancelled in its current state.');
 return getTrip(env.DB,user,id);
}
