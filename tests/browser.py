"""Run with python3 tests/browser.py; requires Playwright and Chromium."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
legacy = [{'id':'legacy','school':'Existing assignment','date':'2099-11-01','startTime':'09:00','endTime':'10:00','status':'confirmed','location':'Gym','address':'123 Main','notes':'Original personal notes','custom':'preserve'}]
fixture = '''Mon, Nov 2, 2099
**C** Shared HS Faculty Individuals - 9:00am - gym - Alice, Bob, David Denk
**C** Coworker HS Senior Sports - 2:00pm - Photographers: Alice
Tue, Nov 3, 2099
Unknown HS Sportsmates - 10:00am - pending approval'''
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   context = browser.new_context(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000)
   page=context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base)
   page.evaluate('(rows)=>{localStorage.setItem("PhotoOpsAssignmentsV1",JSON.stringify(rows));}',legacy)
   before=page.evaluate('localStorage.getItem("PhotoOpsAssignmentsV1")')
   page.reload()
   assert page.evaluate('localStorage.getItem("PhotoOpsAssignmentsV1")')==before
   page.locator('[data-tab="import"]').click()
   page.locator('#scheduleText').fill(fixture); page.locator('#importBtn').click()
   assert page.evaluate('assignments.length')==2
   assert page.evaluate('assignments[0]')==legacy[0]
   assert page.evaluate('teamAssignments.length')==3
   page.locator('#importBtn').click()
   assert page.evaluate('assignments.length')==2
   assert page.evaluate('teamAssignments.length')==3
   page.locator('[data-tab="team"]').click()
   assert page.locator('#teamDirectory button').count()==2
   assert 'David Denk' not in page.locator('#teamDirectory').inner_text()
   page.get_by_role('button',name='Alice · 2 assignments').click()
   assert page.locator('#teamAssignments .assignment-card').count()==2
   assert 'Faculty Individuals' in page.locator('#teamAssignments').inner_text()
   assert '2099' in page.locator('#teamAssignments').inner_text()
   page.locator('#teamSearch').fill('bob')
   assert page.locator('#teamDirectory button').count()==1
   page.locator('#teamTypeFilter').select_option('Senior Sports')
   assert page.locator('#teamDirectory button').count()==0
   page.locator('#teamSearch').fill('')
   assert page.locator('#teamDirectory button').count()==1
   page.get_by_role('button',name='Alice · 1 assignment',exact=True).click()
   assert page.locator('#teamAssignments .assignment-card').count()==1
   with page.expect_download() as download:
    page.locator('#teamAssignments .calendar-btn').click()
   assert 'BEGIN:VEVENT' in Path(download.value.path()).read_text()
   page.locator('#teamUnresolvedSummary').click()
   assert page.locator('#teamUnresolved .assignment-card').count()==1
   page.locator('#themeBtn').click()
   assert page.locator('body').evaluate('e=>e.classList.contains("dark")')
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   page.locator('[data-tab="settings"]').click()
   with page.expect_download() as download: page.locator('#exportBtn').click()
   backup=Path(download.value.path()).read_bytes(); data=json.loads(backup)
   assert len(data['teamAssignments'])==3 and len(data['assignments'])==2
   # Older backups merge rather than deleting newer personal or Team records.
   page.once('dialog',lambda d:d.accept())
   page.locator('#backupInput').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps({'assignments':legacy}).encode()})
   page.wait_for_function('assignments.length===2 && teamAssignments.length===3')
   # Current-schema backup restores both stores after an intentional clear.
   page.once('dialog',lambda d:d.accept())
   page.locator('#clearBtn').click()
   assert page.evaluate('assignments.length===0 && teamAssignments.length===0')
   page.once('dialog',lambda d:d.accept())
   page.locator('#backupInput').set_input_files({'name':'team-backup.json','mimeType':'application/json','buffer':backup})
   page.wait_for_function('assignments.length===2 && teamAssignments.length===3')
   assert page.evaluate('assignments[0]')==legacy[0]
   page.locator('[data-tab="dashboard"]').click()
   page.locator('#addManualBtn').click(); page.locator('#closeAssignmentBtn').click()
   assert not page.locator('#assignmentDialog').evaluate('e=>e.open')
   page.reload(); assert page.evaluate('assignments[0]')==legacy[0]
   page.evaluate('navigator.serviceWorker.ready'); page.reload()
   page.wait_for_function('navigator.serviceWorker.controller !== null')
   context.set_offline(True); page.reload()
   page.locator('[data-tab="team"]').click()
   assert page.locator('#teamDirectory button').count()==2
   assert page.evaluate('teamAssignments.length')==3
   assert not errors,errors
   print(f'PASS {width}x{height}: import, personal separation, directory, filters, calendar, backup, preservation, dismissal, dark mode, responsive layout, offline reload')
   context.close()
  browser.close()
finally:
 server.shutdown()
