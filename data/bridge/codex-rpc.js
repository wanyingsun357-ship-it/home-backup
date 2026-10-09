'use strict';
const {spawn}=require('child_process');
const {EventEmitter}=require('events');
class CodexRpc extends EventEmitter {
  constructor({cwd='/root/ayan',configArgs=[],env={}}={}) {
    super();this.seq=0;this.pending=new Map();this.buffer='';this.closed=false;
    const clean={...process.env,...env};
    for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN'])delete clean[key];
    this.child=spawn('codex',['app-server','--listen','stdio://',...configArgs],{cwd,env:clean,stdio:['pipe','pipe','pipe']});
    this.child.stdout.on('data',d=>{this.buffer+=d;let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);try{this.receive(JSON.parse(line));}catch{}}});
    this.child.stderr.on('data',()=>{}); // Auth/transport debug output must not enter App logs.
    this.child.on('error',e=>this.shutdown(e));
    this.child.on('close',()=>this.shutdown(new Error('Codex connection closed')));
  }
  receive(message) {
    if(message.id!=null && !message.method){const entry=this.pending.get(message.id);if(!entry)return;this.pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(message.error.message||'Codex request failed')):entry.resolve(message.result);return;}
    if(message.id!=null&&message.method){this.emit('request',message);return;}
    if(message.method)this.emit('notification',message);
  }
  write(message){if(this.closed)throw new Error('Codex connection closed');this.child.stdin.write(JSON.stringify(message)+'\n');}
  call(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex request timed out: '+method));},timeout);this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  async initialize(){await this.call('initialize',{clientInfo:{name:'ayan_home',title:'晏白的家',version:'1.0.0'}});this.write({method:'initialized',params:{}});return this;}
  shutdown(error){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.emit('closed',error);}
  close(){this.child.kill();}
}
module.exports={CodexRpc};
