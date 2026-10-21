const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../planner.js'),Store=require('../storage.js');
test('calendar days: Monday-based weeks, six-row months and leap days',()=>{
 assert.deepEqual(P.days('2024-02-29','week'),['2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02','2024-03-03']);
 const month=P.days('2024-02-01','month');assert.equal(month.length,42);assert.equal(month[0],'2024-01-29');assert.equal(month[41],'2024-03-10');assert(month.includes('2024-02-29'));
});
test('previous/next clamp month dates, cross years and support day/week navigation',()=>{
 assert.equal(P.navigate('2024-01-31','month',1),'2024-02-29');assert.equal(P.navigate('2025-01-31','month',1),'2025-02-28');
 assert.equal(P.navigate('2026-01-01','day',-1),'2025-12-31');assert.equal(P.navigate('2026-12-28','week',1),'2027-01-04');
 assert.equal(P.navigate('2026-01-31','month',-1),'2025-12-31');
});
const rows=[{id:'past',school:'North School',date:'2000-01-02',assignmentType:'Portraits',status:'confirmed',startTime:'11:00',notes:'Archive'}, {id:'morning',school:'North School',date:'2000-01-02',assignmentType:'Portraits',status:'confirmed',startTime:'09:00',location:'Gym'}, {id:'other',school:'South School',date:'2000-01-03',assignmentType:'Sports',status:'tentative',arrivalTime:'08:00'}];
test('filters combine exact school/type/status, inclusive ranges and broad search without mutation',()=>{
 const before=JSON.stringify(rows);
 assert.deepEqual(P.filter(rows,{school:'north SCHOOL',start:'2000-01-02',end:'2000-01-02',type:'Portraits',status:'confirmed',search:'Gym'}).map(a=>a.id),['morning']);
 assert.equal(P.filter(rows,{start:'2000-01-03',end:'2000-01-02'}).length,0);
 assert.equal(P.filter(rows,{school:'North School',type:'Sports'}).length,0);assert.equal(JSON.stringify(rows),before);
});
test('calendar and list use the same filters; timeline chronological with historical records',()=>{
 assert.deepEqual(P.filter(rows,{view:'day',anchor:'2000-01-02'}).map(a=>a.id),['morning','past']);
 assert.equal(P.filter(rows,{view:'month',anchor:'2000-01-15',school:'North School'}).length,2);
 assert.equal(P.filter(rows,{view:'week',anchor:'2000-01-03'}).length,1);
 assert.equal(P.filter(rows,{view:'all'}).length,3);
});
const school={id:'s1',name:'Example School',address:'1 First St',city:'Sample City',state:'AA',zip:'12345',phone:'555-0100',notes:'Side entrance'};
test('directory add/edit and duplicate prevention use normalized name/city/state',()=>{
 const original=[school];const edited=P.saveSchool(original,{...school,address:'2 New St'});assert.equal(edited[0].address,'2 New St');assert.equal(original[0].address,'1 First St');
 assert.throws(()=>P.saveSchool(original,{...school,id:'duplicate',name:' EXAMPLE   SCHOOL ',city:'sample city'}),/already exists/);
 assert.equal(P.saveSchool(original,{...school,id:'campus',city:'Different City'}).length,2);assert.throws(()=>P.saveSchool([],{...school,zip:''}),/postal/);
});
test('directory search and full directions/autofill address include all address fields',()=>{
 assert.equal(P.searchSchools([school],'side entrance').length,1);assert.equal(P.searchSchools([school],'12345').length,1);assert.equal(P.searchSchools([school],'missing').length,0);
 assert.equal(P.schoolAddress(school),'1 First St, Sample City, AA, 12345');
});
test('directory restore merges schools without replacing current fields or duplicating campuses',()=>{
 const result=P.mergeSchools([school],[{...school,id:'backup-id',address:'Old address'},{...school,id:'new',name:'Another School'}]);
 assert.equal(result.schools.length,2);assert.equal(result.schools[0].address,'1 First St');assert.equal(result.idMap['backup-id'],'s1');
 assert.throws(()=>P.mergeSchools([school],[{name:'Invalid'}]),/Invalid school/);assert.deepEqual(P.mergeSchools([school],[]).schools,[school]);
});
function memory(initial={}){const map=new Map(Object.entries(initial));return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const A='PhotoOpsAssignmentsV1',D='PhotoOpsSchoolsV1';
test('two-store restore commits both values and leaves no journal',()=>{
 const s=memory({[A]:'old assignments',[D]:'old schools'});Store.transaction(s,{[A]:'old assignments',[D]:'old schools'},{[A]:'new assignments',[D]:'new schools'});
 assert.equal(s.getItem(A),'new assignments');assert.equal(s.getItem(D),'new schools');assert.equal(s.getItem(Store.JOURNAL),null);
});
test('failed directory write rolls back assignment changes; stale baselines are rejected',()=>{
 const s=memory({[A]:'old assignments',[D]:'old schools'}),set=s.setItem;let once=true;
 s.setItem=(k,v)=>{if(k===D && once){once=false;throw new Error('Quota');}set(k,v);};
 assert.throws(()=>Store.transaction(s,{[A]:'old assignments',[D]:'old schools'},{[A]:'new assignments',[D]:'new schools'}),/Quota/);
 assert.equal(s.getItem(A),'old assignments');assert.equal(s.getItem(D),'old schools');assert.equal(s.getItem(Store.JOURNAL),null);
 assert.throws(()=>Store.transaction(s,{[A]:'stale'},{[A]:'overwrite'}),/changed/);
});
test('interrupted multi-store restores recover old values before app startup',()=>{
 const s=memory({[A]:'partially replaced',[D]:'old schools',[Store.JOURNAL]:JSON.stringify({before:[[A,'old assignments'],[D,'old schools']]})});
 Store.recover(s);assert.equal(s.getItem(A),'old assignments');assert.equal(s.getItem(D),'old schools');assert.equal(s.getItem(Store.JOURNAL),null);
});
