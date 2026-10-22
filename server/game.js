import {FIXED_QUESTIONS} from '../src/questions.js';
const validName=x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=20;
export function validateQuestions(items){
 if(!Array.isArray(items)||items.length<1||items.length>100)return '문제는 1~100개까지 등록할 수 있습니다.';
 for(const [i,q] of items.entries()){
  if(typeof q.question!=='string'||!q.question.trim()||q.question.length>300)return `${i+1}번 문제의 설명을 확인하세요.`;
  if(!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>typeof x!=='string'||!x.trim()||x.length>100)||new Set(q.options).size!==4)return `${i+1}번 문제는 중복 없는 보기 4개가 필요합니다.`;
  if(!q.options.includes(q.correctAnswer))return `${i+1}번 정답이 보기에 없습니다.`;
 }return null;
}
export class Game{
 constructor({emit=()=>{},now=()=>Date.now(),questions=FIXED_QUESTIONS}={}){this.emit=emit;this.now=now;this.questions=structuredClone(questions);this.players=new Map();this.status='lobby';this.startedAt=null;this.version=0;}
 leaderboard(){return [...this.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,index:p.index,correctCount:p.index,attempts:p.attempts,mistakes:p.mistakes,finishedAt:p.finishedAt,elapsedMs:p.finishedAt? p.finishedAt-this.startedAt:null,progress:p.index,completed:p.finishedAt!==null})).sort((a,b)=>Number(b.completed)-Number(a.completed)||(a.completed&&b.completed?(a.elapsedMs-b.elapsedMs||a.mistakes-b.mistakes):(b.index-a.index||a.mistakes-b.mistakes||b.score-a.score))||a.name.localeCompare(b.name,'ko')).map((p,i)=>({...p,rank:i+1}));}
 publicState(){return {status:this.status,total:this.questions.length,startedAt:this.startedAt,serverNow:this.now(),version:this.version,players:this.leaderboard(),finishedCount:[...this.players.values()].filter(p=>p.finishedAt!==null).length};}
 broadcast(){this.emit('state',this.publicState());}
 join(id,name){if(!validName(name))return {error:'이름은 1~20자로 입력해 주세요.'};if(!this.players.has(id)&&this.players.size>=120)return {error:'참가 인원이 가득 찼습니다.'};if(this.status==='finished'&&!this.players.has(id))return {error:'게임이 종료되었습니다.'};let p=this.players.get(id);if(p)p.name=name.trim();else {p={id,name:name.trim(),score:0,index:0,attempts:0,mistakes:0,finishedAt:null,wrongChoices:new Set()};this.players.set(id,p)}this.broadcast();return {ok:true,id};}
 start(){if(this.status!=='lobby')return {error:'이미 시작한 게임입니다.'};this.status='running';this.startedAt=this.now();this.broadcast();return {ok:true};}
 getQuestion(id){const p=this.players.get(id);if(!p)return null;const q=this.questions[p.index];return {index:p.index,total:this.questions.length,question:q?{question:q.question,options:q.options}:null,wrongChoices:[...p.wrongChoices],completed:p.finishedAt!==null,version:this.version};}
 answer(id,choice,version){const p=this.players.get(id);if(!p)return {error:'먼저 참가하세요.'};if(this.status!=='running')return {error:'게임이 진행 중이지 않습니다.'};if(version!==this.version)return {error:'게임이 초기화되었습니다. 화면을 새로고침하세요.'};if(p.finishedAt!==null)return {error:'이미 완주했습니다.'};const q=this.questions[p.index];if(typeof choice!=='string'||!q.options.includes(choice))return {error:'보기를 선택하세요.'};if(p.wrongChoices.has(choice))return {error:'이미 선택한 오답입니다.'};p.attempts++;const correct=choice===q.correctAnswer;const earned=correct?Math.max(100,1000-200*p.wrongChoices.size):0;
 if(correct){p.score+=earned;p.index++;p.wrongChoices=new Set();if(p.index===this.questions.length)p.finishedAt=this.now();}else{p.mistakes++;p.wrongChoices.add(choice)}this.broadcast();return {ok:true,correct,earned,...this.getQuestion(id)};}
 reset(){this.players.clear();this.status='lobby';this.startedAt=null;this.version++;this.broadcast();return {ok:true};}
 setQuestions(items){const error=validateQuestions(items);if(error)return {error};if(this.status!=='lobby'||this.players.size)return {error:'문제 변경은 참가자가 없는 대기실에서만 가능합니다. 먼저 초기화하세요.'};this.questions=structuredClone(items);this.version++;this.broadcast();return {ok:true,total:items.length};}
}
