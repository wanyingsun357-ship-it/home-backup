'use strict';
// Preserve media references, not binary payloads or reasoning, in text continuity.
function body(m){
 const parts=[String(m.content||'')];
 if(m.voice)parts.push(`（这条是语音，正文为转写；原音频：${m.voice.url||m.voice.path||'见原聊天记录'}${m.voice.dur?'；时长 '+m.voice.dur+' 秒':''}）`);
 for(const a of m.attachments||[])parts.push(`（附件：${a.name||'未命名'}；${a.type||'文件'}；原文件：${a.path||a.url||'见原聊天记录'}）`);
 if(m.gift?.url)parts.push(`（图片：${m.gift.title||'图片'}；${m.gift.url}）`);
 return parts.filter(Boolean).join('\n');
}
module.exports={body};
