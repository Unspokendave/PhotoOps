const STORAGE_KEY = "PhotoOpsAssignmentsV1";
const SETTINGS_KEY = "PhotoOpsSettingsV1";

let assignments = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{"displayName":"David Denk","leadTime":45,"dark":false}');

const $ = (id) => document.getElementById(id);
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

if (settings.dark) document.body.classList.add("dark");
$("displayName").value = settings.displayName || "David Denk";
$("nameFilter").value = settings.displayName || "David Denk";
$("defaultLeadTime").value = String(settings.leadTime || 45);

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(t => t.classList.remove("active"));
  panels.forEach(p => p.classList.remove("active"));
  tab.classList.add("active");
  $(tab.dataset.tab).classList.add("active");
}));

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  settings.dark = document.body.classList.contains("dark");
  saveSettings();
});

$("displayName").addEventListener("change", e => {
  settings.displayName = e.target.value.trim() || "David Denk";
  $("nameFilter").value = settings.displayName;
  saveSettings();
});

$("defaultLeadTime").addEventListener("change", e => {
  settings.leadTime = Number(e.target.value);
  saveSettings();
});

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveAssignments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  renderAll();
}

function assignmentDateTime(a) {
  const time = a.startTime || "23:59";
  return new Date(`${a.date}T${time}:00`);
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
}

function formatTime(value) {
  if (!value) return "Time TBD";
  const [h,m] = value.split(":").map(Number);
  return new Date(2000,0,1,h,m).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
}

function createAssignmentCard(a) {
  const template = $("assignmentTemplate").content.cloneNode(true);
  const article = template.querySelector(".assignment-card");
  const date = new Date(`${a.date}T12:00:00`);
  template.querySelector(".month").textContent = date.toLocaleDateString([], {month:"short"});
  template.querySelector(".day").textContent = date.getDate();
  template.querySelector("h3").textContent = a.school;
  const pill = template.querySelector(".status-pill");
  pill.textContent = a.status;
  pill.classList.add(`status-${a.status}`);
  template.querySelector(".time-line").textContent = `${formatDate(a.date)} • ${formatTime(a.startTime)}${a.endTime ? "–" + formatTime(a.endTime) : ""}`;
  template.querySelector(".location-line").textContent = [a.location, a.address].filter(Boolean).join(" • ") || "Location not entered";
  template.querySelector(".notes-line").textContent = a.notes || "";
  template.querySelector(".details-btn").addEventListener("click", () => openDialog(a.id));

  const directions = template.querySelector(".directions-btn");
  if (a.address) {
    directions.href = `https://maps.apple.com/?q=${encodeURIComponent(a.address)}`;
  } else {
    directions.style.display = "none";
  }

  template.querySelector(".calendar-btn").addEventListener("click", () => downloadICS(a));
  article.dataset.id = a.id;
  return template;
}

function renderList(container, list) {
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No assignments found.</div>';
    return;
  }
  list.forEach(a => container.appendChild(createAssignmentCard(a)));
}

function renderAll() {
  const sorted = [...assignments].sort((a,b) => assignmentDateTime(a) - assignmentDateTime(b));
  const now = new Date();
  const upcoming = sorted.filter(a => assignmentDateTime(a) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  $("upcomingCount").textContent = upcoming.length;
  $("trainingCount").textContent = assignments.filter(a => a.status === "training").length;
  $("tentativeCount").textContent = assignments.filter(a => ["tentative","tbd"].includes(a.status)).length;

  renderList($("dashboardList"), upcoming.slice(0,6));
  applyScheduleFilters();

  const next = upcoming[0];
  $("nextAssignment").innerHTML = next
    ? `<h2>${escapeHtml(next.school)}</h2>
       <p>${formatDate(next.date)} • ${formatTime(next.startTime)}${next.endTime ? "–"+formatTime(next.endTime) : ""}</p>
       <p>${escapeHtml([next.location, next.address].filter(Boolean).join(" • ") || "Location not entered")}</p>`
    : `<h2>No upcoming assignment</h2><p>Import or add your schedule to get started.</p>`;
}

function escapeHtml(value="") {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function applyScheduleFilters() {
  const term = $("searchInput").value.toLowerCase().trim();
  const status = $("statusFilter").value;
  const list = [...assignments]
    .filter(a => status === "all" || a.status === status)
    .filter(a => [a.school,a.location,a.address,a.notes].join(" ").toLowerCase().includes(term))
    .sort((a,b) => assignmentDateTime(a) - assignmentDateTime(b));
  renderList($("scheduleList"), list);
}

$("searchInput").addEventListener("input", applyScheduleFilters);
$("statusFilter").addEventListener("change", applyScheduleFilters);

function openDialog(id=null) {
  const a = assignments.find(x => x.id === id);
  $("dialogTitle").textContent = a ? "Edit Assignment" : "Add Assignment";
  $("editId").value = a?.id || "";
  $("school").value = a?.school || "";
  $("date").value = a?.date || new Date().toISOString().slice(0,10);
  $("startTime").value = a?.startTime || "";
  $("endTime").value = a?.endTime || "";
  $("status").value = a?.status || "confirmed";
  $("location").value = a?.location || "";
  $("address").value = a?.address || "";
  $("notes").value = a?.notes || "";
  $("deleteAssignmentBtn").style.display = a ? "inline-block" : "none";
  $("assignmentDialog").showModal();
}

$("addManualBtn").addEventListener("click", () => openDialog());

$("assignmentForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("editId").value || crypto.randomUUID();
  const item = {
    id,
    school: $("school").value.trim(),
    date: $("date").value,
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    status: $("status").value,
    location: $("location").value.trim(),
    address: $("address").value.trim(),
    notes: $("notes").value.trim()
  };
  const index = assignments.findIndex(a => a.id === id);
  if (index >= 0) assignments[index] = item; else assignments.push(item);
  saveAssignments();
  $("assignmentDialog").close();
});

$("deleteAssignmentBtn").addEventListener("click", () => {
  const id = $("editId").value;
  if (id && confirm("Delete this assignment?")) {
    assignments = assignments.filter(a => a.id !== id);
    saveAssignments();
    $("assignmentDialog").close();
  }
});

function normalizeYear(monthIndex) {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthIndex, 1);
  if (candidate < new Date(now.getFullYear(), now.getMonth()-3, 1)) year += 1;
  return year;
}

function parseSchedule(text, name) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  let currentDate = null;
  const dateRegex = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?/i;

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(dateRegex);
    if (dateMatch) {
      const monthIndex = new Date(`${dateMatch[2]} 1, 2026`).getMonth();
      const year = Number(dateMatch[4]) || normalizeYear(monthIndex);
      currentDate = `${year}-${String(monthIndex+1).padStart(2,"0")}-${String(Number(dateMatch[3])).padStart(2,"0")}`;
      continue;
    }

    if (!currentDate) continue;

    let block = lines[i];
    let j = i + 1;
    while (j < lines.length && !dateRegex.test(lines[j])) {
      if (/^\*\*C\*\*/.test(lines[j]) || /^C\s/.test(lines[j])) break;
      block += " " + lines[j];
      j++;
    }

    if (!block.toLowerCase().includes(name.toLowerCase())) continue;

    const cleaned = block.replace(/\*\*/g,"").replace(/^C\s*/i,"").trim();
    const school = cleaned.split(/\s+-\s+/)[0].trim() || "Imported Assignment";
    const times = [...cleaned.matchAll(/(\d{1,2}:\d{2})\s*(am|pm)/ig)].map(m => to24(m[1],m[2]));
    const addressMatch = cleaned.match(/Address:\s*([^)]+)/i);
    const locationMatch = cleaned.match(/-\s*(Aud|Auditorium|gym foyer|gym|cafeteria|stage|stadium|field|Main Gym|Aux gym|playground|Outside & gym)/i);
    const lower = cleaned.toLowerCase();
    const status = lower.includes("pending") ? "tentative" :
                   lower.includes("time tbd") || lower.includes("loc tbd") ? "tbd" :
                   lower.includes("training") ? "training" : "confirmed";

    results.push({
      id: crypto.randomUUID(),
      school,
      date: currentDate,
      startTime: times[0] || "",
      endTime: times[1] || "",
      status,
      location: locationMatch ? locationMatch[1] : "",
      address: addressMatch ? addressMatch[1].trim() : "",
      notes: cleaned
    });
  }
  return dedupe(results);
}

function to24(time, meridiem) {
  let [h,m] = time.split(":").map(Number);
  if (meridiem.toLowerCase() === "pm" && h !== 12) h += 12;
  if (meridiem.toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(a => {
    const key = `${a.date}|${a.school}|${a.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

$("importBtn").addEventListener("click", () => {
  const text = $("scheduleText").value.trim();
  const name = $("nameFilter").value.trim();
  if (!text || !name) {
    $("importMessage").textContent = "Paste a schedule and enter your name first.";
    return;
  }
  const parsed = parseSchedule(text, name);
  assignments = dedupe([...assignments, ...parsed]);
  saveAssignments();
  $("importMessage").textContent = `Imported ${parsed.length} assignment${parsed.length === 1 ? "" : "s"} containing “${name}.”`;
});

$("sampleBtn").addEventListener("click", () => {
  $("scheduleText").value = `Mon, Aug 3
**C** Hickory HS SR27 MU - 9:00am last appt@1:20pm- (Gray bkgd) - gym foyer - Tripp, Angel, Connor, Ahmed, Ramsay, Monica, Ben, David Denk (training)
Tue, Aug 4
**C** Jamestown HS SR27 MU -9:00am last appt@1:20pm - cafeteria - Tripp, Ahmed, Monica, Ramsay, Stacy, David Denk (training)
Thu, Aug 20
Woodside HS Fall Sportsmates - 4:00pm - pending approval - Tripp, Ahmed, Ramsay, Monica, David Denk`;
});

function downloadICS(a) {
  const start = a.startTime || "09:00";
  const end = a.endTime || addMinutes(start, 120);
  const dtStart = `${a.date.replaceAll("-","")}T${start.replace(":","")}00`;
  const dtEnd = `${a.date.replaceAll("-","")}T${end.replace(":","")}00`;
  const body = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Denk Hub//EN","BEGIN:VEVENT",
    `UID:${a.id}@denk-hub`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(a.school)}`,
    `LOCATION:${icsEscape([a.location,a.address].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${icsEscape(a.notes || "")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  downloadBlob(`${a.school.replace(/[^a-z0-9]+/gi,"-")}.ics`, body, "text/calendar");
}

function addMinutes(time, mins) {
  const [h,m] = time.split(":").map(Number);
  const date = new Date(2000,0,1,h,m+mins);
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
function icsEscape(v="") { return v.replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n"); }
function downloadBlob(name, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("exportBtn").addEventListener("click", () => {
  downloadBlob("denk-hub-backup.json", JSON.stringify({assignments,settings}, null, 2), "application/json");
});

$("backupInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    assignments = Array.isArray(data.assignments) ? data.assignments : [];
    settings = data.settings || settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    saveAssignments();
    alert("Backup imported.");
  } catch {
    alert("That backup file could not be read.");
  }
});

$("clearBtn").addEventListener("click", () => {
  if (confirm("Clear every saved assignment?")) {
    assignments = [];
    saveAssignments();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

renderAll();
