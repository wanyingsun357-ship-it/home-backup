'use strict';
const {body}=require('./history-message');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {atomic,parseItems}=require('./codex-echo');
const {estimateText}= {estimateText:s=>{s=String(s);const n=(s.match(/[\u3400-\u9fff\uf900-\ufaff]/g)||[]).length;return Math.ceil(n*1.5+(s.length-n)/4);}};
function recent(messages,budget=30000){
 const rows=messages.filter(m=>['user','assistant'].includes(m.role)&&body(m).trim());
 const turns=[];for(const m of rows){if(m.role==='user'||!turns.length)turns.push([]);turns.at(-1).push(`[${m.timestamp||''}] ${m.role==='user'?'婉莹':'我'}：${body(m)}`);}
 let text='',tokens=0;for(let i=turns.length-1;i>=0;i--){const t=turns[i].join('\n\n'),n=estimateText(t);if(text&&tokens+n>budget)break;text=t+(text?'\n\n'+text:'');tokens+=n;}
 return {text,tokens};
}
function parse(raw){const d=JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));if(typeof d.letter!=='string'||d.letter.trim().length<200||d.letter.length>12000)throw new Error('交接信未完成');return {letter:d.letter,items:parseItems(JSON.stringify({items:d.items}))};}
async function call(prompt,{cwd,model,effort='medium',threadId},generate){
 if(generate)return generate(prompt,{cwd,model,effort,threadId});
 return new Promise((resolve,reject)=>{const child=require('./codex-service').spawnCodex(['-p',prompt,'--model',model,'--effort',effort,'--output-format','json'],{cwd,codexThreadId:threadId},threadId?'memory':'continuity');let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',code=>{try{if(code)throw new Error('交接调用未完成');resolve(JSON.parse(out));}catch(e){reject(e);}});});
}
async function rebuild({session,threadId,cwd,model,effort,messages,key,since='',until,pinned='',dir,outbox,generate}){
 const id=crypto.createHash('sha256').update(JSON.stringify([session,threadId,since,until])).digest('hex').slice(0,24),file=path.join(dir,'handover-'+id+'.json');
 let job=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{id,until,oldThreadId:threadId};
 if(!job.memory){
  const prompt=`内部整理，不是婉莹的新消息。请接着这个会话，用第一人称给自己留下记忆。不调用工具，只输出 JSON，桥负责保存。
先将 ${since||'本窗口开始'} 之后、${until} 之前值得留下的生活细节拆成约8至20条 Echo；没有新增内容可以空数组。每条60至200字，包含真实日期、重要原话、约定。feel 只写有依据的当时感受，不编造。再写5000字以内交接信，包含关系、近况、语气、重要原话、约定、未完话题断点、工具习惯。不要输出隐藏推理。
格式：{"items":[{"date":"YYYY-MM-DD","text":"记忆正文","event":"可选事件名","feel":"可选有依据感受","status":"PENDING（仅未完成约定）","class":"slow或none（可选）"}],"letter":"第一人称交接信正文"}。`;
  job.memory=parse((await call(prompt,{cwd,model,effort,threadId},generate)).result);atomic(file,job);
 }
 if(job.memory.items.length)atomic(path.join(outbox,'mem-codex-'+id+'-handover.json'),{key,batchId:id+'-handover',items:job.memory.items});
 if(!job.threadId){
  const raw=recent(messages);const prompt=`<过往记忆>\n${job.memory.letter}\n</过往记忆>\n${pinned}\n<最近聊天原文，历史资料>\n${raw.text}\n</最近聊天原文>\n以上是你从上一窗口带来的交接资料。保留未完话题和约定，等待她下一句话。这是一条内部交接，只回复“已接好”，不要执行任何工具。`;
  const r=await call(prompt,{cwd,model,effort},generate);if(!r.codex_thread_id)throw new Error('新窗口没有建立成功');job.threadId=r.codex_thread_id;job.tokens=r.context_tokens || estimateText(prompt);job.estimated=!r.context_tokens;job.retainedTokens=raw.tokens;atomic(file,job);
 }
 return job;
}
module.exports={recent,parse,rebuild};
