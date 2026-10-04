import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarForPlan,parseReminder,localDateTime} from '../public/workspace-calendar.js';
const plan={id:'48f801e9-a0d0-4ca3-b00c-4dc443758349',title:'开始, 作业; step\\one\nTwo',steps:[{text:'打开说明',done:false},{text:'Ask, clearly; now',done:true}],remindAt:Date.UTC(2027,0,2,14,30),remindMinutes:30};
test('calendar exports UTC event and explicit offset alarm with escaped Unicode text',()=>{
 const ics=calendarForPlan(plan,{language:'zh',now:Date.UTC(2026,9,4)});
 assert.ok(ics.includes('DTSTART:20270102T143000Z\r\n'));
 assert.ok(ics.includes('DTEND:20270102T143500Z\r\n'));
 assert.ok(ics.includes('TRIGGER:-PT30M\r\n'));
 assert.ok(ics.includes('SUMMARY:开始\\, 作业\\; step\\\\one\\nTwo\r\n'));
 assert.ok(ics.includes('DESCRIPTION:1. ○ 打开说明\\n2. ✓ Ask\\, clearly\\; now\r\n'));
 assert.equal(ics.match(/BEGIN:VALARM/g).length,1);
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
 assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false);
});
test('calendar folds by UTF-8 bytes without splitting Chinese characters or emoji',()=>{
 const title='共识之地🐸'.repeat(30),ics=calendarForPlan({...plan,title},{now:Date.UTC(2026,9,4)});
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 const unfolded=ics.replace(/\r\n /g,'');
 assert.ok(unfolded.includes('SUMMARY:'+title+'\r\n'));
 assert.equal(unfolded.includes('�'),false);
});
test('calendar text cannot inject additional calendar properties',()=>{
 const ics=calendarForPlan({...plan,title:'hello\r\nATTENDEE:mailto:other@example.org',remindMinutes:0});
 assert.ok(ics.includes('SUMMARY:hello\\nATTENDEE:mailto:other@example.org'));
 assert.equal(ics.includes('\r\nATTENDEE:'),false);
 assert.ok(ics.includes('TRIGGER:-PT0M'));
});
test('optional local reminder validates exact date and future time',()=>{
 assert.equal(parseReminder(''),null);
 assert.throws(()=>parseReminder('2027-02-30T12:00',0),/workspaceInvalidReminder/);
 assert.throws(()=>parseReminder('2027-01-02T25:00',0),/workspaceInvalidReminder/);
 assert.throws(()=>parseReminder('bad',0),/workspaceInvalidReminder/);
 const expected=new Date(2027,0,2,14,30).getTime();
 assert.equal(parseReminder('2027-01-02T14:30',0),expected);
 assert.equal(localDateTime(expected),'2027-01-02T14:30');
 assert.throws(()=>parseReminder('2027-01-02T14:30',expected),/workspaceInvalidReminder/);
 assert.throws(()=>calendarForPlan({...plan,remindAt:null}),/workspaceInvalidReminder/);
});
