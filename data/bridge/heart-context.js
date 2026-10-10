'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function prepare(threadId,{dir=path.join(__dirname,'heart-state')}={}){
 const file=path.join(dir,crypto.createHash('sha256').update(threadId).digest('hex')+'.json');
 let version=0;try{version=JSON.parse(fs.readFileSync(file,'utf8')).version;}catch{}
 return {text:version===3?'':'<小云朵表达规范>\n'+require('./heart-voice').prompt+'\n</小云朵表达规范>',commit(){fs.mkdirSync(dir,{recursive:true,mode:0o700});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,'{"version":3}',{mode:0o600});fs.renameSync(tmp,file);}};
}
module.exports={prepare};
