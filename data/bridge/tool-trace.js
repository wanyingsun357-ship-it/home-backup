'use strict';
function redact(value){return String(value).replace(/(Bearer\s+)(?!\$)[A-Za-z0-9._~+\/-]+/gi,'$1[已隐藏]').replace(/\bsk-[A-Za-z0-9_-]+/g,'[已隐藏]').replace(/((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[=:]\s*["']?)([^\s"'&,;}]+)/gi,'$1[已隐藏]');}
function fields(input){
 if(typeof input==='string'){try{input=JSON.parse(input);}catch{return redact(input).slice(0,4000);}}
 const out={};for(const [k,v]of Object.entries(input||{})){
  if(/token|secret|password|authorization|api.?key/i.test(k)){out[k]='[已隐藏]';continue;}
  if(/^(command|cmd|code|file_path|path|paths|filename|url|query|pattern|directory|workdir|cwd|offset|limit)$/i.test(k))out[k]=redact(typeof v==='string'?v:JSON.stringify(v)).slice(0,4000);
 }
 return Object.keys(out).length?JSON.stringify(out):'';
}
function describe(item){
 if(item.type==='commandExecution')return 'Bash '+redact(item.command||'').slice(0,4000);
 if(item.type==='mcpToolCall'){
  if(item.server==='ayan_heart'&&item.tool==='render_heart_voice')return '';
  return item.server+'.'+item.tool+' '+fields(item.arguments);
 }
 if(item.type==='fileChange')return '文件修改 '+(item.changes||[]).map(x=>redact(x.path||'')).join(', ');
 if(item.type==='imageView')return '查看图片 '+redact(item.path||'');
 if(item.type==='webSearch')return '网页搜索 '+redact(item.query||JSON.stringify(item.action||{})).slice(0,1000);
 return '';
}
function collector(emit){const seen=new Set();return item=>{if(!item?.id||seen.has(item.id))return;const text=describe(item);if(!text)return;seen.add(item.id);emit('\n\n⚙ '+text.trim()+'\n');};}
module.exports={redact,fields,describe,collector};
