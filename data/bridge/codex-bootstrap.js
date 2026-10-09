'use strict';
const {body}=require('./history-message');
const fs=require('fs');
const {priorMemory,isUserTurn,isInternal}=require('./compact-transcript');
function build(sess,transcript,includeLatest=false){
 const events=fs.readFileSync(transcript,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const memory=priorMemory(events);
 const times=events.filter(e=>isUserTurn(e)&&!isInternal(e)).map(e=>Date.parse(e.timestamp)).filter(Number.isFinite);
 const marker=[...sess.messages].reverse().find(m=>m.role==='system'&&/记忆收进了行囊|从上一个窗口衔接而来/.test(m.content||''));
 const markerAt=Date.parse(marker?.timestamp);
 if(!times.length&&!Number.isFinite(markerAt))throw new Error('无法确认旧窗口边界，保留原会话，暂不进行截断交接');
 const start=Math.min(...times,...(Number.isFinite(markerAt)?[markerAt]:[]));
 const all=includeLatest?sess.messages:sess.messages.slice(0,-1);
 const rows=all.filter(m=>['user','assistant'].includes(m.role)&&Date.parse(m.timestamp)>=start);
 const history=rows.map(m=>`[${m.timestamp}] ${m.role==='user'?'婉莹':'晏白'}：${body(m)}`).join('\n\n');
 const text=[memory,'<此前对话，按时间顺序保存的原文>\n'+history+'\n</此前对话>','以上是一直带着的记忆与对话记录。接着她最新的话自然继续，不需要介绍或复述这些资料。'].filter(Boolean).join('\n\n');
 return {text,stats:{start:new Date(start).toISOString(),messages:rows.length,memoryChars:memory.length,historyChars:history.length,totalChars:text.length}};
}
module.exports={build};
