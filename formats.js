/* Preserve spreadsheet/table boundaries without evaluating supplied HTML. */
(function(root) {
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const headers={school:'school',schoolname:'school',schoolassignment:'school',assignment:'school',date:'date',day:'date',photographer:'photographers',photographers:'photographers',staff:'photographers',assignedto:'photographers',crew:'photographers',type:'assignmentType',assignmenttype:'assignmentType',photographytype:'assignmentType',arrival:'arrivalTime',arrivaltime:'arrivalTime',report:'arrivalTime',start:'startTime',starttime:'startTime',end:'endTime',endtime:'endTime',location:'location',address:'address',notes:'scheduleNotes',operationalnotes:'scheduleNotes',instructions:'scheduleNotes',id:'sourceId',jobid:'sourceId',assignmentid:'sourceId',status:'status'};
  function delimited(text,separator) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"') {if(quoted && text[i+1]==='"'){cell+='"';i++;}else if(quoted || !cell)quoted=!quoted;else cell+=c;}
      else if(!quoted && c===separator){row.push(cell);cell='';}
      else if(!quoted && (c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw new Error('An exported table has an unclosed quoted cell. Export it again as CSV or tab-separated text.');
    row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
  }
  function tableRows(text) {
    if(typeof document==='undefined')throw new Error('HTML tables must be imported in the application.');
    const template=document.createElement('template');template.innerHTML=text;
    const tables=[...template.content.querySelectorAll('table')].filter(t=>!t.parentElement?.closest('table'));
    if(!tables.length)throw new Error('This HTML document has no supported schedule table. Export a table with column headings or dated text.');
    const result=[];
    for(const table of tables) {
      let spans=[];
      for(const tr of [...table.querySelectorAll('tr')].filter(r=>r.closest('table')===table)) {
        const row=[];const next=[];let col=0;
        const copy=()=>{while(spans[col]){row[col]=spans[col].text;if(spans[col].left>1)next[col]={text:spans[col].text,left:spans[col].left-1};col++;}};
        for(const td of tr.children) {
          if(!['TD','TH'].includes(td.tagName))continue;copy();
          const clone=td.cloneNode(true);clone.querySelectorAll('script,style,template').forEach(n=>n.remove());clone.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
          const value=clone.textContent.trim(),width=Math.min(100,+td.getAttribute('colspan')||1),height=Math.min(1000,+td.getAttribute('rowspan')||1);
          for(let j=0;j<width;j++){row[col]=value;if(height>1)next[col]={text:value,left:height-1};col++;}
        }
        copy();spans=next;if(row.some(v=>v?.trim()))result.push(row.map(v=>v||''));
      }
    }
    return result;
  }
  function gmailText(text) {
    if(typeof document==='undefined')throw new Error('Rich email content must be imported in the application.');
    const template=document.createElement('template');template.innerHTML=text;
    template.content.querySelectorAll('script,style,template,head,noscript,blockquote,.gmail_quote').forEach(n=>n.remove());
    function walk(node) {
      if(node.nodeType===3)return node.textContent;
      if(node.nodeType!==1 && node.nodeType!==11)return '';
      const tag=node.tagName;if(tag==='BR')return '\n';
      const content=[...node.childNodes].map(walk).join('');
      if(tag==='LI')return '\n- '+content.trim()+'\n';
      return ['DIV','P','SECTION','ARTICLE','H1','H2','H3','H4','UL','OL','TR'].includes(tag)?'\n'+content+'\n':content;
    }
    return walk(template.content).replace(/\u00a0/g,' ').replace(/\n[ \t]*\n+/g,'\n').trim();
  }
  function structured(text) {
    let rows;
    if(/^\s*</.test(text)) {
      if(!/<table\b/i.test(text))return {plain:gmailText(text)};
      rows=tableRows(text);
      if(!rows.some(r=>r.map(c=>headers[norm(c)]).includes('school'))) {const plain=gmailText(text);if(/<li\b/i.test(text) || /(?:^|\n)-?\s*(?:\*\*C\*\*|C\s)/.test(plain))return {plain};}
    }
    else if(text.includes('\t'))rows=delimited(text,'\t');
    else {
      const first=text.split(/\r?\n/).find(l=>l.trim())||'';
      const candidates=delimited(first,',');
      if(!candidates[0]?.some(c=>headers[norm(c)]==='school'))return null;
      rows=delimited(text,',');
    }
    const records=[];let map=null;
    for(const cells of rows) {
      const keys=cells.map(c=>headers[norm(c)] || '');
      if(keys.includes('school') && (keys.includes('date') || keys.includes('photographers') || keys.includes('startTime'))){map=keys;continue;}
      const nonempty=[...new Set(cells.map(c=>c.trim()).filter(Boolean))];
      if(nonempty.length===1 && (!map || !cells[map.indexOf('school')] || cells.every(c=>!c.trim()||c.trim()===nonempty[0]))) {records.push({heading:nonempty[0]});continue;}
      if(!map)throw new Error('This table needs column headings such as School, Date and Photographers. Headerless multi-column tables are not guessed.');
      const record={},extras={};
      cells.forEach((value,i)=>{if(value.trim()){if(map[i])record[map[i]]=record[map[i]]?record[map[i]]+'\n'+value:value;else extras[`column ${i+1}`]=value;}});
      if(Object.keys(extras).length)record.scheduleDetails=JSON.stringify(extras);
      record.sourceText=cells.join('\t');records.push(record);
    }
    return records;
  }
  const api={delimited,structured,gmailText};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PhotoOpsFormats=api;
})(globalThis);
