import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Game } from './game.js';

const app=express(); const server=createServer(app); const io=new Server(server,{cors:{origin:true}});
const port=Number(process.env.PORT)||3000;
const teacherPin=process.env.TEACHER_PIN;
if(!teacherPin || teacherPin.length<6) {console.error('TEACHER_PIN 환경 변수를 6자리 이상으로 설정해야 합니다.');process.exit(1);}
const equal=(a,b)=>{const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const game=new Game({emit:(event,payload)=>io.emit(event,payload)});
const identities=new Map();
const teacherIds=new Set();
const sessions=new Map(); // id -> session secret; issued at join and held in sessionStorage
const teacherAuth=(socket,fn)=>{if(!teacherIds.has(socket.id)){fn({error:'교사 인증이 필요합니다.'});return false;}return true;};
const syncAnswers=()=>{for(const [socketId,id] of identities){const answer=game.getAnswer(id);if(answer)io.to(socketId).emit('my-answer',answer);}};
io.on('connection',socket=>{
  socket.emit('state',game.publicState());
  socket.on('teacher:login',(pin,reply=()=>{})=>{if(equal(pin,teacherPin)){teacherIds.add(socket.id);reply({ok:true});socket.emit('state',game.publicState());}else reply({error:'교사 비밀번호가 올바르지 않습니다.'});});
  socket.on('player:join',(data={},reply=()=>{})=>{
    const {id,name,secret}=data;
    const key=typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)?id:'';
    if(!key || typeof secret!=='string' || !/^[0-9a-f-]{36}$/i.test(secret))return reply({error:'참가 정보를 확인해 주세요.'});
    const existing=sessions.get(key);
    if(existing && existing!==secret)return reply({error:'이미 사용 중인 참가 정보입니다. 새로고침 후 다시 참가해 주세요.'});
    const response=game.join(key,name);
    if(response.ok){if(!existing)sessions.set(key,secret);identities.set(socket.id,key);socket.emit('my-answer',game.getAnswer(key));}
    reply(response);
  });
  socket.on('player:answer',(choice,reply=()=>{})=>{const id=identities.get(socket.id);const result=game.answer(id,choice);reply(result);if(result.ok)socket.emit('my-answer',result);});
  socket.on('teacher:start',(_,reply=()=>{})=>{if(!teacherAuth(socket,reply))return;if(game.status!=='lobby')return reply({error:'게임이 이미 시작되었습니다.'});game.startQuestion(0);syncAnswers();reply({ok:true});});
  socket.on('teacher:reveal',(_,reply=()=>{})=>{if(!teacherAuth(socket,reply))return;game.reveal();reply({ok:true});});
  socket.on('teacher:next',(_,reply=()=>{})=>{if(!teacherAuth(socket,reply))return;game.next();syncAnswers();reply({ok:true});});
  socket.on('teacher:reset',(_,reply=()=>{})=>{if(!teacherAuth(socket,reply))return;game.reset();sessions.clear();identities.clear();io.emit('game:reset');reply({ok:true});});
  socket.on('disconnect',()=>{identities.delete(socket.id);teacherIds.delete(socket.id);});
});
app.get('/api/health',(_req,res)=>res.json({ok:true,players:game.players.size,status:game.status}));
const dist=resolve(process.cwd(),'dist');app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
server.listen(port,'0.0.0.0',()=>console.log(`어휘 배틀 실행 중: ${port}`));
