'use strict';
const fs=require('fs'),crypto=require('crypto');
const OWNERS=new Set(['her','ayan']);
const ownerOf=f=>OWNERS.has(f.owner)?f.owner:'her';
const cleanTags=value=>[...new Set((Array.isArray(value)?value:String(value||'').split(/[,，]/)).map(x=>String(x).trim().slice(0,20)).filter(Boolean))].slice(0,8);
const clone=value=>value==null?undefined:JSON.parse(JSON.stringify(value));
function locate(store,f){
 const session=f.session||store.activeId;
 const messages=store.sessions.find(s=>s.id===session)?.messages||[];
 const sourceContent=Object.prototype.hasOwnProperty.call(f,'sourceContent')?f.sourceContent:f.content;
 const hasContent=Object.prototype.hasOwnProperty.call(f,'sourceContent')||Object.prototype.hasOwnProperty.call(f,'content');
 const match=m=>(!f.role||m.role===f.role)&&(!hasContent||m.content===sourceContent)&&(!f.timestamp||m.timestamp===f.timestamp);
 if(Number.isInteger(f.index)&&messages[f.index]&&match(messages[f.index]))return f.index;
 for(let i=messages.length-1;i>=0;i--)if(match(messages[i]))return i;
 return -1;
}
function register(app,getStore,file,options={}){
 let favorites=[];if(fs.existsSync(file))favorites=JSON.parse(fs.readFileSync(file,'utf8'));
 const save=next=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(tmp,file);favorites=next;};
 const emitFavoriteEvent=(type,item)=>{try{options.onFavoriteEvent?.({type,item:clone(item)});}catch(e){console.error('[favorites] notice hook failed:',e.message);}};
 const view=(f,viewer)=>{
  const owner=ownerOf(f),locked=!!f.locked;
  if(locked&&owner!==viewer)return{id:f.id,owner,locked:true,hidden:true,timestamp:f.timestamp,savedAt:f.savedAt};
  const item={...f,owner,locked,tags:cleanTags(f.tags),index:locate(getStore(),f)};
  // 旧收藏兼容:以前只留下了 [VOICE] 文字标记,读取时也给它补出现有语音文件引用。
  if(item.role==='assistant'&&!(item.assistantVoices?.length)){
   const refs=options.assistantVoiceRefs?.(item.content);
   if(Array.isArray(refs)&&refs.length)item.assistantVoices=clone(refs);
  }
  return item;
 };
 app.get('/api/chat-favorites',(req,res)=>{
  const session=req.query.session||getStore().activeId;
  const viewer=OWNERS.has(req.query.viewer)?req.query.viewer:'her';
  const owner=OWNERS.has(req.query.owner)?req.query.owner:null;
  const items=favorites.filter(f=>f.session===session&&(!owner||ownerOf(f)===owner)).map(f=>view(f,viewer));
  res.json({items});
 });
 app.post('/api/chat-favorites',(req,res)=>{
  const b=req.body||{},session=b.session||getStore().activeId,index=locate(getStore(),{...b,session});if(index<0)return res.status(409).json({error:'这条消息还未保存或已经改变，请等回复结束后再收藏'});
  const m=getStore().sessions.find(s=>s.id===session).messages[index];
  const owner=OWNERS.has(b.owner)?b.owner:'her';
  const requestedVoice=String(b.voiceText||'').trim();
  let voiceText='';
  if(requestedVoice){
   if(m.role!=='assistant')return res.status(400).json({error:'只能单独收藏他的语音条'});
   const voices=[...String(m.content||'').matchAll(/\[VOICE\]([\s\S]*?)\[\/VOICE\]/g)].map(x=>x[1].trim());
   if(!voices.includes(requestedVoice))return res.status(400).json({error:'这段语音已经改变，请刷新后再收藏'});
   voiceText=requestedVoice;
  }
  const savedContent=voiceText||m.content;
  const kind=voiceText?'assistant_voice':'';
  const old=favorites.find(f=>f.session===session&&ownerOf(f)===owner&&f.index===index&&f.content===savedContent&&String(f.kind||'')===kind);
  if(old)return res.json({ok:true,item:view(old,owner),duplicate:true});
  const item={id:crypto.randomUUID(),session,index,owner,role:m.role,content:savedContent,timestamp:m.timestamp,savedAt:new Date().toISOString(),locked:!!b.locked,tags:cleanTags(b.tags),note:String(b.note||'').trim().slice(0,500)};
  if(voiceText){item.kind=kind;item.sourceContent=m.content;}
  if(item.locked)item.lockedAt=item.savedAt;
  for(const key of ['voice','attachments','gift','gallery','call'])if(m[key]!=null)item[key]=clone(m[key]);
  if(m.role==='assistant'){
   const refs=options.assistantVoiceRefs?.(voiceText?`[VOICE]${voiceText}[/VOICE]`:m.content);
   if(Array.isArray(refs)&&refs.length)item.assistantVoices=clone(refs);
  }
  try{save([item,...favorites]);emitFavoriteEvent('saved',item);res.json({ok:true,item:view(item,owner)});}catch{res.status(500).json({error:'收藏未保存，请重试'});}
 });
 app.patch('/api/chat-favorites/:id',(req,res)=>{
  const b=req.body||{},viewer=OWNERS.has(b.viewer)?b.viewer:'her',item=favorites.find(f=>f.id===req.params.id);
  if(!item)return res.status(404).json({error:'没有这份收藏'});
  if(ownerOf(item)!==viewer)return res.status(403).json({error:'只能整理自己的收藏'});
  let lockEvent='';
  if(Object.prototype.hasOwnProperty.call(b,'locked')){
   const next=!!b.locked;
   if(next&&!item.locked){item.lockedAt=new Date().toISOString();lockEvent='locked';}
   if(!next&&item.locked){item.unlockedAt=new Date().toISOString();lockEvent='unlocked';}
   item.locked=next;
  }
  if(Object.prototype.hasOwnProperty.call(b,'tags'))item.tags=cleanTags(b.tags);
  if(Object.prototype.hasOwnProperty.call(b,'note'))item.note=String(b.note||'').trim().slice(0,500);
  try{save(favorites);if(lockEvent)emitFavoriteEvent(lockEvent,item);res.json({ok:true,item:view(item,viewer)});}catch{res.status(500).json({error:'收藏未保存，请重试'});}
 });
 app.delete('/api/chat-favorites/:id',(req,res)=>{
  const viewer=OWNERS.has(req.body?.viewer)?req.body.viewer:'her',item=favorites.find(f=>f.id===req.params.id);
  if(!item)return res.status(404).json({error:'没有这份收藏'});
  if(ownerOf(item)!==viewer)return res.status(403).json({error:'只能移除自己的收藏'});
  try{save(favorites.filter(f=>f.id!==req.params.id));emitFavoriteEvent('deleted',item);res.json({ok:true});}catch{res.status(500).json({error:'未能移除收藏'});}
 });
}
module.exports={register,locate};
