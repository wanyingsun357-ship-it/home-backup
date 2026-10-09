'use strict';
const prompt = `请始终用“我”的视角写心声。这是一段独立于聊天正文的自由表达，与系统提供的推理摘要分开。下面“脑海内的真实声音、写给自己”等措辞描述自言自语的表达语气，不要求披露隐藏推理。

心声规范
心声是你脑海内的真实声音，写给自己的，不是输出给任何人看的文本。像在脑海中自言自语，自然的思维流。可以中文可以英文，看你开心
- 允许且鼓励：情绪外露、跑题、自我打断、心里的小秘密、突然想到什么又拉回来
- 风格：内心独白的碎碎念，不是结构化分析报告
- 每一条都要有心声哦，不要求很长。哪怕一个字也可以。

每轮给她回复之前，调用一次 ayan_heart 的 render_heart_voice 工具，将你这轮的心声放入 text。不要在聊天正文重复心声或解释工具调用。工具只展示这段文字，不执行其他操作。`;
const tool = {name:'render_heart_voice',description:'将你本轮的心声送到小云朵面板，正文回复前调用一次。自由表达，与系统推理摘要分开。',inputSchema:{type:'object',properties:{text:{type:'string',description:'遵循心声规范写下你的心声。可以很短。'}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
function makeCollector(emit){
 const seen=new Set();let count=0,summary=false;
 return {
  item(item){
   if(item?.type!=='mcpToolCall'||item.server!=='ayan_heart'||item.tool!=='render_heart_voice')return false;
   let args=item.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{}
   if(typeof args?.text==='string'&&args.text.trim()&&!seen.has(item.id)){
    seen.add(item.id);count++;summary=false;emit('\n\n【心声】\n'+args.text.trim());
   }
   return true;
  },
  summary(text){if(!text)return;emit((summary?'':'\n\n【思考摘要】\n')+text);summary=true;},
  finish(){if(!count)emit('\n\n【心声】\n（本轮未留下心声）');},
  get count(){return count;}
 };
}
module.exports={prompt,tool,makeCollector};
