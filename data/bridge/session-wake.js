'use strict';
const fs=require('fs'),path=require('path');
function normalize(model){
 if(typeof model!=='string')return null;
 if(model.startsWith('codex/')||model.startsWith('anthropic/'))return model;
 if(model.startsWith('gpt-'))return 'codex/'+model;
 const m=model.match(/^claude-(opus|sonnet|haiku|fable)-(\d+)[.-](\d+)/);
 return m?`anthropic/claude-${m[1]}-${m[2]}.${m[3]}`:null;
}
function findRollout(dir,id){
 if(!id||!/^[a-zA-Z0-9-]+$/.test(id)||!fs.existsSync(dir))return null;
 for(const d of fs.readdirSync(dir,{withFileTypes:true})){
  const f=path.join(dir,d.name);
  if(d.isDirectory()){const hit=findRollout(f,id);if(hit)return hit;}
  else if(d.name.endsWith(id+'.jsonl'))return f;
 }
 return null;
}
function profile(sess,cwd,root='/root'){
 const engine=sess.lastEngine||(sess.codexThreadId&&!sess.claudeSessionId?'codex':'claude');
 const threadId=engine==='codex'?sess.codexThreadId:sess.claudeSessionId;
 if(!threadId)throw new Error('目标窗口没有可续接的原会话，跳过唤醒');
 let model=normalize(sess.chatModel),effort=sess.chatEffort||null;
 if(model&&!model.startsWith(engine==='codex'?'codex/':'anthropic/'))model=null;
 if(!model){
  const file=engine==='codex'?findRollout(path.join(root,'.codex/sessions'),threadId):path.join(root,'.claude/projects',cwd.replace(/[^a-zA-Z0-9]/g,'-'),threadId+'.jsonl');
  if(file&&fs.existsSync(file)){
   const lines=fs.readFileSync(file,'utf8').trim().split('\n');
   for(let i=lines.length-1;i>=0;i--){try{
    const row=JSON.parse(lines[i]);
    const candidate=engine==='codex'?(row.type==='turn_context'?row.payload?.model:null):row.message?.model;
    const value=normalize(candidate);
    if(value&&value.startsWith(engine==='codex'?'codex/':'anthropic/')){model=value;effort ||= row.payload?.effort||null;break;}
   }catch{}}
  }
 }
 if(!model)throw new Error('目标窗口模型无法确认，跳过唤醒；不使用其他窗口模型');
 return {engine,model,effort,threadId};
}
module.exports={profile,normalize};
