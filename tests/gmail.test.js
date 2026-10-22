const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const S=require('../sync'),F=require('../formats');
const fixture=fs.readFileSync(__dirname+'/fixtures/gmail-production.txt','utf8');
const parse=(text,name='David Denk',year=2026)=>S.parse(text,new Date('2026-10-21T12:00:00'),[name],{year});
const mine=(saved,rows,name='David Denk')=>S.automatic(saved,rows,{name,mode:'mine'});
test('exact user-supplied Gmail text: 20 complete assignment rows, three selected shared/single jobs',()=>{
 const p=parse(fixture);assert.equal(p.rows.length,20);assert.deepEqual(p.warnings,[]);
 const personal=mine([],p.rows);assert.equal(personal.counts.added,3);assert.equal(personal.counts.attention,0);
 assert.deepEqual(personal.next.map(a=>[a.school,a.date]),[['Bruton HS','2026-10-21'],['Grafton High','2026-10-22'],['Petsworth ES','2026-10-23']]);
 assert.equal(mine([],parse(fixture,'Monica').rows,'Monica').counts.added,3);
 assert.equal(mine([],parse(fixture,'Ben').rows,'Ben').counts.added,6);
 assert.equal(mine([],p.rows,'David').counts.added,0);
});
test('time ranges, hour-only games, setup, addresses and operational notes stay intact',()=>{
 const rows=parse(fixture).rows;
 const deep=rows.find(a=>a.school.includes('Chesterfield'));assert.equal(deep.startTime,'08:10');assert.equal(deep.endTime,'14:00');assert.equal(deep.address,'17151 Westerleigh Pkwy.Moseley, VA 23120');assert(deep.scheduleNotes.includes('must sign in'));
 const head=rows.find(a=>a.school==='WJCC Admin');assert.equal(head.arrivalTime,'07:30');assert.equal(head.startTime,'08:00');assert.equal(head.endTime,'16:00');assert.equal(head.location,'James City County Recreation Center');
 assert.equal(rows.find(a=>a.school==='James River').startTime,'18:00');assert.equal(rows.find(a=>a.school==='James River').location,'Midlothian HS');
 assert.equal(rows.find(a=>a.school==='Hornsby MS').endTime,undefined);
 assert(rows.find(a=>a.school==='Petsworth ES').scheduleNotes.includes('10/15 ji'));
 assert(!rows.some(a=>a.school.includes('unavailable')||a.school.includes('appt')));
});
test('selected user does not depend on every other name or role being parseable',()=>{
 const t='Wed, Oct 21\n- **C** Sample HS UC 2C - 8am - gym - LS TBD (driver?), ???, DAVID DENK XYZ db-ftp 10/15 ji';
 const p=parse(t);assert.equal(mine([],p.rows).counts.added,1);assert(p.rows[0].photographers.some(n=>S.nameMatch(n,'David Denk')));
 const wrong='Wed, Oct 21\n- **C** David Denk School UC 2C - 8am - gym - LS Tripp db-ftp 10/15 ji (call David Denk)\n- **C** Another HS UC 2C - 9am - Notes: call LS David Denk';
 assert.equal(mine([],parse(wrong).rows).counts.added,0);
});
test('date context: explicit and selected years, Dec/Jan transitions, operational dates not headings',()=>{
 const p=parse('Wed, Dec 30\n- **C** First HS UC 2C - 8am - LS David Denk\nFri, Jan 1\n- **C** Second HS UC 2C - 9am - LS David Denk\n10/15\nDB rec’d');
 assert.deepEqual(p.rows.map(a=>a.date),['2026-12-30','2027-01-01']);assert(p.rows[1].scheduleNotes.includes('10/15'));
 const clipped=parse('Wed, Oct 21\n- **C** Last HS UC 2C - 8am - LS David Denk\n[Message clipped] View entire message');assert.equal(mine([],clipped.rows).counts.added,1);
 const explicit=parse('Wed, Dec 31, 2025\n- **C** First HS UC 2C - 8am - LS David Denk\nThu, Jan 1\n- **C** Second HS UC 2C - 8am - LS David Denk');
 assert.deepEqual(explicit.rows.map(a=>a.date),['2025-12-31','2026-01-01']);
 assert.equal(parse('Mon, Nov 9\n- **C** Other HS UC 2C - 8am - LS David Denk','David Denk',2037).rows[0].date,'2037-11-09');
});
test('repeated Gmail imports, time changes, reschedules and omitted history stay safe',()=>{
 const p=parse(fixture),initial=mine([],p.rows).next;
 initial[0].notes='Manual notes';initial[0].contacts='My contact';initial[0].address='Custom address';initial.push({id:'past',date:'2000-01-01',school:'History',notes:'Keep'});
 const again=mine(initial,p.rows);assert.equal(again.counts.unchanged,3);assert.deepEqual(again.next,initial);
 const changed=parse(fixture.replace('10:00am- 11:30am','arrival 9:15am - start 10:15am - end 11:30am'));
 const update=mine(initial,changed.rows);assert.equal(update.counts.updated,1);assert.equal(update.next[0].arrivalTime,'09:15');assert.equal(update.next[0].startTime,'10:15');assert.equal(update.next[0].notes,'Manual notes');assert.equal(update.next[0].address,'Custom address');assert.deepEqual(update.next.at(-1),initial.at(-1));
 const moved={...p.rows.find(a=>a.school==='Bruton HS'),date:'2026-11-09'};const pending=mine(initial,[moved]);assert.equal(pending.counts.attention,1);assert.deepEqual(pending.next,initial);
});
test('attention compaction preserves distinct revisions and candidate choices; legacy noise is archived',()=>{
 const incoming=parse(fixture).rows.find(a=>a.school==='Bruton HS');
 const items=[{id:'a',incoming,candidates:['saved-1'],message:'Review'},{id:'b',incoming:{...incoming,scheduleNotes:'  '+incoming.scheduleNotes+' '},candidates:['saved-2'],message:'Other detail'},{id:'c',incoming:{...incoming,date:'2026-12-01'},candidates:['saved-1'],message:'Review'},{id:'legacy',incoming,candidates:[],message:'No photographer could be identified for this entry. It was not imported.'}];
 const compact=S.compactAttention(items);assert.equal(compact.length,2);assert(compact[0].candidates.includes('saved-2'));assert(compact[0].mergedIds.includes('b'));assert(compact[0].relatedMessages.includes('Other detail'));assert(!compact[0].archived);
 const noise=S.compactAttention([items[3]]);assert.equal(noise[0].id,'legacy');assert.equal(noise[0].archived,true);
});
test('CSV/TSV preserve cells, quoted newlines, unknown fields and date inheritance',()=>{
 const csv='School,Date,Type,Start,Photographers,Notes\n"Example School",2026-10-21,UC 2C,8am,"David Denk, ???","Bring backdrop\nand badge"';
 const p=parse(csv);assert.equal(p.rows.length,1);assert.equal(mine([],p.rows).counts.added,1);assert(p.rows[0].scheduleNotes.includes('\nand badge'));
 const tsv='School\tDate\tType\tPhotographers\nFirst HS\t2026-10-21\tUC 2C\tDavid Denk\nSecond HS\t\tUC 2C\tDavid Denk';assert.deepEqual(parse(tsv).rows.map(a=>a.date),['2026-10-21','2026-10-21']);
 assert.throws(()=>parse('Example HS\t8am\tDavid Denk'),/headings/);assert.throws(()=>F.delimited('School,Notes\n"broken',','),/unclosed/);
});
test('large 1000-row Gmail email excludes unrelated or unidentified work without attention overload',()=>{
 const large='From: sender@example.test\nTo: recipient@example.test\nSubject: Schedule\nWed, Oct 21\n'+Array.from({length:1000},(_,i)=>`- **C** Campus ${i} HS UC 2C - 8am - gym - ${i%100===0?'LS Unknown ?, David Denk XYZ db-ftp 10/15 ji':i%2?'LS Other Person ABC db-ftp 10/15 ji':'ITIN needed; names pending'}`).join('\n');
 const began=performance.now(),p=parse(large),result=mine([],p.rows);assert.equal(p.rows.length,1000);assert.equal(result.counts.added,10);assert.equal(result.counts.attention,0);assert.equal(result.attention.length,0);
 const again=mine(result.next,parse(large).rows);assert.equal(again.counts.unchanged,10);assert.equal(again.counts.added,0);
 const elapsed=performance.now()-began;console.log(`1000-row parse, filter, import and repeat: ${Math.round(elapsed)} ms`);assert(elapsed<3000);
});
