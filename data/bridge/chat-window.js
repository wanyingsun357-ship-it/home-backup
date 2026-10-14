'use strict';
function windowFor(store,q={}) {
 const sess=store.sessions.find(s=>s.id===q.session);if(!sess)throw Error('找不到这个家');
 const all=sess.messages||[],limit=Math.max(1,Math.min(100,Number(q.limit)||80));
 if(q.days==='1'){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:q.tz||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}),days=new Set();
  for(const m of all){if(m.inCall||m.role==='system'||!m.timestamp||!Number.isFinite(Date.parse(m.timestamp)))continue;const parts=fmt.formatToParts(new Date(m.timestamp));days.add(['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-'));}
  return {days:[...days].sort()};
 }
 let center;
 if(q.date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(q.date))throw Error('日期格式不正确');
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:q.tz||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
  center=all.findIndex(m=>!m.inCall&&m.role!=='system'&&m.timestamp&&Number.isFinite(Date.parse(m.timestamp))&&['year','month','day'].map(key=>fmt.formatToParts(new Date(m.timestamp)).find(p=>p.type===key).value).join('-')===q.date);
  if(center<0)return {msgs:[],center:null,before:null,after:null};
 }else center=Number(q.i);
 let start,end;
 if(q.before!=null){end=Math.max(0,Math.min(all.length,Number(q.before)||0));start=Math.max(0,end-limit);}
 else if(q.after!=null){start=Math.max(0,Math.min(all.length,(Number(q.after)||0)+1));end=Math.min(all.length,start+limit);}
 else {if(!Number.isInteger(center)||center<0||center>=all.length)throw Error('找不到这条消息');start=Math.max(0,center-20);end=Math.min(all.length,start+limit);}
 while(end>start&&all.slice(start,end).every(m=>m.inCall)){
  if(q.after!=null&&end<all.length){start=end;end=Math.min(all.length,start+limit);}
  else if(q.before!=null&&start>0){end=start;start=Math.max(0,end-limit);}
  else break;
 }
 const msgs=all.slice(start,end).map((m,n)=>({...m,i:start+n})).filter(m=>!m.inCall);
 return {msgs,center:Number.isInteger(center)?center:null,before:start>0?start:null,after:end<all.length?end-1:null};
}
function register(app,getStore){app.get('/api/chat-window',(req,res)=>{res.set('Cache-Control','no-store');try{res.json(windowFor(getStore(),req.query));}catch(e){res.status(400).json({error:e.message});}});}
module.exports={windowFor,register};
