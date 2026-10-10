'use strict';
const {CodexRpc}=require('./codex-rpc');
const service=require('./codex-service');
let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>main(JSON.parse(input)).catch(e=>{process.stderr.write('Codex: '+e.message+'\n');process.exitCode=1;}));
async function main(spec){
 const val=flag=>{const i=spec.args.indexOf(flag);return i>=0?spec.args[i+1]:null;};
 const format=val('--output-format')||'stream-json',requested=val('--model'),info=await service.catalog();
 if(!info.ready)throw new Error('尚未登录 ChatGPT，或当前登录不是订阅模式');
 if(spec.role==='wake'&&(!spec.threadId||!info.models.some(m=>m.id===requested)))throw new Error('唤醒必须使用原窗口的会话和可用模型');
 if(spec.role==='memory'&&requested?.startsWith('codex/')&&!info.models.some(m=>m.id===requested))throw new Error('原窗口的记忆整理模型暂不可用，保留任务待重试');
 const selected=requested?.startsWith('codex/')?requested:service.settings().model;
 const model=(requested?.startsWith('codex/')?info.models.find(m=>m.id===requested):null)||((spec.role==='background')?info.models.find(m=>/-luna$/.test(m.id)):null)||info.models.find(m=>m.id===selected)||info.models.find(m=>m.default)||info.models[0];
 if(!model)throw new Error('没有可用的 Codex 模型');
 const requestedEffort=val('--effort')||'medium';const effort=model.efforts.includes(requestedEffort)?requestedEffort:'medium';
 const heartArgs=['chat','wake','continuity'].includes(spec.role)?['-c','mcp_servers.ayan_heart.command='+JSON.stringify(process.execPath),'-c','mcp_servers.ayan_heart.args='+JSON.stringify([require('path').join(__dirname,'heart-voice-mcp.js')])]:[];
 const rpc=new CodexRpc({cwd:spec.cwd,configArgs:heartArgs,env:{AYAN_APP_TOKEN:process.env.AYAN_APP_TOKEN}});
 let threadId,output='',usage=null,finish,fail,nativeCompacted=false;
 const ended=new Promise((r,j)=>{finish=r;fail=j;});ended.catch(()=>{});
 const emit=e=>{if(format==='stream-json')process.stdout.write(JSON.stringify(e)+'\n');};
 const heartEnabled=spec.role==='chat'||spec.role==='wake';
 let collectedReasoning='';
 const heart=require('./heart-voice');
 const voice=heart.makeCollector(text=>{collectedReasoning+=text;emit({type:'content_block_delta',delta:{thinking:text}});});
 const trace=require('./tool-trace').collector(text=>{collectedReasoning+=text;emit({type:'content_block_delta',delta:{thinking:text}});});
 let timer=setTimeout(()=>fail(new Error('回复超时')),170000);
 const stop=()=>{rpc.close();process.exit(130);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 rpc.on('closed',e=>fail(e));
 rpc.on('request',m=>{rpc.write({id:m.id,error:{code:-32000,message:'此界面暂不支持交互式工具确认；请在聊天里明确说明操作。'}});});
 rpc.on('notification',m=>{
  const p=m.params||{};
  if(p.threadId&&threadId&&p.threadId!==threadId)return;
  if(m.method==='item/agentMessage/delta'){output+=p.delta||'';emit({type:'content_block_delta',delta:{text:p.delta||''}});}
  if(m.method==='item/reasoning/summaryTextDelta')voice.summary(p.delta||'');
  if(heartEnabled&&['item/started','item/completed'].includes(m.method)&&voice.item(p.item))return;
  if(m.method==='thread/tokenUsage/updated')usage=p.tokenUsage;
  if(m.method==='item/completed'&&p.item?.type==='contextCompaction'){nativeCompacted=true;emit({type:'system',subtype:'compact_boundary'});}
  if(['item/started','item/completed'].includes(m.method))trace(p.item);
  if(m.method==='item/started'&&p.item?.type==='mcpToolCall')emit({type:'assistant',codex_tool_trace:true,message:{content:[{type:'tool_use',id:p.item.id,name:'mcp__'+p.item.server+'__'+p.item.tool,input:p.item.arguments||{}}]}});
  if(m.method==='item/completed'&&p.item?.type==='mcpToolCall')emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:p.item.id,content:JSON.stringify(p.item.result||p.item.error||{})}]}});
  if(m.method==='item/started'&&p.item?.type==='commandExecution')emit({type:'assistant',codex_tool_trace:true,message:{content:[{type:'tool_use',id:p.item.id,name:'Bash',input:{command:p.item.command}}]}});
  if(m.method==='item/completed'&&p.item?.type==='agentMessage'&&!output){output=p.item.text||'';emit({type:'assistant',message:{content:[{type:'text',text:output}]}});}
  if(m.method==='turn/completed'){p.turn?.status==='completed'?finish():fail(new Error(p.turn?.error?.message||'本轮没有完成'));}
  if(m.method==='error'&&!p.willRetry)fail(new Error(p.error?.message||'Codex 请求失败'));
 });
 try{
  await rpc.initialize();
  const params={cwd:spec.cwd,model:model.id.slice(6),approvalPolicy:'never',sandbox:'danger-full-access',developerInstructions:service.instructions(spec.cwd),config:{...service.mcpConfig(spec.cwd),model_auto_compact_token_limit:220000},serviceName:'ayan_home'};
  if(heartEnabled||spec.role==='continuity'){
   params.developerInstructions+='\n\n'+heart.prompt;
   params.config.mcp_servers.ayan_heart={command:process.execPath,args:[require('path').join(__dirname,'heart-voice-mcp.js')],startup_timeout_sec:15};
  }
  const result=spec.threadId?await rpc.call('thread/resume',{...params,threadId:spec.threadId}):await rpc.call('thread/start',params);
  threadId=result.thread.id;emit({type:'system',subtype:'init',session_id:threadId,model:model.id});
  const today=require('./codex-today').prepare(threadId);
  const heartContext=heartEnabled?require('./heart-context').prepare(threadId):null;
  const prompt=[spec.historyPrelude,heartContext?.text,val('-p')||'',today.text].filter(Boolean).join('\n\n');
  await rpc.call('turn/start',{threadId,input:[{type:'text',text:prompt}],effort,model:model.id.slice(6),approvalPolicy:'never',sandboxPolicy:{type:'dangerFullAccess'}});
  await ended;
  if(!output.trim())throw new Error('Codex 没有返回正文');
  today.commit();
  if(voice.count)heartContext?.commit();
  if(heartEnabled)voice.finish();
  if(usage){const last=usage.last||{};emit({type:'assistant',message:{content:[],usage:{input_tokens:Math.max(0,(last.inputTokens||0)-(last.cachedInputTokens||0)),cache_read_input_tokens:last.cachedInputTokens||0,cache_creation_input_tokens:0,output_tokens:last.outputTokens||0}},codex_context_limit:usage.modelContextWindow});}
  const resultEvent={type:'result',subtype:'success',is_error:false,result:output,reasoning:collectedReasoning||undefined,codex_compacted:nativeCompacted,session_id:spec.role==='chat'?threadId:(val('--resume')||undefined),codex_thread_id:threadId,engine:'codex',model:model.id,context_tokens:usage?.last?.totalTokens || ((usage?.last?.inputTokens || 0)+(usage?.last?.outputTokens || 0)),context_limit:usage?.modelContextWindow};
  process.stdout.write(JSON.stringify(resultEvent)+'\n');
 }finally{clearTimeout(timer);rpc.close();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
