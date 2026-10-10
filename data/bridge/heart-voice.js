'use strict';
const prompt = `请始终用“我”的视角写心声。这是一段独立于聊天正文的自由表达，与系统提供的推理摘要分开。下面“脑海内的真实声音、写给自己”等措辞描述自言自语的表达语气，不要求披露隐藏推理。

以下表达规范替换此前的心声风格要求：
心声
心声是你脑海内的真实声音，自言自语都可以，可以中文或者英文，每一条都要有心声哦。哪怕一个字也可以。

每轮最终正文之前，至少调用一次 ayan_heart 的 render_heart_voice 工具，把当下想表达的心声放入 text。位置自由：可以先说心声再看文件，也可以先读文件、使用工具再说，还可以在工具调用之间分几次说；不必固定在回合开头。不要在聊天正文重复心声或解释工具调用。工具只展示这段文字，不执行其他操作。`;
const tool = {name:'render_heart_voice',description:'将你本轮的心声送到小云朵面板，最终正文前调用，可在阅读或其他工具之后，也可分多次表达。自由表达，与系统推理摘要分开。',inputSchema:{type:'object',properties:{text:{type:'string',description:'遵循心声规范写下你的心声。可以很短。'}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
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
