import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {resolve} from 'node:path';
import {timingSafeEqual,randomInt} from 'node:crypto';
import {Game} from './game.js';
const app=express(),server=createServer(app),io=new Server(server,{cors:{origin:true}});
const equal=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y)};
let accounts=[];try{if(process.env.TEACHER_ACCOUNTS)accounts=JSON.parse(process.env.TEACHER_ACCOUNTS)}catch{console.error('TEACHER_ACCOUNTS JSON 오류');process.exit(1)}
if(!Array.isArray(accounts))accounts=[];
if(!accounts.length&&process.env.TEACHER_PIN)accounts=[{id:'teacher',name:'기본 교사',password:process.env.TEACHER_PIN}];
if(!accounts.length||accounts.some(a=>typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{2,32}$/.test(a.id)||typeof a.password!=='string'||a.password.length<6)||new Set(accounts.map(a=>a.id)).size!==accounts.length){console.error('교사 계정 환경변수를 설정하세요.');process.exit(1)}
const rooms=new Map(),teachers=new Map(),students=new Map();
function roomFor(id){if(rooms.has(id))return rooms.get(id);let code;do{code=String(randomInt(100000,1000000))}while([...rooms.values()].some(r=>r.code===code));const r={id,code,game:new Game({emit:()=>broadcast(r)}),sessions:new Map(),sockets:new Map()};rooms.set(id,r);return r;}
const byCode=code=>[...rooms.values()].find(r=>r.code===String(code));
function snapshot(r){return {...r.game.publicState(),roomCode:r.code,roster:r.game.leaderboard().map(p=>({...p,connected:[...r.sockets.values()].includes(p.id)}))};}
function broadcast(r){io.to(`room:${r.code}`).emit('state',snapshot(r));for(const [sid,id] of r.sockets)io.to(sid).emit('my-question',r.game.getQuestion(id));}
function authorized(socket,reply){const id=teachers.get(socket.id);if(!id){reply({error:'교사 로그인이 필요합니다.'});return null}return roomFor(id)}
io.on('connection',socket=>{
 socket.on('teacher:login',(data={},reply=()=>{})=>{const account=accounts.find(a=>a.id===data.id);if(!account||!equal(data.password,account.password))return reply({error:'아이디 또는 비밀번호가 올바르지 않습니다.'});const r=roomFor(account.id);teachers.set(socket.id,account.id);socket.join(`room:${r.code}`);reply({ok:true,roomCode:r.code,teacherName:account.name||account.id});socket.emit('state',snapshot(r));});
 socket.on('player:join',(data={},reply=()=>{})=>{const {id,name,secret,roomCode}=data,r=byCode(roomCode);if(!r)return reply({error:'반 코드를 확인하세요.'});if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||typeof secret!=='string'||!/^[0-9a-f-]{36}$/i.test(secret))return reply({error:'참가 정보를 확인하세요.'});const old=r.sessions.get(id);if(old&&!equal(old,secret))return reply({error:'이미 사용 중인 참가 정보입니다.'});const result=r.game.join(id,name);if(!result.ok)return reply(result);r.sessions.set(id,secret);const prev=students.get(socket.id);if(prev) {prev.room.sockets.delete(socket.id);socket.leave(`room:${prev.room.code}`)}students.set(socket.id,{room:r,id});r.sockets.set(socket.id,id);socket.join(`room:${r.code}`);reply({...result,roomCode:r.code});socket.emit('state',snapshot(r));socket.emit('my-question',r.game.getQuestion(id));broadcast(r);});
 socket.on('player:answer',(data={},reply=()=>{})=>{const entry=students.get(socket.id);if(!entry)return reply({error:'먼저 참가하세요.'});const result=entry.room.game.answer(entry.id,data.choice,data.version);reply(result);});
 socket.on('teacher:start',(_,reply=()=>{})=>{const r=authorized(socket,reply);if(r)reply(r.game.start())});
 socket.on('teacher:reset',(_,reply=()=>{})=>{const r=authorized(socket,reply);if(!r)return;r.game.reset();r.sessions.clear();for(const [sid,e] of students)if(e.room===r){students.delete(sid);r.sockets.delete(sid);io.to(sid).emit('game:reset')}broadcast(r);reply({ok:true});});
 socket.on('teacher:questions',(data,reply=()=>{})=>{const r=authorized(socket,reply);if(!r)return;reply(r.game.setQuestions(data));});
 socket.on('disconnect',()=>{teachers.delete(socket.id);const e=students.get(socket.id);if(e){e.room.sockets.delete(socket.id);students.delete(socket.id);broadcast(e.room)}});
});
app.get('/api/health',(_req,res)=>res.json({ok:true,rooms:rooms.size}));const dist=resolve(process.cwd(),'dist');app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(resolve(dist,'index.html')));server.listen(Number(process.env.PORT)||3000,'0.0.0.0');
