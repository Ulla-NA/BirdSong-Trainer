/* Vogelstimmen-Trainer – Prototyp
   Lädt Aufnahmen client-seitig live von der xeno-canto API (v3).
   Läuft komplett im Browser, kein eigenes Backend nötig.
*/

const STATS_KEY = "vogeltrainer_stats_v1";
const LOG_KEY = "vogeltrainer_log_v1";
const MAX_LOG_ENTRIES = 3000;

const state = {
  mode: "erkennen",
  score: { correct: 0, total: 0 },
  currentQuestion: null,
  recordingListCache: {}, // sciName -> array of recording objects (Lernmodus, gedeckelt)
  validationRecordingCache: {}, // sciName -> array of recording objects (Validierungs-Seite, ungedeckelt/vollständig)
  lastShownId: {},        // sciName -> zuletzt gezeigte xcId (um Wiederholung zu vermeiden)
  wikiImageCache: {},     // sciName -> imageUrl | null
  stats: {},              // speciesId -> { attempts, correct, streak, lastSeen }
  answerLog: [],          // [{ speciesId, correct, ts }] – für Verlauf über Zeit
  questionRequestId: 0,   // Schutz gegen Race Conditions bei schnellem Klicken
};

// ---------- Fortschritt / Lernstatistik ----------
// Wird dauerhaft im Browser gespeichert (localStorage), damit man über
// mehrere Sitzungen hinweg sieht, welche Arten schon sicher sitzen, und wie
// sich das über die Zeit entwickelt hat.

function loadStats() {
  try {
    state.stats = JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch (e) {
    state.stats = {};
  }
  try {
    state.answerLog = JSON.parse(localStorage.getItem(LOG_KEY)) || [];
  } catch (e) {
    state.answerLog = [];
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
}

function saveLog() {
  if (state.answerLog.length > MAX_LOG_ENTRIES) {
    state.answerLog = state.answerLog.slice(-MAX_LOG_ENTRIES);
  }
  localStorage.setItem(LOG_KEY, JSON.stringify(state.answerLog));
}

function recordAnswer(sp, correct) {
  const s = state.stats[sp.id] || { attempts: 0, correct: 0, streak: 0, lastSeen: null };
  s.attempts += 1;
  if (correct) { s.correct += 1; s.streak += 1; } else { s.streak = 0; }
  s.lastSeen = Date.now();
  state.stats[sp.id] = s;
  saveStats();

  state.answerLog.push({ speciesId: sp.id, correct, ts: Date.now() });
  saveLog();
}

// Einheitliche Klassifizierung "neu / lernen / gut / sicher" aus Versuchen +
// aktueller Serie richtiger Antworten. Wird sowohl für den Live-Status als
// auch rückblickend (Wochen-Verlauf) genutzt, damit beides konsistent ist.
function classifyStatus(s) {
  if (!s || s.attempts === 0) return "neu";
  if (s.streak >= 5) return "sicher";
  if (s.streak >= 3) return "gut";
  return "lernen";
}

function weightForLabel(label) {
  return { neu: 1.0, lernen: 1.0, gut: 0.5, sicher: 0.2 }[label] ?? 1.0;
}

// Bestimmt Lernstatus + Gewicht für die Abfragehäufigkeit (höheres Gewicht
// = wird häufiger gefragt). Sicher gekonnte Arten werden seltener abgefragt,
// tauchen aber nicht komplett aus der Rotation.
function masteryInfo(sp) {
  const s = state.stats[sp.id] || { attempts: 0, correct: 0, streak: 0, lastSeen: null };
  const label = classifyStatus(s);
  return { ...s, label, weight: weightForLabel(label) };
}

function statusLabelDe(label) {
  return { neu: "neu", lernen: "lernen", gut: "gut", sicher: "sicher" }[label] || label;
}

// ---------- Wochen-Verlauf ----------
// Spielt das geloggte Antwortverlauf chronologisch durch und bildet pro
// Kalenderwoche (Montag–Sonntag) einen kumulierten Schnappschuss: wie viele
// Arten standen am Ende dieser Woche auf neu/lernen/gut/sicher, plus wie
// viele Arten diese Woche tatsächlich geübt wurden und mit welcher Quote.

function mondayOf(tsOrDate) {
  const d = new Date(tsOrDate);
  const day = d.getDay(); // 0 = Sonntag
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// "subsetSpecies" (optional): beschränkt die Balken-Zusammenfassung (Status-
// Verteilung + diese-Woche-geübt-Zähler) auf eine Teilmenge (z.B. den aktuell
// gefilterten "Anzahl Arten zum Start"-Pool). Der Lernstatus einer einzelnen
// Art ("running") wird aber immer aus ihrer GESAMTEN Antwort-Historie
// berechnet, unabhängig vom Filter – nur WELCHE Arten gezählt/angezeigt
// werden, hängt vom Subset ab.
function computeWeeklyProgress(maxWeeks, subsetSpecies) {
  const subset = subsetSpecies || SPECIES;
  const subsetIds = subsetSpecies ? new Set(subsetSpecies.map(sp => sp.id)) : null;

  const log = state.answerLog.slice().sort((a, b) => a.ts - b.ts);
  if (log.length === 0) return [];

  const firstWeek = mondayOf(log[0].ts);
  const lastWeek = mondayOf(Date.now());
  const weeks = [];
  for (let cursor = new Date(firstWeek); cursor <= lastWeek; cursor.setDate(cursor.getDate() + 7)) {
    weeks.push(new Date(cursor));
  }

  const running = {}; // speciesId -> { attempts, correct, streak }
  let logIdx = 0;
  const results = [];

  for (const weekStart of weeks) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const practiced = new Set();
    let correctThisWeek = 0;
    let totalThisWeek = 0;

    while (logIdx < log.length && log[logIdx].ts < weekEnd.getTime()) {
      const e = log[logIdx];
      if (!subsetIds || subsetIds.has(e.speciesId)) {
        practiced.add(e.speciesId);
        totalThisWeek += 1;
        if (e.correct) correctThisWeek += 1;
      }
      const s = running[e.speciesId] || { attempts: 0, correct: 0, streak: 0 };
      s.attempts += 1;
      if (e.correct) { s.correct += 1; s.streak += 1; } else { s.streak = 0; }
      running[e.speciesId] = s;
      logIdx += 1;
    }

    const counts = { neu: 0, lernen: 0, gut: 0, sicher: 0 };
    subset.forEach(sp => { counts[classifyStatus(running[sp.id])] += 1; });

    results.push({
      weekStart,
      practicedThisWeek: practiced.size,
      correctThisWeek,
      totalThisWeek,
      counts,
    });
  }

  return maxWeeks ? results.slice(-maxWeeks) : results;
}

function formatWeekLabel(weekStart) {
  return weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function renderProgressChart(weeklyData, totalSpecies) {
  const maxH = 150;
  totalSpecies = totalSpecies || SPECIES.length;
  const statusOrder = ["neu", "lernen", "gut", "sicher"];

  const bars = weeklyData.map(w => {
    const segs = statusOrder.map(key => {
      const count = w.counts[key];
      if (count <= 0) return "";
      const h = Math.max(2, Math.round((count / totalSpecies) * maxH));
      return `<div class="chart-seg seg-${key}" style="height:${h}px" title="${statusLabelDe(key)}: ${count} Art(en)"></div>`;
    }).join("");
    const acc = w.totalThisWeek ? Math.round((w.correctThisWeek / w.totalThisWeek) * 100) : null;
    return `
      <div class="progress-bar-col">
        <div class="progress-bar-stack" style="height:${maxH}px;">${segs}</div>
        <div class="chart-week-label">${formatWeekLabel(w.weekStart)}</div>
        <div class="chart-week-sub muted">${w.practicedThisWeek ? w.practicedThisWeek + " geübt" : "–"}${acc !== null ? ", " + acc + "%" : ""}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="progress-chart">${bars}</div>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch seg-sicher"></span>sicher</span>
      <span class="legend-item"><span class="legend-swatch seg-gut"></span>gut</span>
      <span class="legend-item"><span class="legend-swatch seg-lernen"></span>lernen</span>
      <span class="legend-item"><span class="legend-swatch seg-neu"></span>neu</span>
    </div>
    <p class="hint">Balken = Lernstand aller ${totalSpecies} Demo-Arten am Ende der jeweiligen Woche (kumulativ). Text darunter = diese Woche tatsächlich geübte Arten und Trefferquote.</p>
  `;
}

function weightedPick(pool) {
  const weights = pool.map(sp => masteryInfo(sp).weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function confusionPartner(sp) {
  if (!sp.confusionGroup) return null;
  return SPECIES.find(s => s.confusionGroup === sp.confusionGroup && s.id !== sp.id) || null;
}

// ---------- Hilfsfunktionen ----------

function getApiKey() {
  return localStorage.getItem("xc_api_key") || "";
}

const AUTOPLAY_KEY = "autoplay_pref";

function getAutoplay() {
  return localStorage.getItem(AUTOPLAY_KEY) === "1";
}

function setupAutoplayToggle() {
  const box = document.getElementById("autoplayToggle");
  box.checked = getAutoplay();
  box.addEventListener("change", () => {
    localStorage.setItem(AUTOPLAY_KEY, box.checked ? "1" : "0");
  });
}

// ---------- Aufnahmen-Limit & Ausschlussliste ----------
// "Aufnahmen pro Art laden" bestimmt, wie viele Treffer pro xeno-canto-Abfrage
// berücksichtigt werden (mehr = mehr Abwechslung). "Ausgeschlossene Aufnahmen"
// sind einzelne xeno-canto-IDs, die dauerhaft aus der Rotation genommen werden
// (z.B. weil auf der Aufnahme schlicht nichts zu hören ist) – beides lokal
// im Browser gespeichert, wirkt also nur für die Person, die es einstellt.

const MAX_REC_KEY = "max_recordings_pref";
const DEFAULT_MAX_RECORDINGS = 20;
const EXCLUDED_KEY = "vogeltrainer_excluded_recordings_v1";

function getMaxRecordings() {
  const v = parseInt(localStorage.getItem(MAX_REC_KEY), 10);
  return (v && v >= 5 && v <= 40) ? v : DEFAULT_MAX_RECORDINGS;
}

function getExcludedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXCLUDED_KEY)) || []);
  } catch (e) {
    return new Set();
  }
}

function excludeRecording(xcId) {
  const set = getExcludedIds();
  set.add(String(xcId));
  localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...set]));
}

// Gegenstück zu excludeRecording – nur für die Validierungs-Seite (dort kann
// man eine Aufnahme testweise ausschließen und den Schritt bei Bedarf direkt
// wieder rückgängig machen, ohne die komplette Ausschlussliste zurückzusetzen).
function unexcludeRecording(xcId) {
  const set = getExcludedIds();
  set.delete(String(xcId));
  localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...set]));
}

function resetExcludedRecordings() {
  localStorage.removeItem(EXCLUDED_KEY);
}

// Lerngruppe (A/B/C): für Teams, die gemeinsam lernen und nicht alle mit
// denselben Arten anfangen wollen. Rein lokal je Gerät/Person gespeichert –
// jede Person stellt in ihren Einstellungen einmalig ihren Buchstaben ein.
const LEARN_GROUP_KEY = "vogeltrainer_lerngruppe";

function getLearnGroup() {
  const v = localStorage.getItem(LEARN_GROUP_KEY);
  return (v === "A" || v === "B" || v === "C") ? v : "all";
}

function checkedValues(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter(el => el.checked)
    .map(el => el.value);
}

function activeNameParts() {
  return checkedValues(".name-toggle");
}

function formatName(sp) {
  const parts = activeNameParts();
  const bits = [];
  if (parts.includes("de")) bits.push(sp.de);
  if (parts.includes("en")) bits.push(sp.en);
  if (parts.includes("sci")) bits.push(`<em>${sp.sci}</em>`);
  if (bits.length === 0) bits.push(sp.de);
  return bits.join(" / ");
}

// Rangfolge für die "Anzahl Arten zum Start"-Beschränkung: leichte vor
// mittleren vor schweren Arten, innerhalb dessen häufige vor seltenen –
// so enthält "10" wirklich die 10 einsteigerfreundlichsten Arten der
// aktuellen Filterauswahl, nicht irgendeine zufällige Teilmenge.
const DIFFICULTY_RANK = { leicht: 0, mittel: 1, schwer: 2 };
const FREQUENCY_RANK = { haeufig: 0, mittel: 1, selten: 2, sehr_selten: 3 };

function currentFilteredSpecies() {
  const freqs = checkedValues(".freq-filter");
  const diffs = checkedValues(".diff-filter");
  const area = document.getElementById("areaFilter").value;
  const group = document.getElementById("groupFilter").value;
  const countVal = document.getElementById("countFilter").value;
  const learnGroup = getLearnGroup();

  // Gebiets-Filter hat drei Modi:
  // - "all"     = Deutschlandweit: keine Einschränkung, alle Arten (11 Gebiete + Arten außerhalb davon)
  // - "kern11"  = alle 11 Gebiete zusammen: nur Arten mit mindestens einem echten Gebiets-Code
  //               (also NICHT die Arten, die ausschließlich areas: ["de"] haben)
  // - <code>    = ein einzelnes Gebiet (inkl. "de" = außerhalb der 11 Gebiete): exakter areas-Treffer
  const areaMatches = sp =>
    area === "all" ? true :
    area === "kern11" ? sp.areas.some(a => a !== "de") :
    sp.areas.includes(area);

  let pool = SPECIES.filter(sp =>
    freqs.includes(sp.frequency) &&
    diffs.includes(sp.difficulty) &&
    areaMatches(sp) &&
    (group === "all" || sp.group === group) &&
    (learnGroup === "all" || LEARN_GROUPS[sp.id] === learnGroup)
  );

  if (countVal !== "all") {
    const n = parseInt(countVal, 10);
    if (pool.length > n) {
      pool = pool
        .slice()
        .sort((a, b) =>
          (DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]) ||
          (FREQUENCY_RANK[a.frequency] - FREQUENCY_RANK[b.frequency]) ||
          a.de.localeCompare(b.de, "de")
        )
        .slice(0, n);
    }
  }

  return pool;
}

function pickDistinctRandom(arr, n, excludeId) {
  const pool = arr.filter(sp => sp.id !== excludeId);
  const chosen = [];
  while (chosen.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

// ---------- xeno-canto Anbindung ----------
// Ruft die xeno-canto API v3 direkt aus dem Browser der Nutzerin auf.
// Hinweis: Diese Aufrufe wurden aus der Entwicklungs-Sandbox heraus NICHT
// erfolgreich getestet (dort blockiert xeno-cantos Bot-Schutz "Anubis"
// automatisierte Anfragen). Im echten Browser mit gültigem API-Key sollte
// es funktionieren, da Anubis primär Scraper ohne JS-Ausführung blockt –
// das bitte einmal gegenprüfen.

// Sucht in geografisch gestaffelten Stufen, von eng (Deutschland, gute
// Qualität) zu weit (weltweit) – so bekommt man auch für Arten mit wenigen
// deutschen xeno-canto-Aufnahmen (z.B. Auerhuhn, Schwarzstorch) noch ein
// Ergebnis, statt nur "keine Aufnahme gefunden" zu zeigen. Jede Stufe wird
// im Ergebnis vermerkt (rec.tier), damit die UI transparent machen kann,
// woher die gezeigte Aufnahme tatsächlich stammt.
// "q_gt:C" ist der korrekte xeno-canto-Syntax für "Qualität besser als C"
// (vorher stand hier fälschlich "q:\">C\"", das die API nicht als
// Vergleichsoperator erkennt und u.U. zu leeren Ergebnissen führte).
const NEIGHBOR_COUNTRIES = [
  "Austria", "Switzerland", "Netherlands", "Belgium", "Luxembourg",
  "France", "Denmark", "Poland", "Czech Republic", "Czechia",
];

async function xcApiPage(queryStr, key, page) {
  const url = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(queryStr)}&key=${key}${page ? `&page=${page}` : ""}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // Echter Netzwerk-/CORS-/Bot-Schutz-Fehler – weitere Stufen würden am
    // selben Problem scheitern, also sofort abbrechen statt weiter zu probieren.
    throw new Error("network");
  }
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

async function tryXcQuery(queryStr, key) {
  const json = await xcApiPage(queryStr, key);
  return (json.recordings && json.recordings.length > 0) ? json.recordings : null;
}

// Wie tryXcQuery, aber holt ALLE Seiten (xeno-canto liefert pro Anfrage nur
// eine Seite, "numPages" im Antwort-JSON gibt die Gesamtzahl an). Für den
// Lernmodus reicht eine Seite plus späterer .slice()-Deckel (siehe
// fetchRecordingList) – für die Validierungs-Seite braucht es aber die
// tatsächliche Gesamtzahl aller Aufnahmen, nicht nur eine für Abwechslung
// ausreichende Stichprobe (siehe fetchAllRecordingsForSpecies).
async function tryXcQueryAllPages(queryStr, key) {
  const first = await xcApiPage(queryStr, key, 1);
  if (!first.recordings || first.recordings.length === 0) return null;
  let all = first.recordings.slice();
  const numPages = parseInt(first.numPages, 10) || 1;
  for (let p = 2; p <= numPages; p++) {
    const next = await xcApiPage(queryStr, key, p);
    if (next.recordings) all = all.concat(next.recordings);
  }
  return all;
}

// Gemeinsame Umwandlung eines xeno-canto-API-Treffers in unser internes
// Aufnahme-Objekt – von fetchRecordingList() (Lernmodus) und
// fetchAllRecordingsForSpecies() (Validierungs-Seite) genutzt.
function mapXcRecording(pick, tier) {
  let fileUrl = pick.file;
  if (fileUrl && fileUrl.startsWith("//")) fileUrl = "https:" + fileUrl;
  // "large" nehmen: zeigt die ganze Aufnahme in ordentlicher Auflösung
  // (Frequenzachse gut lesbar), ist aber deutlich kleiner/schneller
  // geladen als "full" – das war bei langen Aufnahmen spürbar langsam.
  // "full" nur als Rückfallebene, falls "large" mal fehlt.
  let sonoUrl = pick.sono && (pick.sono.large || pick.sono.full || pick.sono.med || pick.sono.small);
  if (sonoUrl && sonoUrl.startsWith("//")) sonoUrl = "https:" + sonoUrl;
  return {
    fileUrl,
    sonoUrl,
    recordist: pick.rec,
    license: pick.lic,
    type: pick.type,
    length: pick.length || null,
    // Sample-Rate (Hz) – bestimmt die Nyquist-Frequenz (= Sample-Rate / 2),
    // bis zu der xeno-canto das Sonogramm zeichnet. Unterschiedliche
    // Aufnahmen können unterschiedliche Sample-Raten haben (22050/44100/
    // 48000 Hz ...), die y-Achsen-Skala ist also NICHT für alle Aufnahmen
    // gleich – deshalb pro Aufnahme aus "smp" berechnet statt fest codiert.
    sampleRate: pick.smp ? parseInt(pick.smp, 10) : null,
    xcId: pick.id,
    country: pick.cnt || null,
    remarks: pick.rmk || null,
    tier,
    pageUrl: `https://xeno-canto.org/${pick.id}`,
  };
}

async function fetchRecordingList(sp) {
  if (state.recordingListCache[sp.sci]) return state.recordingListCache[sp.sci];

  const key = getApiKey();
  if (!key) throw new Error("no-key");

  const sci = sp.sci;
  let recordings = null;
  let tier = null;

  // Stufe 1: Deutschland, bevorzugt gute Qualität
  recordings = await tryXcQuery(`sp:"${sci}" cnt:"Germany" q_gt:C`, key);
  if (recordings) tier = "germany";

  // Stufe 1b: Deutschland, jede Qualität
  if (!recordings) {
    recordings = await tryXcQuery(`sp:"${sci}" cnt:"Germany"`, key);
    if (recordings) tier = "germany";
  }

  // Stufe 2: Nachbarländer, einzeln durchprobiert
  if (!recordings) {
    for (const country of NEIGHBOR_COUNTRIES) {
      recordings = await tryXcQuery(`sp:"${sci}" cnt:"${country}"`, key);
      if (recordings) { tier = "neighbor"; break; }
    }
  }

  // Stufe 3: Europa (xeno-canto-Kontinentalfilter "area:europe")
  if (!recordings) {
    recordings = await tryXcQuery(`sp:"${sci}" area:europe`, key);
    if (recordings) tier = "europe";
  }

  // Stufe 4: weltweit
  if (!recordings) {
    recordings = await tryXcQuery(`sp:"${sci}"`, key);
    if (recordings) tier = "world";
  }

  if (!recordings) throw new Error("no-recordings");

  const list = recordings.slice(0, getMaxRecordings()).map(pick => mapXcRecording(pick, tier));

  state.recordingListCache[sp.sci] = list;
  return list;
}

// Wie fetchRecordingList(), aber für die Validierungs-Seite: lädt ALLE
// Aufnahmen der jeweiligen gestaffelten Suchstufe (nicht nur bis zum
// max_recordings_pref-Deckel), damit der "N / M"-Zähler die echte
// xeno-canto-Gesamtzahl zeigt und man wirklich jede Aufnahme durchgehen
// kann. Eigener Cache, damit der Lernmodus-Cache (mit Deckel) nicht
// vermischt wird.
async function fetchAllRecordingsForSpecies(sp) {
  if (state.validationRecordingCache[sp.sci]) return state.validationRecordingCache[sp.sci];

  const key = getApiKey();
  if (!key) throw new Error("no-key");

  const sci = sp.sci;
  let recordings = null;
  let tier = null;

  recordings = await tryXcQueryAllPages(`sp:"${sci}" cnt:"Germany" q_gt:C`, key);
  if (recordings) tier = "germany";

  if (!recordings) {
    recordings = await tryXcQueryAllPages(`sp:"${sci}" cnt:"Germany"`, key);
    if (recordings) tier = "germany";
  }

  if (!recordings) {
    for (const country of NEIGHBOR_COUNTRIES) {
      recordings = await tryXcQueryAllPages(`sp:"${sci}" cnt:"${country}"`, key);
      if (recordings) { tier = "neighbor"; break; }
    }
  }

  if (!recordings) {
    recordings = await tryXcQueryAllPages(`sp:"${sci}" area:europe`, key);
    if (recordings) tier = "europe";
  }

  if (!recordings) {
    recordings = await tryXcQueryAllPages(`sp:"${sci}"`, key);
    if (recordings) tier = "world";
  }

  if (!recordings) throw new Error("no-recordings");

  const list = recordings.map(pick => mapXcRecording(pick, tier));
  state.validationRecordingCache[sp.sci] = list;
  return list;
}

function originNote(rec) {
  if (!rec.tier || rec.tier === "germany") return "";
  if (rec.tier === "neighbor") {
    return `Hinweis: keine deutsche Aufnahme gefunden, zeige eine Aufnahme aus dem Nachbarland ${rec.country || "?"}.`;
  }
  if (rec.tier === "europe") {
    return `Hinweis: keine Aufnahme aus Deutschland oder den Nachbarländern gefunden, zeige eine Aufnahme aus einem anderen europäischen Land (${rec.country || "?"}).`;
  }
  if (rec.tier === "world") {
    return `Hinweis: keine europäische Aufnahme gefunden, zeige eine Aufnahme von außerhalb Europas (${rec.country || "?"}).`;
  }
  return "";
}

// Holt eine Aufnahme für eine Art – zufällig aus der (gecachten) Liste,
// vermeidet nach Möglichkeit die zuletzt gezeigte Aufnahme (mehr Abwechslung
// bei Ruftyp/Individuum) und lässt dauerhaft ausgeschlossene Aufnahmen weg
// (z.B. weil darauf schlicht nichts zu hören ist).
async function pickRecording(sp) {
  const list = await fetchRecordingList(sp);
  const excluded = getExcludedIds();

  let pool = list.filter(r => !excluded.has(String(r.xcId)));
  if (pool.length === 0) pool = list; // Falls wirklich alle Aufnahmen dieser Art ausgeschlossen wurden

  if (pool.length > 1 && state.lastShownId[sp.sci]) {
    const withoutLast = pool.filter(r => r.xcId !== state.lastShownId[sp.sci]);
    if (withoutLast.length > 0) pool = withoutLast;
  }
  const rec = pool[Math.floor(Math.random() * pool.length)];
  state.lastShownId[sp.sci] = rec.xcId;
  return rec;
}

function xcSpeciesPageUrl(sp) {
  const slug = sp.sci.replace(" ", "-");
  return `https://xeno-canto.org/species/${slug}`;
}

// ---------- Wikipedia-Bild (für Hintergrundinfo) ----------
// Nutzt die öffentliche, CORS-freundliche Wikipedia REST-Summary-API.
// Rein dekorativ – schlägt der Abruf fehl, wird einfach kein Bild gezeigt.

async function fetchWikiImage(sp) {
  if (sp.sci in state.wikiImageCache) return state.wikiImageCache[sp.sci];
  const tryTitles = [sp.en, sp.sci];
  for (const title of tryTitles) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const img = (data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source) || null;
      if (img) {
        state.wikiImageCache[sp.sci] = img;
        return img;
      }
    } catch (e) {
      // still try next title / fail silently
    }
  }
  state.wikiImageCache[sp.sci] = null;
  return null;
}

// ---------- UI: Init ----------

function populateAreaFilter() {
  const sel = document.getElementById("areaFilter");
  Object.entries(AREAS).forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

// Nur Gruppen anzeigen, die tatsächlich im aktuellen Artenset vorkommen –
// in fester, alltagstauglicher Reihenfolge (GROUP_ORDER), nicht alphabetisch.
function populateGroupFilter() {
  const sel = document.getElementById("groupFilter");
  const present = new Set(SPECIES.map(sp => sp.group).filter(Boolean));
  GROUP_ORDER.filter(g => present.has(g)).forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  });
}

function populateConfusionSelect() {
  const sel = document.getElementById("confusionSelect");
  Object.entries(CONFUSION_NOTES).forEach(([key, val]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = val.title;
    sel.appendChild(opt);
  });
}

function switchMode(mode, opts) {
  opts = opts || {};
  // Beim Wechsel des Tabs eine ggf. noch laufende Aufnahme aus der
  // vorherigen Ansicht stoppen (z.B. Sprung von Erkennen-Detailansicht zu
  // Validieren über den "Alle xeno-canto-Aufnahmen..."-Button) – sonst
  // spielt sie im Hintergrund weiter, während schon eine andere Seite zu
  // sehen ist. querySelectorAll deckt auch den Verwechslungsarten-Modus mit
  // seinen zwei gleichzeitigen Audio-Boxen ab.
  document.querySelectorAll("audio").forEach(a => a.pause());
  state.mode = mode;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("erkennenView").classList.toggle("hidden", mode !== "erkennen");
  document.getElementById("unterscheidenView").classList.toggle("hidden", mode !== "unterscheiden");
  document.getElementById("validierenView").classList.toggle("hidden", mode !== "validieren");
  document.getElementById("fortschrittView").classList.toggle("hidden", mode !== "fortschritt");
  // Die Quiz-Filterleiste (Häufigkeit/Schwierigkeit/Gebiet/...) betrifft nur
  // Erkennen/Unterscheiden/Fortschritt – auf der Validierungs-Seite sucht man
  // gezielt nach einer Art, da wäre sie nur verwirrend.
  document.querySelector(".filters").classList.toggle("hidden", mode === "validieren");

  if (mode === "erkennen") {
    loadQuestion();
  } else if (mode === "unterscheiden") {
    if (opts.confusionKey) document.getElementById("confusionSelect").value = opts.confusionKey;
    renderConfusionPair();
  } else if (mode === "fortschritt") {
    renderFortschritt();
  } else if (mode === "validieren") {
    if (opts.speciesId) {
      const sp = SPECIES.find(s => s.id === opts.speciesId);
      if (sp) loadValidationSpecies(sp);
    }
  }
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
  });
}

function updateLearnGroupHint() {
  const val = document.getElementById("learnGroupInput").value;
  const hintEl = document.getElementById("learnGroupCount");
  if (val === "all") {
    hintEl.textContent = `aktuell: keine Aufteilung, alle ${SPECIES.length} Arten.`;
  } else {
    const n = SPECIES.filter(sp => LEARN_GROUPS[sp.id] === val).length;
    hintEl.textContent = `aktuell: Gruppe ${val} mit ${n} Arten.`;
  }
}

function setupSettings() {
  const dialog = document.getElementById("settingsDialog");
  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("apiKeyInput").value = getApiKey();
    document.getElementById("maxRecInput").value = getMaxRecordings();
    document.getElementById("excludedCount").textContent = getExcludedIds().size;
    document.getElementById("learnGroupInput").value = getLearnGroup();
    updateLearnGroupHint();
    dialog.showModal();
  });
  document.getElementById("closeSettingsBtn").addEventListener("click", () => dialog.close());
  document.getElementById("learnGroupInput").addEventListener("change", updateLearnGroupHint);
  document.getElementById("saveKeyBtn").addEventListener("click", () => {
    const val = document.getElementById("apiKeyInput").value.trim();
    localStorage.setItem("xc_api_key", val);

    const maxRecVal = parseInt(document.getElementById("maxRecInput").value, 10);
    if (maxRecVal && maxRecVal >= 5 && maxRecVal <= 40) {
      localStorage.setItem(MAX_REC_KEY, String(maxRecVal));
    }

    localStorage.setItem(LEARN_GROUP_KEY, document.getElementById("learnGroupInput").value);

    dialog.close();
    state.recordingListCache = {};
    state.lastShownId = {};
    if (state.mode === "erkennen") loadQuestion();
    else renderConfusionPair();
  });
  document.getElementById("resetExcludedBtn").addEventListener("click", () => {
    resetExcludedRecordings();
    document.getElementById("excludedCount").textContent = "0";
  });
}

// Merkt sich Häufigkeit/Schwierigkeit/Gebiet/Gruppe/Anzahl/Namensanzeige
// dauerhaft im Browser, damit man nach dem Schließen/Neuöffnen der App nicht
// wieder bei "alle Arten" anfängt. Die Auswahl bei "Anzahl Arten zum Start"
// ist dabei deterministisch (nach Schwierigkeit/Häufigkeit/Name sortiert und
// abgeschnitten, kein Zufall) – bei gleicher restlicher Filterauswahl liefert
// z.B. "20" also immer denselben Artensatz wie beim letzten Mal, nicht
// irgendeine zufällige Teilmenge.
const FILTER_STATE_KEY = "vogeltrainer_filter_state_v1";

function saveFilterState() {
  const s = {
    freq: checkedValues(".freq-filter"),
    diff: checkedValues(".diff-filter"),
    names: checkedValues(".name-toggle"),
    area: document.getElementById("areaFilter").value,
    group: document.getElementById("groupFilter").value,
    count: document.getElementById("countFilter").value,
  };
  localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(s));
}

function restoreFilterState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(FILTER_STATE_KEY));
  } catch (e) {
    saved = null;
  }
  if (!saved) return;

  if (Array.isArray(saved.freq)) {
    document.querySelectorAll(".freq-filter").forEach(el => { el.checked = saved.freq.includes(el.value); });
  }
  if (Array.isArray(saved.diff)) {
    document.querySelectorAll(".diff-filter").forEach(el => { el.checked = saved.diff.includes(el.value); });
  }
  if (Array.isArray(saved.names)) {
    document.querySelectorAll(".name-toggle").forEach(el => { el.checked = saved.names.includes(el.value); });
  }
  const areaSel = document.getElementById("areaFilter");
  if (saved.area && Array.from(areaSel.options).some(o => o.value === saved.area)) areaSel.value = saved.area;
  const groupSel = document.getElementById("groupFilter");
  if (saved.group && Array.from(groupSel.options).some(o => o.value === saved.group)) groupSel.value = saved.group;
  const countSel = document.getElementById("countFilter");
  if (saved.count && Array.from(countSel.options).some(o => o.value === saved.count)) countSel.value = saved.count;
}

function setupFilters() {
  restoreFilterState();

  document.querySelectorAll(".freq-filter, .diff-filter, .name-toggle").forEach(el => {
    el.addEventListener("change", () => {
      saveFilterState();
      if (state.mode === "erkennen") loadQuestion();
      else renderConfusionPair();
    });
  });
  document.getElementById("areaFilter").addEventListener("change", () => {
    saveFilterState();
    if (state.mode === "erkennen") loadQuestion();
    else renderConfusionPair();
  });
  document.getElementById("groupFilter").addEventListener("change", () => {
    saveFilterState();
    if (state.mode === "erkennen") loadQuestion();
    else renderConfusionPair();
  });
  document.getElementById("countFilter").addEventListener("change", () => {
    saveFilterState();
    if (state.mode === "erkennen") loadQuestion();
    else renderConfusionPair();
  });
  document.getElementById("nextBtn").addEventListener("click", loadQuestion);
  document.getElementById("confusionSelect").addEventListener("change", renderConfusionPair);
}

// ---------- Erkennen-Modus ----------

async function loadQuestion() {
  const card = document.getElementById("quizCard");
  const pool = currentFilteredSpecies();

  if (pool.length < 2) {
    card.innerHTML = `<p class="muted">Zu wenige Arten für diese Filterkombination im aktuellen Artenset (${SPECIES.length} Arten enthalten). Bitte Filter lockern.</p>`;
    return;
  }

  const target = weightedPick(pool);
  // Distraktoren kommen IMMER aus dem aktuell gefilterten Pool (nie von
  // außerhalb, z.B. aus anderen Artengruppen) – sonst wäre bei einer engen
  // Filterauswahl (z.B. eine kleine Artengruppe) sofort erkennbar, welche
  // Antwortoption "nicht dazugehört", ohne überhaupt hinzuhören. Ist der
  // gefilterte Pool klein, gibt es entsprechend weniger Antwortoptionen
  // (mind. 2: Zielart + 1 Distraktor) statt Arten von außerhalb zu holen.
  const maxDistractors = Math.min(3, pool.length - 1);
  const distractors = pickDistinctRandom(pool, maxDistractors, target.id);
  const options = [target, ...distractors].sort(() => Math.random() - 0.5);

  state.currentQuestion = { target, options, answered: false };

  // Da das Laden (Geo-Fallback-Stufen) mehrere Sekunden dauern kann: falls
  // währenddessen erneut "Nächste Aufnahme" geklickt oder ein Filter
  // geändert wird, darf die alte, verspätet eintreffende Antwort nicht mehr
  // gerendert werden – sonst passt Audio/Spektrogramm nicht mehr zu den
  // gerade angezeigten Antwortoptionen.
  const myRequestId = ++state.questionRequestId;
  const nextBtn = document.getElementById("nextBtn");
  nextBtn.disabled = true;

  card.innerHTML = `<p class="muted">Lade Aufnahme…</p>`;

  try {
    const rec = await pickRecording(target);
    if (myRequestId !== state.questionRequestId) return;
    renderQuestion(rec, target);
  } catch (err) {
    if (myRequestId !== state.questionRequestId) return;
    renderAudioError(err, target);
  } finally {
    if (myRequestId === state.questionRequestId) nextBtn.disabled = false;
  }
}

function renderAudioError(err, target) {
  const card = document.getElementById("quizCard");
  let msg;
  if (err.message === "no-key") {
    msg = "Kein xeno-canto API-Key hinterlegt. Über das Zahnrad oben rechts einen Key eintragen (kostenloser Account auf xeno-canto.org).";
  } else if (err.message === "no-recordings") {
    msg = "Für diese Art sind auf xeno-canto aktuell keine Aufnahmen zu finden (auch nicht außerhalb Deutschlands) – kein technischer Fehler, es gibt schlicht keinen Treffer für diese Art in der Datenbank.";
  } else if (err.message === "network") {
    msg = "Aufnahme konnte nicht geladen werden – vermutlich ein Netzwerk- oder Bot-Schutz-Problem (xeno-canto blockiert manchmal automatisierte Anfragen). Die Seite der Art lässt sich manuell öffnen.";
  } else {
    msg = `Aufnahme konnte nicht geladen werden (${err.message}). Die Seite der Art lässt sich manuell öffnen.`;
  }
  card.innerHTML = `
    <div class="error-box">${msg}</div>
    <p><a href="${xcSpeciesPageUrl(target)}" target="_blank" rel="noopener">Art manuell auf xeno-canto.org ansehen →</a></p>
    <div class="options-grid" id="optionsGrid"></div>
  `;
  renderOptions(document.getElementById("optionsGrid"));
}

function renderQuestion(rec, target) {
  const card = document.getElementById("quizCard");
  card.innerHTML = `
    <div id="audioSection"></div>
    <div class="options-grid" id="optionsGrid"></div>
    <div id="answerFeedback"></div>
  `;
  renderAudioSection(rec, target, "audioSection");
  renderOptions(document.getElementById("optionsGrid"), rec, target);
}

// Rendert nur den Audio-/Sonogramm-Bereich einer Frage (nicht die
// Antwortoptionen) – so lässt sich per "Andere Aufnahme"/"Ausschließen" eine
// neue Aufnahme derselben Art nachladen, ohne die laufende Frage (Optionen,
// bereits gegebene Antwort, Punktestand) zu verlieren.
// Safari (v.a. macOS/iOS) spielt manche xeno-canto-Dateien nicht inline ab,
// sondern bietet nur "Herunterladen" an – vermutlich weil Safari ohne
// expliziten MIME-Type-Hinweis manchmal nicht erkennt, dass die Datei
// abspielbares Audio ist (Content-Type-/Sniffing-Eigenheit). Ein <source>
// mit explizitem "type" (statt nur "src" am <audio>-Tag) hilft Safari
// häufig, das Format sofort korrekt zuzuordnen, statt zu raten. xeno-canto
// liefert praktisch immer .mp3-Dateien; die Endung wird trotzdem geprüft,
// um für unerwartete Formate (.wav/.ogg/.flac) einen passenden Typ zu setzen.
function guessAudioMimeType(url) {
  const m = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url || "");
  const ext = m ? m[1].toLowerCase() : "mp3";
  const map = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4" };
  return map[ext] || "audio/mpeg";
}

// "opts" erlaubt abweichendes Verhalten der Aktions-Buttons (genutzt von der
// Validierungs-Seite: dort navigiert "Andere Aufnahme" nicht zu einer
// zufälligen Aufnahme, sondern zur nächsten in der festen Liste, und
// "Ausschließen" ersetzt nicht automatisch die Aufnahme, sondern schaltet
// nur den Status um). Ohne opts bleibt das bisherige Verhalten (Quiz/
// Verwechslungsarten-Modus) unverändert.
function renderAudioSection(rec, target, containerId, opts) {
  opts = opts || {};
  const container = document.getElementById(containerId);
  const durSec = parseLengthToSeconds(rec.length);
  const isLongRecording = durSec && durSec > XC_SONO_MAX_SECONDS;
  const audioMime = guessAudioMimeType(rec.fileUrl);
  const isExcluded = getExcludedIds().has(String(rec.xcId));
  const altLabel = opts.altLabel || "🔄 Andere Aufnahme";
  const excludeLabel = opts.excludeLabel
    ? opts.excludeLabel(isExcluded)
    : "🚫 Diese Aufnahme ausschließen (kein Ton hörbar, falsche Art o.ä.)";
  container.innerHTML = `
    <div class="audio-row">
      <button class="play-btn" id="playBtn">▶</button>
      <div>
        <div class="sound-type">${rec.type || "Aufnahmetyp unbekannt"}${rec.length ? ` · Länge: ${rec.length}` : ""}</div>
        <div class="attribution">Aufnahme: ${rec.recordist || "unbekannt"} · xeno-canto.org
          (<a href="${rec.pageUrl}" target="_blank" rel="noopener">Quelle</a>${rec.license ? `, Lizenz: <a href="${rec.license}" target="_blank" rel="noopener">CC</a>` : ""})
        </div>
        ${originNote(rec) ? `<div class="hint">${originNote(rec)}</div>` : ""}
        ${rec.remarks && rec.remarks.trim() ? `<div class="hint">Bemerkung der/des Aufnehmenden: „${rec.remarks.trim()}"</div>` : ""}
      </div>
    </div>
    <audio id="audioPlayer" preload="metadata">
      <source src="${rec.fileUrl}" type="${audioMime}">
    </audio>
    ${rec.sonoUrl ? `
      <div class="sono-container">
        <div class="sono-yaxis" id="sonoYAxis"></div>
        <div class="sono-scroll" id="sonoScroll">
          <div class="sono-wrap" id="sonoWrap">
            <div class="sono-imgwrap" id="sonoImgWrap">
              <img class="spectrogram" id="sonoImg" src="${rec.sonoUrl}" alt="Sonogramm">
              <div class="playhead" id="playhead"></div>
            </div>
            <div class="sono-xaxis" id="sonoXAxis"></div>
          </div>
        </div>
      </div>
      <p class="hint">${isLongRecording
        ? `Diese Aufnahme ist ${rec.length} lang. xeno-canto erzeugt das Sonogramm bei längeren Aufnahmen aber offenbar nur für die ersten 2 Minuten. Der Cursor läuft daher bis zum rechten Rand und bleibt dort stehen, auch wenn die Audiodatei danach noch weiterläuft.`
        : `Das Sonogramm zeigt die gesamte Aufnahme in fester Höhe (nicht nur die Zielart – Hintergrundgeräusche oder andere Vögel können mit abgebildet sein). Bei längeren Aufnahmen scrollt die Ansicht automatisch mit, sobald die rote Linie den sichtbaren Rand erreicht.`
      }${rec.sampleRate ? "" : " Achtung: Sample-Rate dieser Aufnahme unbekannt, y-Achse zeigt daher keine kHz-Werte."}</p>
    ` : ""}
    <div id="playError"></div>
    <div class="rec-actions">
      ${opts.hideAltButton ? "" : `<button class="details-toggle" id="altRecBtn">${altLabel}</button>`}
      <button class="details-toggle" id="excludeRecBtn">${excludeLabel}</button>
    </div>
  `;

  // Autoplay im Erkennen-Modus und auf der Validierungs-Seite (dort gibt es
  // jeweils genau einen Audio-Bereich). Im Verwechslungsarten-Modus stehen
  // zwei Boxen gleichzeitig auf der Seite – automatisches Abspielen beider
  // Aufnahmen übereinander wäre verwirrend, daher dort ausgenommen.
  const autoplayHere = (containerId === "audioSection" || containerId === "validationAudioSection") && getAutoplay();
  setupAudioControls(rec, container, autoplayHere);
  const altBtn = container.querySelector("#altRecBtn");
  if (altBtn) altBtn.addEventListener("click", () => (opts.onAlt ? opts.onAlt() : swapRecording(target, containerId, false)));
  container.querySelector("#excludeRecBtn").addEventListener("click", () => {
    if (opts.onExclude) opts.onExclude(rec.xcId, isExcluded);
    else swapRecording(target, containerId, true, rec.xcId);
  });
}

// Lädt für dieselbe Art eine andere Aufnahme nach (optional: schließt die
// aktuelle vorher dauerhaft aus) – ohne die laufende Frage/Antwortoptionen
// bzw. beim Verwechslungsarten-Vergleich die andere Box zu beeinflussen.
async function swapRecording(sp, containerId, exclude, xcId) {
  if (exclude && xcId != null) excludeRecording(xcId);
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<p class="muted">Lade andere Aufnahme…</p>`;
  try {
    const rec = await pickRecording(sp);
    renderAudioSection(rec, sp, containerId);
  } catch (err) {
    container.innerHTML = `<div class="error-box">Konnte keine andere Aufnahme laden (${err.message}).</div>`;
  }
}

// Lässt das Sonogramm-Bild sauber einblenden statt sichtbar "Zeile für
// Zeile" aufzubauen (progressives Laden großer Bilder) – wirkt schneller/
// aufgeräumter, auch wenn der eigentliche Download gleich lang dauert.
// "onReady" wird zusätzlich aufgerufen, sobald die tatsächliche Bildbreite
// bekannt ist (nötig, um Achsen exakt auf die Bildbreite auszurichten).
function setupImageFadeIn(img, onReady) {
  if (!img) return;
  const handle = () => {
    img.classList.add("loaded");
    if (onReady) onReady();
  };
  if (img.complete && img.naturalWidth > 0) {
    handle();
  } else {
    img.addEventListener("load", handle);
  }
}

// ---------- Sonogramm-Achsenbeschriftung ----------
// xeno-canto liefert nur das reine Sonogramm-Bild ohne Achsen. Die y-Achse
// (Frequenz) und x-Achse (Zeit) werden hier client-seitig aus vorhandenen
// Metadaten berechnet und als überlagerte Beschriftung angezeigt:
// - y-Achse: max. Frequenz = Nyquist-Frequenz = Sample-Rate / 2 (aus dem
//   "smp"-Feld der xeno-canto API). Ist die Sample-Rate unbekannt, wird nur
//   die Achsenbeschriftung "kHz" ohne Zahlenwerte gezeigt (kein Raten).
// - x-Achse: tatsächliche Aufnahmedauer (bevorzugt audio.duration, sobald
//   geladen; bis dahin Näherung aus der von xeno-canto gelieferten
//   "length"-Zeitangabe).

function parseLengthToSeconds(lengthStr) {
  if (!lengthStr) return null;
  const parts = String(lengthStr).split(":").map(Number);
  if (parts.some(n => isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// xeno-canto scheint das Sonogramm-Bild (jedenfalls in der von uns
// verwendeten "large"-Variante) bei längeren Aufnahmen nur für die ersten
// 2 Minuten zu erzeugen, auch wenn die Aufnahme selbst länger läuft – die
// eigentliche Audiodatei ist dann länger als das dazugehörige Sonogramm.
// Beobachtung/Hypothese von der Nutzerin bestätigt (2026-07-26) anhand einer
// 5:06-min-Aufnahme, deren Sonogramm sich wie eine 2:00-min-Aufnahme verhielt.
// Deshalb wird die für x-Achse UND Cursor-Sync verwendete Dauer bei längeren
// Aufnahmen auf 120s gedeckelt: der Cursor läuft dann bis zum rechten Rand
// und bleibt dort stehen, während die Audiodatei ggf. noch weiterläuft –
// statt (wie vorher) am echten Ende der Audiodatei zu landen, obwohl das
// Sonogramm optisch schon lange vorher "fertig" war.
const XC_SONO_MAX_SECONDS = 120;
function capSonoDuration(sec) {
  return (sec && isFinite(sec)) ? Math.min(sec, XC_SONO_MAX_SECONDS) : sec;
}

// Wählt eine "runde" Schrittweite aus einer Kandidatenliste, sodass ungefähr
// targetTicks Markierungen entstehen (statt krummer Werte wie "3.7 kHz").
function chooseStep(maxVal, candidates, targetTicks) {
  const rough = maxVal / targetTicks;
  for (const c of candidates) {
    if (c >= rough) return c;
  }
  return candidates[candidates.length - 1];
}

function renderSonoYAxis(el, maxKHz) {
  if (!el) return;
  if (!maxKHz || !isFinite(maxKHz) || maxKHz <= 0) {
    el.innerHTML = `<span class="axis-caption-y">kHz</span>`;
    return;
  }
  const step = chooseStep(maxKHz, [1, 2, 2.5, 5, 10], 5);
  let html = `<span class="axis-caption-y">kHz</span>`;
  for (let v = 0; v <= maxKHz + 0.001; v += step) {
    const pct = 100 - (v / maxKHz) * 100; // 0 kHz unten, Maximum oben
    const label = Number.isInteger(v) ? v : v.toFixed(1);
    html += `<span class="ytick" style="top:${pct}%">${label}</span>`;
  }
  el.innerHTML = html;
}

function renderSonoXAxis(el, durationSec) {
  if (!el) return;
  if (!durationSec || !isFinite(durationSec) || durationSec <= 0) {
    el.innerHTML = "";
    return;
  }
  const step = chooseStep(durationSec, [1, 2, 5, 10, 15, 30, 60, 120, 300], 8);
  let html = "";
  for (let t = 0; t <= durationSec + 0.001; t += step) {
    const pct = (t / durationSec) * 100;
    html += `<span class="xtick" style="left:${pct}%">${Math.round(t)}s</span>`;
  }
  el.innerHTML = html;
}

// Setzt die Breite von Sonogramm-Wrapper, Bild-Wrapper und x-Achse explizit
// auf die tatsächlich gerenderte Bildbreite (in px) – so bleiben Zeitmarken
// exakt unter der richtigen Bildspalte, unabhängig von CSS-Sizing-Details.
function syncSonoWidths(img, wrapEl, imgWrapEl, xAxisEl) {
  if (!img || !wrapEl) return;
  const w = img.clientWidth;
  if (!w) return;
  wrapEl.style.width = w + "px";
  if (imgWrapEl) imgWrapEl.style.width = w + "px";
  if (xAxisEl) xAxisEl.style.width = w + "px";
}

// Bewegt die Sono-Scrollansicht automatisch mit, sobald der Playhead den
// sichtbaren Rand erreicht – wie eine mitlaufende Wiedergabeanzeige.
// "knownDuration" (Sekunden, aus xeno-cantos eigenem "length"-Feld) wird,
// wenn vorhanden, IMMER bevorzugt statt audio.duration verwendet – sie wird
// serverseitig aus der Originaldatei berechnet und ist zuverlässiger als die
// clientseitige Schätzung des Browsers (bei manchen, v.a. VBR-codierten
// MP3s, ist audio.duration ungenau, wodurch Cursor und Sonogramm im Lauf
// der Aufnahme auseinanderlaufen können).
function setupSonoSync(audio, scrollEl, wrapEl, playheadEl, knownDuration) {
  if (!playheadEl) return;
  audio.addEventListener("timeupdate", () => {
    const dur = knownDuration || ((audio.duration && isFinite(audio.duration)) ? capSonoDuration(audio.duration) : null);
    if (!dur) return;
    const pct = Math.min(100, (audio.currentTime / dur) * 100);
    playheadEl.style.left = pct + "%";
    if (scrollEl && wrapEl) {
      const wrapWidth = wrapEl.offsetWidth;
      const playheadPx = (pct / 100) * wrapWidth;
      const visibleLeft = scrollEl.scrollLeft;
      const visibleRight = visibleLeft + scrollEl.clientWidth;
      const margin = 24;
      if (playheadPx > visibleRight - margin || playheadPx < visibleLeft) {
        scrollEl.scrollLeft = Math.max(0, playheadPx - scrollEl.clientWidth * 0.15);
      }
    }
  });
  audio.addEventListener("ended", () => {
    if (scrollEl) scrollEl.scrollLeft = 0;
  });
}

// "container" ist das DOM-Element, in das renderAudioSection() gerendert hat
// (per containerId). Wichtig: alle Lookups laufen über container.querySelector
// statt document.getElementById, weil im Verwechslungsarten-Modus zwei
// Audio-Bereiche gleichzeitig auf der Seite stehen und die IDs (playBtn,
// audioPlayer, ...) sich sonst überschneiden würden.
function setupAudioControls(rec, container, autoplayAllowed) {
  const audio = container.querySelector("#audioPlayer");
  const playBtn = container.querySelector("#playBtn");
  const playhead = container.querySelector("#playhead");
  const sonoScroll = container.querySelector("#sonoScroll");
  const sonoWrap = container.querySelector("#sonoWrap");
  const sonoImgWrap = container.querySelector("#sonoImgWrap");
  const sonoImg = container.querySelector("#sonoImg");
  const sonoYAxis = container.querySelector("#sonoYAxis");
  const sonoXAxis = container.querySelector("#sonoXAxis");
  const playError = container.querySelector("#playError");

  setupImageFadeIn(sonoImg, () => {
    syncSonoWidths(sonoImg, sonoWrap, sonoImgWrap, sonoXAxis);
  });

  // y-Achse (kHz) hängt nur von der Sample-Rate ab, ist also sofort bekannt.
  renderSonoYAxis(sonoYAxis, rec.sampleRate ? rec.sampleRate / 2000 : null);

  // x-Achse & Cursor-Sync: die von xeno-canto server-seitig gemeldete Länge
  // ("length"-Feld) ist die verlässlichste Dauer-Quelle – anders als die vom
  // Browser aus der Audiodatei geschätzte audio.duration, die bei manchen
  // (v.a. VBR-codierten) MP3s ungenau ist und dazu führt, dass Cursor und
  // Sonogramm im Lauf der Aufnahme auseinanderlaufen. Ist "length" nicht
  // verwertbar, wird versucht, audio.duration per Vorspul-Trick zu schärfen.
  const knownDuration = capSonoDuration(parseLengthToSeconds(rec.length));
  renderSonoXAxis(sonoXAxis, knownDuration);
  setupSonoSync(audio, sonoScroll, sonoWrap, playhead, knownDuration);

  // Ohne "length"-Angabe: audio.duration übernehmen, sobald bekannt (ohne
  // den Vorspul-Schärfungstrick – der lud parallel große Teile der Audiodatei
  // nach und verzögerte dadurch spürbar das Laden des Sonogramm-Bildes,
  // weil sich beide Downloads die Verbindung teilen). Auch hier gilt das
  // 120s-Limit (s. Kommentar bei capSonoDuration).
  if (!knownDuration) {
    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        renderSonoXAxis(sonoXAxis, capSonoDuration(audio.duration));
      }
    });
  }

  // "Wiedergabe fehlgeschlagen" hier kann zwei sehr unterschiedliche Ursachen
  // haben: (1) Autoplay-Sperre des Browsers (harmlos, Klick auf Play behebt
  // es), oder (2) das Format/der Stream dieser konkreten xeno-canto-Datei
  // wird vom Browser nicht unterstützt – das kommt vereinzelt in Safari
  // (macOS/iOS) vor und zeigt sich dort z.T. sogar als "zum Abspielen
  // herunterladen"-Hinweis, wenn man den Direktlink öffnet. Für Fall (2)
  // gibt es keinen zuverlässigen Client-seitigen Fix (liegt an der Datei/am
  // Server), daher der Hinweis auf "Andere Aufnahme" als praktischer Ausweg.
  function showPlayError() {
    if (!playError) return;
    playError.innerHTML = `<div class="error-box">Wiedergabe fehlgeschlagen. Das kann an einer Autoplay-Sperre liegen (einfach nochmal auf ▶ klicken) oder daran, dass dein Browser (v.a. Safari auf Mac/iPhone) genau diese Aufnahmedatei nicht unterstützt. Falls Letzteres: bitte "🔄 Andere Aufnahme" probieren, oder Direktlink: <a href="${rec.fileUrl}" target="_blank" rel="noopener">Audiodatei öffnen</a></div>`;
  }

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(showPlayError);
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("error", showPlayError);
  audio.addEventListener("play", () => { playBtn.textContent = "⏸"; });
  audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });
  audio.addEventListener("ended", () => {
    playBtn.textContent = "▶";
    if (playhead) playhead.style.left = "0%";
  });

  if (autoplayAllowed) {
    audio.play().catch(() => {
      // Browser hat automatische Wiedergabe blockiert (Autoplay-Richtlinie) –
      // dann einfach manuell über den Play-Button starten.
      if (playError) playError.innerHTML = `<p class="hint">Automatische Wiedergabe wurde vom Browser blockiert – bitte einmal auf ▶ klicken.</p>`;
    });
  }
}

function renderOptions(container, rec, target) {
  const q = state.currentQuestion;
  container.innerHTML = "";
  q.options.forEach(sp => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = formatName(sp);
    btn.addEventListener("click", () => handleAnswer(sp, btn, rec, target));
    container.appendChild(btn);
  });
}

function handleAnswer(chosen, btnEl, rec, target) {
  const q = state.currentQuestion;
  if (q.answered) return;
  q.answered = true;

  const wasCorrect = chosen.id === q.target.id;
  state.score.total += 1;
  if (wasCorrect) state.score.correct += 1;
  recordAnswer(q.target, wasCorrect);

  const container = btnEl.parentElement;
  Array.from(container.children).forEach((btn, i) => {
    const sp = q.options[i];
    btn.disabled = true;
    if (sp.id === q.target.id) btn.classList.add("correct");
    else if (sp.id === chosen.id) btn.classList.add("incorrect");
  });

  updateScore();
  renderDetailsToggle(q.target);
}

function updateScore() {
  document.getElementById("scoreDisplay").textContent =
    `Punktestand: ${state.score.correct} / ${state.score.total}`;
}

// Zeigt zunächst nur einen Toggle-Button; Inhalt (inkl. Wikipedia-Bild)
// wird erst beim ersten Öffnen geladen/gerendert, damit die Ansicht nach
// dem Antworten nicht ungefragt aufklappt.
function renderDetailsToggle(sp) {
  const panel = document.getElementById("answerFeedback");
  const partner = confusionPartner(sp);

  panel.innerHTML = `
    ${partner ? `
      <div class="confusion-hint">
        ⚠️ ${sp.de} kann akustisch mit <strong>${partner.de}</strong> verwechselt werden.
        <button class="details-toggle" id="jumpConfusionBtn">🔁 Verwechslungsarten vergleichen</button>
      </div>
    ` : ""}
    <button class="details-toggle" id="detailsToggleBtn">ℹ️ Mehr über ${sp.de} erfahren</button>
    <div class="details hidden" id="detailsContent"></div>
  `;

  if (partner) {
    document.getElementById("jumpConfusionBtn").addEventListener("click", () => {
      switchMode("unterscheiden", { confusionKey: sp.confusionGroup });
    });
  }

  const toggleBtn = document.getElementById("detailsToggleBtn");
  const content = document.getElementById("detailsContent");
  let loaded = false;

  toggleBtn.addEventListener("click", async () => {
    const willShow = content.classList.contains("hidden");
    content.classList.toggle("hidden");
    toggleBtn.textContent = willShow ? `▲ Weniger anzeigen` : `ℹ️ Mehr über ${sp.de} erfahren`;
    if (willShow && !loaded) {
      loaded = true;
      renderDetailsContent(sp, content);
    }
  });
}

async function renderDetailsContent(sp, content) {
  const areaNames = sp.areas.map(a => AREAS[a]).join(", ");
  const confusion = sp.confusionGroup ? CONFUSION_NOTES[sp.confusionGroup] : null;
  content.innerHTML = `
    <h3>${sp.de} <span class="muted">(${sp.en}, <em>${sp.sci}</em>)</span></h3>
    <div id="speciesImgWrap" class="muted" style="font-size:0.8rem;">Bild wird geladen…</div>
    <p>${sp.background}</p>
    <p>
      <span class="tag">Häufigkeit: ${sp.frequency}</span>
      <span class="tag">Schwierigkeit: ${sp.difficulty}</span>
      ${sp.group ? `<span class="tag">Gruppe: ${sp.group}</span>` : ""}
    </p>
    <p><strong>Vorkommen in euren Gebieten (eBird-Hotspot-Meldungen, kumulativ):</strong><br>${areaNames || "bisher keine eBird-Meldung in den gesampelten Gebieten"}</p>
    ${confusion ? `<div class="confusion-note"><strong>Verwechslungsgefahr – ${confusion.title}:</strong> ${confusion.note}</div>` : ""}
    <button class="details-toggle" id="jumpValidationBtn">🔍 Alle xeno-canto-Aufnahmen dieser Art durchgehen</button>
  `;
  document.getElementById("jumpValidationBtn").addEventListener("click", () => {
    switchMode("validieren", { speciesId: sp.id });
  });

  const imgWrap = document.getElementById("speciesImgWrap");
  try {
    const imgUrl = await fetchWikiImage(sp);
    if (imgUrl) {
      imgWrap.innerHTML = `<img class="species-photo" src="${imgUrl}" alt="${sp.de}"><div class="hint">Bild: Wikipedia</div>`;
    } else {
      imgWrap.innerHTML = "";
    }
  } catch (e) {
    imgWrap.innerHTML = "";
  }
}

// ---------- Unterscheiden-Modus ----------

async function renderConfusionPair() {
  const key = document.getElementById("confusionSelect").value;
  const info = CONFUSION_NOTES[key];
  const pairSpecies = SPECIES.filter(sp => sp.confusionGroup === key);
  const card = document.getElementById("confusionCard");

  card.innerHTML = `
    <div class="confusion-note"><strong>${info.title}:</strong> ${info.note}</div>
    <div class="confusion-pair" id="pairGrid"></div>
  `;

  const grid = document.getElementById("pairGrid");
  for (const sp of pairSpecies) {
    const box = document.createElement("div");
    box.className = "confusion-species";
    const audioContainerId = `confAudio-${sp.id}`;
    box.innerHTML = `
      <h3>${formatName(sp)}</h3>
      <div id="${audioContainerId}"><p class="muted">Lade Aufnahme…</p></div>
      <p>${sp.background}</p>
    `;
    grid.appendChild(box);

    try {
      const rec = await pickRecording(sp);
      renderAudioSection(rec, sp, audioContainerId);
    } catch (err) {
      const msg = err.message === "no-key"
        ? "Kein API-Key hinterlegt (Zahnrad oben rechts)."
        : "Aufnahme nicht automatisch ladbar.";
      document.getElementById(audioContainerId).innerHTML = `
        <p class="muted">${msg}</p>
        <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">manuell auf xeno-canto.org ansehen →</a></p>
      `;
    }
  }
}

// ---------- Validierungs-Seite ----------
// Für die Validierung von Monitoring-Aufnahmen: gezielt nach einer Art
// suchen (deutsch/englisch/lateinisch) und alle xeno-canto-Aufnahmen dazu
// nacheinander durchgehen (mit Sonogramm, wie im Erkennen-Modus), statt wie
// dort zufällig einzelne Aufnahmen zum Raten zu bekommen. Nutzt bewusst
// dieselbe gestaffelte Suche (fetchAllRecordingsForSpecies, anders als der
// Lernmodus ohne max_recordings_pref-Deckel – der "N / M"-Zähler soll die
// echte xeno-canto-Gesamtzahl zeigen) und dieselbe Ausschlussliste wie der
// Lernmodus, damit beide Seiten konsistent bleiben.

const MONTH_NAMES_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function validationLabel(sp) {
  return `${sp.de} (${sp.sci}) – ${sp.en}`;
}

function populateValidationSpeciesList() {
  const dl = document.getElementById("validationSpeciesList");
  dl.innerHTML = SPECIES.map(sp => `<option value="${validationLabel(sp)}">`).join("");
}

// Ordnet den Sucheingabetext einer Art zu: erst exakter Treffer auf das
// Datalist-Label (Auswahl per Vorschlagsliste), sonst exakter Treffer auf
// einen der drei Namen, sonst lockere Teilstring-Suche über alle drei Namen.
// Bei mehreren Treffern wird bewusst nur der erste genommen und die
// Trefferzahl im Suchhinweis angezeigt (keine eigene Trefferliste) – für den
// Validierungs-Anwendungsfall reicht das, da meist der volle/fast volle
// Name eingegeben wird.
function resolveSpeciesInput(text) {
  const t = text.trim().toLowerCase();
  if (!t) return { match: null, count: 0 };

  const exactLabel = SPECIES.find(sp => validationLabel(sp).toLowerCase() === t);
  if (exactLabel) return { match: exactLabel, count: 1 };

  const exactName = SPECIES.filter(sp =>
    sp.de.toLowerCase() === t || sp.en.toLowerCase() === t || sp.sci.toLowerCase() === t
  );
  if (exactName.length >= 1) return { match: exactName[0], count: exactName.length };

  const partial = SPECIES.filter(sp =>
    sp.de.toLowerCase().includes(t) || sp.en.toLowerCase().includes(t) || sp.sci.toLowerCase().includes(t)
  );
  return { match: partial[0] || null, count: partial.length };
}

function setupValidationSearch() {
  populateValidationSpeciesList();
  const input = document.getElementById("validationSearchInput");
  const hint = document.getElementById("validationSearchHint");

  const doSearch = () => {
    const { match, count } = resolveSpeciesInput(input.value);
    if (!match) {
      hint.textContent = input.value.trim()
        ? "Keine Art gefunden – bitte deutschen, englischen oder lateinischen Namen (auch als Teilstring) versuchen."
        : "";
      return;
    }
    hint.textContent = count > 1 ? `${count} Treffer, zeige „${match.de}" – für eine andere Art genauer eingeben.` : "";
    loadValidationSpecies(match);
  };

  document.getElementById("validationSearchBtn").addEventListener("click", doSearch);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
}

// Kurzer Kopf (Name + Häufigkeit/Schwierigkeit/Gruppe) direkt über der
// Audio-Box. Die ausführlichen Infos (Habitat/Saison/Gebiete/Hintergrundtext)
// stehen bewusst erst danach (renderValidationDetails) – Nutzerin-Feedback
// 2026-09-21: Sonogramm/Audio soll sichtbar sein, ohne dafür scrollen zu
// müssen, die Zusatzinfos sind fürs Validieren selbst nachrangig.
// Link zur Art auf eBird (Nutzerin-Feedback 2026-09-21). Braucht den
// eBird-"speciesCode" (z.B. "gretit1" für Kohlmeise) -- eBird-URLs erlauben
// keinen Direktlink nur über den wissenschaftlichen Namen. Der Code kommt
// optional aus sp.ebirdCode (per Node-Skript aus ebird_species_codes.json in
// species-data.js injiziert, sobald die Datei vorliegt -- s. neuer
// "eBird-Artcodes exportieren"-Button in ebird-artenabgleich-tool.html).
// Ohne Code lieber gar keinen Link zeigen als einen geratenen/kaputten.
function ebirdSpeciesLinkHtml(sp) {
  if (!sp.ebirdCode) return "";
  return `<p><a href="https://ebird.org/species/${sp.ebirdCode}" target="_blank" rel="noopener">Art auf eBird ansehen →</a></p>`;
}

function renderValidationHeader(sp) {
  const card = document.getElementById("validationHeaderCard");
  card.classList.remove("hidden");
  card.innerHTML = `
    <h3 style="margin-top:0;">${sp.de} <span class="muted">(${sp.en}, <em>${sp.sci}</em>)</span></h3>
    <p style="margin-bottom:0;">
      <span class="tag">Häufigkeit: ${sp.frequency}</span>
      <span class="tag">Schwierigkeit: ${sp.difficulty}</span>
      ${sp.group ? `<span class="tag">Gruppe: ${sp.group}</span>` : ""}
    </p>
  `;
}

function renderValidationDetails(sp) {
  const card = document.getElementById("validationDetailsCard");
  card.classList.remove("hidden");
  const areaNames = sp.areas.map(a => AREAS[a]).join(", ") || "bisher keine eBird-Meldung in den gesampelten Gebieten";
  const habitatText = (sp.habitat && sp.habitat.length)
    ? sp.habitat.map(h => HABITAT_LABELS[h] || h).join(", ")
    : "keine Angabe (noch nicht recherchiert)";
  const seasonText = sp.vocalMonths
    ? `${MONTH_NAMES_DE[sp.vocalMonths[0] - 1]}–${MONTH_NAMES_DE[sp.vocalMonths[1] - 1]}`
    : (sp.habitat ? "ganzjährig aktiv / keine ausgeprägte Rufsaison bekannt" : "keine Angabe (noch nicht recherchiert)");

  card.innerHTML = `
    <div class="validation-info-grid">
      <div><h4>Habitat</h4>${habitatText}</div>
      <div><h4>Ruf-/Gesangssaison</h4>${seasonText}</div>
      <div><h4>Vorkommen in euren Gebieten</h4>${areaNames}</div>
    </div>
    <p style="margin-top:0.8rem;">${sp.background}</p>
    <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">Art auf xeno-canto.org ansehen →</a></p>
    ${ebirdSpeciesLinkHtml(sp)}
  `;
}

async function loadValidationSpecies(sp) {
  state.validation = { sp, recordings: [], index: 0 };
  document.getElementById("validationSearchInput").value = validationLabel(sp);
  renderValidationHeader(sp);
  renderValidationDetails(sp);
  const card = document.getElementById("validationCard");
  card.innerHTML = `<p class="muted">Lade Aufnahmen… (bei sehr häufigen Arten mit vielen xeno-canto-Aufnahmen kann das etwas dauern)</p>`;
  try {
    const list = await fetchAllRecordingsForSpecies(sp);
    state.validation.recordings = list;
    renderValidationRecording();
  } catch (err) {
    let msg;
    if (err.message === "no-key") {
      msg = "Kein xeno-canto API-Key hinterlegt. Über das Zahnrad oben rechts einen Key eintragen.";
    } else if (err.message === "no-recordings") {
      msg = "Für diese Art sind auf xeno-canto aktuell keine Aufnahmen zu finden.";
    } else {
      msg = `Aufnahmen konnten nicht geladen werden (${err.message}).`;
    }
    card.innerHTML = `
      <div class="error-box">${msg}</div>
      <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">Art manuell auf xeno-canto.org ansehen →</a></p>
    `;
  }
}

function renderValidationRecording() {
  const { sp, recordings, index } = state.validation;
  const card = document.getElementById("validationCard");
  if (!recordings.length) {
    card.innerHTML = `<div class="error-box">Für diese Art sind auf xeno-canto keine Aufnahmen zu finden.</div>`;
    return;
  }
  const rec = recordings[index];
  const isExcluded = getExcludedIds().has(String(rec.xcId));
  card.innerHTML = `
    <div class="validation-nav">
      <button id="valPrevBtn" ${index === 0 ? "disabled" : ""}>← Vorherige</button>
      <span class="validation-counter">${index + 1} / ${recordings.length}</span>
      <button id="valNextBtn" ${index === recordings.length - 1 ? "disabled" : ""}>Nächste →</button>
    </div>
    ${isExcluded ? `<div class="validation-excluded-badge">🚫 Diese Aufnahme ist aktuell ausgeschlossen (wird im Lernmodus nicht mehr gezeigt).</div>` : ""}
    <div id="validationAudioSection"></div>
  `;

  document.getElementById("valPrevBtn").addEventListener("click", () => {
    if (state.validation.index > 0) { state.validation.index--; renderValidationRecording(); }
  });
  document.getElementById("valNextBtn").addEventListener("click", () => {
    if (state.validation.index < state.validation.recordings.length - 1) { state.validation.index++; renderValidationRecording(); }
  });

  renderAudioSection(rec, sp, "validationAudioSection", {
    hideAltButton: true, // Navigation (oben) übernimmt "andere Aufnahme" hier vollständig
    excludeLabel: (excluded) => excluded
      ? "↩️ Ausschluss aufheben"
      : "🚫 Diese Aufnahme ausschließen (kein Ton hörbar, falsche Art o.ä.)",
    onExclude: (xcId, wasExcluded) => {
      if (wasExcluded) unexcludeRecording(xcId);
      else excludeRecording(xcId);
      renderValidationRecording(); // Badge/Button-Text aktualisieren, an derselben Aufnahme/Position bleiben
    },
  });
}

// ---------- Fortschritt-Ansicht ----------

function renderFortschritt() {
  const view = document.getElementById("fortschrittView");
  const rows = SPECIES.map(sp => {
    const info = masteryInfo(sp);
    const acc = info.attempts ? Math.round((info.correct / info.attempts) * 100) : null;
    return { sp, info, acc };
  }).sort((a, b) => (a.info.attempts - b.info.attempts) || ((a.acc ?? 0) - (b.acc ?? 0)));

  const totalAttempts = rows.reduce((sum, r) => sum + r.info.attempts, 0);

  const weeklyData = computeWeeklyProgress(10);

  // Zweiter Balkensatz: derselbe Verlauf, aber beschränkt auf den aktuell
  // aktiven Filter-Pool (Häufigkeit/Schwierigkeit/Gebiet/Gruppe/Lerngruppe/
  // "Anzahl Arten zum Start") – zeigt z.B. den Fortschritt speziell für die
  // eigenen 20 Start-Arten, statt immer auf alle Arten der App bezogen zu
  // sein. Wird nur angezeigt, wenn der Filter tatsächlich etwas einschränkt.
  const filterPool = currentFilteredSpecies();
  const filterIsActive = filterPool.length < SPECIES.length;
  const filterWeeklyData = filterIsActive ? computeWeeklyProgress(10, filterPool) : null;

  view.innerHTML = `
    <div class="card" style="max-width: 760px;">
      <h2 style="margin-top:0; color: var(--green-dark);">Dein Fortschritt</h2>
      <p class="muted">Arten, die du sicher erkennst (Serie von mehreren richtigen Antworten), werden seltener abgefragt – neue oder noch unsichere Arten häufiger. Basiert nur auf dem Modus „Arten erkennen“, lokal in diesem Browser gespeichert.</p>
      ${totalAttempts === 0 ? `<p class="muted">Noch keine Antworten erfasst – leg im Modus „Arten erkennen" los.</p>` : `
      <h3 style="color: var(--green-dark); margin-bottom:0.3rem;">Verlauf pro Woche – alle ${SPECIES.length} Arten</h3>
      ${renderProgressChart(weeklyData)}
      ${filterIsActive ? `
      <h3 style="color: var(--green-dark); margin-top:1.6rem; margin-bottom:0.3rem;">Verlauf pro Woche – aktueller Filter (${filterPool.length} Arten)</h3>
      <p class="hint" style="margin-top:0;">Bezieht sich auf die gerade in den Filtern oben ausgewählte Artenmenge (Häufigkeit/Schwierigkeit/Gebiet/Gruppe/Lerngruppe/Anzahl Arten zum Start).</p>
      ${renderProgressChart(filterWeeklyData, filterPool.length)}
      ` : ""}
      <h3 style="color: var(--green-dark); margin-top:1.6rem;">Alle Arten im Detail</h3>

      <table class="progress-table">
        <thead>
          <tr><th>Art</th><th>Versuche</th><th>Richtig</th><th>Status</th><th>Zuletzt geübt</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${formatName(r.sp)}</td>
              <td>${r.info.attempts}</td>
              <td>${r.acc === null ? "–" : r.acc + "%"}</td>
              <td><span class="status-badge status-${r.info.label}">${statusLabelDe(r.info.label)}</span></td>
              <td>${r.info.lastSeen ? new Date(r.info.lastSeen).toLocaleDateString("de-DE") : "–"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      `}
      <button id="resetStatsBtn" class="details-toggle" style="margin-top:1.2rem;">Fortschritt zurücksetzen</button>
    </div>
  `;

  document.getElementById("resetStatsBtn").addEventListener("click", () => {
    if (confirm("Gesamten Lernfortschritt (inkl. Verlauf) in diesem Browser wirklich zurücksetzen?")) {
      state.stats = {};
      state.answerLog = [];
      saveStats();
      saveLog();
      renderFortschritt();
    }
  });
}

// ---------- Init ----------

function init() {
  loadStats();
  populateAreaFilter();
  populateGroupFilter();
  populateConfusionSelect();
  setupTabs();
  setupSettings();
  setupFilters();
  setupAutoplayToggle();
  setupValidationSearch();
  loadQuestion();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
