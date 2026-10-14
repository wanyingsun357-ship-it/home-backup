'use strict';
const crypto=require('crypto');
function createReplay({maxBytes=16*1024*1024,maxEvents=20000,ttl=30*60*1000,now=Date.now}={}){
 const epoch=crypto.randomBytes(12).toString('hex');let seq=0,bytes=0;const rows=[];
 function prune(){while(rows.length&&(bytes>maxBytes||rows.length>maxEvents||now()-rows[0].at>ttl)){bytes-=rows.shift().size;}}
 return {record(data){const event={...data,seq:++seq,epoch};const size=Buffer.byteLength(JSON.stringify(event));rows.push({event,size,at:now()});bytes+=size;prune();return event;},resume(q={}){prune();const cursor=Number(q.cursor);const requested=q.epoch!=null;const valid=requested&&q.epoch===epoch&&Number.isInteger(cursor)&&cursor>=0&&cursor<=seq&&cursor>=(rows[0]?.event.seq||seq+1)-1;return {epoch,seq,gap:requested&&!valid,events:valid?rows.filter(r=>r.event.seq>cursor).map(r=>r.event):[]};}};
}
module.exports={createReplay};
