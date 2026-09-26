/* =========================================================
   CarbonLens — Carbon Footprint Tracker for Individuals & Campuses
   CodeVoyage Hackathon · SU-02 · Sustainability theme
   Fully client-side. All personal data stays in localStorage.
   ========================================================= */

/* ---------- Emission factors (kg CO2e per unit) ----------
   Sources: EPA "Emission Factors for GHG Inventories" (2024),
   UK DEFRA/BEIS GHG Conversion Factors (2023), IPCC AR6 WG3
   dietary footprint estimates. Figures are representative
   averages for a hackathon prototype, not audited values. */
const EMISSION_FACTORS = {
  travel: {
    car: 0.192,     // average petrol car, per km (DEFRA)
    bus: 0.089,     // per km, per passenger (DEFRA)
    train: 0.041,   // per km, per passenger (DEFRA)
    flight: 0.246,  // per km, short-haul, per passenger (DEFRA)
    bike: 0,
    walk: 0
  },
  electricity: 0.475,  // kg CO2e per kWh, grid average (IEA global blend)
  food: {
    veg: 1.7,
    non_veg: 3.6,
    vegan: 1.1
  },
  waste: {
    landfill: 0.58,
    recycled: 0.12,
    composted: 0.06
  }
};

const TRAVEL_LABELS = { car:'🚗 Car', bus:'🚌 Bus', train:'🚆 Train', flight:'✈️ Flight', bike:'🚲 Bike', walk:'🚶 Walk' };
const FOOD_LABELS = { veg:'🥗 Veg', non_veg:'🍗 Non-veg', vegan:'🌱 Vegan' };
const WASTE_LABELS = { landfill:'🗑 Landfill', recycled:'♻️ Recycled', composted:'🌱 Composted' };

const BENCHMARKS = {
  personal: { excellent: 60, average: 160, poor: 260 },
  campus:   { excellent: 4500, average: 9000, poor: 14000 } // per-capita monthly, scaled per team below
};

const CHALLENGES = [
  { id:'no-car-week', name:'No-Car Week', icon:'🚲', description:'Skip the car for 7 days — walk, cycle, bus or train instead.', duration:7, co2SavedPerDay:4.8 },
  { id:'meatless-week', name:'Meatless Week', icon:'🥗', description:'Eat vegetarian or vegan for every meal, 7 days straight.', duration:7, co2SavedPerDay:2.4 },
  { id:'energy-saver', name:'Energy Saver Fortnight', icon:'💡', description:'Cut electricity use by ~20% for two weeks.', duration:14, co2SavedPerDay:1.9 },
  { id:'zero-landfill', name:'Zero Landfill Month', icon:'♻️', description:'Recycle or compost every day for a month — nothing to landfill.', duration:30, co2SavedPerDay:0.9 }
];

const OFFSET_PROJECTS = [
  { id:'reforest', name:'Community Reforestation', icon:'🌳', standard:'Gold Standard', rate:0.06, unit:'₹ per kg CO2e', desc:'Native tree-planting drives run with local farming communities; verified under the Gold Standard registry.' },
  { id:'renewable', name:'Renewable Energy Certificates', icon:'💨', standard:'Verra VCS', rate:0.09, unit:'₹ per kg CO2e', desc:'Backs wind & solar generation that displaces coal power on the grid, verified via Verra VCS.' },
  { id:'cookstove', name:'Clean Cookstove Program', icon:'🔥', standard:'Verra VCS', rate:0.05, unit:'₹ per kg CO2e', desc:'Funds efficient cookstoves for rural households, cutting both emissions and indoor air pollution.' }
];

/* Synthetic campus dataset — clearly labelled as demo data.
   Each team: baseline per-capita monthly footprint (kg CO2e) and headcount. */
const CAMPUS_TEAMS = [
  { id:'hostel-a', name:'Hostel A (Himalaya)', type:'Hostel', headcount:180, base:210 },
  { id:'hostel-b', name:'Hostel B (Nilgiri)',  type:'Hostel', headcount:165, base:245 },
  { id:'hostel-c', name:'Hostel C (Vindhya)',  type:'Hostel', headcount:140, base:175 },
  { id:'dept-cse', name:'Dept. of CSE',        type:'Department', headcount:320, base:130 },
  { id:'dept-mech',name:'Dept. of Mechanical', type:'Department', headcount:210, base:190 },
  { id:'dept-civil',name:'Dept. of Civil',     type:'Department', headcount:150, base:160 },
  { id:'admin',    name:'Admin Block',         type:'Team', headcount:60,  base:110 }
];

/* ---------- Seeded pseudo-random (deterministic, no Math.random jitter) ---------- */
function seeded(n){
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------- App state ---------- */
const DEFAULT_STATE = {
  consentGiven: false,
  userMode: 'personal',
  profile: { name: '', team: CAMPUS_TEAMS[0].id },
  activities: [],
  challenges: {},
  offsetsPurchased: 0,
  selectedActivityType: null,
};

let state = structuredCloneSafe(DEFAULT_STATE);
let currentUser = null;
let charts = { trend: null, breakdown: null };
let activeChartTab = 'trend';

/* ---------- Appearance ---------- */
const THEME_KEY = 'carbonlens_theme';
function getSavedTheme(){
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch(e) {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme, persist=true){
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  if (persist) { try { localStorage.setItem(THEME_KEY, normalized); } catch(e) {} }
  const dark = normalized === 'dark';
  const top = document.getElementById('themeToggleBtn');
  const drawer = document.getElementById('drawerThemeToggleBtn');
  if (top){
    top.innerHTML = dark ? '🌙 <span>Dark</span>' : '☀️ <span>Light</span>' ;
    top.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    top.setAttribute('aria-label', top.title);
    top.setAttribute('aria-pressed', String(dark));
  }
  if (drawer) drawer.textContent = dark ? '☀️ Switch to light mode' : '🌙 Switch to dark mode';
}
function toggleTheme(){
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  showToast(document.documentElement.dataset.theme === 'dark' ? '🌙 Dark mode enabled.' : '☀️ Light mode enabled.');
}
document.addEventListener('keydown', (e) => {
  if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) toggleTheme();
});
applyTheme(getSavedTheme(), false);

function loadState(){
  try {
    const raw = localStorage.getItem('carbonlens_state_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign(structuredCloneSafe(DEFAULT_STATE), parsed);
    }
  } catch (e) { console.warn('Could not load saved state', e); }
  return structuredCloneSafe(DEFAULT_STATE);
}

function structuredCloneSafe(obj){
  return JSON.parse(JSON.stringify(obj));
}

let saveTimer = null;
async function syncStateToServer(){
  if (!currentUser) return;
  try {
    await fetch('/api/state', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({state}) });
  } catch(e) { console.warn('Could not sync state to server', e); }
}
function saveState(){
  if (currentUser) localStorage.setItem(`carbonlens_state_${currentUser.id}`, JSON.stringify(state));
  else localStorage.setItem('carbonlens_state_v2', JSON.stringify(state));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(syncStateToServer, 250);
}

async function clearAllData(){
  if (!confirm('Clear all saved activities, challenges, offsets and profile settings for this account?')) return;
  try {
    const res = await fetch('/api/state', {method:'DELETE'});
    if (!res.ok) throw new Error('server');
    const data = await res.json();
    state = data.state; state.consentGiven = true;
    localStorage.setItem(`carbonlens_state_${currentUser.id}`, JSON.stringify(state));
    renderAll();
    showToast('🗑 Your account data was cleared.');
  } catch(e) { showToast('Could not clear account data.'); }
}

/* ---------- Date helpers ---------- */
function monthKey(dateStr){ return dateStr ? dateStr.slice(0,7) : ''; }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function currentMonthKey(){ return todayStr().slice(0,7); }
function lastNMonthKeys(n){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i=n-1; i>=0; i--){
    const dt = new Date(d.getFullYear(), d.getMonth()-i, 1);
    out.push(dt.toISOString().slice(0,7));
  }
  return out;
}
function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleString('default',{ month:'short' });
}

/* =========================================================
   ACTIVITY LOGGING
   ========================================================= */
function computeCo2(type, data){
  if (type === 'travel'){
    return (parseFloat(data.distance)||0) * EMISSION_FACTORS.travel[data.mode];
  }
  if (type === 'electricity'){
    return (parseFloat(data.kwh)||0) * EMISSION_FACTORS.electricity;
  }
  if (type === 'food'){
    return (parseFloat(data.meals)||0) * EMISSION_FACTORS.food[data.foodType];
  }
  if (type === 'waste'){
    return (parseFloat(data.kg)||0) * EMISSION_FACTORS.waste[data.wasteType];
  }
  return 0;
}

function addActivity(activity){
  activity.id = Date.now() + Math.floor(Math.random()*1000);
  activity.loggedAt = new Date().toISOString();
  state.activities.push(activity);
  saveState();
  renderAll();
  renderHistory();
}

function undoLastActivity(){
  if (!state.activities.length){ showToast('Nothing to undo.'); return; }
  const removed = state.activities.pop();
  saveState();
  renderAll();
  showToast(`Undid ${removed.type} entry (${removed.co2e.toFixed(2)} kg CO2e).`);
}

function activitiesForMonth(key, list){
  list = list || state.activities;
  return list.filter(a => monthKey(a.date) === key);
}

function totalCo2(list){
  return list.reduce((s,a) => s + (a.co2e||0), 0);
}

function categoryTotals(list){
  const totals = { travel:0, electricity:0, food:0, waste:0 };
  list.forEach(a => { totals[a.type] = (totals[a.type]||0) + a.co2e; });
  return totals;
}

/* =========================================================
   OCR — auto-import electricity reading from a bill photo
   Uses Tesseract.js (loaded via CDN). Falls back gracefully
   with a clear message if the library can't load (offline).
   ========================================================= */
async function runBillOcr(file){
  const statusEl = document.getElementById('ocrStatus');
  if (typeof Tesseract === 'undefined'){
    statusEl.textContent = 'OCR engine unavailable offline — enter kWh manually.';
    return;
  }
  statusEl.textContent = '🔎 Reading bill…';
  try {
    const { data } = await Tesseract.recognize(file, 'eng', { logger: () => {} });
    const text = data.text || '';
    // Look for a number followed by kWh / units consumed style patterns
    const patterns = [
      /(\d{1,5}(?:\.\d{1,2})?)\s*k\s*w\s*h/i,
      /units?\s*(?:consumed)?\s*[:\-]?\s*(\d{1,5}(?:\.\d{1,2})?)/i,
      /(\d{1,5}(?:\.\d{1,2})?)\s*units/i
    ];
    let found = null;
    for (const p of patterns){
      const m = text.match(p);
      if (m){ found = parseFloat(m[1]); break; }
    }
    if (found && found > 0 && found < 100000){
      document.getElementById('electricityKwh').value = found;
      statusEl.textContent = `✅ Detected ${found} kWh from bill — please double-check before logging.`;
      showToast('📷 Bill scanned — value auto-filled, verify it!');
    } else {
      statusEl.textContent = '⚠️ Could not confidently read a kWh value — please enter manually.';
    }
  } catch (err){
    console.error(err);
    statusEl.textContent = '⚠️ OCR failed — please enter the value manually.';
  }
}

/* =========================================================
   RECOMMENDATIONS — ranked by estimated CO2 saved
   ========================================================= */
function buildRecommendations(){
  const list = activitiesForMonth(currentMonthKey());
  const cat = categoryTotals(list);
  const recs = [];

  const carKm = list.filter(a => a.type==='travel' && a.mode==='car')
                     .reduce((s,a)=>s+(a.distance||0),0);
  if (carKm > 5){
    const saved = carKm * (EMISSION_FACTORS.travel.car - EMISSION_FACTORS.travel.bus) * 0.6;
    recs.push({ title:'Swap some car trips for the bus', icon:'🚌',
      desc:`You logged ${carKm.toFixed(0)} km by car this month. Shifting 60% of that to bus/metro cuts emissions a lot.`,
      savings: saved });
  }

  const flightKm = list.filter(a => a.type==='travel' && a.mode==='flight')
                        .reduce((s,a)=>s+(a.distance||0),0);
  if (flightKm > 0){
    recs.push({ title:'Bundle trips to reduce flights', icon:'✈️',
      desc:`${flightKm.toFixed(0)} km flown this month. Combining trips or choosing train for shorter hops saves significant CO2e.`,
      savings: flightKm * EMISSION_FACTORS.travel.flight * 0.3 });
  }

  if (cat.electricity > 20){
    recs.push({ title:'Trim peak electricity use', icon:'💡',
      desc:'Switch to LED lighting and unplug idle chargers/AC standby during the day.',
      savings: cat.electricity * 0.18 });
  }

  const nonVegMeals = list.filter(a => a.type==='food' && a.foodType==='non_veg')
                           .reduce((s,a)=>s+(a.meals||0),0);
  if (nonVegMeals > 4){
    recs.push({ title:'Try a couple of plant-based days', icon:'🥗',
      desc:`${nonVegMeals} non-veg meals logged. Swapping 2 a week for vegetarian meals adds up fast.`,
      savings: nonVegMeals * (EMISSION_FACTORS.food.non_veg - EMISSION_FACTORS.food.veg) * 0.25 });
  }

  const landfillKg = list.filter(a => a.type==='waste' && a.wasteType==='landfill')
                          .reduce((s,a)=>s+(a.wasteKg||0),0);
  if (landfillKg > 2){
    recs.push({ title:'Segregate more waste for recycling', icon:'♻️',
      desc:`${landfillKg.toFixed(1)} kg sent to landfill. Sorting recyclables/compostables cuts most of that impact.`,
      savings: landfillKg * (EMISSION_FACTORS.waste.landfill - EMISSION_FACTORS.waste.recycled) * 0.7 });
  }

  if (!recs.length){
    recs.push({ title:'Log a few more activities', icon:'📋',
      desc:'Once you track travel, electricity, food and waste for a few days, tailored tips will appear here.',
      savings: 0 });
  }

  return recs.filter(r => r.savings >= 0).sort((a,b) => b.savings - a.savings).slice(0,6);
}

/* =========================================================
   CHALLENGES
   ========================================================= */
function getChallengeProgress(id){
  return state.challenges[id] || { joined:false, days:0, lastCheckin:null };
}
function joinChallenge(id){
  state.challenges[id] = { joined:true, days:0, lastCheckin:null };
  saveState();
  renderChallenges();
  renderMetrics();
  showToast('🏆 Challenge joined — good luck!');
}
function checkinChallenge(id){
  const c = state.challenges[id];
  if (!c) return;
  const today = todayStr();
  if (c.lastCheckin === today){ showToast('Already checked in today — come back tomorrow!'); return; }
  c.days += 1;
  c.lastCheckin = today;
  saveState();
  renderChallenges();
  renderMetrics();
  const def = CHALLENGES.find(x=>x.id===id);
  if (def && c.days >= def.duration){
    showToast(`🎉 "${def.name}" complete! You saved ~${(c.days*def.co2SavedPerDay).toFixed(1)} kg CO2e.`);
  } else {
    showToast('✅ Day checked in!');
  }
}
function totalChallengeSavings(){
  let total = 0;
  CHALLENGES.forEach(c => {
    const p = getChallengeProgress(c.id);
    total += p.days * c.co2SavedPerDay;
  });
  return total;
}
function totalStreakDays(){
  let total = 0;
  CHALLENGES.forEach(c => { total += getChallengeProgress(c.id).days; });
  return total;
}

/* =========================================================
   CAMPUS DATA (synthetic, deterministic, clearly labelled)
   ========================================================= */
function campusMonthlyHistory(teamIndex, monthsBack){
  // Deterministic pseudo-random walk around the team's baseline.
  const team = CAMPUS_TEAMS[teamIndex];
  const out = [];
  for (let i=0;i<monthsBack;i++){
    const noise = (seeded(teamIndex*97 + i*13) - 0.5) * 0.22;
    const seasonal = Math.sin((i/monthsBack) * Math.PI) * 0.06;
    out.push(Math.max(20, team.base * (1 + noise - seasonal)));
  }
  return out;
}

function getUserTeam(){
  return CAMPUS_TEAMS.find(t => t.id === state.profile.team) || CAMPUS_TEAMS[0];
}

function campusLeaderboardData(){
  const months = 6;
  return CAMPUS_TEAMS.map((team, idx) => {
    const hist = campusMonthlyHistory(idx, months);
    let perCapita = hist[hist.length-1];
    if (team.id === state.profile.team){
      // fold in the user's real logged footprint (scaled to a rough per-capita nudge)
      const userTotal = totalCo2(activitiesForMonth(currentMonthKey()));
      perCapita = perCapita * 0.85 + (userTotal / 3);
    }
    return { ...team, perCapita, history: hist };
  }).sort((a,b) => a.perCapita - b.perCapita);
}

/* =========================================================
   OFFSETS
   ========================================================= */
function simulateOffsetPurchase(kg){
  state.offsetsPurchased = (state.offsetsPurchased||0) + kg;
  saveState();
  renderMetrics();
  showToast(`🌳 Simulated purchase: offset ${kg.toFixed(1)} kg CO2e (no real payment made).`);
}

/* =========================================================
   TOASTS
   ========================================================= */
function showToast(message){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* =========================================================
   RENDER: metrics + gauge
   ========================================================= */
function animateNumber(el, to, decimals){
  const from = parseFloat(el.dataset.val || '0');
  const start = performance.now();
  const dur = 700;
  function step(t){
    const p = Math.min(1, (t-start)/dur);
    const eased = 1 - Math.pow(1-p, 3);
    const val = from + (to-from)*eased;
    el.firstChild.textContent = val.toFixed(decimals);
    if (p < 1) requestAnimationFrame(step); else el.dataset.val = to;
  }
  requestAnimationFrame(step);
}

function renderMetrics(){
  const isCampus = state.userMode === 'campus';
  document.getElementById('scopeLabelMetric').textContent = isCampus ? 'campus · this month' : 'this month';
  document.getElementById('scopeLabelCharts').textContent = isCampus ? 'Campus' : 'Personal';
  document.getElementById('scopeLabelBoard').textContent = isCampus ? 'Hostels / Depts' : 'Personal';

  const monthList = activitiesForMonth(currentMonthKey());
  const total = totalCo2(monthList);

  const totalEl = document.getElementById('totalFootprint');
  if (!totalEl.firstChild || totalEl.children.length < 1) {
    totalEl.innerHTML = `<span>0.0</span> <small>kg CO2e</small>`;
  }
  animateNumber(totalEl, total, 1);

  // delta vs previous month
  const months = lastNMonthKeys(2);
  const prevTotal = totalCo2(activitiesForMonth(months[0]));
  const deltaEl = document.getElementById('footprintDelta');
  if (prevTotal > 0){
    const diff = ((total - prevTotal)/prevTotal)*100;
    deltaEl.textContent = diff <= 0
      ? `▼ ${Math.abs(diff).toFixed(0)}% vs last month`
      : `▲ ${diff.toFixed(0)}% vs last month`;
    deltaEl.style.color = diff <= 0 ? 'var(--accent)' : 'var(--danger)';
  } else {
    deltaEl.textContent = 'Log activities to see your trend';
    deltaEl.style.color = '';
  }

  // benchmark gauge
  const bm = isCampus ? BENCHMARKS.campus : BENCHMARKS.personal;
  const compareValue = isCampus ? getUserTeam().base : total;
  const ratio = Math.min(1.3, compareValue / bm.average);
  const dash = 157;
  const fillEl = document.getElementById('gaugeFill');
  const offset = dash - Math.min(dash, (Math.min(ratio,1.3)/1.3) * dash);
  fillEl.style.strokeDashoffset = offset;
  let label, color;
  if (compareValue <= bm.excellent){ label='Excellent 🌟'; color='var(--accent)'; }
  else if (compareValue <= bm.average){ label='Good 👍'; color='var(--accent-2)'; }
  else if (compareValue <= bm.poor){ label='Average ⚖️'; color='var(--warn)'; }
  else { label='High ⚠️'; color='var(--danger)'; }
  fillEl.style.stroke = color;
  document.getElementById('benchmarkComparison').textContent = label;
  document.getElementById('benchmarkComparison').style.color = color;

  // net after offsets
  const net = Math.max(0, total - (state.offsetsPurchased||0));
  const netEl = document.getElementById('netFootprint');
  if (!netEl.firstChild || netEl.children.length < 1){ netEl.innerHTML = `<span>0.0</span> <small>kg CO2e</small>`; }
  animateNumber(netEl, net, 1);
  document.getElementById('offsetAmount').textContent = `${(state.offsetsPurchased||0).toFixed(1)} kg offset (simulated)`;

  // streak
  document.getElementById('streakValue').innerHTML = `${totalStreakDays()} <small>days</small>`;
}

/* =========================================================
   RENDER: charts
   ========================================================= */
function renderCharts(){
  const isCampus = state.userMode === 'campus';
  const ctxTrend = document.getElementById('trendChart').getContext('2d');
  const ctxBreak = document.getElementById('breakdownChart').getContext('2d');
  const months = lastNMonthKeys(6);
  const labels = months.map(monthLabel);

  let trendData;
  if (isCampus){
    trendData = campusMonthlyHistory(CAMPUS_TEAMS.findIndex(t=>t.id===getUserTeam().id), 6);
  } else {
    trendData = months.map(m => totalCo2(activitiesForMonth(m)));
  }

  const gridColor = 'rgba(255,255,255,0.08)';
  const textColor = '#9fd9c8';

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctxTrend, {
    type:'line',
    data:{ labels, datasets:[{
      label: isCampus ? `${getUserTeam().name} per-capita CO2e` : 'Your CO2e',
      data: trendData,
      borderColor:'#3ce8a0',
      backgroundColor:(ctx)=>{
        const g = ctx.chart.ctx.createLinearGradient(0,0,0,220);
        g.addColorStop(0,'rgba(60,232,160,0.35)');
        g.addColorStop(1,'rgba(60,232,160,0.02)');
        return g;
      },
      fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#3ce8a0', pointBorderColor:'#04241c', borderWidth:3
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:textColor }, grid:{ color:'transparent' } },
        y:{ ticks:{ color:textColor }, grid:{ color:gridColor }, beginAtZero:true }
      }
    }
  });

  const cat = isCampus
    ? approximateCampusCategoryTotals()
    : categoryTotals(activitiesForMonth(currentMonthKey()));

  if (charts.breakdown) charts.breakdown.destroy();
  charts.breakdown = new Chart(ctxBreak, {
    type:'doughnut',
    data:{
      labels:['🚗 Travel','⚡ Electricity','🍽 Food','🗑 Waste'],
      datasets:[{
        data:[cat.travel, cat.electricity, cat.food, cat.waste],
        backgroundColor:['#3ce8a0','#20c4d9','#a6ff5c','#ffb547'],
        borderColor:'rgba(7,27,24,0.9)', borderWidth:3, hoverOffset:10
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ color:textColor, padding:14, font:{ family:'Sora' } } } }
    }
  });
}

function approximateCampusCategoryTotals(){
  // Rough synthetic split of a team's per-capita footprint across categories, for chart purposes.
  const total = getUserTeam().base;
  return { travel: total*0.38, electricity: total*0.32, food: total*0.22, waste: total*0.08 };
}

function switchChartTab(tab){
  activeChartTab = tab;
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.toggle('active', b.dataset.chart===tab));
  document.getElementById('trendPane').hidden = tab !== 'trend';
  document.getElementById('breakdownPane').hidden = tab !== 'breakdown';
}

/* =========================================================
   RENDER: campus panel
   ========================================================= */
function renderCampusPanel(){
  const panel = document.getElementById('campusPanel');
  const isCampus = state.userMode === 'campus';
  panel.hidden = !isCampus;
  if (!isCampus) return;

  const grid = document.getElementById('campusGrid');
  grid.innerHTML = '';
  const totalHeads = CAMPUS_TEAMS.reduce((s,t)=>s+t.headcount,0);
  document.getElementById('campusHeadcount').textContent = `${totalHeads.toLocaleString()} people tracked`;

  CAMPUS_TEAMS.forEach((team, idx) => {
    const hist = campusMonthlyHistory(idx, 6);
    const latest = hist[hist.length-1];
    const prev = hist[hist.length-2];
    const trendUp = latest > prev;
    const el = document.createElement('div');
    el.className = 'campus-tile' + (team.id === state.profile.team ? ' selected' : '');
    el.innerHTML = `
      <h4>${team.name}</h4>
      <div class="val">${latest.toFixed(0)} <small style="font-size:0.55em">kg/person</small></div>
      <div class="meta">${team.headcount} people · ${team.type}
        <span class="${trendUp?'trend-up':'trend-down'}">${trendUp?'▲':'▼'} ${Math.abs(((latest-prev)/prev)*100).toFixed(0)}%</span>
      </div>`;
    el.addEventListener('click', () => {
      state.profile.team = team.id;
      saveState();
      renderAll();
      showToast(`Team set to ${team.name}`);
    });
    grid.appendChild(el);
  });
}

/* =========================================================
   RENDER: recommendations
   ========================================================= */
function renderRecommendations(){
  const list = document.getElementById('recommendationsList');
  const recs = buildRecommendations();
  list.innerHTML = '';
  recs.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'recommend-item';
    el.innerHTML = `
      <div class="recommend-rank">${i+1}</div>
      <div class="recommend-body">
        <h4>${r.icon} ${r.title}</h4>
        <p>${r.desc}</p>
      </div>
      <div class="recommend-savings">${r.savings>0 ? '≈ '+r.savings.toFixed(1)+' kg CO2e' : ''}</div>
    `;
    list.appendChild(el);
  });
}

/* =========================================================
   RENDER: challenges
   ========================================================= */
function renderChallenges(){
  const wrap = document.getElementById('challengesList');
  wrap.innerHTML = '';
  CHALLENGES.forEach(c => {
    const p = getChallengeProgress(c.id);
    const pct = Math.min(100, (p.days/c.duration)*100);
    const savings = p.days * c.co2SavedPerDay;
    const doneToday = p.lastCheckin === todayStr();
    const complete = p.days >= c.duration;
    const el = document.createElement('div');
    el.className = 'challenge-card';
    el.innerHTML = `
      <h4>${c.icon} ${c.name}</h4>
      <p>${c.description}</p>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="challenge-foot">
        <span class="challenge-days">${p.days}/${c.duration} days</span>
        <span class="challenge-savings">${savings.toFixed(1)} kg CO2e saved</span>
      </div>
      <div style="margin-top:10px">
        ${!p.joined
          ? `<button class="btn btn-ghost btn-liquid" data-action="join" data-id="${c.id}">Join challenge</button>`
          : complete
            ? `<span class="completed-badge">🎉 Completed!</span>`
            : `<button class="btn btn-primary btn-liquid" data-action="checkin" data-id="${c.id}" ${doneToday?'disabled':''}>${doneToday?'✅ Checked in today':'+ Check in today'}</button>`
        }
      </div>
    `;
    wrap.appendChild(el);
  });

  wrap.querySelectorAll('[data-action="join"]').forEach(b => b.addEventListener('click', (e) => { attachRipple(e); joinChallenge(b.dataset.id); }));
  wrap.querySelectorAll('[data-action="checkin"]').forEach(b => b.addEventListener('click', (e) => { attachRipple(e); checkinChallenge(b.dataset.id); }));
}

/* =========================================================
   RENDER: leaderboard
   ========================================================= */
function renderLeaderboard(){
  const wrap = document.getElementById('leaderboardList');
  if(!wrap) return;
  const myTotal = totalCo2(activitiesForMonth(currentMonthKey()));
  const me = state.profile.name || currentUser?.username || 'You';
  const demo = [
    {name:me, sub:'You · current account', val:myTotal, isMe:true},
    {name:'Aarav Sharma', sub:'student01 · demo', val:Math.max(12,myTotal*0.72)},
    {name:'Demo User', sub:'demo01 · demo', val:Math.max(16,myTotal*0.88)},
    {name:'Eco Explorer', sub:'Campus demo', val:Math.max(21,myTotal*1.08)},
    {name:'Green Starter', sub:'Campus demo', val:Math.max(28,myTotal*1.32)}
  ].sort((a,b)=>a.val-b.val);
  wrap.innerHTML=demo.map((r,i)=>`<div class="leaderboard-item ${r.isMe?'me':''}"><div class="rank ${i<3?['gold','silver','bronze'][i]:''}">${i+1}</div><div><div class="lb-name">${escapeHtml(r.name)}${r.isMe?' (you)':''}</div><div class="lb-sub">${escapeHtml(r.sub)}</div></div><div class="lb-val">${r.val.toFixed(1)} kg CO2e</div></div>`).join('');
}

/* =========================================================
   RENDER: offsets
   ========================================================= */
function renderOffsets(){
  const wrap = document.getElementById('offsetList');
  wrap.innerHTML = '';
  const total = totalCo2(activitiesForMonth(currentMonthKey()));
  OFFSET_PROJECTS.forEach(p => {
    const cost = (total * p.rate).toFixed(0);
    const el = document.createElement('div');
    el.className = 'offset-card';
    el.innerHTML = `
      <h4>${p.icon} ${p.name}</h4>
      <p>${p.desc}</p>
      <div class="offset-rate">${p.standard} · ~₹${p.rate} per kg CO2e</div>
      <button class="btn btn-ghost btn-liquid" data-kg="${total}" data-id="${p.id}">
        Offset this month (~₹${cost}, simulated)
      </button>
    `;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('button[data-kg]').forEach(b => {
    b.addEventListener('click', (e) => {
      attachRipple(e);
      const kg = parseFloat(b.dataset.kg);
      if (kg <= 0){ showToast('Log some activities first — nothing to offset yet.'); return; }
      simulateOffsetPurchase(kg);
    });
  });
}

/* =========================================================
   RENDER: recent activity list
   ========================================================= */
function renderRecentActivities(){
  const ul = document.getElementById('recentActivityList');
  ul.innerHTML = '';
  const recent = [...state.activities].slice(-6).reverse();
  if (!recent.length){
    ul.innerHTML = `<li class="empty">No activities logged yet — add your first one above!</li>`;
    return;
  }
  const icons = { travel:'🚗', electricity:'⚡', food:'🍽', waste:'🗑' };
  recent.forEach(a => {
    let detail = '';
    if (a.type==='travel') detail = `${TRAVEL_LABELS[a.mode]} · ${a.distance} km`;
    if (a.type==='electricity') detail = `${a.kwh} kWh`;
    if (a.type==='food') detail = `${FOOD_LABELS[a.foodType]} · ${a.meals} meal(s)`;
    if (a.type==='waste') detail = `${WASTE_LABELS[a.wasteType]} · ${a.wasteKg} kg`;
    const li = document.createElement('li');
    li.innerHTML = `<span>${icons[a.type]} ${detail} <span style="opacity:.55">· ${a.date}</span></span><span class="co2">${a.co2e.toFixed(2)} kg</span>`;
    ul.appendChild(li);
  });
}

/* =========================================================
   LOCATION + GOOGLE MAPS VIEW
   ========================================================= */
let currentMapLocation = null;
let lastTripRoute = [];

function mapsUrl(lat, lon, zoom=15){
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + ',' + lon)}&zoom=${zoom}`;
}

function updateMapForLocation(lat, lon, label='Current location'){
  currentMapLocation = { lat, lon, label };
  const frame = document.getElementById('googleMapFrame');
  const placeholder = document.getElementById('mapPlaceholder');
  const coords = document.getElementById('locationCoords');
  const updated = document.getElementById('locationUpdated');
  const status = document.getElementById('locationStatus');
  const open = document.getElementById('openGoogleMapsBtn');
  if (!frame) return;
  frame.src = `https://www.google.com/maps?q=${encodeURIComponent(lat + ',' + lon)}&z=16&output=embed`;
  frame.classList.add('ready');
  placeholder.hidden = true;
  coords.textContent = `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  updated.textContent = `Last updated: ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  status.textContent = `${label} · location stays on this device unless you open/share Google Maps.`;
  open.disabled = false;
}

function updateMapForRoute(route, label='Trip route'){
  if (!route || !route.length) return;
  lastTripRoute = route;
  const end = route[route.length-1];
  updateMapForLocation(end.lat, end.lon, label);
  const frame = document.getElementById('googleMapFrame');
  if (route.length > 1){
    const start = route[0];
    frame.src = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start.lat + ',' + start.lon)}&destination=${encodeURIComponent(end.lat + ',' + end.lon)}&travelmode=driving&output=embed`;
  }
  document.getElementById('openLastTripBtn').disabled = false;
}

function locateUser(){
  if (!navigator.geolocation){ showToast('Geolocation is not supported by this browser.'); return; }
  const status = document.getElementById('locationStatus');
  status.textContent = '📍 Requesting your location…';
  navigator.geolocation.getCurrentPosition(
    pos => updateMapForLocation(pos.coords.latitude, pos.coords.longitude, 'Current location'),
    err => { status.textContent = `⚠️ Location unavailable: ${err.message}`; showToast('Location permission is required to show the map.'); },
    { enableHighAccuracy:true, maximumAge:30000, timeout:10000 }
  );
}

function openCurrentGoogleMaps(){
  if (!currentMapLocation){ locateUser(); return; }
  window.open(mapsUrl(currentMapLocation.lat, currentMapLocation.lon), '_blank', 'noopener,noreferrer');
}

function openLastTripRoute(){
  const route = lastTripRoute.length ? lastTripRoute : [...state.activities].reverse().find(a => a.route && a.route.length)?.route;
  if (!route || !route.length){ showToast('No saved trip route is available yet.'); return; }
  const start = route[0], end = route[route.length-1];
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start.lat + ',' + start.lon)}&destination=${encodeURIComponent(end.lat + ',' + end.lon)}`, '_blank', 'noopener,noreferrer');
}

/* =========================================================
   ACTIVITY HISTORY + REPORTING
   ========================================================= */
const ACTIVITY_ICONS = { travel:'🚗', electricity:'⚡', food:'🍽', waste:'🗑' };
const ACTIVITY_NAMES = { travel:'Travel', electricity:'Electricity', food:'Food', waste:'Waste' };

function activityDetails(a){
  if (a.type === 'travel') return `${TRAVEL_LABELS[a.mode] || a.mode} · ${Number(a.distance||0).toFixed(2)} km`;
  if (a.type === 'electricity') return `${Number(a.kwh||0).toFixed(1)} kWh`;
  if (a.type === 'food') return `${FOOD_LABELS[a.foodType] || a.foodType} · ${a.meals} meal(s)`;
  if (a.type === 'waste') return `${WASTE_LABELS[a.wasteType] || a.wasteType} · ${Number(a.wasteKg||0).toFixed(1)} kg`;
  return 'Activity';
}

function activitySearchText(a){ return `${a.type} ${activityDetails(a)} ${a.date}`.toLowerCase(); }

function getHistoryFiltered(){
  const q = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();
  const type = document.getElementById('historyTypeFilter')?.value || 'all';
  const month = document.getElementById('historyMonthFilter')?.value || 'all';
  return [...state.activities].reverse().filter(a => {
    if (type !== 'all' && a.type !== type) return false;
    if (month !== 'all' && monthKey(a.date) !== month) return false;
    if (q && !activitySearchText(a).includes(q)) return false;
    return true;
  });
}

function populateHistoryMonths(){
  const select = document.getElementById('historyMonthFilter');
  if (!select) return;
  const current = select.value || 'all';
  const months = [...new Set(state.activities.map(a => monthKey(a.date)).filter(Boolean))].sort().reverse();
  select.innerHTML = '<option value="all">All dates</option>' + months.map(m => `<option value="${m}">${new Date(m+'-01T00:00:00').toLocaleString(undefined,{month:'long',year:'numeric'})}</option>`).join('');
  select.value = months.includes(current) ? current : 'all';
}

function renderHistory(){
  const body = document.getElementById('historyTableBody');
  if (!body) return;
  populateHistoryMonths();
  const rows = getHistoryFiltered();
  body.innerHTML = '';
  const badge = document.getElementById('historyCountBadge');
  const summary = document.getElementById('historySummary');
  const empty = document.getElementById('historyEmpty');
  badge.textContent = `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`;
  const total = totalCo2(rows);
  const travel = rows.filter(a => a.type === 'travel').length;
  summary.innerHTML = `<span>📊 <strong>${total.toFixed(1)} kg</strong> CO₂e in view</span><span>🧾 ${rows.length} entries</span><span>📍 ${rows.filter(a => a.route?.length || a.location).length} with location</span><span>🚗 ${travel} travel logs</span>`;
  empty.hidden = rows.length > 0;
  rows.forEach(a => {
    const tr = document.createElement('tr');
    const hasLocation = !!(a.route?.length || a.location);
    tr.innerHTML = `<td>${a.date}</td><td><span class="history-type">${ACTIVITY_ICONS[a.type] || '•'} ${ACTIVITY_NAMES[a.type] || a.type}</span></td><td>${activityDetails(a)}</td><td><strong>${Number(a.co2e||0).toFixed(2)}</strong> kg</td><td>${hasLocation ? '<button class="table-action map-action" data-id="'+a.id+'">🗺 View</button>' : '<span class="muted">—</span>'}</td><td><button class="table-action detail-action" data-id="${a.id}">Details</button> <button class="table-action edit-action" data-id="${a.id}">Edit</button> <button class="table-action delete-action" data-id="${a.id}">Delete</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('.detail-action').forEach(b => b.addEventListener('click', () => openActivityDetail(b.dataset.id)));
  body.querySelectorAll('.edit-action').forEach(b => b.addEventListener('click', () => openEditActivity(b.dataset.id)));
  body.querySelectorAll('.delete-action').forEach(b => b.addEventListener('click', () => deleteActivity(b.dataset.id)));
  body.querySelectorAll('.map-action').forEach(b => b.addEventListener('click', () => showActivityOnMap(b.dataset.id)));
}

function openActivityDetail(id){
  window.__carbonlensDetailId = id;
  const a = state.activities.find(x => String(x.id) === String(id));
  if (!a) return;
  document.getElementById('activityDetailTitle').textContent = `${ACTIVITY_ICONS[a.type] || '•'} ${ACTIVITY_NAMES[a.type] || a.type} details`;
  const body = document.getElementById('activityDetailBody');
  const location = a.location || (a.route?.length ? {start:a.route[0], end:a.route[a.route.length-1]} : null);
  body.innerHTML = `<div class="detail-grid"><div><span>Date</span><strong>${a.date}</strong></div><div><span>CO₂e</span><strong>${Number(a.co2e||0).toFixed(2)} kg</strong></div><div><span>Details</span><strong>${activityDetails(a)}</strong></div><div><span>Logged</span><strong>${a.loggedAt ? new Date(a.loggedAt).toLocaleString() : 'Earlier version'}</strong></div></div>${location ? `<div class="detail-location"><span>📍 Location captured locally</span><p>Start: ${location.start.lat.toFixed(5)}, ${location.start.lon.toFixed(5)}<br>End: ${location.end.lat.toFixed(5)}, ${location.end.lon.toFixed(5)}</p></div>` : '<p class="hint" style="margin-top:14px;">No location was attached to this activity.</p>'}`;
  const mapBtn = document.getElementById('detailMapBtn');
  mapBtn.hidden = !location;
  mapBtn.onclick = location ? () => { window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(location.start.lat+','+location.start.lon)}&destination=${encodeURIComponent(location.end.lat+','+location.end.lon)}`, '_blank', 'noopener,noreferrer'); } : null;
  document.getElementById('activityDetailModal').hidden = false;
}

function showActivityOnMap(id){
  const a = state.activities.find(x => String(x.id) === String(id));
  if (!a) return;
  const route = a.route || (a.location ? [a.location.start, a.location.end] : []);
  if (!route.length){ showToast('This older activity has no saved location.'); return; }
  updateMapForRoute(route, `${ACTIVITY_NAMES[a.type] || 'Activity'} · ${a.date}`);
  document.getElementById('tripSection')?.scrollIntoView({behavior:'smooth', block:'center'});
  showToast('🗺 Location loaded in the Google Maps panel above.');
}

function deleteActivity(id){
  const idx = state.activities.findIndex(a => String(a.id) === String(id));
  if (idx < 0) return;
  const a = state.activities[idx];
  if (!confirm(`Delete this ${a.type} activity from local history?`)) return;
  state.activities.splice(idx, 1);
  saveState();
  renderAll();
  renderHistory();
  showToast('🗑 Activity removed from local history.');
}

function exportActivityCsv(){
  const rows = getHistoryFiltered();
  if (!rows.length){ showToast('No activity records match the current filters.'); return; }
  const headers = ['Date','Type','Details','CO2e_kg','Latitude_Start','Longitude_Start','Latitude_End','Longitude_End'];
  const csvRows = [headers, ...rows.map(a => {
    const loc = a.location || (a.route?.length ? {start:a.route[0], end:a.route[a.route.length-1]} : null);
    return [a.date, a.type, activityDetails(a), Number(a.co2e||0).toFixed(3), loc?.start?.lat ?? '', loc?.start?.lon ?? '', loc?.end?.lat ?? '', loc?.end?.lon ?? ''];
  })];
  const csv = csvRows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`CarbonLens_Activity_History_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Activity history CSV exported.');
}

function scrollToHistory(){
  document.getElementById('historySection')?.scrollIntoView({behavior:'smooth', block:'start'});
}

/* =========================================================
   PDF REPORT EXPORT (bonus: campus sustainability report)
   ========================================================= */
function exportPdfReport(){
  if (typeof window.jspdf === 'undefined'){
    showToast('PDF library unavailable offline.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const isCampus = state.userMode === 'campus';
  const total = totalCo2(activitiesForMonth(currentMonthKey()));
  const cat = isCampus ? approximateCampusCategoryTotals() : categoryTotals(activitiesForMonth(currentMonthKey()));

  doc.setFillColor(7,27,24);
  doc.rect(0,0,210,32,'F');
  doc.setTextColor(60,232,160);
  doc.setFontSize(20);
  doc.text('CarbonLens — Sustainability Report', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(200,230,220);
  doc.text(`Generated ${new Date().toLocaleDateString()} · ${isCampus ? 'Campus view' : 'Personal view'}`, 14, 26);

  doc.setTextColor(20,20,20);
  doc.setFontSize(13);
  doc.text('Summary', 14, 44);
  doc.setFontSize(11);
  doc.text(`Total footprint this month: ${total.toFixed(1)} kg CO2e`, 14, 52);
  doc.text(`Offsets simulated to date: ${(state.offsetsPurchased||0).toFixed(1)} kg CO2e`, 14, 59);
  if (isCampus){
    doc.text(`Team: ${getUserTeam().name} (${getUserTeam().headcount} people)`, 14, 66);
    doc.setFontSize(9);
    doc.setTextColor(120,120,120);
    doc.text('Campus-wide figures are synthetic demonstration data for this hackathon prototype.', 14, 73);
    doc.setTextColor(20,20,20);
    doc.setFontSize(11);
  }

  let y = isCampus ? 84 : 70;
  doc.setFontSize(13);
  doc.text('Category breakdown', 14, y); y += 8;
  doc.setFontSize(11);
  [['Travel', cat.travel], ['Electricity', cat.electricity], ['Food', cat.food], ['Waste', cat.waste]]
    .forEach(([label, val]) => { doc.text(`${label}: ${val.toFixed(1)} kg CO2e`, 18, y); y += 7; });

  y += 4;
  doc.setFontSize(13);
  doc.text('Top recommendations', 14, y); y += 8;
  doc.setFontSize(10);
  buildRecommendations().slice(0,4).forEach(r => {
    const line = `• ${r.title}${r.savings>0 ? ' — up to ~'+r.savings.toFixed(1)+' kg CO2e saved' : ''}`;
    const wrapped = doc.splitTextToSize(line, 180);
    doc.text(wrapped, 18, y);
    y += wrapped.length*6 + 2;
  });

  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(130,130,130);
  doc.text('Emission factors adapted from EPA, DEFRA and IPCC AR6 public datasets. All personal data stored locally on the user device only.', 14, 285);

  if (state.activities.length){
    doc.addPage();
    doc.setFillColor(7,27,24); doc.rect(0,0,210,22,'F');
    doc.setTextColor(60,232,160); doc.setFontSize(16); doc.text('CarbonLens — Full Activity History', 14, 14);
    doc.setTextColor(25,25,25); doc.setFontSize(9);
    let hy = 32;
    state.activities.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach((a, i) => {
      if (hy > 272){ doc.addPage(); hy = 20; }
      doc.text(`${a.date}  |  ${ACTIVITY_NAMES[a.type] || a.type}  |  ${activityDetails(a)}  |  ${Number(a.co2e||0).toFixed(2)} kg CO2e`, 14, hy);
      hy += 6;
    });
  }

  doc.save(`CarbonLens_Report_${currentMonthKey()}.pdf`);
  showToast('⬇ Report downloaded!');
}

/* =========================================================
   UI: ripple / liquid button feedback
   ========================================================= */
function attachRipple(e){
  const btn = e.currentTarget || e.target.closest('button');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const x = ((e.clientX ?? (rect.left+rect.width/2)) - rect.left);
  const y = ((e.clientY ?? (rect.top+rect.height/2)) - rect.top);
  btn.style.setProperty('--rx', x+'px');
  btn.style.setProperty('--ry', y+'px');
  btn.classList.remove('rippling');
  void btn.offsetWidth; // reflow to restart animation
  btn.classList.add('rippling');
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-liquid');
  if (btn) attachRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
});

/* =========================================================
   UI WIRING
   ========================================================= */
function setMode(mode){
  state.userMode = mode;
  saveState();
  document.getElementById('personalModeBtn').classList.toggle('active', mode==='personal');
  document.getElementById('campusModeBtn').classList.toggle('active', mode==='campus');
  document.getElementById('personalModeBtn').setAttribute('aria-selected', mode==='personal');
  document.getElementById('campusModeBtn').setAttribute('aria-selected', mode==='campus');
  document.getElementById('modeSlider').classList.toggle('right', mode==='campus');
  renderAll();
}

function selectActivityType(type){
  state.selectedActivityType = type;
  document.getElementById('activityType').value = type;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.type===type));
  ['travelFields','electricityFields','foodFields','wasteFields'].forEach(id => document.getElementById(id).hidden = true);
  document.getElementById(`${type}Fields`).hidden = false;
  document.getElementById('dateField').hidden = false;
  const btn = document.getElementById('logActivityBtn');
  btn.disabled = false;
  btn.textContent = `Log ${type} activity`;
}

function handleActivitySubmit(e){
  e.preventDefault();
  const type = state.selectedActivityType;
  if (!type){ showToast('Pick a category first.'); return; }
  const date = document.getElementById('activityDate').value || todayStr();
  let data = { type, date };
  let co2e = 0;

  if (type === 'travel'){
    const distance = parseFloat(document.getElementById('travelDistance').value)||0;
    const mode = document.getElementById('travelMode').value;
    if (distance <= 0){ showToast('Enter a distance greater than 0.'); return; }
    co2e = computeCo2('travel', { distance, mode });
    Object.assign(data, { distance, mode });
  } else if (type === 'electricity'){
    const kwh = parseFloat(document.getElementById('electricityKwh').value)||0;
    if (kwh <= 0){ showToast('Enter a kWh value greater than 0.'); return; }
    co2e = computeCo2('electricity', { kwh });
    Object.assign(data, { kwh });
  } else if (type === 'food'){
    const meals = parseFloat(document.getElementById('foodMeals').value)||0;
    const foodType = document.getElementById('foodType').value;
    if (meals <= 0){ showToast('Enter at least 1 meal.'); return; }
    co2e = computeCo2('food', { meals, foodType });
    Object.assign(data, { meals, foodType });
  } else if (type === 'waste'){
    const kg = parseFloat(document.getElementById('wasteKg').value)||0;
    const wasteType = document.getElementById('wasteType').value;
    if (kg <= 0){ showToast('Enter a waste amount greater than 0.'); return; }
    co2e = computeCo2('waste', { kg, wasteType });
    Object.assign(data, { wasteKg:kg, wasteType });
  }

  data.co2e = co2e;
  addActivity(data);
  e.target.reset();
  document.getElementById('activityDate').value = todayStr();
  showToast(`✅ Logged! +${co2e.toFixed(2)} kg CO2e`);
}

function populateTeamPicker(){
  const sel = document.getElementById('teamPicker');
  sel.innerHTML = CAMPUS_TEAMS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  sel.value = state.profile.team;
}

function openDrawer(){
  document.getElementById('settingsDrawer').classList.add('open');
  document.getElementById('drawerBackdrop').classList.add('show');
}
function closeDrawer(){
  document.getElementById('settingsDrawer').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('show');
}

function seedDemoData(){
  const modes = ['car','bus','train','bike'];
  const today = new Date();
  for (let i=0;i<18;i++){
    const d = new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate()-i));
    const dateStr = d.toISOString().slice(0,10);
    const r = seeded(i*3.1);
    if (r < 0.4){
      const distance = 3 + seeded(i*7)*12;
      const mode = modes[Math.floor(seeded(i*11)*modes.length)];
      addActivityQuiet({ type:'travel', date:dateStr, distance:+distance.toFixed(1), mode, co2e: computeCo2('travel',{distance,mode}) });
    } else if (r < 0.65){
      const kwh = 2 + seeded(i*5)*8;
      addActivityQuiet({ type:'electricity', date:dateStr, kwh:+kwh.toFixed(1), co2e: computeCo2('electricity',{kwh}) });
    } else if (r < 0.85){
      const meals = 1 + Math.floor(seeded(i*9)*2);
      const foodType = seeded(i*13) < 0.5 ? 'veg' : 'non_veg';
      addActivityQuiet({ type:'food', date:dateStr, meals, foodType, co2e: computeCo2('food',{meals,foodType}) });
    } else {
      const kg = 0.5 + seeded(i*17)*2.5;
      const wasteType = seeded(i*19) < 0.5 ? 'landfill' : 'recycled';
      addActivityQuiet({ type:'waste', date:dateStr, wasteKg:+kg.toFixed(1), wasteType, co2e: computeCo2('waste',{kg,wasteType}) });
    }
  }
  saveState();
  renderAll();
  showToast('✨ Sample month of data added!');
}
function addActivityQuiet(a){
  a.id = Date.now()+Math.floor(Math.random()*10000);
  state.activities.push(a);
}

/* =========================================================
   SCROLL REVEAL
   ========================================================= */
function initScrollReveal(){
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold:0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* =========================================================
   AUTHENTICATION — server-backed accounts + per-user state
   ========================================================= */
function showAuthMessage(message, good=false){
  const el=document.getElementById('authMessage'); if(!el) return;
  el.textContent=message; el.className='auth-message '+(good?'good':'error');
}
function setAuthTab(tab){
  const login=tab==='login';
  document.getElementById('loginTabBtn').classList.toggle('active',login);
  document.getElementById('registerTabBtn').classList.toggle('active',!login);
  document.getElementById('loginPanel').hidden=!login;
  document.getElementById('registerPanel').hidden=login;
  showAuthMessage('');
}
function showAuthOverlay(){ document.getElementById('authOverlay').classList.remove('hidden'); }
function hideAuthOverlay(){ document.getElementById('authOverlay').classList.add('hidden'); }
function applyUserSession(user, serverState){
  currentUser=user;
  const localRaw=localStorage.getItem(`carbonlens_state_${user.id}`);
  let localState=null;
  try { localState=localRaw?JSON.parse(localRaw):null; } catch(e){}
  state=serverState || structuredCloneSafe(DEFAULT_STATE);
  state.profile=state.profile||{}; state.profile.name=state.profile.name||user.name;
  localStorage.setItem(`carbonlens_state_${user.id}`,JSON.stringify(state));
  document.getElementById('accountName').textContent=state.profile.name || user.name;
  document.getElementById('accountId').textContent=`@${user.username} · ${user.role==='faculty'?'Faculty':'Student'}`;
  document.getElementById('facultyAttendancePanel').hidden = user.role !== 'faculty';
  document.getElementById('studentAttendancePanel').hidden = user.role === 'faculty';
}
async function loginWithCredentials(username,password){
  const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const data=await res.json(); if(!res.ok) throw new Error(data.error||'Login failed');
  applyUserSession(data.user,data.state); hideAuthOverlay(); return true;
}
async function ensureAuth(){
  showAuthOverlay();
  try {
    const me=await fetch('/api/auth/me');
    if(me.ok){ const data=await me.json(); applyUserSession(data.user,data.state); hideAuthOverlay(); return true; }
  } catch(e){ showAuthMessage('Server connection unavailable. Start CarbonLens with npm start.'); return false; }
  return new Promise(resolve=>{
    const loginForm=document.getElementById('loginForm'); const registerForm=document.getElementById('registerForm');
    document.getElementById('loginTabBtn').onclick=()=>setAuthTab('login');
    document.getElementById('registerTabBtn').onclick=()=>setAuthTab('register');
    document.querySelectorAll('.demo-login').forEach(btn=>btn.onclick=async()=>{
      try { showAuthMessage('Signing into demo account…'); await loginWithCredentials(btn.dataset.user,btn.dataset.pass); resolve(true); } catch(e){ showAuthMessage(e.message); }
    });
    loginForm.onsubmit=async(e)=>{ e.preventDefault(); try { showAuthMessage('Signing in…'); await loginWithCredentials(document.getElementById('loginUsername').value,document.getElementById('loginPassword').value); resolve(true); } catch(err){ showAuthMessage(err.message); } };
    registerForm.onsubmit=async(e)=>{ e.preventDefault();
      try { const payload={name:document.getElementById('registerName').value,username:document.getElementById('registerUsername').value,password:document.getElementById('registerPassword').value,role:document.getElementById('registerRole').value};
        const res=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Registration failed');
        applyUserSession(data.user,data.state); hideAuthOverlay(); showToast('🌱 Account created — welcome to CarbonLens!'); resolve(true);
      } catch(err){ showAuthMessage(err.message); }
    };
  });
}
async function logout(){
  await fetch('/api/auth/logout',{method:'POST'}).catch(()=>{});
  currentUser=null; state=structuredCloneSafe(DEFAULT_STATE);
  Object.values(charts).forEach(c=>{try{c?.destroy()}catch(e){}}); charts={trend:null,breakdown:null};
  document.getElementById('accountName').textContent='Guest'; document.getElementById('accountId').textContent='Not signed in';
  setAuthTab('login'); document.getElementById('loginForm').reset(); document.getElementById('registerForm').reset(); showAuthOverlay();
}

/* =========================================================
   ACTIVITY EDITING
   ========================================================= */
let editingActivityId=null;
function openEditActivity(id){
  const a=state.activities.find(x=>String(x.id)===String(id)); if(!a) return;
  editingActivityId=id;
  const form=document.getElementById('editActivityForm');
  let fields=`<input type="hidden" name="type" value="${a.type}"><label>Date<input type="date" name="date" value="${a.date||todayStr()}" required></label>`;
  if(a.type==='travel') fields+=`<label>Distance (km)<input type="number" name="distance" min="0" step="0.1" value="${a.distance??0}" required></label><label>Mode<select name="mode">${Object.entries(TRAVEL_LABELS).map(([k,v])=>`<option value="${k}" ${a.mode===k?'selected':''}>${v}</option>`).join('')}</select></label>`;
  if(a.type==='electricity') fields+=`<label>Electricity (kWh)<input type="number" name="kwh" min="0" step="0.1" value="${a.kwh??0}" required></label>`;
  if(a.type==='food') fields+=`<label>Meals<input type="number" name="meals" min="0" step="1" value="${a.meals??0}" required></label><label>Food type<select name="foodType">${Object.entries(FOOD_LABELS).map(([k,v])=>`<option value="${k}" ${a.foodType===k?'selected':''}>${v}</option>`).join('')}</select></label>`;
  if(a.type==='waste') fields+=`<label>Waste (kg)<input type="number" name="wasteKg" min="0" step="0.1" value="${a.wasteKg??0}" required></label><label>Waste type<select name="wasteType">${Object.entries(WASTE_LABELS).map(([k,v])=>`<option value="${k}" ${a.wasteType===k?'selected':''}>${v}</option>`).join('')}</select></label>`;
  form.innerHTML=fields; document.getElementById('editActivityModal').hidden=false;
}
function closeEditActivity(){ document.getElementById('editActivityModal').hidden=true; editingActivityId=null; }
function saveEditedActivity(e){
  e.preventDefault(); const a=state.activities.find(x=>String(x.id)===String(editingActivityId)); if(!a) return;
  const fd=new FormData(e.target); const type=a.type; const data={};
  if(type==='travel'){data.distance=+fd.get('distance');data.mode=fd.get('mode'); if(data.distance<=0)return showToast('Distance must be greater than 0.');}
  if(type==='electricity'){data.kwh=+fd.get('kwh'); if(data.kwh<=0)return showToast('kWh must be greater than 0.');}
  if(type==='food'){data.meals=+fd.get('meals');data.foodType=fd.get('foodType'); if(data.meals<=0)return showToast('Meals must be greater than 0.');}
  if(type==='waste'){data.wasteKg=+fd.get('wasteKg');data.wasteType=fd.get('wasteType'); if(data.wasteKg<=0)return showToast('Waste must be greater than 0.');}
  Object.assign(a,data,{date:fd.get('date'),co2e:computeCo2(type,data)});
  saveState(); closeEditActivity(); document.getElementById('activityDetailModal').hidden=true; renderAll(); showToast('✏️ Activity updated and saved to your account.');
}


function escapeHtml(v){ return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }

/* =========================================================
   SMART ATTENDANCE — rotating QR + geofence
   ========================================================= */
let activeFacultySession=null;
let facultyQrTimer=null;
let facultyCountdownTimer=null;
let qrScanner=null;

function attendanceDistanceHint(){ return 'Location is checked once at attendance verification; no continuous tracking is used.'; }
function showAttendanceAlert(msg, good=false){
  const el=document.getElementById('attendanceAlert'); if(!el)return;
  el.hidden=false; el.className='attendance-alert '+(good?'good':'warn'); el.textContent=msg;
}
async function loadMyAttendance(){
  if(!currentUser || currentUser.role==='faculty') return;
  try{
    const res=await fetch('/api/attendance/my'); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Attendance unavailable');
    const entries=Object.entries(data.subjects||{});
    const wrap=document.getElementById('attendanceSubjectTable');
    if(!entries.length){ wrap.innerHTML='<p class="hint">No completed lecture sessions yet.</p>'; return; }
    wrap.innerHTML=`<table class="attendance-table"><thead><tr><th>Subject</th><th>Attended</th><th>Classes</th><th>Percentage</th></tr></thead><tbody>${entries.map(([subject,v])=>{const low=v.percentage<75;return `<tr><td><strong>${escapeHtml(subject)}</strong></td><td>${v.attended}</td><td>${v.total}</td><td><span class="attendance-percent ${low?'low':'ok'}">${v.percentage}%</span></td></tr>`}).join('')}</tbody></table>`;
    const lows=entries.filter(([,v])=>v.percentage<75);
    if(lows.length){ showAttendanceAlert(`⚠️ Attendance alert: ${lows.map(([s,v])=>`${s} (${v.percentage}%)`).join(', ')} is below the 75% threshold.`); notifyLowAttendance(lows); }
    else showAttendanceAlert('✓ Attendance is currently at or above 75% for all subjects.',true);
  }catch(e){ document.getElementById('attendanceSubjectTable').innerHTML='<p class="hint">Attendance service unavailable.</p>'; }
}
function getBrowserLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error('Geolocation is not supported.'));
    navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),e=>reject(new Error('Location permission is required.')), {enableHighAccuracy:true,timeout:12000,maximumAge:10000});
  });
}
async function verifyAttendance(sessionId,token){
  const status=document.getElementById('attendanceCheckinStatus'); status.textContent='📍 Checking your location…';
  try{
    const pos=await getBrowserLocation();
    const res=await fetch('/api/attendance/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,token,...pos})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||'Attendance verification failed.');
    status.textContent=data.already?'✓ You are already marked present for this lecture.':'✓ Attendance marked successfully.';
    showAttendanceAlert('✓ Attendance recorded successfully.',true); loadMyAttendance();
  }catch(e){ status.textContent='⚠️ '+e.message; showAttendanceAlert('⚠️ '+e.message); }
}
async function handleAttendanceQrText(text){
  try{
    let payload=text;
    if(text.includes('attendance=')) payload=decodeURIComponent(text.split('attendance=')[1]);
    const obj=JSON.parse(payload);
    if(!obj.sessionId||!obj.token) throw new Error('Not a CarbonLens attendance QR.');
    await stopQrScanner();
    document.getElementById('attendanceSessionId').value=obj.sessionId;
    document.getElementById('attendanceToken').value=obj.token;
    document.getElementById('uploadedQrStatus').textContent=`✓ QR loaded: ${obj.subject||'Attendance session'}`;
    verifyAttendance(obj.sessionId,obj.token);
  }catch(e){ document.getElementById('attendanceCheckinStatus').textContent='⚠️ Scan or upload a valid CarbonLens attendance QR.'; }
}
async function startQrScanner(){
  const wrap=document.getElementById('qrScannerWrap'); wrap.hidden=false;
  if(!window.Html5Qrcode){ showToast('QR scanner library is unavailable. Use Upload QR or manual code.'); return; }
  qrScanner=new Html5Qrcode('qr-reader');
  try{
    await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}}, text=>handleAttendanceQrText(text),()=>{});
  }catch(e){ wrap.hidden=true; showToast('Camera could not start. Use Upload QR instead.'); }
}
async function uploadAttendanceQr(file){
  if(!file) return;
  if(!window.Html5Qrcode){ showToast('QR image scanner library is unavailable.'); return; }
  const status=document.getElementById('uploadedQrStatus'); status.textContent='Reading QR image…'; document.getElementById('studentDemoQrPanel')?.setAttribute('hidden','');
  const scanner=new Html5Qrcode('qr-reader');
  try{
    const text=await scanner.scanFile(file,true);
    await handleAttendanceQrText(text);
  }catch(e){ status.textContent='⚠️ No readable CarbonLens QR found in that image.'; }
  finally{ try{scanner.clear();}catch(e){} }
}
async function stopQrScanner(){ if(qrScanner){try{await qrScanner.stop();qrScanner.clear();}catch(e){} qrScanner=null;} document.getElementById('qrScannerWrap').hidden=true; }
async function facultyStartSession(e){
  e.preventDefault();
  const status=document.getElementById('facultySessionStatus'); status.textContent='📍 Getting classroom location…';
  try{
    const pos=await getBrowserLocation();
    const payload={subject:document.getElementById('facultySubject').value,durationMinutes:+document.getElementById('facultyDuration').value,radiusMeters:+document.getElementById('facultyRadius').value,...pos};
    const res=await fetch('/api/attendance/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Could not start session.');
    activeFacultySession=data.session; renderFacultySession(); status.textContent='✓ Session started. Show this QR to students.'; showToast('🎓 Attendance session started.');
  }catch(e){ status.textContent='⚠️ '+e.message; }
}
function renderFacultySession(){
  const s=activeFacultySession; const qr=document.getElementById('facultyQr'); const stop=document.getElementById('stopFacultySessionBtn');
  if(!s){qr.innerHTML='<span class="hint">Start a lecture to generate the QR.</span>';document.getElementById('facultyQrCode').textContent='—';stop.hidden=true;return;}
  stop.hidden=false;
  const refresh=()=>{ const current=activeFacultySession; if(!current)return; const payload=JSON.stringify({sessionId:current.id,token:current.token,subject:current.subject}); qr.innerHTML=''; if(window.QRCode) new QRCode(qr,{text:payload,width:220,height:220,correctLevel:QRCode.CorrectLevel.M}); else qr.textContent='QR library unavailable'; document.getElementById('facultyQrCode').textContent=current.token; };
  refresh(); clearInterval(facultyQrTimer); facultyQrTimer=setInterval(async()=>{ try{const r=await fetch('/api/attendance/sessions/'+s.id);const d=await r.json(); if(!r.ok||d.session.closed){activeFacultySession=null;renderFacultySession();return;} activeFacultySession=d.session; refresh(); }catch(e){} },5000);
  clearInterval(facultyCountdownTimer); facultyCountdownTimer=setInterval(()=>{const left=Math.max(0,s.closesAt-Date.now()); if(left<=0){document.getElementById('facultyCountdown').textContent='Session closed automatically';clearInterval(facultyCountdownTimer);activeFacultySession=null;renderFacultySession();return;} document.getElementById('facultyCountdown').textContent=`${s.subject} · closes in ${Math.ceil(left/60000)} min · QR rotates every 10 sec`;},1000);
  loadFacultyRoster();
}
async function stopFacultySession(){ if(!activeFacultySession)return; const id=activeFacultySession.id; await fetch('/api/attendance/sessions/'+id+'/stop',{method:'POST'}); activeFacultySession=null; clearInterval(facultyQrTimer); clearInterval(facultyCountdownTimer); renderFacultySession(); loadFacultyRoster(); showToast('■ Attendance session closed.'); }
async function loadFacultyRoster(){ if(!activeFacultySession)return; try{const r=await fetch('/api/attendance/faculty/'+activeFacultySession.id);const d=await r.json(); const rows=d.records||[]; document.getElementById('facultyRoster').innerHTML=rows.length?`<table class="attendance-table"><thead><tr><th>Student</th><th>Marked</th><th>Distance</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHtml(x.studentName)}</td><td>${new Date(x.markedAt).toLocaleTimeString()}</td><td>${x.distanceMeters} m</td></tr>`).join('')}</tbody></table>`:'<p class="hint">No students have checked in yet.</p>'; }catch(e){} }
function exportAttendanceCsv(){ window.location.href='/api/attendance/export'; }
async function loadAttendanceAnalytics(){
  try{
    const res=await fetch('/api/attendance/analytics'); const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Unavailable');
    const completed=(data.trend||[]).length;
    const present=(data.trend||[]).reduce((n,x)=>n+(x.present||0),0);
    const subjects=Object.keys(data.bySubject||{}).length;
    const a=document.getElementById('analyticsClasses'); if(a)a.textContent=completed;
    const b=document.getElementById('analyticsPresent'); if(b)b.textContent=present;
    const c=document.getElementById('analyticsSubjects'); if(c)c.textContent=subjects;
    const subjectEntries=Object.entries(data.bySubject||{}).sort((a,b)=>(b[1].present/b[1].classes)-(a[1].present/a[1].classes));
    const hourEntries=Object.entries(data.byHour||{}).sort((a,b)=>b[1]-a[1]);
    const ps=document.getElementById('peakAttendanceSubject'); if(ps) ps.textContent=subjectEntries[0]?.[0]||'—';
    const pt=document.getElementById('peakAttendanceTime'); if(pt) pt.textContent=hourEntries[0]?.[0]||'—';
    const av=document.getElementById('avgAttendancePerLecture'); if(av) av.textContent=completed?((present/completed).toFixed(1)):'—';
    const trend=document.getElementById('attendanceTrend');
    if(trend){
      const rows=(data.trend||[]).slice(-14);
      trend.innerHTML=rows.length?rows.map(x=>`<div class="trend-bar" title="${escapeHtml(x.subject)} · ${x.present} check-ins"><i style="height:${Math.max(8,Math.min(100,12+x.present*16))}px"></i><span>${escapeHtml(x.date.slice(5))}</span></div>`).join(''):'<span class="hint">No completed sessions yet.</span>';
    }
  }catch(e){
    const trend=document.getElementById('attendanceTrend'); if(trend)trend.innerHTML='<span class="hint">Analytics unavailable.</span>';
  }
}
async function deleteMyAttendance(){
  if(!confirm('Delete your saved attendance records from this local prototype? This cannot be undone.')) return;
  const res=await fetch('/api/attendance/my',{method:'DELETE'}); const data=await res.json();
  if(!res.ok) return showToast(data.error||'Could not delete attendance.');
  showToast(`🗑 Deleted ${data.deleted||0} attendance records.`); await loadMyAttendance(); await loadAttendanceAnalytics();
}
async function notifyLowAttendance(lows){
  if(!lows.length || !('Notification' in window)) return;
  if(Notification.permission==='default'){
    try{ await Notification.requestPermission(); }catch(e){}
  }
  if(Notification.permission==='granted') new Notification('CarbonLens attendance alert',{body:`Attendance below 75%: ${lows.map(([s,v])=>`${s} ${v.percentage}%`).join(', ')}`});
}
async function initAttendance(){
  if(!currentUser)return;
  const nav=document.getElementById('attendanceNavBtn');
  if(currentUser.role==='faculty'){
    document.getElementById('studentAttendancePanel').hidden=true; document.getElementById('facultyAttendancePanel').hidden=false;
    if(nav) nav.textContent='🎓 Faculty Attendance';
    await loadAttendanceAnalytics();
  } else {
    document.getElementById('facultyAttendancePanel').hidden=true; document.getElementById('studentAttendancePanel').hidden=false;
    if(nav) nav.textContent='🎓 My Attendance';
    await loadMyAttendance(); await loadAttendanceAnalytics();
  }
}


function initQuickActions(){
  document.querySelectorAll('.quick-action').forEach(btn=>btn.addEventListener('click',()=>{
    const q=btn.dataset.quick;
    if(q==='walk'){ selectActivityType('travel'); document.getElementById('travelDistance').value=2; document.getElementById('travelMode').value='walk'; showToast('🚶 2 km walk ready to log.'); }
    if(q==='cycle'){ selectActivityType('travel'); document.getElementById('travelDistance').value=3; document.getElementById('travelMode').value='bike'; showToast('🚲 3 km cycle ready to log.'); }
    if(q==='electricity'){ selectActivityType('electricity'); document.getElementById('electricityKwh').value=1; showToast('⚡ 1 kWh electricity entry ready.'); }
    if(q==='plant'){ const tips=['Use a reusable bottle today.','Choose walking/cycling for short trips.','Switch off unused lights and chargers.','Add one plant to your study space.']; showToast('🌱 '+tips[Math.floor(Math.random()*tips.length)]); }
  }));
}

function renderCarbonTrendSummary(){
  const months={}; const cats={};
  state.activities.forEach(a=>{const m=(a.date||'').slice(0,7); const kg=Number(a.co2e||0); if(!m)return; months[m]=(months[m]||0)+kg; cats[a.type]=(cats[a.type]||0)+kg;});
  const vals=Object.values(months); const total=vals.reduce((a,b)=>a+b,0);
  const best=Object.entries(months).sort((a,b)=>a[1]-b[1])[0]; const peak=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
  const labels={travel:'Travel',electricity:'Electricity',food:'Food',waste:'Waste'};
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('trendTotal',`${total.toFixed(1)} kg`); set('trendAverage',`${(vals.length?total/vals.length:0).toFixed(1)} kg`); set('trendBest',best?`${best[0]} · ${best[1].toFixed(1)} kg`:'—'); set('trendPeak',peak?`${labels[peak[0]]||peak[0]} · ${peak[1].toFixed(1)} kg`:'—');
}

/* =========================================================
   INIT
   ========================================================= */
function renderAll(){
  renderMetrics();
  renderCharts();
  renderCarbonTrendSummary();
  renderCampusPanel();
  renderAiInsights();
  renderRecommendations();
  renderChallenges();
  renderLeaderboard();
  renderOffsets();
  renderRecentActivities();
  renderHistory();
}

async function init(){
  const authenticated = await ensureAuth();
  if (!authenticated) return;
  // Consent
  if (state.consentGiven){
    document.getElementById('consentOverlay').classList.add('hidden');
  }
  document.getElementById('consentAcceptBtn').addEventListener('click', () => {
    state.consentGiven = true;
    saveState();
    document.getElementById('consentOverlay').classList.add('hidden');
  });

  // Appearance toggle
  applyTheme(getSavedTheme());
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('drawerThemeToggleBtn').addEventListener('click', toggleTheme);

  // Mode toggle
  document.getElementById('personalModeBtn').addEventListener('click', () => setMode('personal'));
  document.getElementById('campusModeBtn').addEventListener('click', () => setMode('campus'));
  if (state.userMode === 'campus'){
    document.getElementById('modeSlider').classList.add('right');
    document.getElementById('personalModeBtn').classList.remove('active');
    document.getElementById('campusModeBtn').classList.add('active');
  }

  // Chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => selectActivityType(chip.dataset.type));
  });
  if (state.selectedActivityType) selectActivityType(state.selectedActivityType);

  // Form
  document.getElementById('activityForm').addEventListener('submit', handleActivitySubmit);
  document.getElementById('activityDate').value = todayStr();
  document.getElementById('undoLastBtn').addEventListener('click', undoLastActivity);

  // OCR
  document.getElementById('billImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) runBillOcr(file);
  });

  // Chart tabs
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => switchChartTab(tab.dataset.chart));
  });

  // Drawer
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('settingsBtn').addEventListener('click', openDrawer);
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);
  document.getElementById('profileName').value = state.profile.name || '';
  document.getElementById('profileName').addEventListener('input', (e) => {
    state.profile.name = e.target.value; saveState(); renderLeaderboard();
  });
  populateTeamPicker();
  document.getElementById('teamPicker').addEventListener('change', (e) => {
    state.profile.team = e.target.value; saveState(); renderAll();
  });
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (confirm('This will permanently delete all your locally stored CarbonLens data. Continue?')) clearAllData();
  });
  document.getElementById('seedDemoBtn').addEventListener('click', seedDemoData);

  // PDF export + history + location controls
  document.getElementById('exportPdfBtn').addEventListener('click', exportPdfReport);
  document.getElementById('historyBtn').addEventListener('click', scrollToHistory);
  document.getElementById('exportCsvBtn').addEventListener('click', exportActivityCsv);
  document.getElementById('locationBtn').addEventListener('click', locateUser);
  document.getElementById('refreshLocationBtn').addEventListener('click', locateUser);
  document.getElementById('openGoogleMapsBtn').addEventListener('click', openCurrentGoogleMaps);
  document.getElementById('openLastTripBtn').addEventListener('click', openLastTripRoute);
  ['historySearch','historyTypeFilter','historyMonthFilter'].forEach(id => document.getElementById(id).addEventListener('input', renderHistory));
  document.getElementById('clearHistoryFilterBtn').addEventListener('click', () => {
    document.getElementById('historySearch').value=''; document.getElementById('historyTypeFilter').value='all'; document.getElementById('historyMonthFilter').value='all'; renderHistory();
  });
  document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', () => { document.getElementById('activityDetailModal').hidden = true; }));
  document.getElementById('editActivityBtn').addEventListener('click', () => { if (window.__carbonlensDetailId) openEditActivity(window.__carbonlensDetailId); });
  document.getElementById('editActivityForm').addEventListener('submit', saveEditedActivity);
  document.querySelectorAll('[data-close-edit]').forEach(el => el.addEventListener('click', closeEditActivity));

  document.getElementById('attendanceNavBtn').addEventListener('click', () => document.getElementById('attendanceSection').scrollIntoView({behavior:'smooth'}));
  initQuickActions();
  document.getElementById('manualAttendanceForm').addEventListener('submit', e=>{e.preventDefault();verifyAttendance(document.getElementById('attendanceSessionId').value.trim(),document.getElementById('attendanceToken').value.trim());});
  document.getElementById('scanAttendanceBtn').addEventListener('click', startQrScanner);
  document.getElementById('uploadQrBtn').addEventListener('click',()=>document.getElementById('uploadQrInput').click());
  document.getElementById('uploadQrInput').addEventListener('change',e=>uploadAttendanceQr(e.target.files[0]));
  const showDemoQr=()=>{ const panel=document.getElementById('studentDemoQrPanel'); if(panel) panel.hidden=false; document.getElementById('attendanceSessionId').value='DEMO-ATT-001'; document.getElementById('attendanceToken').value='DEMO1234'; document.getElementById('uploadedQrStatus').textContent='🧪 Demo QR ready. Click Use Demo QR to mark demo attendance.'; panel?.scrollIntoView({behavior:'smooth',block:'nearest'}); };
  document.getElementById('demoQrBtn').addEventListener('click',showDemoQr);
  document.getElementById('useDemoQrBtn')?.addEventListener('click',()=>{document.getElementById('attendanceSessionId').value='DEMO-ATT-001';document.getElementById('attendanceToken').value='DEMO1234';document.getElementById('uploadedQrStatus').textContent='✓ Demo QR payload loaded. Verifying…';verifyAttendance('DEMO-ATT-001','DEMO1234');});
  document.getElementById('hideDemoQrBtn')?.addEventListener('click',()=>{document.getElementById('studentDemoQrPanel').hidden=true;});
  document.getElementById('downloadStudentDemoQrBtn')?.addEventListener('click',()=>{const a=document.createElement('a');a.href='/demo-attendance-qr.png';a.download='CarbonLens-demo-attendance-qr.png';a.click();});
  document.getElementById('downloadDemoQrBtn').addEventListener('click',()=>{const a=document.createElement('a');a.href='/demo-attendance-qr.png';a.download='CarbonLens-demo-attendance-qr.png';a.click();});
  document.getElementById('stopQrScanBtn').addEventListener('click', stopQrScanner);
  document.getElementById('exportAttendanceBtn').addEventListener('click', exportAttendanceCsv);
  document.getElementById('refreshMyAttendanceBtn').addEventListener('click', async()=>{await loadMyAttendance(); showToast('↻ Attendance refreshed.');});
  document.getElementById('copyAttendanceCodeBtn').addEventListener('click', async()=>{const code=document.getElementById('facultyQrCode').textContent.trim(); if(code&&code!=='—'){try{await navigator.clipboard.writeText(code);showToast('📋 Rotating code copied.');}catch(e){showToast('Copy is unavailable; read the code from the screen.');}}});
  document.getElementById('printAttendanceQrBtn').addEventListener('click', ()=>{const qr=document.getElementById('facultyQr'); if(!qr||!qr.innerHTML.trim()) return showToast('Start a session first.'); const w=window.open('','_blank','width=520,height=650'); if(!w) return showToast('Allow pop-ups to print the QR.'); w.document.write('<html><head><title>CarbonLens Attendance QR</title><style>body{font-family:Arial;text-align:center;padding:30px}h1{font-size:22px}#qr{display:inline-block;padding:18px;border:1px solid #ddd;margin:20px}</style></head><body><h1>CarbonLens Live Attendance</h1><div id="qr">'+qr.innerHTML+'</div><p>Dynamic QR — use the current screen only.</p></body></html>'); w.document.close(); setTimeout(()=>w.print(),300);});
  document.getElementById('deleteAttendanceBtn').addEventListener('click', deleteMyAttendance);
  document.getElementById('refreshAttendanceAnalyticsBtn').addEventListener('click', loadAttendanceAnalytics);

async function loadTimetable(){
  try{
    const r=await fetch('/api/attendance/timetable'); const d=await r.json(); timetableSlots=d.slots||[]; renderTimetable();
  }catch(e){ timetableSlots=[{id:'1',day:1,time:'10:00',subject:'Biomedical Instrumentation',duration:10,radiusMeters:100},{id:'2',day:2,time:'11:00',subject:'Biomaterials',duration:10,radiusMeters:100},{id:'3',day:3,time:'09:00',subject:'Fluid Mechanics',duration:10,radiusMeters:100}]; renderTimetable(); }
}
function renderTimetable(){
  const names=['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const el=document.getElementById('timetableList'); if(!el)return;
  el.innerHTML=timetableSlots.length?timetableSlots.map(x=>`<div class="timetable-row"><span>${names[x.day]||'Day '+x.day} ${x.time}</span><strong>${escapeHtml(x.subject)}</strong><button class="link-btn" data-remove-slot="${x.id}">Remove</button></div>`).join(''):'<span class="hint">No timetable slots saved.</span>';
  el.querySelectorAll('[data-remove-slot]').forEach(b=>b.addEventListener('click',async()=>{ timetableSlots=timetableSlots.filter(x=>x.id!==b.dataset.removeSlot); await saveTimetable(); }));
}
async function saveTimetable(){
  try{ const r=await fetch('/api/attendance/timetable',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({slots:timetableSlots})}); if(!r.ok) throw new Error(); const d=await r.json(); timetableSlots=d.slots||timetableSlots; renderTimetable(); showToast('🗓 Timetable saved.'); }
  catch(e){ showToast('Could not save timetable.'); }
}
async function checkTimetableAutoCreate(){
  if(!timetableAutoCreate || !currentUser || currentUser.role!=='faculty' || activeFacultySession) return;
  const now=new Date(), day=now.getDay()||7, hh=String(now.getHours()).padStart(2,'0'), mm=String(now.getMinutes()).padStart(2,'0');
  const key=`${now.toISOString().slice(0,10)}-${day}-${hh}:${mm}`;
  const slot=timetableSlots.find(x=>Number(x.day)===day && String(x.time).slice(0,5)===`${hh}:${mm}`);
  if(!slot || lastAutoCreatedSlot===key) return;
  lastAutoCreatedSlot=key;
  document.getElementById('facultySubject').value=slot.subject;
  document.getElementById('facultyDuration').value=String(slot.duration||10);
  document.getElementById('facultyRadius').value=String(slot.radiusMeters||100);
  try{ await facultyStartSession(new Event('submit')); showToast(`🗓 Auto-created: ${slot.subject}`); }catch(e){ console.warn(e); }
}
  document.getElementById('timetableAutofillBtn').addEventListener('click', ()=>{
    const day=new Date().getDay()||7; const slot=timetableSlots.find(x=>Number(x.day)===day)||timetableSlots[0];
    if(!slot) return showToast('Add a timetable slot first.');
    document.getElementById('facultySubject').value=slot.subject; document.getElementById('facultyDuration').value=String(slot.duration||10); document.getElementById('facultyRadius').value=String(slot.radiusMeters||100);
    showToast(`🗓️ Timetable loaded: ${slot.subject} at ${slot.time}`);
  });
  document.getElementById('timetableAddBtn').addEventListener('click', async()=>{
    const slot={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),day:Number(document.getElementById('timetableDay').value),time:document.getElementById('timetableTime').value,subject:document.getElementById('timetableSubject').value.trim(),duration:Number(document.getElementById('facultyDuration').value)||10,radiusMeters:Number(document.getElementById('facultyRadius').value)||100};
    if(!slot.subject||!slot.time) return showToast('Enter a subject and time.'); timetableSlots.push(slot); document.getElementById('timetableSubject').value=''; await saveTimetable();
  });
  document.getElementById('timetableAutoToggleBtn').addEventListener('click',()=>{ timetableAutoCreate=!timetableAutoCreate; document.getElementById('timetableAutoToggleBtn').textContent=`⚙ Auto-create: ${timetableAutoCreate?'On':'Off'}`; showToast(timetableAutoCreate?'🗓 Auto-create enabled while this faculty page is open.':'Auto-create disabled.'); });
  document.getElementById('facultySessionForm').addEventListener('submit', facultyStartSession);
  document.getElementById('stopFacultySessionBtn').addEventListener('click', stopFacultySession);
  document.getElementById('exportFacultyAttendanceBtn').addEventListener('click', exportAttendanceCsv);
  initAttendance();
  loadTimetable();
  clearInterval(timetableTimer); timetableTimer=setInterval(checkTimetableAutoCreate,30000);

  // Trip tracker
  document.getElementById('startTripBtn').addEventListener('click', startTrip);
  document.getElementById('stopTripBtn').addEventListener('click', stopTrip);
  document.getElementById('logTripBtn').addEventListener('click', logTrip);

  initScrollReveal();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

/* =========================================================
   AI INSIGHTS ENGINE
   On-device rule/statistics based analysis — no data leaves
   the browser, no external AI service is called. Framed as
   "AI insights" because it automatically detects anomalies,
   projects trends and personalizes nudges from your own data.
   ========================================================= */
function daysAgoStr(n){
  const d = new Date();
  d.setDate(d.getDate()-n);
  return d.toISOString().slice(0,10);
}
function activitiesInDayRange(startDaysAgo, endDaysAgoExclusive){
  const start = daysAgoStr(startDaysAgo);
  const end = daysAgoStr(endDaysAgoExclusive);
  return state.activities.filter(a => a.date > end && a.date <= start);
}

function buildAiInsights(){
  const insights = [];
  const thisWeek = activitiesInDayRange(7, 0).length ? activitiesInDayRange(7,0) : activitiesInDayRange(7,-1);
  const lastWeek = activitiesInDayRange(14,7);
  const catThis = categoryTotals(state.activities.filter(a => a.date > daysAgoStr(7)));
  const catLast = categoryTotals(state.activities.filter(a => a.date > daysAgoStr(14) && a.date <= daysAgoStr(7)));

  const catNames = { travel:'🚗 Travel', electricity:'⚡ Electricity', food:'🍽 Food', waste:'🗑 Waste' };
  Object.keys(catNames).forEach(cat => {
    const now = catThis[cat]||0, prev = catLast[cat]||0;
    if (prev > 2 && now > prev * 1.3){
      const pct = (((now-prev)/prev)*100).toFixed(0);
      insights.push({ type:'warn', icon:'⚠️', title:`${catNames[cat]} emissions jumped`,
        desc:`Up ${pct}% vs the previous 7 days (${prev.toFixed(1)} → ${now.toFixed(1)} kg CO2e). Worth a look at the Recommendations panel.` });
    } else if (prev > 2 && now < prev * 0.75){
      const pct = (((prev-now)/prev)*100).toFixed(0);
      insights.push({ type:'good', icon:'📉', title:`${catNames[cat]} emissions dropped`,
        desc:`Down ${pct}% vs the previous 7 days — nice work, keep it up!` });
    }
  });

  // Monthly forecast (simple linear projection)
  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const monthTotal = totalCo2(activitiesForMonth(currentMonthKey()));
  if (daysElapsed >= 3 && monthTotal > 0){
    const projected = (monthTotal/daysElapsed) * daysInMonth;
    const bm = state.userMode==='campus' ? BENCHMARKS.campus.average : BENCHMARKS.personal.average;
    const overUnder = projected > bm ? 'above' : 'below';
    insights.push({
      type: projected > bm ? 'warn' : 'good',
      icon: '🔮',
      title: `Projected to finish the month at ~${projected.toFixed(0)} kg CO2e`,
      desc: `Based on your pace so far (day ${daysElapsed} of ${daysInMonth}), that's ${overUnder} the ${bm} kg average benchmark.`
    });
  }

  // Streak nudge
  CHALLENGES.forEach(c => {
    const p = getChallengeProgress(c.id);
    if (p.joined && p.days > 0 && p.days < c.duration && p.lastCheckin !== todayStr() && p.lastCheckin === daysAgoStr(1)){
      insights.push({ type:'warn', icon:'🔥', title:`Don't break your "${c.name}" streak!`,
        desc:`You're on day ${p.days}/${c.duration} — check in today to keep it alive.` });
    }
  });

  // Onboarding nudge
  if (state.activities.length === 0){
    insights.push({ type:'good', icon:'👋', title:'Welcome! Log your first activity',
      desc:'Once you add a few travel, electricity, food or waste entries, this panel will start surfacing personalized patterns automatically.' });
  } else if (state.activities.length < 5){
    insights.push({ type:'good', icon:'📈', title:'Keep logging for sharper insights',
      desc:'The more activities you log, the more accurate anomaly detection and forecasts become.' });
  }

  if (!insights.length){
    insights.push({ type:'good', icon:'✅', title:'Everything looks steady',
      desc:'No unusual spikes detected in the last two weeks. Check the Recommendations panel for ways to go even lower.' });
  }

  return insights.slice(0,5);
}

function renderAiInsights(){
  const wrap = document.getElementById('aiInsightsList');
  wrap.innerHTML = '';
  buildAiInsights().forEach(ins => {
    const el = document.createElement('div');
    el.className = `ai-insight ${ins.type}`;
    el.innerHTML = `<span class="ai-insight-icon">${ins.icon}</span>
      <div class="ai-insight-body"><h4>${ins.title}</h4><p>${ins.desc}</p></div>`;
    wrap.appendChild(el);
  });
}

/* =========================================================
   GEOLOCATION TRIP TRACKER + on-device transport-mode AI
   ========================================================= */
let tripState = { tracking:false, watchId:null, points:[], distance:0, speeds:[], mode:'walk' };

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function classifyTransportMode(avgKmh){
  if (avgKmh < 1) return 'walk';
  if (avgKmh < 7) return 'walk';
  if (avgKmh < 25) return 'bike';
  if (avgKmh < 45) return 'bus';
  if (avgKmh < 130) return 'car';
  return 'train';
}

function startTrip(){
  if (!navigator.geolocation){ showToast('Geolocation is not supported by this browser.'); return; }
  tripState = { tracking:true, watchId:null, points:[], distance:0, speeds:[], mode:'walk' };
  document.getElementById('tripStatus').textContent = 'Tracking…';
  document.getElementById('tripStatus').classList.add('tracking');
  document.getElementById('startTripBtn').disabled = true;
  document.getElementById('stopTripBtn').disabled = false;
  document.getElementById('logTripBtn').disabled = true;

  tripState.watchId = navigator.geolocation.watchPosition(onTripPosition, onTripError, {
    enableHighAccuracy:true, maximumAge:0, timeout:8000
  });
  showToast('📍 Trip tracking started.');
}

function onTripPosition(pos){
  const point = { lat:pos.coords.latitude, lon:pos.coords.longitude, t:pos.timestamp };
  const pts = tripState.points;
  if (pts.length){
    const last = pts[pts.length-1];
    const dKm = haversineKm(last.lat, last.lon, point.lat, point.lon);
    const dtHours = Math.max((point.t - last.t)/3600000, 1/3600);
    const speed = dKm / dtHours;
    if (dKm > 0.003){ // ignore GPS jitter under ~3m
      tripState.distance += dKm;
      tripState.speeds.push(speed);
      if (tripState.speeds.length > 10) tripState.speeds.shift();
    }
  }
  pts.push(point);
  updateMapForLocation(point.lat, point.lon, 'Live trip location');

  const avgSpeed = tripState.speeds.length ? tripState.speeds.reduce((a,b)=>a+b,0)/tripState.speeds.length : 0;
  tripState.mode = classifyTransportMode(avgSpeed);

  document.getElementById('tripDistance').textContent = `${tripState.distance.toFixed(2)} km`;
  document.getElementById('tripSpeed').textContent = `${avgSpeed.toFixed(1)} km/h`;
  document.getElementById('tripMode').textContent = TRAVEL_LABELS[tripState.mode] || tripState.mode;
}

function onTripError(err){
  console.error('Trip geolocation error', err);
  showToast('⚠️ Location error: ' + err.message);
}

function stopTrip(){
  if (tripState.watchId !== null) navigator.geolocation.clearWatch(tripState.watchId);
  tripState.tracking = false;
  document.getElementById('tripStatus').textContent = tripState.distance > 0 ? 'Stopped — ready to log' : 'Stopped — no movement detected';
  document.getElementById('tripStatus').classList.remove('tracking');
  document.getElementById('startTripBtn').disabled = false;
  document.getElementById('stopTripBtn').disabled = true;
  document.getElementById('logTripBtn').disabled = tripState.distance <= 0.02;
  showToast('⏹ Trip tracking stopped.');
}

function logTrip(){
  if (tripState.distance <= 0.02){ showToast('Not enough movement recorded to log.'); return; }
  const distance = +tripState.distance.toFixed(2);
  const mode = tripState.mode;
  const co2e = computeCo2('travel', { distance, mode });
  const route = tripState.points.length > 1
    ? tripState.points.filter((_, i, arr) => i === 0 || i === arr.length - 1 || i % Math.max(1, Math.ceil(arr.length / 60)) === 0)
    : [];
  const location = route.length ? { start: route[0], end: route[route.length-1] } : null;
  addActivity({ type:'travel', date:todayStr(), distance, mode, co2e, route, location });
  if (route.length) {
    updateMapForRoute(route, 'Last trip route');
    document.getElementById('openLastTripBtn').disabled = false;
  }
  showToast(`✅ Logged ${distance} km by ${TRAVEL_LABELS[mode]} — +${co2e.toFixed(2)} kg CO2e`);
  document.getElementById('logTripBtn').disabled = true;
  document.getElementById('tripStatus').textContent = 'Idle';
  document.getElementById('tripDistance').textContent = '0.00 km';
  document.getElementById('tripSpeed').textContent = '0 km/h';
  document.getElementById('tripMode').textContent = '–';
  tripState = { tracking:false, watchId:null, points:[], distance:0, speeds:[], mode:'walk' };
}

/* Stop camera/geolocation cleanly if the tab is closed. */
window.addEventListener('beforeunload', () => {
  if (tripState.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(tripState.watchId);
});
