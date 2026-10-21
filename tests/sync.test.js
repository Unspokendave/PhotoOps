const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../sync.js');
const base={school:'Example HS',assignmentType:'Faculty Groups',date:'2026-11-02',arrivalTime:'08:30',startTime:'09:00',endTime:'12:00',photographers:['Alex Smith'],location:'Gym',address:'1 Main St',scheduleNotes:'Source notes'};
const prefs={mode:'all'};
function first(row=base){return S.apply([],S.plan([],[row],prefs).entries,'2026-10-21T12:00:00Z')[0];}
function update(old,incoming){const p=S.plan([old],[incoming],prefs);return {p,result:S.apply([old],p.entries,'2026-10-22T12:00:00Z')};}
test('updated arrival times prepare diffs and preserve IDs/history',()=>{
 const old=first();const {p,result}=update(old,{...base,arrivalTime:'08:00'});
 assert.equal(p.entries[0].status,'updated');assert.deepEqual(p.entries[0].diffs.map(d=>d.field),['arrivalTime']);
 assert.equal(result[0].arrivalTime,'08:00');assert.equal(result[0].id,old.id);assert.equal(result[0].history.length,1);
 assert.equal(result[0].sync.lastImportedAt,'2026-10-22T12:00:00Z');
});
test('stable ID recognizes changed date, school, type, times and photographer',()=>{
 const old=first({...base,sourceId:'job-1'});
 const incoming={...base,sourceId:'job-1',date:'2026-11-09',school:'New School',assignmentType:'Senior Sports',location:'Field',photographers:['Jordan'],startTime:'10:00',endTime:'14:00'};
 const {p,result}=update(old,incoming);assert.equal(p.entries[0].status,'updated');
 for(const f of ['date','school','location','assignmentType','photographers','startTime','endTime']) assert.deepEqual(result[0][f],incoming[f]);
 assert.equal(result.length,1);
});
test('reschedules without IDs require review and can explicitly update instead of duplicating',()=>{
 const old=first();const p=S.plan([old],[{...base,date:'2026-11-09'}],prefs);
 assert.equal(p.entries[0].status,'ambiguous');assert.equal(p.entries[0].selected,false);
 assert.equal(S.apply([old],p.entries).length,1);
 Object.assign(p.entries[0],{selected:true,action:'update',targetId:old.id});
 const result=S.apply([old],p.entries);assert.equal(result.length,1);assert.equal(result[0].date,'2026-11-09');
});
test('identical imports and duplicate rows are idempotent, preserving timestamps',()=>{
 const old=first();const p=S.plan([old],[base,base],prefs);
 assert.equal(p.entries.length,1);assert.equal(p.duplicates,1);assert.equal(p.entries[0].status,'unchanged');
 assert.deepEqual(S.apply([old],p.entries),[old]);
 assert.equal(S.apply([],S.plan([],[base,base],prefs).entries).length,1);
});
test('partial upload retains historical and omitted assignments indefinitely',()=>{
 const old=first();const history={...first({...base,school:'Past School',date:'2000-01-02'}),notes:'history'};
 const result=S.apply([old,history],S.plan([old,history],[{...base,arrivalTime:'07:00'}],prefs).entries);
 assert.equal(result.length,2);assert.deepEqual(result[1],history);
 assert.deepEqual(S.apply(result,[]),result);
});
test('manual notes, contacts, custom fields and addresses survive blank and nonblank imports',()=>{
 const old={...first(),notes:'My note',contacts:'My contact',custom:'keep',address:'My custom address'};
 const {p,result}=update(old,{...base,address:'New source address',scheduleNotes:'New source notes',endTime:''});
 assert.equal(result[0].notes,'My note');assert.equal(result[0].contacts,'My contact');assert.equal(result[0].custom,'keep');
 assert.equal(result[0].address,'My custom address');assert.equal(result[0].endTime,'12:00');assert.equal(result[0].scheduleNotes,'New source notes');
 assert(p.entries[0].diffs.find(d=>d.field==='address').preserved);
 assert.equal(S.plan(result,[{...base,address:'New source address',scheduleNotes:'New source notes',endTime:''}],prefs).entries[0].status,'unchanged');
});
test('manual field overrides require explicit acceptance',()=>{
 const old={...first(),arrivalTime:'06:00',manualFields:['arrivalTime']};
 const incoming={...base,arrivalTime:'08:00'};const p=S.plan([old],[incoming],prefs);
 assert(p.entries[0].diffs[0].preserved);
 p.entries[0].overrides=['arrivalTime'];const result=S.apply([old],p.entries);
 assert.equal(result[0].arrivalTime,'08:00');assert(!result[0].manualFields.includes('arrivalTime'));
});
test('multiple plausible assignments are ambiguous, never silently overwritten',()=>{
 const a=first(),b={...first(),id:'other'};const p=S.plan([a,b],[{...base,arrivalTime:'08:00'}],prefs);
 assert.equal(p.entries[0].status,'ambiguous');assert.deepEqual(S.apply([a,b],p.entries),[a,b]);
});
test('conflicting stable IDs in one upload require review and cannot target the same record twice',()=>{
 const a=first({...base,sourceId:'one'});const p=S.plan([a],[{...base,sourceId:'one',arrivalTime:'08:00'},{...base,sourceId:'one',arrivalTime:'07:00'}],prefs);
 assert(p.entries.every(e=>e.status==='ambiguous' && !e.selected));
 p.entries.forEach(e=>Object.assign(e,{selected:true,action:'update',targetId:a.id}));
 assert.throws(()=>S.apply([a],p.entries),/same assignment/);assert.equal(a.arrivalTime,'08:30');
});
test('restoration recovers previous values and can itself be undone',()=>{
 const old=first();const changed=update(old,{...base,arrivalTime:'07:00'}).result[0];
 const restored=S.restore(changed,0);assert.equal(restored.arrivalTime,old.arrivalTime);
 assert.equal(restored.sync.lastImportedAt,old.sync.lastImportedAt);assert.equal(restored.history.length,2);
 assert.equal(S.restore(restored,1).arrivalTime,'07:00');
});
test('name, aliases, all and review modes respect each installation',()=>{
 assert.equal(S.plan([],[base],{mode:'mine',name:'Someone Else'}).entries.length,0);
 assert.equal(S.plan([],[base],{mode:'mine',name:'Someone Else',aliases:['alex smith']}).entries.length,1);
 assert.equal(S.plan([],[base],{mode:'all'}).entries[0].selected,true);
 assert.equal(S.plan([],[base],{mode:'review'}).entries[0].selected,false);
 const old=first({...base,sourceId:'job'});
 assert.equal(S.plan([old],[{...base,sourceId:'job',photographers:['Replacement']}],{mode:'mine',name:'Alex Smith'}).entries.length,0);
});
test('past assignments appear in day, week, month and all views',()=>{
 const a={date:'2000-01-02'};assert(S.inView(a,'day','2000-01-02'));assert(S.inView(a,'week','2000-01-01'));assert(S.inView(a,'month','2000-01-31'));assert(S.inView(a,'all','2026-01-01'));assert(!S.inView(a,'day','2000-01-03'));
});
test('text parsing separates arrival, start, end and source ID, and never invents names',()=>{
 const parsed=S.parse('Mon, Nov 2, 2026\n[ID: A1] Example HS Faculty Groups - arrival 8:30am - start 9:00am - end 1:00pm - gym - Photographers: Alex Smith\n**C** Another HS Senior Sports - 4:00pm - pending approval');
 assert.equal(parsed.rows.length,2);const a=parsed.rows[0];assert.equal(a.sourceId,'A1');assert.equal(a.arrivalTime,'08:30');assert.equal(a.startTime,'09:00');assert.equal(a.endTime,'13:00');assert.equal(a.assignmentType,'Faculty Groups');assert.deepEqual(a.photographers,['Alex Smith']);assert(!parsed.rows[1].photographers);
});
test('structured imports validate data and retain stable identifiers',()=>{
 const p=S.parse(JSON.stringify({assignments:[{...base,assignmentId:'J1'},{...base,date:'2026-02-30'}]}));assert.equal(p.rows.length,1);assert.equal(p.rows[0].sourceId,'J1');assert.equal(p.warnings.length,1);
 assert.throws(()=>S.parse('{broken'));
});
test('legacy records are not mutated during preview; migrated fields retain original ID and notes',()=>{
 const old={id:'legacy',school:'Example HS Faculty Groups',date:base.date,startTime:base.startTime,notes:'Example HS Faculty Groups - 9:00am - Photographers: Alex Smith',address:'My custom address',contacts:'Do not lose',custom:{a:1}};
 const before=JSON.stringify(old);const p=S.plan([old],[base],prefs);assert.equal(JSON.stringify(old),before);
 const result=S.apply([old],p.entries);assert.equal(result[0].id,'legacy');assert.equal(result[0].notes,old.notes);assert.equal(result[0].address,old.address);assert.deepEqual(result[0].custom,old.custom);
});

test('unchanged source matches among recurring assignments without an unnecessary update',()=>{
 const a=first();const b=first({...base,date:'2026-11-09'});
 const p=S.plan([a,b],[base],prefs);assert.equal(p.entries[0].status,'unchanged');assert.equal(p.entries[0].targetId,a.id);
});
test('changed same-day rows in one upload without IDs require review instead of duplicate inserts',()=>{
 const p=S.plan([],[base,{...base,scheduleNotes:'Conflicting source note'}],prefs);
 assert(p.entries.every(e=>e.status==='ambiguous' && !e.selected));assert.equal(S.apply([],p.entries).length,0);
});
test('unrecognized structured schedule details are retained separately from manual contacts',()=>{
 const p=S.parse(JSON.stringify([{...base,contacts:'Schedule office',reference:'Gate B'}]));
 assert.deepEqual(JSON.parse(p.rows[0].scheduleDetails),{contacts:'Schedule office',reference:'Gate B'});
});

test('manual identity edits do not cause duplicate imports when source provenance is unchanged',()=>{
 const a={...first(),school:'My school label',photographers:['My chosen name'],manualFields:['school','photographers']};
 const p=S.plan([a],[base],prefs);assert.equal(p.entries[0].status,'unchanged');assert.equal(p.entries[0].targetId,a.id);
 assert.deepEqual(S.apply([a],p.entries),[a]);
});
test('blank optional arrays and missing legacy values are equivalent, not manual edits',()=>{
 assert(S.equal(undefined,[]));assert(S.equal('',undefined));
});

test('distinct stable source IDs can identify separate same-time jobs in one upload',()=>{
 const p=S.plan([],[{...base,sourceId:'job-A'},{...base,sourceId:'job-B'}],prefs);
 assert(p.entries.every(e=>e.status==='new'));assert.equal(S.apply([],p.entries).length,2);
});

test('unrecognized schedule statuses stay visible as information rather than breaking cards',()=>{
 const p=S.parse(JSON.stringify([{...base,status:'Needs manager review'}]));
 assert(!p.rows[0].status);assert(p.rows[0].scheduleDetails.includes('Needs manager review'));assert(p.warnings.length);
 const confirmed=S.parse(JSON.stringify([{...base,status:'Confirmed'}]));assert.equal(confirmed.rows[0].status,'confirmed');
});
