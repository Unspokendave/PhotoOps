/* Pure schedule parsing, matching and restoration; no network or storage access. */
(function (root) {
  'use strict';
  const Formats = typeof module!=='undefined' && module.exports ? require('./formats.js') : root.PhotoOpsFormats;
  const clone = value => JSON.parse(JSON.stringify(value));
  const norm = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const fields = ['date','arrivalTime','startTime','endTime','school','location','assignmentType','photographers','address','status','scheduleNotes','scheduleDetails'];
  const equal = (a,b) => (!present(a) && !present(b)) || JSON.stringify(Array.isArray(a) ? a.map(norm).sort() : norm(a)) === JSON.stringify(Array.isArray(b) ? b.map(norm).sort() : norm(b));
  const present = value => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '';
  function category(title) {
    const split = title.match(/^(.*?)\s*\|\s*(.+)$/);
    if (split) return {school:split[1].trim(), assignmentType:split[2].trim()};
    for (const [re, type] of [[/\b(?:SR\d*\s+MU|Senior Make-?ups?)\b/i,'Senior Makeups'],[/\b(?:UCMU|UC\s+MU)\b/i,'UC MU'],[/\bUC(?:\s+\d+C)?\b/i,null],[/\bBomb Portraits\b/i,'Bomb Portraits'],[/\bJV Football Candids\b/i,'JV Football Candids'],[/\bHeadshots(?:\s+\d+C)?\b/i,null],[/\bHC Game\b/i,'HC Game'],[/\bSenior Sports\b/i,'Senior Sports'],[/\bFaculty Individuals?\b/i,'Faculty Individuals'],[/\bFaculty Groups?\b/i,'Faculty Groups'],[/\b(?:Fall |Winter |Spring )?Sportsmates\b/i,'Sportsmates']]) {
      const m=title.match(re); if(m) return {school:title.slice(0,m.index).trim() || title,assignmentType:type || m[0]};
    }
    return {school:title.trim()};
  }
  function nameKey(value) {
    let text=norm(value).normalize('NFKC').replace(/[’]/g,"'").replace(/\./g,'');
    const parts=text.split(',').map(s=>s.trim());
    if(parts.length===2 && parts.every(Boolean))text=parts[1]+' '+parts[0];
    return text.replace(/\s+/g,' ');
  }
  function nameMatch(a,b) {return !!nameKey(a) && nameKey(a)===nameKey(b);}
  function person(value) {
    return /^[\p{L}][\p{L}’'.-]*(?:\s+[\p{L}][\p{L}’'.-]*){0,3}$/u.test(value) && !/\b(?:gym|school|hs|ms|es|address|location|pending|approval|notes|unknown|tbd|unassigned|cafeteria|auditorium|training|sportsmates|faculty|groups|individuals|senior|makeups|background|bkgd|confirmed|cancelled|canceled|stadium|field|stage)\b/i.test(value);
  }
  function entryParts(text,knownNames=[]) {
    const parts=text.split(/\n|\s+-\s*/).map(s=>s.trim()).filter(Boolean);
    let names=[];const consumed=new Set();
    function read(value) {
      if(/\b(?:notes?|instructions?|location|address)\s*:/i.test(value))return [];
      value=value.replace(/\((?:training|confirmed|tentative|tbd)\)/ig,'').trim();
      if(knownNames.some(n=>nameMatch(n,value)) && (person(value) || (value.split(',').length===2 && value.split(',').every(n=>person(n.trim())))))return [value];
      const list=value.split(/\s*(?:,|;|&|\band\b)\s*/i).filter(Boolean);
      if(list.length===2 && /^[A-Z]{2}$/.test(list[1]))return []; // An unlabelled city/state is not a person list.
      return list.filter(person);
    }
    parts.forEach((part,index)=>{
      const labeled=part.match(/\b(?:photographers?|staff|assigned to)\s*:\s*(.*?)(?=\s+(?:location|address|arrival|start|end|notes)\s*:|$)/i);
      if(labeled) {const found=read(labeled[1]);names.push(...found);if(labeled.index===0)consumed.add(index);return;}
      const structural=index===parts.length-1 || (index===0 && parts.length>1 && (category(parts[1]).assignmentType || /\b(?:HS|MS|ES|school|academy)\b/i.test(parts[1])));
      if(structural || knownNames.some(n=>read(part).some(m=>nameMatch(n,m)))) {
        const found=read(part);
        if(found.length && (parts.length>1 || knownNames.some(n=>nameMatch(n,part)))) {names.push(...found);consumed.add(index);}
      }
    });
    return {title:parts.find((part,i)=>!consumed.has(i) && !/^(?:(?:arrival|arrive|start|end|location|address|notes|id)\s*[:@]|\d{1,2}:\d{2}|(?:gym|cafeteria|auditorium|stadium|field)$)/i.test(part)) || '',photographers:[...new Map(names.map(n=>[nameKey(n),n])).values()]};
  }
  function roster(text) {return entryParts(text).photographers;}
  function crew(text,knownNames=[]) {
    text=text.split(/\b(?:notes?|instructions?)\s*:/i)[0];
    const markers=[...text.matchAll(/\bLS\b|\b(?:kc|sj)\b|\bK(?=\s+(?:-|[A-Z]))/g)];
    if(!markers.length)return [];
    const start=markers.at(-1);let value=text.slice(start.index+start[0].length);
    value=value.split(/\bdb-ftp\b|\(\s*Address\s*:|\b(?:notes?|instructions?|address)\s*:|\(\s*(?:enter|bring|call|must|DB)\b/i)[0];
    value=value.replace(/^(?:[\s,;\-]*\d{1,2}\/\d{1,2}[,; ]*)*[\s,;\-]*/,'');
    const tokens=value.split(/\s*(?:,|;|&|\band\b|\/)\s*/i);const names=[];
    for(let i=0;i<tokens.length;i++) {
      const raw=tokens[i].replace(/\([^)]*\)/g,'').trim();
      const words=raw.split(/\s+/);let selected=null;
      for(const known of knownNames)for(let length=1;length<=Math.min(words.length,5);length++) {
        const prefix=words.slice(0,length).join(' '),suffix=words.slice(length).join(' ');
        if(nameMatch(known,prefix) && (!suffix || /^(?!JR\b|SR\b|II\b|III\b|IV\b)[A-Z][A-Z0-9]{1,7}(?:\s|$)/.test(suffix)))selected=prefix;
      }
      if(selected){names.push(selected);continue;}
      let token=tokens[i].replace(/\([^)]*\)/g,'').replace(/\s+[A-Z][A-Z0-9]{1,7}\b.*$/,'').replace(/\s+\d.*$/,'').trim();
      if(knownNames.some(n=>nameMatch(n,token)))names.push(token);
      else if(i+1<tokens.length && knownNames.some(n=>nameMatch(n,token+', '+tokens[i+1].trim()))) {names.push(token+', '+tokens[++i].trim());}
      else if(person(token) && !/\b(?:notify|bring|office|van|equipment|needed|rec’d|sent)\b/i.test(token))names.push(token);
    }
    return [...new Map(names.map(n=>[nameKey(n),n])).values()];
  }
  function rowMatches(row,names) {
    return (row.photographers||[]).some(n=>names.some(m=>nameMatch(n,m)));
  }
  function heading(value,now,context={}) {
    let text=value.trim().replace(/^[•*\-]+\s*/,'').replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day|sday|nesday|rsday|urday)?[.,]?\s*/i,'').replace(/(\d)(?:st|nd|rd|th)\b/ig,'$1').replace(/\b([A-Za-z]{3})\./g,'$1').trim().replace(/:\s*$/,'');
    let month,day,year;
    let m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){year=+m[1];month=+m[2]-1;day=+m[3];}
    else if((m=text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/))){month=+m[1]-1;day=+m[2];year=m[3]?+m[3]:undefined;}
    else if((m=text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/))){month=new Date(`${m[1]} 1, 2000`).getMonth();day=+m[2];year=m[3]?+m[3]:undefined;}
    else return null;
    if(!year) {
      year=context.year || now.getFullYear();
      if(context.lastMonth===11 && month===0)year++;
      else if(context.lastMonth!==undefined && context.lastMonth-month>6) return {date:null};
    }
    const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(!validDate(date))return {date:null};context.year=year;context.lastMonth=month;
    return {date,explicit:!!m?.[3] && /\d{4}/.test(text)};
  }
  function time(value) {
    const m=String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if(!m) return undefined;
    let h=+m[1]; const min=+(m[2] || 0);
    if(min>59 || (m[3] ? h<1 || h>12 : h>23)) return undefined;
    if(m[3]) h=h%12+(norm(m[3])==='pm'?12:0);
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  function validDate(date) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
    const d=new Date(date+'T12:00:00'); return !Number.isNaN(+d) && [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')===date;
  }
  function parse(text, now=new Date(), knownNames=[], options={}) {
    const warnings=[]; let rows=[];
    const context={year:options.year?Number(options.year):undefined};
    if(context.year && (!Number.isInteger(context.year) || context.year<1900 || context.year>2200))throw new Error('Choose a valid four-digit schedule year.');
    const explicit=[...text.matchAll(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<>]{0,30}\b(20\d{2})\b/g)];
    if(!context.year && explicit.length)context.year=+explicit[0][1];
    const structured=/^\s*[\[{]/.test(text)?null:Formats.structured(text);
    if(structured?.plain!==undefined)text=structured.plain;
    else if(structured) {
      const list=[];
      for(const record of structured) {
        if(record.heading){const h=heading(record.heading,now,context);if(h)context.date=h.date;continue;}
        const own=record.date?heading(record.date,now,context):null;
        const date=own?own.date:context.date;if(own)context.date=own.date;
        list.push({...record,date,scheduleNotes:record.scheduleNotes || record.sourceText});
      }
      text=JSON.stringify(list);
    }
    let ignored=0;
    if (/^[\s]*[\[{]/.test(text)) {
      const data=JSON.parse(text); const list=Array.isArray(data)?data:data.assignments;
      if(!Array.isArray(list)) throw new Error('JSON must contain an assignments array.');
      rows=list.map(a=>{
        if(!a || typeof a!=='object' || Array.isArray(a)) return {};
        const out={...category(String(a.school || '')),date:a.date};
        for(const f of fields) if(present(a[f])) out[f]=clone(a[f]);
        if(typeof out.photographers==='string')out.photographers=entryParts('Photographers: '+out.photographers,knownNames).photographers;
        if(!out.photographers && typeof a.photographer==='string')out.photographers=entryParts('Photographers: '+a.photographer,knownNames).photographers;
        out.sourceId=String(a.sourceId || a.assignmentId || a.jobId || a.id || '').trim();
        if(present(a.notes) && !out.scheduleNotes) out.scheduleNotes=a.notes;
        const extras=Object.fromEntries(Object.entries(a).filter(([k])=>![...fields,'id','sourceId','assignmentId','jobId','notes','sync','history','manualFields'].includes(k)));
        if(Object.keys(extras).length) out.scheduleDetails=JSON.stringify(extras,null,2);
        out.school=category(String(a.school || '')).school;
        return out;
      });
    } else {
      const blocks=[]; let date, block='';
      const flush=()=>{if(block && date) blocks.push({date,text:block});block='';};
      for(const original of text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean)) {
        const line=original.replace(/^[•\-]\s*/, '');
        const cleaned=line.replace(/^[•\-]\s*/, '').trim();
        const h=/^\d{1,2}\//.test(cleaned)?null:heading(cleaned,now,context);
        if(h) {
          flush();date=h.date;if(!date)warnings.push('A date heading could not be read.');
        } else if(date) {
          if(/^(?:from|to|cc|bcc|subject|sent):|^on .+wrote:|^--\s*$|^\[?message clipped\]?|^view entire message/i.test(line)){flush();date=null;ignored++;break;}
          if(/^.+?\b(?:unavailable|appt\s*@|appointment\s*@)\b/i.test(line) && !/^(?:\*\*C\*\*|C\s)/.test(line)){flush();ignored++;continue;}
          const title=line.split(/\s+-\s*/)[0];
          if(block && entryParts(block,knownNames).title && (/^(?:\*\*C\*\*|C\s)/.test(line) || (/\s+-\s*/.test(line) && (category(title).assignmentType || /\d{1,2}:\d{2}\s*(am|pm)/i.test(line))))) flush();
          block+=(block?'\n':'')+line;
        } else ignored++;
      }
      flush();
      rows=blocks.map(({date,text})=>{
        const sourceId=text.match(/\b(?:assignment\s*id|job\s*id|id)\s*:\s*([\w.-]+)/i)?.[1];
        const clean=text.replace(/\[(?:assignment\s*id|job\s*id|id)\s*:\s*[\w.-]+\]/ig,'').replace(/\*\*/g,'').replace(/^C[ \t]+/gm,'').trim();
        const parsed=entryParts(clean,knownNames);
        const production=crew(clean,knownNames);
        const clock=clean.search(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i);
        const title=production.length && clock>=0?clean.slice(0,clock).replace(/[-;\s]+$/,''):parsed.title;
        const result={...category(title),date,sourceId,photographers:production.length?production:parsed.photographers,scheduleNotes:text};
        const clocks=[...clean.matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/ig)];
        const labeled=(label)=>clean.match(new RegExp('\\b(?:'+label+')\\s*[:@]?\\s*(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))','i'));
        for(const [field,label] of [['arrivalTime','arrival|arrive|report'],['startTime','start'],['endTime','end|last appt']]) {const m=labeled(label);if(m)result[field]=time(m[1]);}
        const setup=clocks.find(m=>/^\s*(?:setup|set up|arrival)\b/i.test(clean.slice(m.index+m[0].length)));
        if(setup)result.arrivalTime ||= time(setup[0]);
        const session=clocks.filter(m=>m!==setup && !/\b(?:arrival|arrive|report)\s*[:@]?\s*$/i.test(clean.slice(0,m.index)));
        if(!result.startTime && session[0])result.startTime=time(session[0][0]);
        const ranges=[...clean.matchAll(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/ig)];
        if(!result.endTime && ranges.length)result.endTime=time(ranges.at(-1)[2]);
        result.address=clean.match(/\bAddress:\s*([^\n)]*?)(?:\)|\s+-\s+|$|\n)/i)?.[1]?.trim();
        result.location=clean.match(/\bLocation:\s*(.*?)(?:\)|\s+-\s+|$)/i)?.[1]?.trim() || clean.match(/-\s*(Outside & gym|gym foyer|Main Gym|Aux gym|Auditorium|Aud|gym|cafeteria|library|Cocke Hall|stage|stadium|field|playground)\b/i)?.[1] || clean.match(/@\s*([A-Z][^\n]+?)(?=\s+\d{1,2}\/\d{1,2}|\s+(?:LS|K)\b|$)/)?.[1]?.trim();
        result.status=/pending/i.test(clean)?'tentative':/time tbd|loc tbd/i.test(clean)?'tbd':/training/i.test(clean)?'training':/confirmed/i.test(clean)?'confirmed':undefined;
        return result;
      });
    }
    const accepted=[];
    rows.forEach((a,i)=>{
      if(!validDate(a.date) || typeof a.school!=='string' || !a.school.trim() || (a.photographers!==undefined && (!Array.isArray(a.photographers) || !a.photographers.every(n=>typeof n==='string')))) {warnings.push(`Row ${i+1}: invalid school, date or photographer roster; not imported.`);return;}
      for(const field of fields) {
        if(!present(a[field])) delete a[field];
        else if(field.endsWith('Time')) {const t=time(a[field]);if(t) a[field]=t;else {warnings.push(`Row ${i+1}: invalid ${field}; not imported.`);delete a[field];}}
        else if(field!=='photographers' && typeof a[field]!=='string') {warnings.push(`Row ${i+1}: invalid ${field}; not imported.`); delete a[field];}
      }
      if(a.status) {
        const status=norm(a.status);
        if(['confirmed','training','tentative','tbd'].includes(status)) a.status=status;
        else { warnings.push(`Row ${i+1}: unrecognized status retained in imported details, not applied as a status.`); a.scheduleDetails=[a.scheduleDetails,`Source status: ${a.status}`].filter(Boolean).join('\n'); delete a.status; }
      }
      accepted.push(a);
    });
    return {rows:accepted,warnings:[...new Set(warnings)],ignored,year:context.year || now.getFullYear(),yearInferred:!options.year && !explicit.length};
  }
  function info(a) {
    return {...category(a.school||''),...a,assignmentType:a.assignmentType || category(a.school||'').assignmentType,photographers:a.photographers || roster(a.scheduleNotes || a.notes || '')};
  }
  function comparable(a) {const result={};for(const f of fields) if(present(a[f])) result[f]=a[f];return result;}
  function fingerprint(a) {return JSON.stringify([a.sourceId || '',...fields.map(f=>Array.isArray(a[f]) ? a[f].map(norm).sort() : norm(a[f]))]);}
  function overlap(a,b) {return (a||[]).some(n=>(b||[]).some(m=>nameMatch(m,n)));}
  function changes(old, incoming, overrides=[]) {
    const result=[]; const source=old.sync?.source;
    for(const f of fields) {
      if(!present(incoming[f])) continue; // Absence is never a request to clear a field.
      const baseline=source && present(source[f]) ? source[f] : info(old)[f];
      const protectedField=(old.manualFields || []).includes(f) || (source && present(source[f]) && present(old[f]) && !equal(old[f],source[f])) || ((!source || !present(source[f])) && ['address'].includes(f) && present(old[f]));
      if(!equal(baseline,incoming[f]) || (overrides.includes(f) && !equal(old[f],incoming[f]))) result.push({field:f,before:old[f] ?? info(old)[f] ?? '',incoming:incoming[f],preserved:!!protectedField && !overrides.includes(f)});
    }
    if (incoming.sourceId && incoming.sourceId !== (old.sync?.sourceId || old.sourceId)) result.push({field:'sourceId',before:old.sync?.sourceId || old.sourceId || '',incoming:incoming.sourceId,preserved:false});
    return result;
  }
  function indexAssignments(existing) {
    const ids=new Map(),schools=new Map(),dates=new Map(),facts=new Map();
    const add=(map,key,a)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(a);};
    for(const a of existing) {
      const old={...info(a),...(a.sync?.source || {})};facts.set(a,old);
      if(a.sync?.sourceId || a.sourceId)add(ids,a.sync?.sourceId || a.sourceId,a);
      add(schools,norm(category(old.school).school),a);add(dates,old.date+'|'+norm(old.assignmentType),a);
    }
    return {ids,schools,dates,facts};
  }
  function match(existing, incoming, index=indexAssignments(existing)) {
    const id=incoming.sourceId;
    if(id) {
      const exact=index.ids.get(id) || [];
      if(exact.length) return {candidates:exact,confident:exact.length===1,reason:'Explicit source assignment ID'};
    }
    const pool=[...new Set([...(index.schools.get(norm(incoming.school)) || []),...(index.dates.get(incoming.date+'|'+norm(incoming.assignmentType)) || [])])];
    const candidates=pool.filter(a=>{
      const old=index.facts.get(a);
      if(id && (a.sync?.sourceId || a.sourceId) && (a.sync?.sourceId || a.sourceId)!==id) return false;
      const school=norm(category(old.school).school)===norm(incoming.school);
      const type=present(old.assignmentType) && equal(old.assignmentType,incoming.assignmentType);
      const people=overlap(old.photographers,incoming.photographers);
      return school || (type && old.date===incoming.date && people);
    });
    const exact=candidates.filter(a=>a.sync?.source && fields.every(f=>!present(incoming[f]) || equal(a.sync.source[f],incoming[f])));
    if(exact.length===1) return {candidates:exact,confident:true,reason:'Unchanged source record'};
    const confident=candidates.filter(a=>{
      const old=index.facts.get(a);
      return norm(category(old.school).school)===norm(incoming.school) && equal(old.assignmentType,incoming.assignmentType) && old.date===incoming.date && (overlap(old.photographers,incoming.photographers) || (present(old.startTime) && old.startTime===incoming.startTime));
    });
    // A changed date without a stable ID is reviewed, even with a unique likely match.
    return {candidates:confident.length===1?confident:candidates,confident:confident.length===1,reason:candidates.length?'Possible match; verify identity, especially reschedules or recurring work':'No existing match'};
  }
  function plan(existing, rows, preferences={}) {
    const entries=[];const seen=new Set();const index=indexAssignments(existing);let duplicates=0;
    const names=[preferences.name,...(preferences.aliases || [])].filter(present);
    for(const incoming of rows) {
      const fp=fingerprint(incoming);if(seen.has(fp)){duplicates++;continue;}seen.add(fp);
      const mine=(incoming.photographers||[]).some(n=>names.some(m=>nameMatch(n,m)));
      if(preferences.mode==='mine' && !mine) continue;
      const found=match(existing,incoming,index);
      const old=found.confident?found.candidates[0]:null;
      const diffs=old?changes(old,incoming):[];
      const status=old?(diffs.length?'updated':'unchanged'):found.candidates.length?'ambiguous':'new';
      entries.push({incoming:clone(incoming),status,candidates:found.candidates.map(a=>a.id),targetId:old?.id,diffs,reason:found.reason,selected:preferences.mode!=='review' && status!=='ambiguous' && status!=='unchanged',action:old?'update':found.candidates.length?'skip':'new',overrides:[]});
    }
    const groups=new Map();
    const group=(key,e)=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);};
    for(const e of entries) {
      if(e.targetId)group('target:'+e.targetId,e);
      if(e.incoming.sourceId)group('source:'+e.incoming.sourceId,e);
      if(!e.targetId)group('session:'+JSON.stringify([norm(e.incoming.school),norm(e.incoming.assignmentType),e.incoming.date,e.incoming.startTime || '']),e);
    }
    const conflicts=new Set();
    for(const [key,items] of groups)if(items.length>1) {
      if(key.startsWith('session:')) {
        const uncertain=items.filter(e=>!e.incoming.sourceId);
        if(uncertain.length)items.forEach(e=>conflicts.add(e));
      } else items.forEach(e=>conflicts.add(e));
    }
    for(const entry of conflicts) {entry.status='ambiguous';entry.selected=false;entry.action='skip';entry.reason='Conflicting rows refer to the same assignment; saved work was left unchanged.';}
    return {entries,duplicates};
  }
  function apply(existing, entries, now=new Date().toISOString()) {
    const next=clone(existing);const targets=new Set();
    for(const entry of entries.filter(e=>e.selected && e.action!=='skip')) {
      if(entry.action==='new') {
        if(next.some(a=>entry.incoming.sourceId && (a.sync?.sourceId || a.sourceId)===entry.incoming.sourceId)) throw new Error('Duplicate source ID. Link to the existing assignment instead.');
        next.push({...clone(entry.incoming),id:root.crypto.randomUUID(),notes:'',status:entry.incoming.status||'confirmed',sync:{sourceId:entry.incoming.sourceId,source:comparable(entry.incoming),lastImportedAt:now},history:[]});
      } else {
        if(targets.has(entry.targetId)) throw new Error('Two imported rows target the same assignment. Resolve them before syncing.');targets.add(entry.targetId);
        const index=next.findIndex(a=>a.id===entry.targetId);if(index<0) throw new Error('The matched assignment no longer exists. Preview again.');
        const old=next[index];
        if(entry.incoming.sourceId && next.some(a=>a.id!==old.id && (a.sync?.sourceId || a.sourceId)===entry.incoming.sourceId)) throw new Error('That source ID already belongs to a different assignment.');
        const diffs=changes(old,entry.incoming,entry.overrides);
        if(!diffs.length && old.sync) continue;
        const updated=clone(old);for(const d of diffs) if(!d.preserved) updated[d.field]=clone(d.incoming);
        const previous=clone(old);delete previous.history;
        updated.history=[...(old.history||[]),{at:now,kind:'sync',previous}];
        updated.sync={...(old.sync||{}),sourceId:entry.incoming.sourceId || old.sync?.sourceId,source:{...(old.sync?.source||{}),...comparable(entry.incoming)},lastImportedAt:now};
        // Explicitly accepting an imported value releases that manual override.
        updated.manualFields=(old.manualFields||[]).filter(f=>!entry.overrides.includes(f));
        next[index]=updated;
      }
    }
    return clone(next);
  }
  function automatic(existing,rows,preferences={},now=new Date().toISOString()) {
    const proposed=plan(existing,rows,{...preferences,mode:preferences.mode==='all'?'all':'mine'});
    const counts={added:0,updated:0,unchanged:0,attention:0};const attention=[];
    for(const entry of proposed.entries) {
      if(entry.status==='ambiguous') {attention.push({incoming:entry.incoming,candidates:entry.candidates,message:'This may be an existing or rescheduled assignment. Saved work was left unchanged.'});counts.attention++;}
      else if(entry.status==='new')counts.added++;
      else if(entry.status==='updated')counts.updated++;
      else counts.unchanged++;
    }
    return {next:apply(existing,proposed.entries,now),counts,attention,duplicates:proposed.duplicates};
  }
  function compactAttention(items) {
    const result=[],seen=new Map();
    for(const original of items) {
      const item=clone(original);
      if(!item.candidates?.length && /^(?:No photographer could be identified for this entry|\d+ parts? of the file could not be fully read)/.test(item.message || ''))item.archived=true;
      const key=item.incoming?fingerprint(item.incoming):norm(item.message);
      if(!seen.has(key)){seen.set(key,item);result.push(item);continue;}
      const first=seen.get(key);first.candidates=[...new Set([...(first.candidates || []),...(item.candidates || [])])];
      first.mergedIds=[...new Set([...(first.mergedIds || []),item.id,...(item.mergedIds || [])].filter(Boolean))];
      first.relatedMessages=[...new Set([...(first.relatedMessages || []),item.message].filter(m=>m && m!==first.message))];
      if(!item.archived)delete first.archived;
    }
    return result;
  }
  function restore(a,index,now=new Date().toISOString()) {
    const event=a.history?.[index];if(!event?.previous) throw new Error('No prior values to restore.');
    const previous=clone(a);delete previous.history;
    return {...clone(event.previous),id:a.id,history:[...clone(a.history),{at:now,kind:'restore',previous}]};
  }
  function inView(a,view,anchor) {
    if(view==='all') return true;
    const date=new Date(a.date+'T12:00:00');const start=new Date(anchor+'T12:00:00');
    if(view==='day') return a.date===anchor;
    if(view==='month') return a.date.slice(0,7)===anchor.slice(0,7);
    start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(end.getDate()+7);
    return date>=start && date<end;
  }
  const api={fields,norm,equal,category,roster,parse,info,changes,match,plan,apply,restore,inView,clone,validDate,nameKey,nameMatch,entryParts,automatic,crew,rowMatches,heading,compactAttention};
  if(typeof module!=='undefined' && module.exports) module.exports=api;else root.PhotoOpsSync=api;
})(globalThis);
