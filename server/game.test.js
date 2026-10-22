import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,TOTAL} from './game.js';
import {FIXED_QUESTIONS} from '../src/questions.js';

test('24 original questions are retained and have valid answers',()=>{assert.equal(TOTAL,24);for(const q of FIXED_QUESTIONS){assert.equal(q.options.length,4);assert.ok(q.options.includes(q.correctAnswer));}});
test('same question, answer only once, speed scoring, leaderboard and full progression',()=>{
 let now=1000;let tasks=[];let messages=[];
 const game=new Game({now:()=>now,emit:(ev,data)=>messages.push(data),schedule:(fn,ms)=>{const t={fn,at:now+ms};tasks.push(t);return t;},cancel:t=>{tasks=tasks.filter(x=>x!==t)}});
 assert.equal(game.join('a','학생A').ok,true);assert.equal(game.join('b','학생B').ok,true);
 game.startQuestion(0);assert.equal(game.publicState().question.question,FIXED_QUESTIONS[0].question);
 assert.equal(game.publicState().correctAnswer,null);
 const first=game.answer('a',FIXED_QUESTIONS[0].correctAnswer);assert.equal(first.earned,1000);
 assert.equal(game.answer('a',FIXED_QUESTIONS[0].correctAnswer).error,'이미 답변했습니다.');
 now+=10000;assert.equal(game.answer('b',FIXED_QUESTIONS[0].options.find(x=>x!==FIXED_QUESTIONS[0].correctAnswer)).earned,0);
 assert.equal(game.leaderboard()[0].name,'학생A');
 game.reveal();assert.equal(game.publicState().correctAnswer,FIXED_QUESTIONS[0].correctAnswer);
 for(let i=1;i<24;i++){game.next();assert.equal(game.index,i);assert.equal(game.publicState().question.question,FIXED_QUESTIONS[i].question);game.reveal();}
 game.next();assert.equal(game.status,'finished');assert.equal(game.leaderboard()[0].score,1000);
 game.reset();assert.equal(game.status,'lobby');assert.equal(game.players.size,0);
});
test('rejects late submissions and unknown users',()=>{let now=0;const g=new Game({now:()=>now,schedule:()=>1,cancel:()=>{}});g.join('a','학생');g.startQuestion(0);now=26000;assert.ok(g.answer('a',FIXED_QUESTIONS[0].correctAnswer).error);assert.ok(g.answer('no','a').error);});
