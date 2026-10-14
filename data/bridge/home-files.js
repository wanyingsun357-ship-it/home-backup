'use strict';
const fs=require('fs'),path=require('path');
const MEDIA=/\.(?:png|jpe?g|gif|webp|heic|heif|avif|svg|ico|mp3|m4a|aac|wav|ogg|opus|flac|mp4|mov|webm|mkv)$/i;
function fileRef(raw){try{const u=new URL(String(raw).trim(),'https://entangledforever.com');if(!['entangledforever.com','www.entangledforever.com','localhost','127.0.0.1','45.77.208.204'].includes(u.hostname))return null;const p=decodeURIComponent(u.pathname);if(!/^\/(made|uploads)\//.test(p)||p.includes('\\')||p.includes('\0'))return null;const parts=p.slice(1).split('/');if(parts.some(s=>!s||s==='.'||s==='..'||s.startsWith('.')))return null;return {key:parts.join('/'),url:'/'+parts.map(encodeURIComponent).join('/'),name:parts.at(-1),source:parts[0]};}catch{return null;}}
function list(store,root,session=''){
 if(session&&session!=='unassigned'&&!store.sessions.some(s=>s.id===session))throw Error('找不到这个家');
 const files=new Map();
 function add(raw,sid,title,at,mime=''){
  const ref=fileRef(raw);if(!ref||MEDIA.test(ref.name)||/^(image|audio|video)\//i.test(mime))return;
  let file=files.get(ref.key);if(!file){file={...ref,title:title||ref.name,sessions:[],at:at||null};files.set(ref.key,file);}
  if(sid&&!file.sessions.includes(sid))file.sessions.push(sid);
  if(at&&(!file.at||at>file.at))file.at=at;
  if(title&&file.title===ref.name)file.title=title;
 }
 for(const s of store.sessions)for(const m of s.messages||[]){
  for(const a of m.attachments||[])if(a&&typeof a==='object')add(a.url,s.id,a.name,m.timestamp,a.type);
  const content=String(m.content||'');
  for(const match of content.matchAll(/\[([^\]\n]+)\]\(([^\s)]+)\)/g))add(match[2],s.id,match[1],m.timestamp);
  for(const match of content.matchAll(/(?:https?:\/\/[^\s/<>"']+)?\/(?:made|uploads)\/[^\s<>"'\]\)）]+/g))add(match[0].replace(/[，。；;,]+$/,''),s.id,null,m.timestamp);
 }
 function walk(dir){if(!fs.existsSync(dir))return;for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.name.startsWith('.'))continue;const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(d.isFile())add('/'+path.relative(root,p).split(path.sep).map(encodeURIComponent).join('/'));}}
 walk(path.join(root,'made'));
 const result=[];const realRoot=fs.realpathSync(root)+path.sep;
 for(const f of files.values()){
  if(session==='unassigned'?f.sessions.length:session&&!f.sessions.includes(session))continue;
  let stat;try{const p=fs.realpathSync(path.join(root,f.key));if(!p.startsWith(realRoot))continue;stat=fs.statSync(p);if(!stat.isFile())continue;}catch{}
  result.push({...f,size:stat?.size||0,missing:!stat,at:f.at||stat?.mtime.toISOString()||null,ext:path.extname(f.name).slice(1).toUpperCase()||'FILE'});
 }
 result.sort((a,b)=>(b.at||'').localeCompare(a.at||''));
 return {items:result,sessions:store.sessions.map(s=>({id:s.id,title:s.title}))};
}
function register(app,getStore,root){app.get('/api/home-files',(req,res)=>{res.set('Cache-Control','no-store');try{res.json(list(getStore(),root,String(req.query.session||'')));}catch(e){res.status(400).json({error:e.message});}});}
module.exports={fileRef,list,register};
