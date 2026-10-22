import { randomUUID } from 'node:crypto';
import { FIXED_QUESTIONS } from '../src/questions.js';

export const TOTAL = FIXED_QUESTIONS.length;
const MAX_PLAYERS = 120;
const DURATION = 25;
const REVEAL_MS = 4500;
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 20;

export class Game {
  constructor({emit = () => {}, now = () => Date.now(), schedule = (fn,ms)=>setTimeout(fn,ms), cancel = clearTimeout} = {}) {
    this.emit = emit; this.now = now; this.schedule = schedule; this.cancel = cancel;
    this.players = new Map(); this.teacherSockets = new Set(); this.status = 'lobby'; this.index = 0;
    this.endsAt = null; this.timer = null; this.revealTimer = null; this.round = 0;
  }
  leaderboard() {return [...this.players.values()].map(({id,name,score,streak,correctCount})=>({id,name,score,streak,correctCount})).sort((a,b)=>b.score-a.score||b.correctCount-a.correctCount||a.name.localeCompare(b.name,'ko')).map((p,i)=>({...p,rank:i+1}));}
  publicState() {
    const q = FIXED_QUESTIONS[this.index];
    return {status:this.status,index:this.index,total:TOTAL,endsAt:this.endsAt,serverNow:this.now(),duration:DURATION,round:this.round,question:this.status==='lobby'?null:{question:q.question,options:q.options},correctAnswer:['reveal','finished'].includes(this.status)?q.correctAnswer:null,players:this.leaderboard(),answeredCount:[...this.players.values()].filter(p=>p.answers.has(this.index)).length};
  }
  broadcast(){this.emit('state',this.publicState());}
  join(id,name){
    if(!validName(name)) return {error:'이름이나 별명을 1~20자로 입력해 주세요.'};
    if(this.status==='finished') return {error:'게임이 종료되었습니다. 다음 게임을 기다려 주세요.'};
    if(!this.players.has(id)&&this.players.size>=MAX_PLAYERS) return {error:'참가 가능 인원이 가득 찼습니다.'};
    const old=this.players.get(id);
    if(old) old.name=name.trim();
    else this.players.set(id,{id,name:name.trim(),score:0,streak:0,correctCount:0,answers:new Map()});
    this.broadcast(); return {ok:true,id};
  }
  answer(id,choice){
    const p=this.players.get(id); const q=FIXED_QUESTIONS[this.index];
    if(!p) return {error:'먼저 게임에 참가해 주세요.'};
    if(this.status!=='question'||this.now()>=this.endsAt) return {error:'답변 시간이 끝났습니다.'};
    if(p.answers.has(this.index)) return {error:'이미 답변했습니다.'};
    if(typeof choice!=='string'||!q.options.includes(choice)) return {error:'올바른 보기를 선택해 주세요.'};
    const correct=choice===q.correctAnswer;
    const timeLeft=Math.max(0,this.endsAt-this.now());
    const earned=correct?Math.round(500+500*timeLeft/(DURATION*1000))+Math.min(p.streak,5)*50:0;
    p.answers.set(this.index,{choice,correct,earned});
    if(correct){p.score+=earned;p.streak+=1;p.correctCount+=1;}else p.streak=0;
    this.broadcast(); return {ok:true,choice,correct,earned};
  }
  clearTimers(){if(this.timer)this.cancel(this.timer);if(this.revealTimer)this.cancel(this.revealTimer);this.timer=null;this.revealTimer=null;}
  startQuestion(index){
    this.clearTimers();this.index=index;this.status='question';this.endsAt=this.now()+DURATION*1000;
    const round=++this.round;this.broadcast();
    this.timer=this.schedule(()=>{if(round===this.round&&this.status==='question')this.reveal();},DURATION*1000);
  }
  reveal(){
    if(this.status!=='question')return;
    this.clearTimers();this.status='reveal';this.endsAt=null;this.broadcast();
    const round=this.round;
    this.revealTimer=this.schedule(()=>{if(round===this.round&&this.status==='reveal')this.next();},REVEAL_MS);
  }
  next(){if(this.status!=='reveal')return;this.clearTimers();if(this.index===TOTAL-1){this.status='finished';this.endsAt=null;this.broadcast();}else this.startQuestion(this.index+1);}
  reset(){this.clearTimers();this.round++;this.players.clear();this.status='lobby';this.index=0;this.endsAt=null;this.broadcast();}
  getAnswer(id){return this.players.get(id)?.answers.get(this.index) || null;}
}
