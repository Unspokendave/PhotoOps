"""One-click importing and preservation regressions; Python Playwright + Chromium."""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
fixture=(Path(__file__).parent/'fixtures/original-company-schedule.txt').read_text()
old={'id':'historical','school':'Archived school','date':'2000-01-02','notes':'Historical notes','contacts':{'phone':'123'},'custom':{'keep':True},'status':'confirmed'}
def raw(page):return page.evaluate("localStorage.getItem('PhotoOpsAssignmentsV1')")
def run(page,text,name='David Denk',mode='mine'):
 page.locator('[data-tab="import"]').click();page.locator('#nameFilter').fill(name);page.locator('#importMode').select_option(mode)
 page.locator('#scheduleText').fill(text);page.locator('#importBtn').click();page.wait_for_function("!document.getElementById('importBtn').disabled")
 return page.locator('#importMessage').inner_text()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   c=b.new_context(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000)
   page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.evaluate("a=>{localStorage.setItem('PhotoOpsAssignmentsV1',JSON.stringify([a]));localStorage.setItem('PhotoOpsSettingsV1',JSON.stringify({displayName:'David Denk',aliases:[],importMode:'mine',leadTime:60,dark:true}));}",old);page.reload();initial=raw(page)
   assert page.locator('#defaultLeadTime').count()==0
   assert page.get_by_text('Reminder lead time',exact=True).count()==0
   assert page.evaluate('settings.leadTime')==60  # Legacy setting is inert and not erased on load.
   assert page.locator('#syncPreview').count()==0 and page.locator('[data-tab="team"]').count()==0
   for kind in ['add','edit']:
    for filled in [False,True]:
     for method in ['close','cancel','escape','keyboard']:
      if kind=='add':page.locator('[data-tab="dashboard"]').click();page.locator('#addManualBtn').click()
      else:page.locator('[data-tab="schedule"]').click();page.locator('#scheduleList .details-btn').click()
      page.locator('#school').fill('Unsaved change' if filled else '')
      if method=='escape':page.keyboard.press('Escape')
      else:
       control=page.locator('#closeAssignmentBtn' if method in ['close','keyboard'] else '#cancelAssignmentBtn')
       if method=='keyboard':control.focus();page.keyboard.press('Enter')
       elif width<1000:control.tap()
       else:control.click()
      assert not page.locator('#assignmentDialog').evaluate('e=>e.open');assert raw(page)==initial
   # The exact repository sample is uploaded, not a generic JSON-only happy path.
   page.locator('[data-tab="import"]').click();page.locator('#scheduleFile').set_input_files({'name':'company.txt','mimeType':'text/plain','buffer':fixture.encode()})
   page.wait_for_function("document.getElementById('scheduleText').value.includes('Hickory')")
   assert page.locator('#importBtn').inner_text()=='Import & Update Schedule';page.locator('#importBtn').click()
   page.wait_for_function("!document.getElementById('importBtn').disabled")
   assert '3 added, 0 updated, 0 unchanged, 0 need attention' in page.locator('#importMessage').inner_text()
   assert page.evaluate('assignments.length')==4;assert page.evaluate('assignments[0]')==old
   before=raw(page);assert '3 unchanged' in run(page,fixture);assert raw(page)==before
   # Entered name controls selection even when all three schools are already saved.
   assert '1 unchanged' in run(page,fixture,'Stacy');assert '1 unchanged' in run(page,fixture,'Angel')
   assert '0 unchanged' in run(page,fixture,'David');assert 'No assignments matched' in page.locator('#importMessage').inner_text()
   assert raw(page)==before
   first=page.evaluate("assignments.find(a=>a.school==='Hickory HS')");assignment_id=first['id']
   page.locator('[data-tab="schedule"]').click();page.locator(f'#scheduleList [data-id="{assignment_id}"] .details-btn').click()
   page.locator('#notes').fill('My own note');page.locator('#contacts').fill('My contact');page.locator('#address').fill('Custom address');page.locator('#saveAssignmentBtn').click()
   partial='\n'.join(fixture.splitlines()[:2]).replace('9:00am last appt@1:20pm','arrival 8:30am - start 9:30am - end 1:20pm')
   assert '1 updated' in run(page,partial)
   changed=page.evaluate("assignments.find(a=>a.id===%s)"%json.dumps(assignment_id))
   assert changed['startTime']=='09:30' and changed['arrivalTime']=='08:30'
   assert changed['notes']=='My own note' and changed['contacts']=='My contact' and changed['address']=='Custom address'
   assert len(changed['history'])==1 and page.evaluate('assignments.length')==4
   before=raw(page);assert '1 unchanged' in run(page,partial);assert raw(page)==before
   moved=partial.replace('Mon, Aug 3','Tue, Aug 4')
   assert '1 need attention' in run(page,moved);assert raw(page)==before
   assert not page.locator('#importAttention').evaluate('e=>e.open');assert 'photographer roster' not in page.locator('#importMessage').inner_text()
   page.reload();page.locator('[data-tab="import"]').click();assert page.locator('#importAttention').is_visible()
   page.locator('#importAttention summary').click();page.locator('#attentionItems select').first.select_option(assignment_id)
   page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Update selected assignment',exact=True).click()
   page.wait_for_function('attention.length===0');assert page.evaluate('assignments.length')==4
   unknown='Mon, Aug 3, 2026\n**C** David Denk School Faculty Groups - 9:00am - gym'
   message=run(page,unknown);assert 'No photographer names could be identified' in message and '0 added' in message
   assert not page.locator('#importAttention').evaluate('e=>e.open')
   assert '1 added' in run(page,unknown,mode='all')
   # Backup failure and a failure after the assignment write leave the prior batch intact.
   current=page.evaluate("assignments.find(a=>a.id===%s)"%json.dumps(assignment_id))
   incoming={k:current[k] for k in ['school','date','assignmentType','photographers']};incoming['arrivalTime']='07:00'
   for failure in ['backup','attention']:
    before=raw(page);queue_before=page.evaluate("localStorage.getItem('PhotoOpsImportAttentionV21')")
    page.evaluate("""kind=>{window.oldSet=Storage.prototype.setItem;window.failOnce=true;Storage.prototype.setItem=function(k,v){if(failOnce && ((kind==='backup' && k.startsWith('PhotoOpsSyncBackupV21:')) || (kind==='attention' && k==='PhotoOpsImportAttentionV21'))){failOnce=false;throw new DOMException('Full','QuotaExceededError');}return oldSet.call(this,k,v);};}""",failure)
    assert run(page,json.dumps([incoming])).startswith('Import stopped')
    assert raw(page)==before and page.evaluate("localStorage.getItem('PhotoOpsImportAttentionV21')")==queue_before
    page.evaluate('()=>{Storage.prototype.setItem=window.oldSet;}')
   assert '1 updated' in run(page,json.dumps([incoming]));assert page.evaluate('assignments[0]')==old
   # Explicit aliases and case differences retain the one-click workflow.
   page.locator('[data-tab="settings"]').click();page.locator('#nameAliases').fill('David Denk');page.locator('#nameAliases').press('Tab')
   assert '1 unchanged' in run(page,json.dumps([incoming]),'Other Name')
   with page.expect_download() as dl:
    page.locator('[data-tab="settings"]').click();page.locator('#exportBtn').click()
   backup_bytes=Path(dl.value.path()).read_bytes();exported=json.loads(backup_bytes);assert exported['assignments'][0]==old
   assert exported['attention']
   page.evaluate("()=>{localStorage.setItem('PhotoOpsImportAttentionV21','[]');attention=[];renderAttention();}")
   page.on('dialog',lambda d:d.accept())
   page.locator('#backupInput').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup_bytes})
   page.wait_for_function('attention.length>0');assert page.evaluate('assignments[0]')==old
   page.locator('[data-tab="schedule"]').click()
   with page.expect_download() as dl:page.locator(f'#scheduleList [data-id="{assignment_id}"] .calendar-btn').click()
   calendar=Path(dl.value.path()).read_text();assert 'BEGIN:VEVENT' in calendar and 'VALARM' not in calendar
   page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null')
   c.set_offline(True);page.reload();assert page.title()=='PhotoOps'
   assert page.evaluate('assignments[0]')==old and page.locator('#importBtn').inner_text()=='Import & Update Schedule'
   assert page.locator('body').evaluate('e=>e.classList.contains("dark")');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not errors,errors
   print(f'PASS {width}x{height}: actual company sample/name changes; one-click updates/repeats; ambiguity/unknown formats; persistent optional attention; manual/history preservation; aliases; storage rollback; 16 dismissals; backup/calendar/dark/offline')
   c.close()
  b.close()
finally:server.shutdown()
