"""Real supplied Gmail schedule, rich clipboard, scale and offline regressions."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
from html import escape
from playwright.sync_api import sync_playwright
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
fixture=(root/'tests/fixtures/gmail-production.txt').read_text()
rich='<div>To: staff@example.com</div>'+''.join('<ul><li><span style="color:red;background:yellow">'+escape(line[2:])+'</span></li></ul>' if line.startswith('- ') else '<div><b>'+escape(line)+'</b></div>' for line in fixture.splitlines())+'<blockquote class="gmail_quote">Mon, Nov 2\nOld School - 8am - Photographers: David Denk</blockquote><script>window.untrusted=true</script>'
def click(page):
 page.locator('#importBtn').click();page.wait_for_function("!document.getElementById('importBtn').disabled")
 return page.locator('#importMessage').inner_text()
def paste(page,html):
 page.locator('#scheduleText').evaluate('(el,html)=>{const data=new DataTransfer();data.setData("text/html",html);el.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));}',html)
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(390,844),(768,1024),(1440,1000)]:
   c=b.new_context(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000)
   page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('[data-tab="import"]').click()
   page.locator('#nameFilter').fill('David Denk');page.locator('.import-options summary').click();page.locator('#scheduleYear').fill('2026')
   paste(page,rich);assert '3 added' in click(page)
   assert not page.evaluate('Boolean(window.untrusted)')
   saved=page.evaluate('assignments');assert len(saved)==3 and {a['school'] for a in saved}=={'Bruton HS','Grafton High','Petsworth ES'}
   assert '3 unchanged' in click(page)
   page.locator('#scheduleText').fill(fixture);assert '3 unchanged' in click(page)
   page.locator('#scheduleText').fill(fixture.replace('10:00am- 11:30am','10:15am- 11:30am'));assert '1 updated' in click(page)
   page.locator('#nameFilter').fill('Monica');page.locator('#scheduleText').fill(fixture);message=click(page);assert '2 added' in message,message
   # Headered HTML table uses columns, not concatenated prose; notes remain text.
   paste(page,'<table><tr><th>School</th><th>Date</th><th>Photographers</th><th>Start</th><th>Notes</th></tr><tr><td>Table School</td><td>2026-11-01</td><td>Monica, Other Person</td><td>09:00</td><td>Keep<br>instructions</td></tr></table>')
   assert '1 added' in click(page)
   table='<table><tr><th>Date</th><th>School</th><th>Photographers</th><th>Start</th></tr><tr><td rowspan="2">2026-11-02</td><td>Span One</td><td>Monica</td><td>8am</td></tr><tr><td>Span Two</td><td>Monica</td><td>9am</td></tr></table>'
   parsed=page.evaluate('(html)=>PhotoOpsSync.parse(html,new Date(),["Monica"],{year:2026})',table)
   assert [r['date'] for r in parsed['rows']]==['2026-11-02','2026-11-02']
   page.locator('#scheduleText').fill('Wed, Dec 30\n- **C** Year One UC 2C - 8am - LS Monica\nFri, Jan 1\n- **C** Year Two UC 2C - 8am - LS Monica\n[Message clipped] View entire message')
   message=click(page);assert '2 added' in message,message
   assert 'Gmail may have clipped' in page.locator('#importFormatMessage').inner_text()
   assert {r['date'] for r in page.evaluate('assignments') if r['school'].startswith('Year ')}=={'2026-12-30','2027-01-01'}
   # Large unrelated crews generate no persistent warnings, and repeat identically.
   big='Wed, Oct 21, 2026\n'+'\n'.join(f'- **C** Scale School {i} UC 2C - 8:00am - gym - LS '+('Monica' if i%100==0 else 'Unknown Person') for i in range(1000))
   page.locator('#scheduleText').fill(big);assert '10 added' in click(page);assert '0 need attention' in page.locator('#importMessage').inner_text()
   assert '10 unchanged' in click(page)
   assert page.evaluate('attention.length')==0
   assert page.locator('#attentionItems').locator('article').count()==0
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   # Source dates don't delete any earlier saved record.
   assert len(page.evaluate('assignments'))==18
   before=page.evaluate("localStorage.getItem('PhotoOpsAssignmentsV1')")
   page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null')
   c.set_offline(True);page.reload();assert page.locator('#importBtn').count()==1
   assert page.evaluate('typeof PhotoOpsFormats.structured')=='function'
   assert page.evaluate("localStorage.getItem('PhotoOpsAssignmentsV1')")==before
   assert not errors,errors
   print(f'PASS {width}x{height}: supplied Gmail plain/rich paste; exact/shared names; changed names/times; HTML columns; 1,000 rows/repeats/no warning flood; history; refresh/offline')
   c.close()
  b.close()
finally:server.shutdown()
