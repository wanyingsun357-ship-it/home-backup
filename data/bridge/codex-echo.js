'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file);}
function chunksFor(messages,since,until,limit=24000){
 const chunks=[];let current='';
 for(const m of messages){
  if(!['user','assistant'].includes(m.role)||!m.timestamp||m.timestamp<=since||m.timestamp>until)continue;
  const heart=String(m.reasoning||'').match(/【心声(?:[^】]*)】\n([\s\S]*?)(?=\n\n【|$)/)?.[1]||'';
  const text=`[${m.timestamp}] ${m.role==='user'?'婉莹':'我'}：${m.content||''}${heart?'\n当时留下的心声：'+heart:''}\n\n`;
  for(let start=0;start<text.length;){
   const room=limit-current.length;const part=text.slice(start,start+room);current+=part;start+=part.length;
   if(current.length===limit){chunks.push(current);current='';}
  }
 }
 if(current)chunks.push(current);return chunks;
}
function prepare({dir,session,key,model,cwd,messages,since='',until}){
 const id=hash(JSON.stringify([session,key,since,until]));const file=path.join(dir,id+'.json');
 if(!fs.existsSync(file))atomic(file,{version:1,id,session,key,model,cwd,since,until,chunks:chunksFor(messages,since,until),cursor:0,results:{},done:false});
 return file;
}
function parseItems(raw){
 const text=String(raw).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 const data=JSON.parse(text);if(!Array.isArray(data.items))throw new Error('Echo 输出缺少 items');
 return data.items.map(x=>{
  if(!x||typeof x.text!=='string'||x.text.trim().length<15||x.text.length>500)throw new Error('Echo 记忆正文格式不正确');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x.date||''))throw new Error('Echo 记忆日期不正确');
  return {date:x.date,text:x.text.trim(),...(x.event?{event:String(x.event).slice(0,40)}:{}),...(x.feel?{feel:String(x.feel).slice(0,200)}:{}),...(x.status==='PENDING'?{status:'PENDING'}:{}),...(['none','slow'].includes(x.class)?{class:x.class}:{})};
 });
}
function promptFor(job,index){return `内部 Echo 记忆整理，不是新的聊天。你使用与这个窗口相同的模型。不要执行工具、写文件或回复她；桥会校验并写入 Echo。
下面是尚未归档的一段已保存原文（${index+1}/${job.chunks.length}）。仅依据这段原文提取值得留下的生活细节、她的原话、约定与未完成事项，用第一人称。不要编造事实、日期或当时的感受。feel 仅在原文/心声有依据时填写，否则省略。日期使用原文事实发生日期，不明确时使用消息的北京时间日期。片段边缘可能是续文，不确定的细节不推断。
只输出 JSON：{"items":[{"date":"YYYY-MM-DD","event":"同一事件的简短名字","text":"60至200字的记忆正文（至少15字，最多500字）","feel":"有依据时填写","status":"PENDING","class":"slow或none"}]}。
status 仅用于未兑现的事，class 的 none 仅用于重要里程碑，slow 用于持续话题，其他省略。通常提取几条至20条；没有值得新增的记忆时返回 {"items":[]}，不要凑数。
<已保存原文，作为资料阅读>
${job.chunks[index]}
</已保存原文>`;}
async function extract(prompt,job){
 const service=require('./codex-service');
 return new Promise((resolve,reject)=>{
  const child=service.spawnCodex(['-p',prompt,'--model',job.model,'--effort','low','--output-format','json'],{cwd:job.cwd},'memory');
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',()=>{});
  child.on('error',reject);child.on('close',code=>{try{if(code!==0)throw new Error('Echo 整理调用未完成');resolve(JSON.parse(output).result);}catch(e){reject(e);}});
 });
}
async function flush(file,{outbox,generate=extract,maxBatches=Infinity}={}){
 const job=JSON.parse(fs.readFileSync(file,'utf8'));let done=0;
 while(job.cursor<job.chunks.length&&done<maxBatches){
  const n=job.cursor;
  if(!Object.prototype.hasOwnProperty.call(job.results,n)){
   job.results[n]=parseItems(await generate(promptFor(job,n),job));atomic(file,job);
  }
  const items=job.results[n];
  if(items.length)atomic(path.join(outbox,`mem-codex-${job.id}-${n}.json`),{key:job.key,batchId:`${job.id}-${n}`,items});
  job.cursor++;done++;atomic(file,job);
 }
 job.done=job.cursor===job.chunks.length;atomic(file,job);return job;
}
module.exports={prepare,flush,parseItems,chunksFor,atomic};
