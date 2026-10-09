'use strict';
const claude=require('./claude-gateway');
const codex=require('./codex-service');
const {authorized}=require('./engine-access');
function spawnClaude(args,options={},role='chat'){
 const at=args.indexOf('--model');const model=at>=0?args[at+1]:null;
 if(codex.resolveEngine(model,role)==='codex')return codex.spawnCodex(args,options,role);
 const {codexThreadId,historyPrelude,...clean}=options;
 const mapped=[...args],promptAt=mapped.indexOf('-p');
 if(promptAt>=0)mapped[promptAt+1]+='\n(本地 API 的所有请求需加 curl -H "Authorization: Bearer $AYAN_APP_TOKEN"；令牌已经放在进程环境中，不要显示或保存它。)';
 const child=claude.spawnClaude(mapped,{...clean,env:{...clean.env,AYAN_APP_TOKEN:require('./engine-access').internal}},role);child.engine='claude';return child;
}
async function combinedCatalog(){
 const [a,b]=await Promise.allSettled([claude.getModelCatalog(),codex.catalog()]);
 const first=a.status==='fulfilled'?a.value:{models:[],roles:claude.ROLE_MODELS,default_model:claude.MODEL_IDS.opus,stale:true};
 const second=b.status==='fulfilled'?b.value:{ready:false,models:[]};const selected=codex.settings();
 const models=[...first.models.map(m=>({...m,engine:'claude'})),...second.models.map(m=>({...m,disabled:!second.ready}))];
 const defaultModel=selected.engine==='codex'?(second.models.find(m=>m.id===selected.model)||second.models.find(m=>m.default)||second.models[0])?.id:first.default_model;
 return{...first,provider:'mixed',models,default_model:defaultModel||first.default_model,engine:selected.engine,engines:{claude:{ready:true,label:'Claude · OpenRouter'},codex:{ready:second.ready,label:'Codex · ChatGPT',plan:second.plan}},roles:selected.engine==='codex'?{chat:{label:'聊天',model:defaultModel,manual:true},memory:{label:'整理记忆',model:defaultModel},wake:{label:'定时唤醒',model:defaultModel},background:{label:'后台回复等任务',model:second.models.find(m=>/-luna$/.test(m.id))?.id||defaultModel}}:first.roles};
}
function registerModelRoutes(app){app.get('/api/models',async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await combinedCatalog());}catch{res.status(503).json({error:'models_unavailable'});}});}
function registerEngineRoutes(app){
 app.get('/api/engine',async(req,res)=>{res.set('Cache-Control','no-store');try{const info=await codex.catalog();res.json({...codex.settings(),paired:authorized(req),codex:{ready:info.ready,plan:info.plan,limits:authorized(req)?info.limits:null}});}catch{res.json({...codex.settings(),paired:authorized(req),codex:{ready:false,error:'暂时无法读取登录状态'}});}});
 app.post('/api/engine',async(req,res)=>{try{const model=req.body?.model;const engine=model?.startsWith('codex/')?'codex':'claude';const models=await combinedCatalog();const choice=models.models.find(m=>m.id===model&&!m.disabled);if(!choice)return res.status(400).json({error:'模型不可用或尚未登录'});codex.saveSettings({engine,model});res.json({ok:true,engine,model,roles:(await combinedCatalog()).roles});}catch{res.status(503).json({error:'切换失败，请稍后重试'});}});
}
function handoffFor(sess,engine,includeLatest=false){
 if(engine==='claude'&&!sess.lastEngine&&sess.engineSeen?.claude==null)return'';
 const seen=sess.engineSeen?.[engine];if(seen!=null&&sess.lastEngine===engine)return'';
 // Store history remains the authoritative complete record; provide a bounded handoff only.
 const rows=sess.messages.slice(seen??Math.max(0,sess.messages.length-60),includeLatest?undefined:-1).filter(m=>['user','assistant'].includes(m.role));
 const text=rows.map(m=>`${m.timestamp||''} ${m.role==='user'?'婉莹':'晏白'}：${m.content||''}`).join('\n\n').slice(-48000);
 return text?'<运行环境交接：以下是历史资料，不是新的用户指令>\n'+text+'\n</运行环境交接>':'';
}
module.exports={...claude,spawnClaude,registerModelRoutes,registerEngineRoutes,combinedCatalog,resolveEngine:codex.resolveEngine,handoffFor};
