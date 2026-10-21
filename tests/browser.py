"""Browser regressions: python3 tests/browser.py (Playwright + /usr/bin/chromium)."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/'
old={'id':'past','school':'Historical School','date':'2000-01-02','startTime':'09:00','endTime':'12:00','notes':'Historical notes','contacts':{'phone':'123'},'custom':{'keep':True},'status':'confirmed'}
row={'sourceId':'job-1','school':'Example HS','assignmentType':'Faculty Groups','date':'2099-11-02','arrivalTime':'08:30','startTime':'09:00','endTime':'12:00','photographers':['Alex Smith'],'location':'Gym','address':'1 Main St','scheduleNotes':'Original schedule notes'}
def preview(page,rows):
 page.locator('[data-tab="import"]').click()
 page.locator('#scheduleText').fill(json.dumps(rows))
 page.locator('#importBtn').click()
 assert page.locator('#syncPreview').is_visible()
def commit(page):
 page.locator('#confirmSyncBtn').click()
 page.wait_for_function("document.getElementById('importMessage').textContent.startsWith('Synchronization complete')")
def raw(page):return page.evaluate("localStorage.getItem('PhotoOpsAssignmentsV1')")
def current(page):return page.evaluate("assignments.find(a=>a.sync?.sourceId==='job-1')")
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base)
   page.evaluate('''old=>{localStorage.setItem('PhotoOpsAssignmentsV1',JSON.stringify([old]));localStorage.setItem('PhotoOpsSettingsV1',JSON.stringify({displayName:'Taylor',aliases:['Alex Smith'],importMode:'all',leadTime:60,dark:true}));}''',old)
   page.reload(); initial=raw(page)
   assert page.locator('[data-tab="team"]').count()==0
   assert page.locator('body').evaluate('e=>e.classList.contains("dark")')
   # Close, Cancel, Escape and keyboard close with empty/filled add/edit forms.
   for mode in ['add','edit']:
    for filled in [False,True]:
     for method in ['close','cancel','escape','keyboard']:
      if mode=='edit':page.locator('[data-tab="schedule"]').click();page.locator('#scheduleList .details-btn').click()
      else:page.locator('[data-tab="dashboard"]').click();page.locator('#addManualBtn').click()
      page.locator('#school').fill('Unsaved' if filled else '')
      if method=='escape':page.keyboard.press('Escape')
      else:
       button=page.locator('#closeAssignmentBtn' if method in ['close','keyboard'] else '#cancelAssignmentBtn')
       if method=='keyboard':button.focus();page.keyboard.press('Enter')
       elif width<1000:button.tap()
       else:button.click()
      assert not page.locator('#assignmentDialog').evaluate('e=>e.open')
      assert raw(page)==initial
   page.locator('[data-tab="dashboard"]').click();page.locator('#addManualBtn').click()
   page.locator('#saveAssignmentBtn').click()
   assert page.locator('#assignmentDialog').evaluate('e=>e.open')
   assert page.locator('#school').evaluate('e=>e===document.activeElement')
   page.locator('#cancelAssignmentBtn').click();assert raw(page)==initial
   # Actual local file upload must populate a preview without changing storage.
   page.locator('[data-tab="import"]').click()
   page.locator('#scheduleFile').set_input_files({'name':'schedule.json','mimeType':'application/json','buffer':json.dumps([row]).encode()})
   page.wait_for_function("document.getElementById('scheduleText').value.includes('job-1')")
   page.locator('#importBtn').click();assert '1 new' in page.locator('#syncCounts').inner_text();assert raw(page)==initial
   page.locator('#cancelSyncBtn').click()
   # Preview, cancel and repeat before committing: no migration writes on load/preview.
   preview(page,[row]);assert '1 new' in page.locator('#syncCounts').inner_text();assert raw(page)==initial
   page.locator('#cancelSyncBtn').click();assert raw(page)==initial
   preview(page,[row]);commit(page)
   a=current(page);assignment_id=a['id'];assert page.evaluate('assignments[0]')==old
   backups=page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('PhotoOpsSyncBackupV21:')).map(k=>JSON.parse(localStorage.getItem(k)))")
   assert len(backups)==1 and backups[0]['assignmentsRaw']==initial
   synced_raw=raw(page);preview(page,[row,row]);assert '1 unchanged' in page.locator('#syncCounts').inner_text()
   page.locator('#confirmSyncBtn').click();assert raw(page)==synced_raw;page.locator('#cancelSyncBtn').click()
   # Manual details survive future syncs; unknown historical fields remain intact.
   page.locator('[data-tab="schedule"]').click()
   page.locator(f'#scheduleList [data-id="{assignment_id}"] .details-btn').click()
   page.locator('#notes').fill('My private note');page.locator('#contacts').fill('My contact');page.locator('#address').fill('Custom manual address')
   page.locator('#saveAssignmentBtn').click()
   revised={**row,'date':'2099-11-09','arrivalTime':'08:00','location':'Field','address':'2 Source Road','scheduleNotes':'Revised schedule notes'}
   preview(page,[revised]);assert '1 updated' in page.locator('#syncCounts').inner_text()
   assert 'Arrival time: 08:30 → 08:00' in page.locator('#syncRows').inner_text()
   assert 'manual value kept' in page.locator('#syncRows').inner_text()
   commit(page);a=current(page)
   assert a['id']==assignment_id and a['arrivalTime']=='08:00' and a['date']=='2099-11-09'
   assert a['notes']=='My private note' and a['contacts']=='My contact' and a['address']=='Custom manual address'
   assert a['history'][0]['previous']['arrivalTime']=='08:30'
   assert page.evaluate('assignments[0]')==old
   synced_raw=raw(page);preview(page,[revised]);assert '1 unchanged' in page.locator('#syncCounts').inner_text();page.locator('#cancelSyncBtn').click();assert raw(page)==synced_raw
   # Past assignments remain available through every date view.
   page.locator('[data-tab="schedule"]').click();page.locator('#viewDate').fill('2000-01-02')
   for view in ['day','week','month','all']:
    page.locator('#scheduleView').select_option(view)
    if view in ['all','day']:
     assert page.locator('#scheduleList' if view=='all' else '#calendarView').get_by_text('Historical School',exact=True).count()==1
    else:
     assert page.locator('#calendarView .calendar-event').filter(has_text='Historical School').count()==1
   with page.expect_download() as download:page.locator(f'#scheduleList [data-id="{assignment_id}"] .calendar-btn').click()
   assert 'BEGIN:VEVENT' in Path(download.value.path()).read_text()
   page.locator(f'#scheduleList [data-id="{assignment_id}"] .details-btn').click()
   page.locator('#assignmentDialog details').evaluate('e=>e.open=true')
   page.once('dialog',lambda d:d.accept());page.locator('#assignmentHistory button').first.click()
   page.wait_for_function("!document.getElementById('assignmentDialog').open")
   assert current(page)['arrivalTime']=='08:30' and current(page)['notes']=='My private note'
   # Ambiguous reschedule without source ID must be explicitly linked.
   no_id={**row,'date':'2099-11-16'};no_id.pop('sourceId')
   preview(page,[no_id]);assert '1 ambiguous' in page.locator('#syncCounts').inner_text()
   assert not page.locator('#syncRows input[type=checkbox]').first.is_checked()
   page.get_by_label('Import decision 1',exact=True).select_option(assignment_id)
   commit(page);assert current(page)['date']=='2099-11-16';assert page.evaluate('assignments.length')==2
   # Failed backups and failed commit writes cannot partially replace assignments.
   before_failure=raw(page)
   preview(page,[revised])
   page.evaluate("""()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('PhotoOpsSyncBackupV21:'))throw new DOMException('Full','QuotaExceededError');return originalSetItem.call(this,k,v);};}""")
   page.locator('#confirmSyncBtn').click();page.wait_for_function("document.getElementById('importMessage').textContent.startsWith('Synchronization stopped')")
   page.wait_for_function("!document.getElementById('confirmSyncBtn').disabled")
   assert raw(page)==before_failure
   page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}')
   page.evaluate("""()=>{Storage.prototype.setItem=function(k,v){if(k==='PhotoOpsAssignmentsV1')throw new DOMException('Full','QuotaExceededError');return originalSetItem.call(this,k,v);};}""")
   page.locator('#confirmSyncBtn').click();page.wait_for_function("document.getElementById('importMessage').textContent.startsWith('Synchronization stopped')")
   page.wait_for_function("!document.getElementById('confirmSyncBtn').disabled")
   assert raw(page)==before_failure
   page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}');page.locator('#cancelSyncBtn').click()
   # Another tab invalidates the preview rather than being overwritten.
   preview(page,[revised]);other=context.new_page();other.goto(base)
   other.evaluate("localStorage.setItem('PhotoOpsAssignmentsV1',JSON.stringify([...JSON.parse(localStorage.getItem('PhotoOpsAssignmentsV1')),{id:'other-tab',school:'Another tab',date:'2001-01-01',status:'confirmed'}]))")
   other_raw=raw(other);page.locator('#confirmSyncBtn').click();page.wait_for_function("document.getElementById('importMessage').textContent.startsWith('Synchronization stopped')")
   assert raw(page)==other_raw;other.close();page.reload()
   # Preferences and aliases, including opt-in review mode, persist locally.
   foreign={**row,'sourceId':'job-foreign','school':'Foreign School','photographers':['Other Person']}
   page.locator('[data-tab="import"]').click();page.locator('#importMode').select_option('mine');preview(page,[foreign]);assert '0 new' in page.locator('#syncCounts').inner_text()
   alias={**row,'sourceId':'job-alias','school':'Alias School'};preview(page,[alias]);assert '1 new' in page.locator('#syncCounts').inner_text()
   page.locator('#importMode').select_option('review');preview(page,[foreign]);assert not page.locator('#syncRows input[type=checkbox]').first.is_checked()
   page.get_by_label('Import decision 1',exact=True).select_option('new');commit(page)
   page.locator('[data-tab="settings"]').click()
   with page.expect_download() as download:page.locator('#syncBackupBtn').click()
   safety=json.loads(Path(download.value.path()).read_text());assert safety['assignments'][0]==old
   with page.expect_download() as download:page.locator('#exportBtn').click()
   exported=json.loads(Path(download.value.path()).read_text());assert exported['schemaVersion']==21 and exported['assignments'][0]==old
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null')
   page.evaluate("async()=>{const c=await caches.open('PhotoOps-v3');await c.put(location.origin+'/',new Response('stale app'));}")
   context.set_offline(True);page.reload();assert page.title()=='PhotoOps';assert page.evaluate('assignments[0]')==old
   assert page.locator('#confirmSyncBtn').count()==1;assert not errors,errors
   print(f'PASS {width}x{height}: 16 dismissal cases; preview/cancel/diffs/sync/idempotence; manual/history preservation; all date views; restoration; ambiguity resolution; quota/commit failure and stale-tab protection; modes/aliases; calendar/backups; responsive/dark/offline')
   context.close()
  browser.close()
finally:server.shutdown()
