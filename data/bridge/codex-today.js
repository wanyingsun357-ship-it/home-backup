'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function prepare(threadId,{source='/root/ayan/today.md',dir=path.join(__dirname,'today-state')}={}){
 const text=fs.readFileSync(source,'utf8');const hash=crypto.createHash('sha256').update(text).digest('hex');
 const file=path.join(dir,crypto.createHash('sha256').update(threadId).digest('hex')+'.json');let previous;
 try{previous=JSON.parse(fs.readFileSync(file,'utf8')).hash;}catch{}
 return {text:previous===hash?'':'<本轮最新状态>\n'+text+'\n</本轮最新状态>',commit(){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({hash}),{mode:0o600});fs.renameSync(tmp,file);
 }};
}
module.exports={prepare};
