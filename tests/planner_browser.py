"""Calendar, directory and combined-filter regressions. Run python3 tests/planner_browser.py."""
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
rows=[{'id':'late','school':'Example School','date':'2024-02-29','startTime':'11:00','endTime':'12:00','assignmentType':'Portraits','status':'confirmed','location':'Auditorium','notes':'Keep late notes','contacts':{'phone':'111'}},
      {'id':'early','school':'Example School','date':'2024-02-29','startTime':'09:00','endTime':'10:00','assignmentType':'Portraits','status':'confirmed','location':'Gym','notes':'Keep early notes'},
      {'id':'other','school':'Other School','date':'2024-03-01','startTime':'08:00','assignmentType':'Sports','status':'tentative'},
      {'id':'past','school':'Historical School','date':'2000-01-02','startTime':'09:00','status':'confirmed','notes':'Keep history','custom':{'keep':True}}]
fields={'schoolName':'Example School','schoolAddress':'1 First St','schoolCity':'Sample City','schoolState':'AA','schoolZip':'12345','schoolPhone':'555-0100','schoolNotes':'Use side entrance'}
def directory(page):page.locator('[data-tab="schools"]').click()
def fill_school(page,values=fields):
 for key,value in values.items():page.locator('#'+key).fill(value)
def school_save(page):page.locator('#schoolForm button[type="submit"]').click()
def get_raw(page,key='PhotoOpsAssignmentsV1'):return page.evaluate('(key)=>localStorage.getItem(key)',key)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   c=b.new_context(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000)
   page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url);page.evaluate("r=>{localStorage.setItem('PhotoOpsAssignmentsV1',JSON.stringify(r));localStorage.setItem('PhotoOpsSettingsV1',JSON.stringify({displayName:'Test Person',aliases:[],importMode:'all',dark:true,leadTime:60}));}",rows);page.reload()
   initial=get_raw(page);assert get_raw(page,'PhotoOpsSchoolsV1') is None
   page.locator('[data-tab="schedule"]').click();page.locator('#viewDate').fill('2024-02-29');page.locator('#scheduleView').select_option('day')
   assert page.locator('.day-timeline [data-id]').evaluate_all('els=>els.map(e=>e.dataset.id)')==['early','late']
   page.locator('.day-timeline [data-id="early"] .details-btn').click();assert page.locator('#notes').input_value()=='Keep early notes'
   with page.expect_download() as dl:page.locator('#dialogCalendarBtn').click()
   assert 'SUMMARY:Example School' in Path(dl.value.path()).read_text();page.locator('#closeAssignmentBtn').click()
   page.locator('#scheduleView').select_option('week');assert page.locator('.calendar-week .calendar-day').count()==7
   assert page.locator('.calendar-day[data-date="2024-02-29"] .calendar-event').count()==2
   assert page.locator('.calendar-day[data-date="2024-03-01"] .calendar-event').count()==1
   page.locator('.calendar-day[data-date="2024-03-01"] .calendar-event').click();assert page.locator('#editId').input_value()=='other';page.keyboard.press('Escape')
   page.locator('#scheduleView').select_option('month');assert page.locator('.calendar-month .calendar-day').count()==42
   assert page.locator('.calendar-month .weekday').count()==7
   assert page.locator('.calendar-day[data-date="2024-02-29"] .calendar-count').get_attribute('aria-label')=='2 assignments'
   page.screenshot(path=f'/tmp/photoops-calendar-{width}.png',full_page=True)
   page.locator('.calendar-day[data-date="2024-02-29"] .calendar-date').first.click();assert page.locator('#scheduleView').input_value()=='day'
   page.locator('#calendarNext').click();assert page.locator('#viewDate').input_value()=='2024-03-01'
   page.locator('#calendarPrevious').click();assert page.locator('#viewDate').input_value()=='2024-02-29'
   page.locator('#scheduleView').select_option('week');page.locator('#calendarNext').click();assert page.locator('#viewDate').input_value()=='2024-03-07'
   page.locator('#scheduleView').select_option('month');page.locator('#viewDate').fill('2024-01-31');page.locator('#calendarNext').click();assert page.locator('#viewDate').input_value()=='2024-02-29'
   page.locator('#calendarToday').click();assert page.locator('#viewDate').input_value()==page.evaluate('PhotoOpsPlanner.iso(new Date())')
   assert get_raw(page)==initial
   # Every filter combines with search and calendar period, with inclusive dates.
   page.locator('#viewDate').fill('2024-02-29');page.locator('#schoolFilter').select_option('Example School');page.locator('#typeFilter').select_option('Portraits')
   page.locator('#filterStart').fill('2024-02-29');page.locator('#filterEnd').fill('2024-02-29');page.locator('#statusFilter').select_option('confirmed');page.locator('#searchInput').fill('Gym')
   for view in ['all','day','week','month']:
    page.locator('#scheduleView').select_option(view);assert page.locator('#filterCount').inner_text().startswith('1 matching assignment')
    assert page.locator('#scheduleList .assignment-card' if view=='all' else '.day-timeline .assignment-card' if view=='day' else '#calendarView .calendar-event').count()==1
   page.locator('#searchInput').fill('missing');assert page.locator('#filterEmpty').is_visible()
   page.locator('#resetFilters').click();assert page.locator('#schoolFilter').input_value()=='' and page.locator('#statusFilter').input_value()=='all'
   page.locator('#scheduleView').select_option('all');assert page.locator('#filterCount').inner_text().startswith('4 matching assignments')
   page.locator('#filterStart').fill('2024-03-02');page.locator('#filterEnd').fill('2024-03-01');assert 'Start date must' in page.locator('#filterEmpty').inner_text();page.locator('#resetFilters').click()
   # Directory CRUD, duplicate blocking, search and address reuse.
   directory(page);page.locator('#addSchoolBtn').click();fill_school(page);school_save(page);assert not page.locator('#schoolDialog').evaluate('e=>e.open')
   school_id=page.evaluate('schools[0].id');directory_raw=get_raw(page,'PhotoOpsSchoolsV1');assert get_raw(page)==initial
   page.locator('#addSchoolBtn').click();fill_school(page,{**fields,'schoolName':' EXAMPLE SCHOOL ','schoolCity':'sample city'});school_save(page)
   assert 'already exists' in page.locator('#schoolMessage').inner_text();assert get_raw(page,'PhotoOpsSchoolsV1')==directory_raw;page.locator('#cancelSchoolBtn').click()
   page.locator('#schoolSearch').fill('side entrance');assert page.locator('#schoolDirectory article').count()==1
   page.locator('#schoolSearch').fill('missing');assert 'No schools match' in page.locator('#schoolDirectory').inner_text();page.locator('#schoolSearch').fill('')
   href=page.locator('#schoolDirectory a').get_attribute('href');assert '1%20First%20St' in href and '12345' in href
   page.get_by_role('button',name='Edit Example School',exact=True).click();page.locator('#schoolAddress').fill('2 Second St');school_save(page)
   assert page.evaluate('schools[0].id')==school_id
   page.locator('[data-tab="dashboard"]').click();page.locator('#addManualBtn').click()
   suggestion=page.locator('#schoolSuggestions option').first.get_attribute('value');page.locator('#school').fill(suggestion);page.locator('#school').press('Tab')
   assert page.locator('#school').input_value()=='Example School';assert page.locator('#address').input_value()=='2 Second St, Sample City, AA, 12345'
   page.locator('#address').fill('My custom address');page.locator('#date').fill('2024-03-02');page.locator('#notes').fill('My personal notes');page.locator('#saveAssignmentBtn').click()
   linked=page.evaluate("assignments.find(a=>a.schoolId)");assert linked['address']=='My custom address' and linked['schoolId']==school_id
   # Editing assignment and reselecting school never silently replaces manual addresses.
   page.locator('[data-tab="schedule"]').click();page.locator(f'#scheduleList [data-id="{linked["id"]}"] .details-btn').click()
   page.locator('#school').fill(suggestion);page.once('dialog',lambda d:d.dismiss());page.locator('#school').press('Tab')
   assert page.locator('#address').input_value()=='My custom address';page.locator('#cancelAssignmentBtn').click()
   directory(page);page.get_by_role('button',name='Edit Example School',exact=True).click();page.locator('#schoolAddress').fill('3 Third St');school_save(page)
   assert page.evaluate("assignments.find(a=>a.schoolId).address")=='My custom address'
   page.reload();directory(page);assert page.evaluate('schools[0].address')=='3 Third St';assert page.evaluate('assignments.slice(0,4)')==rows
   page.locator('[data-tab="settings"]').click()
   with page.expect_download() as dl:page.locator('#exportBtn').click()
   backup=Path(dl.value.path()).read_bytes();assert json.loads(backup)['schools'][0]['address']=='3 Third St'
   directory(page);page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Remove Example School',exact=True).click()
   assert page.evaluate('schools.length')==0;assert page.evaluate('assignments.length')==5;assert page.evaluate("assignments.find(a=>a.schoolId).address")=='My custom address'
   page.locator('[data-tab="settings"]').click();page.on('dialog',lambda d:d.accept())
   page.locator('#backupInput').set_input_files({'name':'schools.json','mimeType':'application/json','buffer':backup});page.wait_for_function('schools.length===1')
   assert page.evaluate('assignments.length')==5 and page.evaluate('assignments.slice(0,4)')==rows
   # Old backups without schools must retain the current directory.
   page.locator('#backupInput').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps({'assignments':rows}).encode()})
   page.wait_for_timeout(100);assert page.evaluate('schools.length')==1
   # Failed multi-store restore rolls assignments back too.
   assignments_before=get_raw(page);schools_before=get_raw(page,'PhotoOpsSchoolsV1')
   incoming=json.loads(backup);incoming['assignments'].append({'id':'new-backup-assignment','school':'New Backup School','date':'2024-04-01','status':'confirmed'})
   incoming['schools'].append({**incoming['schools'][0],'id':'new-backup-school','name':'New Backup School'})
   page.evaluate("""()=>{window.savedSetItem=Storage.prototype.setItem;window.failSchoolOnce=true;Storage.prototype.setItem=function(k,v){if(k==='PhotoOpsSchoolsV1' && failSchoolOnce){failSchoolOnce=false;throw new DOMException('Full','QuotaExceededError');}return savedSetItem.call(this,k,v);};}""")
   page.locator('#backupInput').set_input_files({'name':'fail.json','mimeType':'application/json','buffer':json.dumps(incoming).encode()})
   page.wait_for_function('window.failSchoolOnce===false');page.wait_for_timeout(100)
   assert get_raw(page)==assignments_before and get_raw(page,'PhotoOpsSchoolsV1')==schools_before
   page.evaluate('()=>{Storage.prototype.setItem=window.savedSetItem;}')
   assert get_raw(page,'PhotoOpsRestoreJournalV21') is None
   # Simulate interruption after first restore write: startup restores both original values.
   page.evaluate("""([a,s])=>{localStorage.setItem('PhotoOpsRestoreJournalV21',JSON.stringify({before:[['PhotoOpsAssignmentsV1',a],['PhotoOpsSchoolsV1',s]]}));localStorage.setItem('PhotoOpsAssignmentsV1','[]');}""",[assignments_before,schools_before]);page.reload()
   assert get_raw(page)==assignments_before and get_raw(page,'PhotoOpsSchoolsV1')==schools_before
   page.locator('[data-tab="schedule"]').click();page.locator('#scheduleView').select_option('month');page.locator('#viewDate').fill('2024-02-29')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('body').evaluate('e=>e.classList.contains("dark")')
   page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null');c.set_offline(True);page.reload()
   directory(page);assert page.locator('#schoolDirectory article').count()==1
   page.locator('[data-tab="schedule"]').click();page.locator('#scheduleView').select_option('month');page.locator('#viewDate').fill('2024-02-29');assert page.locator('.calendar-month .calendar-day').count()==42
   assert page.evaluate('assignments.slice(0,4)')==rows;assert not errors,errors
   print(f'PASS {width}x{height}: calendar layouts/date/event selection/navigation/export; combined filters/reset/counts; directory CRUD/duplicates/search/autofill/overrides; no history deletion; backup/old backup/rollback/recovery; dark/responsive/offline')
   c.close()
  b.close()
finally:server.shutdown()
