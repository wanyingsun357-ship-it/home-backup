'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const {redact}=require('./tool-trace');
function create(file,{queueDir=path.join(path.dirname(file),'../wake-outbox'),diaryFile=path.join(path.dirname(file),'diary-for-ayan.json')}={}){
 let pendingSave;
 let records=[];try{records=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(records))records=[];}catch{}
 for(const r of records)if(r.status==='running')r.status='interrupted';
 function save(){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(records),{mode:0o600});fs.renameSync(temp,file);}
 function safeSave(){clearTimeout(pendingSave);pendingSave=null;try{save();}catch(e){console.error('[footprints] write failed',e.code||'error');}}
 if(records.length)safeSave();
 function track(proc,{session,kind,reason='',model=''}){
  const r={id:crypto.randomUUID(),session,kind,reason:String(reason).slice(0,500),model,at:new Date().toISOString(),status:'running',text:'',reasoning:'',activities:[]};records.unshift(r);records=records.slice(0,5000);safeSave();
  let output='',stderr='',pending='',done=false;const finish=(status)=>{if(done)return;done=true;clearTimeout(timer);r.status=status;r.finishedAt=new Date().toISOString();safeSave();};
  const timer=setTimeout(()=>finish('timeout'),250000);timer.unref?.();
  proc.stdout.on('data',d=>{if(output.length<2000000)output+=d.toString();});
  function line(value){
   if(value.startsWith('__AYAN_FOOTPRINT__')){try{
    const e=JSON.parse(value.slice('__AYAN_FOOTPRINT__'.length));
    if(e.kind==='reasoning'&&r.reasoning.length<1000000)r.reasoning+=String(e.text||'');
    if(e.kind==='activity'&&e.id){const old=r.activities.find(x=>x.id===e.id);const activity={id:e.id,detail:redact(e.detail||'').slice(0,4000),status:e.status,at:e.at};if(old)Object.assign(old,activity);else if(r.activities.length<300)r.activities.push(activity);}
    if(!pendingSave){pendingSave=setTimeout(safeSave,500);pendingSave.unref?.();}
   }catch{}return;}
   stderr=(stderr+'\n'+redact(value)).slice(-2000);
  }
  proc.stderr?.on('data',d=>{pending+=d.toString();let n;while((n=pending.indexOf('\n'))>=0){line(pending.slice(0,n));pending=pending.slice(n+1);}if(pending.length>100000)pending=pending.slice(-4000);});
  proc.on('error',e=>{r.error=redact(e.message||'进程启动失败').slice(0,500);finish('failed');});
  proc.on('close',(code,signal)=>{if(done)return;if(pending)line(pending);r.exitCode=code;r.signal=signal||undefined;try{const j=JSON.parse(output);r.text=String(j.result||'').replace(/\[QUIET\]/gi,'').trim();r.reasoning=String(j.reasoning||r.reasoning||'');if(j.is_error)r.error=redact(j.error||j.result||stderr).slice(0,500);r.model=j.model||model;finish(code||j.is_error?'failed':/\[QUIET\]/i.test(j.result||'')?'quiet':'completed');}catch{r.error=stderr.trim().slice(0,500)||'进程未返回完整结果；旧记录或进程中断可能没有详细原因。';finish(signal==='SIGTERM'?'timeout':'failed');}});
 }
 function list(store,{session='',offset=0,limit=20}={}){
  if(session&&!store.sessions.some(s=>s.id===session))throw Error('unknown session');
  let all=records.filter(r=>!session||r.session===session).map(r=>({...r}));
  try{for(const name of fs.readdirSync(queueDir).filter(n=>n.endsWith('.json'))){try{const d=JSON.parse(fs.readFileSync(path.join(queueDir,name),'utf8'));if(!d.session||!store.sessions.some(s=>s.id===d.session)||(session&&d.session!==session))continue;
   let at=String(d.at||'').replace(' ','T');if(!/Z$|[+-]\d\d:\d\d$/.test(at))at+='+08:00';if(!Number.isFinite(Date.parse(at)))continue;
   all.push({id:'queue-'+name,session:d.session,kind:d.kind||'alarm',at:new Date(at).toISOString(),status:Date.parse(at)>Date.now()?'scheduled':'queued',reason:d.reason==='wander'?'':String(d.reason||''),text:'',reasoning:''});
  }catch{}}}catch{}
  let diaries=[];try{diaries=JSON.parse(fs.readFileSync(diaryFile,'utf8')).entries||[];}catch{}
  for(const r of all){if(r.reason==='wander')r.reason='';r.activities=(r.activities||[]).map(a=>{
   // Only label exact diary IDs explicitly present in the invocation. Never infer from a whole-library read.
   const titles=diaries.filter(d=>!d.locked&&d.id&&String(d.id).length>=4&&new RegExp('(^|[^a-zA-Z0-9_-])'+String(d.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^a-zA-Z0-9_-])').test(a.detail)).map(d=>String(d.title||'未命名日记').slice(0,100));
   return {...a,...(titles.length?{titles:[...new Set(titles)].slice(0,5)}:{})};
  });}

  for(const s of store.sessions){if(session&&s.id!==session)continue;
   for(const m of s.messages||[]){if(m.role!=='assistant'||!m.selfWake||!m.timestamp)continue;
    if(all.some(r=>r.session===s.id&&r.text===m.content&&Math.abs(Date.parse(r.finishedAt||r.at)-Date.parse(m.timestamp))<15000))continue;
    all.push({id:'legacy-'+crypto.createHash('sha256').update(s.id+m.timestamp+(m.content||'')).digest('hex').slice(0,20),session:s.id,kind:'legacy',at:m.timestamp,status:'legacy',text:m.content||'',reasoning:m.reasoning||''});
   }
  }
  all.sort((a,b)=>b.at.localeCompare(a.at));const unique=[...new Map(all.map(r=>[r.id,r])).values()];
  return {items:unique.slice(offset,offset+limit),total:unique.length,nextOffset:offset+limit<unique.length?offset+limit:null,sessions:store.sessions.map(s=>({id:s.id,title:s.title}))};
 }
 function register(app,getStore){app.get('/api/footprints',(req,res)=>{res.set('Cache-Control','no-store');try{res.json(list(getStore(),{session:String(req.query.session||''),offset:Math.max(0,parseInt(req.query.offset)||0),limit:Math.max(1,Math.min(50,parseInt(req.query.limit)||20))}));}catch{res.status(400).json({error:'找不到这个家'});}});}
 return {track,list,register,recentStarts:()=>records.slice().sort((a,b)=>a.at.localeCompare(b.at)).filter(r=>r.kind!=='fingertips'&&Date.now()-Date.parse(r.at)<86400000).reduce((a,r)=>{(a[r.session] ||= []).push(Date.parse(r.at));return a;},{})};
}
module.exports={create};
