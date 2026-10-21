const {test} = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');
const sample = `Mon, Aug 3, 2026
**C** Hickory HS SR27 MU - 9:00am last appt@1:20pm- (Gray bkgd) - gym foyer - Tripp, Angel, David Denk (training)
**C** Second HS Faculty Groups - 2:00pm - Photographers: Monica
Tue, Aug 4, 2026
Jamestown HS Fall Sportsmates -9:00am last appt@1:20pm - cafeteria - Tripp, Monica
Wed, Aug 5, 2026
Unclear HS Senior Sports - 9:00am - gym - pending approval`;
test('import recognizes distinct multiline and same-day assignments, exact rosters and times',()=>{
 const rows=S.parse(sample); assert.equal(rows.length,4);
 assert.deepEqual(rows[0].photographers,['Tripp','Angel','David Denk']);
 assert.equal(rows[0].school,'Hickory HS'); assert.equal(rows[0].assignmentType,'Senior Makeups');
 assert.equal(rows[0].startTime,'09:00'); assert.equal(rows[0].endTime,'13:20');
 assert.equal(rows[0].location,'gym foyer'); assert.equal(rows[0].status,'training');
 assert.deepEqual(rows[1].photographers,['Monica']); assert.deepEqual(rows[3].photographers,[]);
});
test('categories separated from school including explicit unfamiliar types',()=>{
 for(const type of ['Sportsmates','Faculty Individuals','Faculty Groups','Senior Sports','Senior Makeups']) {
  assert.deepEqual(S.classify(`Example HS ${type}`),{school:'Example HS',assignmentType:type});
 }
 assert.deepEqual(S.classify('Example HS | Yearbook Portraits'),{school:'Example HS',assignmentType:'Yearbook Portraits'});
 assert.deepEqual(S.classify('Example HS Yearbook Portraits'),{school:'Example HS',assignmentType:'Yearbook Portraits'});
 assert.equal(S.classify('Capitalized School Name').assignmentType,'Uncategorized');
});
test('roster safety: no names inferred from school, address, notes, or ambiguous segments',()=>{
 for(const text of ['Capitalized School Name - Gym','Example - 9:00am - David Denk','Example - Address: Main Street, New City','Example - Alice, pending approval']) assert.deepEqual(S.roster(text),[]);
 assert.deepEqual(S.roster("Example - Photographers: Anne-Marie, José O’Neil"),['Anne-Marie','José O’Neil']);
 assert.deepEqual(S.roster('Example - Alice, alice'),['alice']);
});
test('directory excludes David, supports name/type filters and shared assignments',()=>{
 const rows=S.parse(sample); const people=S.directory(rows);
 assert.equal(people.find(p=>p.name==='Tripp').assignments.length,2);
 assert(!people.some(p=>p.name==='David Denk'));
 assert.equal(S.directory(rows,'David Denk','TRI','Sportsmates')[0].assignments.length,1);
 assert.equal(S.directory(rows,'David Denk','Monica','Faculty Groups')[0].assignments.length,1);
 assert.equal(S.directory(rows,'David Denk','missing').length,0);
});
test('repeat imports merge rosters and source variants without mutating or dropping legacy fields',()=>{
 const rows=S.parse(sample); const old={...rows[0],id:'old',notes:'Original notes',custom:'keep'};
 const before=JSON.stringify(old); const changed={...rows[0],photographers:['Monica'],sourceTexts:['New roster source']};
 const merged=S.merge([old],[changed]); assert.equal(merged.length,1); assert.equal(merged[0].id,'old');
 assert.equal(merged[0].custom,'keep'); assert.equal(merged[0].notes,'Original notes'); assert.equal(JSON.stringify(old),before);
 assert(merged[0].photographers.includes('Monica')); assert(merged[0].sourceTexts.includes('New roster source'));
 assert.equal(S.merge(rows,rows).length,4);
 const legacy={id:'legacy',school:'Hickory HS SR27 MU',date:'2026-08-03',startTime:'09:00',location:'gym foyer',address:'',notes:sample.split('\n')[1]};
 const saved=JSON.stringify(legacy); assert.equal(S.metadata(legacy).assignmentType,'Senior Makeups'); assert.equal(JSON.stringify(legacy),saved);
});
test('bad dates and preamble do not invent assignments',()=>{
 assert.equal(S.parse('Company Header\nMon, Feb 30, 2026\nSchool - 9:00am - Alice, Bob').length,0);
 assert.equal(S.parse('No dated assignments here').length,0);
});

test('different assignment types and end times are not silently collapsed',()=>{
 const a=S.parse(sample)[0];
 assert.equal(S.merge([a],[{...a,assignmentType:'Faculty Groups'}]).length,2);
 assert.equal(S.merge([a],[{...a,endTime:'15:00'}]).length,2);
});
test('legacy notes supply directory metadata without rewriting stored records',()=>{
 const a={id:'old',date:'2026-08-03',school:'Hickory HS SR27 MU',startTime:'09:00',notes:'Hickory HS SR27 MU - 9:00am - Tripp, David Denk'};
 const before=JSON.stringify(a);
 assert.equal(S.directory([a])[0].name,'Tripp');
 assert.equal(S.directory([a])[0].assignments[0].assignmentType,'Senior Makeups');
 assert.equal(JSON.stringify(a),before);
});

test('unmarked same-day assignments with TBD times remain separate',()=>{
 const rows=S.parse('Mon, Nov 2, 2026\nFirst HS Sportsmates - 9:00am - Alice, Bob\nSecond HS Faculty Groups - time TBD - Photographers: Monica');
 assert.equal(rows.length,2); assert.equal(rows[1].startTime,'');
 assert.deepEqual(rows[1].photographers,['Monica']);
});
