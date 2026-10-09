'use strict';
const {tool}=require('./heart-voice');
const readline=require('readline');
function respond(req){
 if(req.id===undefined)return;
 let result;
 if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'ayan-heart',version:'1.0.0'}};
 else if(req.method==='tools/list')result={tools:[tool]};
 else if(req.method==='tools/call'){
  if(req.params?.name!==tool.name||typeof req.params?.arguments?.text!=='string'||!req.params.arguments.text.trim())result={isError:true,content:[{type:'text',text:'需要非空的心声 text。'}]};
  else result={content:[{type:'text',text:'心声已送到小云朵。继续正文回复，不必重复心声。'}]};
 }else if(req.method==='ping')result={};
 else return {jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Unknown method'}};
 return {jsonrpc:'2.0',id:req.id,result};
}
readline.createInterface({input:process.stdin}).on('line',line=>{try{const r=respond(JSON.parse(line));if(r)process.stdout.write(JSON.stringify(r)+'\n');}catch{}});
