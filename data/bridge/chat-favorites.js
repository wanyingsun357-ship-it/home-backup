'use strict';
const fs=require('fs'),crypto=require('crypto');
function locate(store,f){
 const messages=store.sessions.find(s=>s.id===f.session)?.messages||[];
 const match=m=>m.role===f.role&&m.content===f.content&&(!f.timestamp||m.timestamp===f.timestamp);
 if(Number.isInteger(f.index)&&messages[f.index]&&match(messages[f.index]))return f.index;
 for(let i=messages.length-1;i>=0;i--)if(match(messages[i]))return i;
 return -1;
}
function register(app,getStore,file){
 let favorites=[];if(fs.existsSync(file))favorites=JSON.parse(fs.readFileSync(file,'utf8'));
 const save=next=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(tmp,file);favorites=next;};
 app.get('/api/chat-favorites',(req,res)=>res.json({items:favorites.filter(f=>f.session===req.query.session).map(f=>({...f,index:locate(getStore(),f)}))}));
 app.post('/api/chat-favorites',(req,res)=>{
  const b=req.body||{},index=locate(getStore(),b);if(index<0)return res.status(409).json({error:'这条消息还未保存或已经改变，请等回复结束后再收藏'});
  const m=getStore().sessions.find(s=>s.id===b.session).messages[index];
  if(favorites.some(f=>f.session===b.session&&f.index===index&&f.content===m.content))return res.json({ok:true});
  try{save([{id:crypto.randomUUID(),session:b.session,index,role:m.role,content:m.content,timestamp:m.timestamp,savedAt:new Date().toISOString()},...favorites]);res.json({ok:true});}catch{res.status(500).json({error:'收藏未保存，请重试'});}
 });
 app.delete('/api/chat-favorites/:id',(req,res)=>{try{save(favorites.filter(f=>f.id!==req.params.id));res.json({ok:true});}catch{res.status(500).json({error:'未能移除收藏'});}});
}
module.exports={register,locate};
