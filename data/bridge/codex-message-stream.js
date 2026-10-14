'use strict';
// Preserve assistant message boundaries in both incremental text and the saved reply.
function create(emit) {
 let text='',lastId=null,pending=false;
 const received=new Map();
 function append(value,id){
  if(!value)return;
  const key=id||lastId||'default';
  const boundary=pending||(lastId!==null&&key!==lastId);
  const gap=boundary&&text.trim()&&!/\n\s*\n$/.test(text)?'\n\n':'';
  pending=false;lastId=key;
  received.set(key,(received.get(key)||'')+value);
  text+=gap+value;emit(gap+value);
 }
 function complete(item){
  const key=item.id||lastId||'default',full=String(item.text||''),part=received.get(key)||'';
  if(!full)return;
  if(!part)append(full,key);
  else if(full.startsWith(part))append(full.slice(part.length),key);
 }
 return {delta:append,complete,tool:()=>{if(text.trim())pending=true;},get text(){return text;}};
}
module.exports={create};
