const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../sync.js');
const fixture=fs.readFileSync(__dirname+'/fixtures/original-company-schedule.txt','utf8');
const parse=(text,name)=>S.parse(text,new Date('2026-07-01T12:00:00'),[name]);
const mine=(saved,rows,name,aliases=[])=>S.automatic(saved,rows,{mode:'mine',name,aliases});
test('actual repository company sample: shared names select different work for different people',()=>{
 const rows=parse(fixture,'David Denk').rows;
 assert.equal(rows.length,3);assert.equal(mine([],rows,' David   Denk ').counts.added,3);
 assert.equal(mine([],rows,'Angel').counts.added,1);assert.equal(mine([],rows,'Stacy').counts.added,1);
 assert.equal(mine([],rows,'Monica').counts.added,3);assert.equal(mine([],rows,'David').counts.added,0);
});
const variants=`Mon, Aug 3, 2026
**C** Hickory HS SR27 MU - 9:00am last appt@1:20pm - gym foyer - David Denk
Tue, Aug 4, 2026
**C** Photographers: David Denk - Jamestown HS SR27 MU - arrival 8:30am - start 9:00am - cafeteria
Thu, Aug 20, 2026
Woodside HS Fall Sportsmates - Tripp, David Denk - 4:00pm - pending approval
Fri, Aug 21, 2026
**C** Hickory HS Faculty Groups - 10:00am
Photographers: Monica, David Denk
Location: Main Gym
Sat, Aug 22, 2026
**C** David Denk - Jamestown HS Faculty Individuals - 9:00am - gym`;
test('single, shared, labelled-before-school, middle, multiline and leading names are recognized without corrupting school/type',()=>{
 const p=parse(variants,'David Denk');assert.equal(p.rows.length,5);assert.equal(mine([],p.rows,'David Denk').counts.added,5);
 assert.equal(p.rows[0].school,'Hickory HS');assert.equal(p.rows[1].school,'Jamestown HS');assert.equal(p.rows[4].school,'Jamestown HS');
 assert.equal(p.rows[2].school,'Woodside HS');assert.equal(p.rows[3].location,'Main Gym');
 assert(p.rows[2].photographers.includes('Tripp'));assert(p.rows[3].photographers.includes('Monica'));
});
test('reproduces My Assignments leak: same-school existing candidate must never bypass the entered name',()=>{
 const rows=parse(fixture,'David Denk').rows;
 const initial=mine([],rows,'David Denk').next;
 const changed={...rows[0],photographers:['Monica'],arrivalTime:'07:00'};
 const result=mine(initial,[changed],'David Denk');assert.equal(result.counts.updated,0);assert.equal(result.counts.added,0);assert.deepEqual(result.next,initial);
 const other=mine(initial,[changed],'Monica');assert.equal(other.counts.updated,1);
});
test('full-name boundaries, punctuation, whitespace, case, explicit aliases and Last, First',()=>{
 assert(S.nameMatch('DAVID   DENK','David Denk'));assert(S.nameMatch('D. Denk','D Denk'));assert(S.nameMatch('Denk, David','David Denk'));
 assert(!S.nameMatch('Ann','Anna'));assert(!S.nameMatch('David','David Denk'));assert(!S.nameMatch('David Denk','David Denker'));
 const rows=parse('Mon, Aug 3, 2026\nHickory HS Faculty Groups - 9:00am - Photographers: Denk, David','David Denk').rows;
 assert.equal(mine([],rows,'David Denk').counts.added,1);
 assert.equal(mine([],parse(variants,'David Denk').rows,'Another Person',['David Denk']).counts.added,5);
});
test('descriptions, school names, addresses and city/state are not photographer assignments',()=>{
 const p=parse(`Mon, Aug 3, 2026
**C** David Denk School Faculty Groups - 9:00am - gym
**C** Woodside HS Sportsmates - 4:00pm - pending approval
**C** Jamestown HS Faculty Groups - 10:00am - Address: 1 Main St, Richmond, VA`,'David Denk');
 assert.equal(p.rows.length,3);assert(p.rows.every(r=>!r.photographers));assert.equal(mine([],p.rows,'David Denk').counts.added,0);
 assert.equal(S.automatic([],p.rows,{mode:'all'}).counts.added,3);
 assert.deepEqual(S.roster('Example HS - 9:00am - Richmond, VA'),[]);
});
test('real-format repeated imports, changed arrivals/start and historical omissions preserve data and IDs',()=>{
 const rows=parse(variants,'David Denk').rows;let first=mine([],rows,'David Denk').next;
 const historical={id:'historical',school:'Old assignment',date:'2000-01-01',notes:'Keep forever',custom:{a:1}};first.push(historical);
 first[0].notes='My note';first[0].contacts='My contact';first[0].custom={keep:true};
 const again=mine(first,rows,'David Denk');assert.equal(again.counts.unchanged,5);assert.deepEqual(again.next,first);
 const update={...rows[0],arrivalTime:'08:00',startTime:'09:30'};const changed=mine(first,[update],'David Denk');
 assert.equal(changed.counts.updated,1);assert.equal(changed.next.length,6);assert.equal(changed.next[0].id,first[0].id);
 assert.equal(changed.next[0].notes,'My note');assert.equal(changed.next[0].contacts,'My contact');assert.deepEqual(changed.next.at(-1),historical);
 assert.equal(changed.next[0].history.length,1);
});
test('uncertain reschedules stay untouched, while known identifiers allow automatic date changes',()=>{
 const row=parse(variants,'David Denk').rows[0],first=mine([],[row],'David Denk').next;
 const changed={...row,date:'2026-08-10'};const unresolved=mine(first,[changed],'David Denk');
 assert.equal(unresolved.counts.attention,1);assert.deepEqual(unresolved.next,first);
 const identified=mine([],[{...row,sourceId:'job-1'}],'David Denk').next;
 const moved=mine(identified,[{...changed,sourceId:'job-1'}],'David Denk');assert.equal(moved.counts.updated,1);assert.equal(moved.next.length,1);
});

test('JSON single and shared name fields are recognized; isolated names are not used as school titles',()=>{
 const p=S.parse(JSON.stringify([{school:'Example School',date:'2026-08-03',photographer:'David Denk'},{school:'Other School',date:'2026-08-04',photographers:'Monica and David Denk'}]),new Date(),['David Denk']);
 assert.equal(mine([],p.rows,'David Denk').counts.added,2);
 assert.equal(parse('Mon, Aug 3, 2026\nPhotographers: David Denk','David Denk').rows.length,0);
 assert.equal(parse('Mon, Aug 3, 2026\nDavid Denk School - 9:00am - gym','David Denk School').rows[0].photographers,undefined);
});

test('leading photographer lines stay attached to the following assignment rather than being split away',()=>{
 const text='Mon, Aug 3, 2026\nPhotographers: David Denk\n**C** Hickory HS Faculty Groups - 9:00am - gym\nTue, Aug 4, 2026\nDavid Denk\n**C** Jamestown HS Faculty Individuals - 10:00am - cafeteria';
 const p=parse(text,'David Denk');assert.equal(p.rows.length,2);assert.equal(mine([],p.rows,'David Denk').counts.added,2);
 assert.equal(p.rows[0].school,'Hickory HS');assert.equal(p.rows[1].school,'Jamestown HS');
});
