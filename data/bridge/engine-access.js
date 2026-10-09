'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const file=path.join(__dirname,'.engine-access.json');
let state;
if(fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));
else {state={secret:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});}
const internal=crypto.createHmac('sha256',state.secret).update('internal').digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function issue(){const body=Buffer.from(JSON.stringify({expires:Date.now()+180*86400000,nonce:crypto.randomBytes(12).toString('hex')})).toString('base64url');return body+'.'+crypto.createHmac('sha256',state.secret).update(body).digest('hex');}
function authorized(req){
 if(equal(req.headers.authorization,'Bearer '+internal))return true;
 const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ayan_device='))?.slice(12);
 if(!value)return false;const [body,sig]=value.split('.');
 if(!equal(sig,crypto.createHmac('sha256',state.secret).update(body).digest('hex')))return false;
 try{return JSON.parse(Buffer.from(body,'base64url')).expires>Date.now();}catch{return false;}
}
let failures=0,failSince=0;
function registerAccess(app,{express,isCodex}){
 app.post('/api/engine/unlock',express.json({limit:'2kb'}),(req,res)=>{
  // Pair codes are issued by a separate admin process; read the latest state.
  state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Date.now()-failSince>3600000){failSince=Date.now();failures=0;}
  if(failures>=12)return res.status(429).json({error:'配对尝试太多，请稍后再试'});
  const code=String(req.body?.code||'').replace(/[\s-]/g,'').toUpperCase();
  const hash=crypto.createHash('sha256').update(code).digest('hex');
  if(!state.pairHash||Date.now()>state.pairExpires||!equal(hash,state.pairHash)){failures++;return res.status(403).json({error:'配对码不正确或已过期'});}
  res.setHeader('Set-Cookie','ayan_device='+issue()+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=15552000');
  delete state.pairHash;delete state.pairExpires;fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
  res.json({ok:true});
 });
 app.use('/api',(req,res,next)=>{
  const publicMetadata=['GET','HEAD'].includes(req.method)&&['/models','/engine','/health'].includes(req.path);
  const mustProtect=req.method!=='OPTIONS'&&!publicMetadata;
  if(mustProtect&&!authorized(req))return res.status(401).json({error:'device_pairing_required'});
  next();
 });
 const original=global.fetch;
 if(!global.__ayanInternalFetch){global.__ayanInternalFetch=true;global.fetch=(input,options={})=>{
  const url=typeof input==='string'?input:input?.url;
  if(url&&/^http:\/\/127\.0\.0\.1:3000\/api\//.test(url)){const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+internal);return original(input,{...options,headers});}
  return original(input,options);
 };}
}
function pairCode(){const code=crypto.randomBytes(8).toString('hex').toUpperCase();state.pairHash=crypto.createHash('sha256').update(code).digest('hex');state.pairExpires=Date.now()+86400000;fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});return code.match(/.{4}/g).join('-');}
module.exports={registerAccess,authorized,internal,pairCode};
