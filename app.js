/* Vogelstimmen-Trainer – Prototyp
   Lädt Aufnahmen client-seitig live von der xeno-canto API (v3).
   Läuft komplett im Browser, kein eigenes Backend nötig.
*/

const STATS_KEY = "vogeltrainer_stats_v1";
const LOG_KEY = "vogeltrainer_log_v1";
const MAX_LOG_ENTRIES = 3000;

// App-Version, rein zur Anzeige (Einstellungsdialog) und zum manuellen Prüfen, ob ein Deploy
// angekommen ist. Muss bei jedem inhaltlichen Deploy von Hand hochgezählt werden (Schema
// "JJJJ-MM-TT.n", n hochzählen bei mehreren Deploys am selben Tag) – es gibt keinen Build-Step,
// der das automatisch könnte. S. CLAUDE.md Abschnitt "PWA-Update-Mechanismus".
const APP_VERSION = "2026-09-23.10";

// Alle UI-Texte auf Deutsch und Englisch. Artdaten selbst (Artnamen,
// background-Texte, Verwechslungshinweise) stehen in species-data.js und
// werden über die Helferfunktionen unten (areaName, groupLabel, ...)
// eingebunden, nicht hier.
const STRINGS = {
  de: {
    header: { title: "Vogelstimmen-Trainer", badge: "Prototyp", settingsBtn: "Einstellungen" },
    tabs: {
      erkennen: "Arten erkennen",
      unterscheiden: "Verwechslungsarten unterscheiden",
      validieren: "🔍 Validieren",
      fortschritt: "📊 Fortschritt",
      anleitung: "❓ Anleitung",
      disclaimer: "⚠️ Hinweise",
    },
    nav: {
      showBtn: "📋 Optionen anzeigen",
      hideBtn: "📋 Optionen ausblenden",
    },
    settings: {
      title: "Einstellungen",
      apiKeyIntro: 'Zum Laden echter Aufnahmen wird ein kostenloser <strong>xeno-canto API-Key</strong> benötigt (Account anlegen auf <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a>, Key erscheint dann unter „Your account" → „API key"). Eine ausführlichere Anleitung dazu gibt es auf der Anleitung-Seite oben.',
      apiKeyLabel: "xeno-canto API-Key",
      apiKeyPlaceholder: "dein-api-key",
      apiKeyHint: "Der Key wird nur lokal in deinem Browser gespeichert, nicht an uns übertragen.",
      maxRecLabel: "Aufnahmen pro Art laden (max.)",
      maxRecHint: "Höherer Wert = mehr Abwechslung, aber etwas langsameres erstes Laden pro Art.",
      excludedLabel: "Ausgeschlossene Aufnahmen (z.B. weil kein Ton hörbar war oder die Art falsch bestimmt wirkte):",
      resetExcludedBtn: "Ausschlussliste zurücksetzen",
      learnGroupLabel: "Lerngruppe (für Teams)",
      learnGroupNone: "Keine Aufteilung – alle Arten",
      learnGroupA: "Gruppe A",
      learnGroupB: "Gruppe B",
      learnGroupC: "Gruppe C",
      learnGroupHintIntro: "Wenn ihr zu mehreren die App nutzt und nicht alle mit denselben Arten anfangen wollt: jede Person wählt hier einmalig ihren Buchstaben. Die drei Gruppen sind fest und ausgewogen eingeteilt (je gleich viele leichte/mittlere/schwere Arten aus allen Vogelfamilien) –",
      learnGroupHintNone: "aktuell: keine Aufteilung, alle {n} Arten.",
      learnGroupHintGroup: "aktuell: Gruppe {g} mit {n} Arten.",
      saveBtn: "Speichern",
      closeBtn: "Schließen",
      versionLabel: "App-Version:",
      checkUpdateBtn: "Nach Updates suchen",
    },
    update: {
      available: "Eine neue Version der App ist verfügbar.",
      reloadBtn: "Jetzt neu laden",
      checking: "Suche nach Updates …",
      upToDate: "Du nutzt bereits die neueste Version.",
      checkFailed: "Prüfung fehlgeschlagen (evtl. offline) – bitte später nochmal versuchen.",
    },
    filters: {
      frequency: "Häufigkeit", freq_haeufig: "häufig", freq_mittel: "mittel", freq_selten: "selten", freq_sehr_selten: "sehr selten",
      difficulty: "Schwierigkeit", diff_leicht: "leicht", diff_mittel: "mittel", diff_schwer: "schwer",
      area: "Gebiet", area_all: "Deutschlandweit", area_kern11: "alle 11 Gebiete",
      group: "Artengruppe", group_all: "alle Gruppen",
      count: "Anzahl Arten zum Start", count_all: "alle",
      names: "Namen anzeigen", names_de: "DE", names_en: "EN", names_sci: "Lat",
      showBtn: "🔧 Filter anzeigen", hideBtn: "🔧 Filter ausblenden",
    },
    erkennen: {
      loadingQuestion: "Lade Frage…",
      autoplayLabel: "Automatisch abspielen",
      nextBtn: "Nächste Aufnahme",
      tooFewSpecies: "Zu wenige Arten für diese Filterkombination im aktuellen Artenset ({total} Arten enthalten). Bitte Filter lockern.",
      loadingRecording: "Lade Aufnahme…",
    },
    audioError: {
      noKey: "Kein xeno-canto API-Key hinterlegt. Über das Zahnrad oben rechts einen Key eintragen (kostenloser Account auf xeno-canto.org).",
      noRecordings: "Für diese Art sind auf xeno-canto aktuell keine Aufnahmen zu finden (auch nicht außerhalb Deutschlands) – kein technischer Fehler, es gibt schlicht keinen Treffer für diese Art in der Datenbank.",
      network: "Aufnahme konnte nicht geladen werden – vermutlich ein Netzwerk- oder Bot-Schutz-Problem (xeno-canto blockiert manchmal automatisierte Anfragen). Die Seite der Art lässt sich manuell öffnen.",
      generic: "Aufnahme konnte nicht geladen werden ({msg}). Die Seite der Art lässt sich manuell öffnen.",
      viewManually: "Art manuell auf xeno-canto.org ansehen →",
    },
    audio: {
      unknownType: "Aufnahmetyp unbekannt",
      lengthLabel: " · Länge: {length}",
      recordingBy: "Aufnahme: {recordist} · xeno-canto.org",
      unknownRecordist: "unbekannt",
      source: "Quelle",
      license: ", Lizenz: ",
      licenseLink: "CC",
      remarksLabel: "Bemerkung der/des Aufnehmenden: „{remarks}\"",
      neighborNote: "Hinweis: keine deutsche Aufnahme gefunden, zeige eine Aufnahme aus dem Nachbarland {country}.",
      europeNote: "Hinweis: keine Aufnahme aus Deutschland oder den Nachbarländern gefunden, zeige eine Aufnahme aus einem anderen europäischen Land ({country}).",
      worldNote: "Hinweis: keine europäische Aufnahme gefunden, zeige eine Aufnahme von außerhalb Europas ({country}).",
      longRecordingHint: "Diese Aufnahme ist {length} lang. xeno-canto erzeugt das Sonogramm bei längeren Aufnahmen aber offenbar nur für die ersten 2 Minuten. Der Cursor läuft daher bis zum rechten Rand und bleibt dort stehen, auch wenn die Audiodatei danach noch weiterläuft.",
      normalRecordingHint: "Das Sonogramm zeigt die gesamte Aufnahme in fester Höhe (nicht nur die Zielart – Hintergrundgeräusche oder andere Vögel können mit abgebildet sein). Bei längeren Aufnahmen scrollt die Ansicht automatisch mit, sobald die rote Linie den sichtbaren Rand erreicht.",
      unknownSampleRateSuffix: " Achtung: Sample-Rate dieser Aufnahme unbekannt, y-Achse zeigt daher keine kHz-Werte.",
      altRecBtn: "🔄 Andere Aufnahme",
      excludeBtnDefault: "🚫 Diese Aufnahme ausschließen (kein Ton hörbar, falsche Art o.ä.)",
      playError: 'Wiedergabe fehlgeschlagen. Das kann an einer Autoplay-Sperre liegen (einfach nochmal auf ▶ klicken) oder daran, dass dein Browser (v.a. Safari auf Mac/iPhone) genau diese Aufnahmedatei nicht unterstützt. Falls Letzteres: bitte "🔄 Andere Aufnahme" probieren, oder den Direktlink unten öffnen.',
      openFileLink: "Audiodatei öffnen",
      autoplayBlocked: "Automatische Wiedergabe wurde vom Browser blockiert – bitte einmal auf ▶ klicken.",
      blobFallbackTrying: "Wiedergabe versucht es auf einem zweiten Weg (v.a. für Safari) – einen Moment…",
    },
    swap: {
      loading: "Lade andere Aufnahme…",
      error: "Konnte keine andere Aufnahme laden ({msg}).",
    },
    score: { label: "Punktestand: {correct} / {total}" },
    details: {
      confusionHint: "⚠️ {name} kann akustisch mit <strong>{partner}</strong> verwechselt werden.",
      jumpConfusionBtn: "🔁 Verwechslungsarten vergleichen",
      moreAbout: "ℹ️ Mehr über {name} erfahren",
      lessInfo: "▲ Weniger anzeigen",
      imageLoading: "Bild wird geladen…",
      frequencyTag: "Häufigkeit: {v}",
      difficultyTag: "Schwierigkeit: {v}",
      groupTag: "Gruppe: {v}",
      areasLabel: "Vorkommen in euren Gebieten (eBird-Hotspot-Meldungen, kumulativ):",
      noAreaData: "bisher keine eBird-Meldung in den gesampelten Gebieten",
      confusionDangerPrefix: "Verwechslungsgefahr – {title}:",
      jumpValidationBtn: "🔍 Alle xeno-canto-Aufnahmen dieser Art durchgehen",
      imageCaption: "Bild: Wikipedia",
      imageCredit: "Foto: {artist} ({license}), via Wikimedia Commons",
      imageLicenseUnknown: "Lizenz unbekannt",
      imageSourceLink: "Quelle ansehen →",
      notYetTranslated: "(Text noch nicht ins Englische übersetzt, zeige deutschen Originaltext)",
    },
    confusion: {
      pairLabel: "Verwechslungspaar",
      loadingRecording: "Lade Aufnahme…",
      noApiKey: "Kein API-Key hinterlegt (Zahnrad oben rechts).",
      cannotAutoLoad: "Aufnahme nicht automatisch ladbar.",
      viewManually: "manuell auf xeno-canto.org ansehen →",
    },
    validation: {
      searchLabel: "Art suchen (deutsch, englisch oder lateinisch)",
      searchPlaceholder: "z.B. Kohlmeise, Great Tit, Parus major",
      searchBtn: "Suchen",
      initialHint: "Oben eine Art auswählen, um alle xeno-canto-Aufnahmen dazu einzeln durchzugehen.",
      noMatch: "Keine Art gefunden – bitte deutschen, englischen oder lateinischen Namen (auch als Teilstring) versuchen.",
      multipleMatches: '{count} Treffer, zeige „{name}" – für eine andere Art genauer eingeben.',
      loadingRecordings: "Lade Aufnahmen… (bei sehr häufigen Arten mit vielen xeno-canto-Aufnahmen kann das etwas dauern)",
      noKey: "Kein xeno-canto API-Key hinterlegt. Über das Zahnrad oben rechts einen Key eintragen.",
      noRecordings: "Für diese Art sind auf xeno-canto aktuell keine Aufnahmen zu finden.",
      genericError: "Aufnahmen konnten nicht geladen werden ({msg}).",
      habitatLabel: "Habitat",
      habitatSpecialistNote: "Spezialist für Plausibilitätscheck: {tags}",
      seasonLabel: "Ruf-/Gesangssaison",
      areasLabel: "Vorkommen in euren Gebieten",
      noDataYet: "keine Angabe (noch nicht recherchiert)",
      yearRoundNoSeason: "ganzjährig aktiv / keine ausgeprägte Rufsaison bekannt",
      viewOnXc: "Art auf xeno-canto.org ansehen →",
      viewOnEbird: "Art auf eBird ansehen →",
      noRecordingsFound: "Für diese Art sind auf xeno-canto keine Aufnahmen zu finden.",
      prevBtn: "← Vorherige",
      nextBtn: "Nächste →",
      counter: "{i} / {n}",
      excludedBadge: "🚫 Diese Aufnahme ist aktuell ausgeschlossen (wird im Lernmodus nicht mehr gezeigt).",
      excludeBtn: "🚫 Diese Aufnahme ausschließen (kein Ton hörbar, falsche Art o.ä.)",
      unexcludeBtn: "↩️ Ausschluss aufheben",
    },
    progress: {
      title: "Dein Fortschritt",
      description: 'Arten, die du sicher erkennst (Serie von mehreren richtigen Antworten), werden seltener abgefragt – neue oder noch unsichere Arten häufiger. Basiert nur auf dem Modus „Arten erkennen", lokal in diesem Browser gespeichert.',
      noAnswers: 'Noch keine Antworten erfasst – leg im Modus „Arten erkennen" los.',
      weeklyAll: "Verlauf pro Woche – alle {n} Arten",
      weeklyFilter: "Verlauf pro Woche – aktueller Filter ({n} Arten)",
      filterHint: "Bezieht sich auf die gerade in den Filtern oben ausgewählte Artenmenge (Häufigkeit/Schwierigkeit/Gebiet/Gruppe/Lerngruppe/Anzahl Arten zum Start).",
      allSpeciesDetail: "Alle Arten im Detail",
      colSpecies: "Art", colAttempts: "Versuche", colCorrect: "Richtig", colStatus: "Status", colLastPracticed: "Zuletzt geübt",
      resetBtn: "Fortschritt zurücksetzen",
      resetConfirm: "Gesamten Lernfortschritt (inkl. Verlauf) in diesem Browser wirklich zurücksetzen?",
      practicedThisWeek: "{n} geübt",
      noneThisWeek: "–",
      statusNew: "neu", statusLearning: "lernen", statusGood: "gut", statusMastered: "sicher",
      chartHint: "Balken = Lernstand aller {n} Demo-Arten am Ende der jeweiligen Woche (kumulativ). Text darunter = diese Woche tatsächlich geübte Arten und Trefferquote.",
    },
    footer: {
      text: 'Audioquelle: <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a> (Creative-Commons-lizenzierte Aufnahmen, Namensnennung wird jeweils angezeigt). Artenliste: eigene Taxonomie-Tabelle. Gebietsvorkommen: <a href="https://ebird.org" target="_blank" rel="noopener">eBird.org</a> (kumulative Hotspot-Meldungen im gebietsangepassten Suchradius – kein Ersatz für echtes Monitoring). Wichtige Einschränkungen zur Datenqualität: siehe Tab „⚠️ Hinweise".',
    },
    disclaimer: {
      heading: "⚠️ Wichtige Hinweise zu dieser App",
      intro: "Bitte vor der Nutzung lesen – besonders, wenn du die App zur Validierung echter Monitoring-Ergebnisse einsetzt.",
      s1h: "KI-gestützte Inhalte", s1: "Große Teile der Artdaten in dieser App (Häufigkeits-/Schwierigkeitseinstufung, Hintergrundtexte, Ruf-/Gesangsbeschreibungen) wurden mit Unterstützung von KI (Claude) recherchiert und formuliert – auf Basis öffentlicher Quellen wie NABU, BfN, DDA, IUCN, Wikipedia und Landesämtern, aber nicht durchgehend von Ornitholog:innen gegengeprüft. Insbesondere bei selten behandelten Arten sind Fehler möglich.",
      s2h: "Quellen im Detail", s2: "Konkret genutzte Quellen für Häufigkeit, Schwierigkeit, Verbreitung und Ruf-/Gesangsbeschreibungen: NABU (Naturschutzbund Deutschland), BfN (Bundesamt für Naturschutz), DDA (Dachverband Deutscher Avifaunisten), IUCN Red List, Wikipedia sowie diverse Landesämter für Umwelt/Naturschutz. Gebietsvorkommen stammen von eBird.org (Cornell Lab of Ornithology), Audioaufnahmen von xeno-canto.org, Artfotos von Wikipedia/Wikimedia Commons (Fotograf:in und Lizenz werden jeweils unter dem Bild angezeigt). Wichtig: die Hintergrundtexte sind keine Kopien dieser Quellen, sondern eigenständige, mit KI-Unterstützung aus mehreren Quellen zusammengefasste Texte in eigenen Worten. Bei Unstimmigkeiten gelten die verlinkten Originalquellen als maßgeblich.",
      s3h: "Datenqualität im Detail", s3: "eBird-Gebietsvorkommen sind kumulative Meldungen (jemals dort beobachtet), keine aktuelle Bestandsaufnahme – eine Art kann als „vorkommend\" markiert sein, obwohl sie dort nur einmal vor Jahren gemeldet wurde. Die Artbestimmung der xeno-canto-Aufnahmen stammt von der jeweils aufnehmenden Person und ist nicht durch die App geprüft – gelegentliche Fehlbestimmungen sind möglich (nutzt den „Ausschließen\"-Button, wenn dir eine Aufnahme fragwürdig vorkommt). Häufigkeits- und Schwierigkeitsangaben sind fortlaufend verbesserte Einschätzungen, kein amtlicher Status.",
      s4h: "Mehrstimmiger Auftritt: mehrere Arten in einer Aufnahme", s4: "Vögel halten sich leider nicht an unsere Quiz-Regeln: In vielen xeno-canto-Aufnahmen ist im Hintergrund noch die ein oder andere weitere Stimme zu hören – manchmal sogar eine Art, die ebenfalls unter den Antwortoptionen steht. Hör also ruhig zweimal hin und achte darauf, welche Stimme am besten zum Sonogramm passt, bevor du dich entscheidest. Wir übernehmen die Artbestimmung unverändert von xeno-canto und prüfen nicht selbst nach, wer im Hintergrund noch mitzwitschert – das liegt schlicht außerhalb dessen, was wir als App beeinflussen können. Bei eindeutig verwirrenden Aufnahmen hilft wie immer der „Ausschließen\"-Button.",
      s5h: "Trainingstool, kein Ersatz für Monitoring", s5: "Diese App dient dem Einüben und Auffrischen von Rufkenntnissen sowie als Hilfsmittel bei der manuellen Validierung von automatisierten Erkennungen (z.B. BirdNET). Sie ersetzt keine fachliche Bestimmung, keine offizielle Artenliste und keine wissenschaftliche Auswertung.",
      s6h: "Keine Gewähr", s6: "Die App wird ohne Gewähr für Richtigkeit oder Vollständigkeit bereitgestellt. Bei Zweifeln an einer Angabe: bitte unabhängig gegenprüfen (z.B. über die verlinkten Quellen) und uns gerne Bescheid geben.",
      s7h: "Fehler gefunden?", s7: "Rückmeldungen sind sehr willkommen – bitte an {email} melden.",
    },
    anleitung: {
      heading: "❓ Kurzanleitung",
      s1h: "1. xeno-canto API-Key besorgen (einmalig nötig)",
      s1: '<ol><li>Kostenlosen Account anlegen auf <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a> (oben rechts „Sign in / Register").</li><li>Nach dem Einloggen oben rechts auf deinen Nutzernamen → „Your account" klicken.</li><li>Dort den Menüpunkt „API key" öffnen – dort steht dein persönlicher Key (eine Zeichenkette).</li><li>Key kopieren, in dieser App oben rechts auf das ⚙️-Zahnrad klicken, Key einfügen, „Speichern".</li></ol><p class="hint">Der Key wird nur lokal in deinem Browser gespeichert (localStorage), nicht an uns übertragen. Ohne Key funktioniert die App nur eingeschränkt (keine echten Audio-Aufnahmen).</p>',
      s2h: "2. Die vier Modi",
      s2: "<ul><li><strong>Arten erkennen</strong>: Quiz-Modus – Aufnahme anhören, richtige Art aus mehreren Optionen auswählen. Mit den Filtern oben (Häufigkeit, Schwierigkeit, Gebiet, Artengruppe, Anzahl, Lerngruppe) lässt sich der Umfang einschränken.</li><li><strong>Verwechslungsarten unterscheiden</strong>: zwei leicht verwechselbare Arten direkt nebeneinander anhören und vergleichen.</li><li><strong>🔍 Validieren</strong>: gezielt eine bestimmte Art suchen und alle xeno-canto-Aufnahmen dazu der Reihe nach durchgehen – gedacht für den Abgleich von automatisierten Erkennungsergebnissen (z.B. BirdNET) mit der echten Aufnahme.</li><li><strong>📊 Fortschritt</strong>: zeigt, welche Arten du schon sicher erkennst und wie sich das über die Zeit entwickelt hat.</li></ul>",
      s3h: "3. Nützliche Kleinigkeiten",
      s3: '<ul><li>🚫 „Diese Aufnahme ausschließen": falls eine Aufnahme keinen Ton enthält oder die Art falsch bestimmt wirkt – merkt sich die App dauerhaft (nur in diesem Browser).</li><li>Sprache umschalten: Button oben rechts neben dem Zahnrad.</li></ul>',
      s4h: "4. App installieren (optional)",
      s4: '<p>Die App lässt sich wie eine eigenständige App installieren – sie startet dann z.B. per Doppelklick auf ein Icon, ganz ohne Adressleiste drumherum.</p><p><strong>Am Computer (Chrome oder Edge):</strong> Seite öffnen, dann rechts in der Adressleiste auf das Installieren-Symbol klicken (ein kleiner Bildschirm mit Pfeil nach unten, meist ganz rechts neben der URL) und „Installieren" bestätigen. Falls das Symbol nicht zu sehen ist: oben rechts auf die drei Punkte („⋮") klicken → „App installieren".</p><p><strong>Am Handy (Android, Chrome):</strong> Seite öffnen, oben rechts auf die drei Punkte tippen → „Zum Startbildschirm hinzufügen" (oder „App installieren").</p><p><strong>Am iPhone/iPad (Safari):</strong> Seite öffnen, unten das Teilen-Symbol antippen (Quadrat mit Pfeil nach oben) → nach unten scrollen → „Zum Home-Bildschirm".</p><p class="hint">Browser-Menüs ändern sich gelegentlich, und nicht jeder Browser unterstützt die Installation gleich gut (in Firefox z.B. nur eingeschränkt). Findest du das Symbol oder den Menüpunkt nicht: einfach „[Browsername] Web-App installieren" googeln, oder frag ChatGPT oder Claude – die können dich Schritt für Schritt durch dein konkretes Gerät führen.</p>',
      s5h: "Fragen?", s5: "Bei Problemen oder Fragen: {email}",
    },
  },
  en: {
    header: { title: "Bird Song Trainer", badge: "Prototype", settingsBtn: "Settings" },
    tabs: {
      erkennen: "Identify Species",
      unterscheiden: "Compare Similar Species",
      validieren: "🔍 Validate",
      fortschritt: "📊 Progress",
      anleitung: "❓ Guide",
      disclaimer: "⚠️ Disclaimer",
    },
    nav: {
      showBtn: "📋 Show options",
      hideBtn: "📋 Hide options",
    },
    settings: {
      title: "Settings",
      apiKeyIntro: 'A free <strong>xeno-canto API key</strong> is needed to load real recordings (create an account at <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a>, the key then appears under "Your account" → "API key"). A more detailed guide is available on the Guide tab above.',
      apiKeyLabel: "xeno-canto API key",
      apiKeyPlaceholder: "your-api-key",
      apiKeyHint: "The key is only stored locally in your browser, never sent to us.",
      maxRecLabel: "Recordings to load per species (max.)",
      maxRecHint: "Higher value = more variety, but slightly slower first load per species.",
      excludedLabel: "Excluded recordings (e.g. because no sound was audible, or the species seemed misidentified):",
      resetExcludedBtn: "Reset exclusion list",
      learnGroupLabel: "Learning group (for teams)",
      learnGroupNone: "No split – all species",
      learnGroupA: "Group A",
      learnGroupB: "Group B",
      learnGroupC: "Group C",
      learnGroupHintIntro: "If several of you use the app and don't want to all start with the same species: each person picks their letter here once. The three groups are fixed and balanced (equal numbers of easy/medium/hard species from every bird family) –",
      learnGroupHintNone: "currently: no split, all {n} species.",
      learnGroupHintGroup: "currently: group {g} with {n} species.",
      saveBtn: "Save",
      closeBtn: "Close",
      versionLabel: "App version:",
      checkUpdateBtn: "Check for updates",
    },
    update: {
      available: "A new version of the app is available.",
      reloadBtn: "Reload now",
      checking: "Checking for updates …",
      upToDate: "You're already using the latest version.",
      checkFailed: "Check failed (maybe offline) – please try again later.",
    },
    filters: {
      frequency: "Frequency", freq_haeufig: "common", freq_mittel: "moderate", freq_selten: "rare", freq_sehr_selten: "very rare",
      difficulty: "Difficulty", diff_leicht: "easy", diff_mittel: "medium", diff_schwer: "hard",
      area: "Area", area_all: "Nationwide (Germany)", area_kern11: "all 11 areas",
      group: "Species group", group_all: "all groups",
      count: "Number of species to start", count_all: "all",
      names: "Show names", names_de: "DE", names_en: "EN", names_sci: "Lat",
      showBtn: "🔧 Show filters", hideBtn: "🔧 Hide filters",
    },
    erkennen: {
      loadingQuestion: "Loading question…",
      autoplayLabel: "Autoplay",
      nextBtn: "Next recording",
      tooFewSpecies: "Too few species for this filter combination in the current species set ({total} species included). Please loosen the filters.",
      loadingRecording: "Loading recording…",
    },
    audioError: {
      noKey: "No xeno-canto API key set. Enter one via the gear icon top right (free account at xeno-canto.org).",
      noRecordings: "No recordings currently found for this species on xeno-canto (not even outside Germany) – not a technical error, there's simply no match for this species in the database.",
      network: "Recording could not be loaded – likely a network or bot-protection issue (xeno-canto sometimes blocks automated requests). You can open the species page manually.",
      generic: "Recording could not be loaded ({msg}). You can open the species page manually.",
      viewManually: "View species manually on xeno-canto.org →",
    },
    audio: {
      unknownType: "Recording type unknown",
      lengthLabel: " · Length: {length}",
      recordingBy: "Recording: {recordist} · xeno-canto.org",
      unknownRecordist: "unknown",
      source: "Source",
      license: ", License: ",
      licenseLink: "CC",
      remarksLabel: 'Recordist\'s remark: "{remarks}"',
      neighborNote: "Note: no German recording found, showing a recording from the neighboring country {country}.",
      europeNote: "Note: no recording found from Germany or neighboring countries, showing a recording from another European country ({country}).",
      worldNote: "Note: no European recording found, showing a recording from outside Europe ({country}).",
      longRecordingHint: "This recording is {length} long. xeno-canto apparently only generates the sonogram for the first 2 minutes on longer recordings. The cursor therefore runs to the right edge and stays there, even though the audio file continues afterwards.",
      normalRecordingHint: "The sonogram shows the whole recording at a fixed height (not just the target species – background noise or other birds may be visible too). On longer recordings the view scrolls automatically once the red line reaches the visible edge.",
      unknownSampleRateSuffix: " Note: sample rate of this recording unknown, so the y-axis shows no kHz values.",
      altRecBtn: "🔄 Different recording",
      excludeBtnDefault: "🚫 Exclude this recording (no sound audible, wrong species, etc.)",
      playError: 'Playback failed. This can be due to your browser blocking autoplay (just click ▶ again), or your browser (especially Safari on Mac/iPhone) not supporting this particular recording file. If it\'s the latter: please try "🔄 Different recording", or open the direct link below.',
      openFileLink: "Open audio file",
      autoplayBlocked: "Automatic playback was blocked by the browser – please click ▶ once.",
      blobFallbackTrying: "Trying a second way to load this (mainly helps Safari) – one moment…",
    },
    swap: {
      loading: "Loading a different recording…",
      error: "Could not load a different recording ({msg}).",
    },
    score: { label: "Score: {correct} / {total}" },
    details: {
      confusionHint: "⚠️ {name} can be confused acoustically with <strong>{partner}</strong>.",
      jumpConfusionBtn: "🔁 Compare similar species",
      moreAbout: "ℹ️ Learn more about {name}",
      lessInfo: "▲ Show less",
      imageLoading: "Loading image…",
      frequencyTag: "Frequency: {v}",
      difficultyTag: "Difficulty: {v}",
      groupTag: "Group: {v}",
      areasLabel: "Occurrence in your areas (eBird hotspot reports, cumulative):",
      noAreaData: "no eBird report so far in the sampled areas",
      confusionDangerPrefix: "Risk of confusion – {title}:",
      jumpValidationBtn: "🔍 Go through all xeno-canto recordings of this species",
      imageCaption: "Image: Wikipedia",
      imageCredit: "Photo: {artist} ({license}), via Wikimedia Commons",
      imageLicenseUnknown: "license unknown",
      imageSourceLink: "View source →",
      notYetTranslated: "(text not yet translated into English, showing the German original)",
    },
    confusion: {
      pairLabel: "Species pair",
      loadingRecording: "Loading recording…",
      noApiKey: "No API key set (gear icon top right).",
      cannotAutoLoad: "Recording could not be loaded automatically.",
      viewManually: "view manually on xeno-canto.org →",
    },
    validation: {
      searchLabel: "Search species (German, English or scientific name)",
      searchPlaceholder: "e.g. Kohlmeise, Great Tit, Parus major",
      searchBtn: "Search",
      initialHint: "Select a species above to go through all its xeno-canto recordings one by one.",
      noMatch: "No species found – please try the German, English or scientific name (partial matches work too).",
      multipleMatches: '{count} matches, showing "{name}" – enter more specifically for a different species.',
      loadingRecordings: "Loading recordings… (can take a moment for very common species with many xeno-canto recordings)",
      noKey: "No xeno-canto API key set. Enter one via the gear icon top right.",
      noRecordings: "No recordings currently found for this species on xeno-canto.",
      genericError: "Recordings could not be loaded ({msg}).",
      habitatLabel: "Habitat",
      habitatSpecialistNote: "Specialist for plausibility check: {tags}",
      seasonLabel: "Calling/singing season",
      areasLabel: "Occurrence in your areas",
      noDataYet: "no data (not yet researched)",
      yearRoundNoSeason: "active year-round / no distinct calling season known",
      viewOnXc: "View species on xeno-canto.org →",
      viewOnEbird: "View species on eBird →",
      noRecordingsFound: "No recordings found for this species on xeno-canto.",
      prevBtn: "← Previous",
      nextBtn: "Next →",
      counter: "{i} / {n}",
      excludedBadge: "🚫 This recording is currently excluded (no longer shown in learning mode).",
      excludeBtn: "🚫 Exclude this recording (no sound audible, wrong species, etc.)",
      unexcludeBtn: "↩️ Undo exclusion",
    },
    progress: {
      title: "Your Progress",
      description: 'Species you recognize reliably (a streak of several correct answers) are asked less often – new or still-uncertain species more often. Based only on "Identify Species" mode, stored locally in this browser.',
      noAnswers: 'No answers recorded yet – get started in "Identify Species" mode.',
      weeklyAll: "Progress per week – all {n} species",
      weeklyFilter: "Progress per week – current filter ({n} species)",
      filterHint: "Refers to the species set currently selected in the filters above (frequency/difficulty/area/group/learning group/number of species to start).",
      allSpeciesDetail: "All species in detail",
      colSpecies: "Species", colAttempts: "Attempts", colCorrect: "Correct", colStatus: "Status", colLastPracticed: "Last practiced",
      resetBtn: "Reset progress",
      resetConfirm: "Really reset your entire learning progress (including history) in this browser?",
      practicedThisWeek: "{n} practiced",
      noneThisWeek: "–",
      statusNew: "new", statusLearning: "learning", statusGood: "good", statusMastered: "mastered",
      chartHint: "Bars = learning status of all {n} demo species at the end of each week (cumulative). Text below = species actually practiced that week and success rate.",
    },
    footer: {
      text: 'Audio source: <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a> (Creative Commons licensed recordings, attribution shown for each). Species list: own taxonomy table. Area occurrence: <a href="https://ebird.org" target="_blank" rel="noopener">eBird.org</a> (cumulative hotspot reports within an area-adjusted search radius – not a substitute for real monitoring). Important data-quality caveats: see the "⚠️ Disclaimer" tab.',
    },
    disclaimer: {
      heading: "⚠️ Important notes about this app",
      intro: "Please read before use – especially if you're using the app to validate real monitoring results.",
      s1h: "AI-assisted content", s1: "Large parts of the species data in this app (frequency/difficulty classification, background texts, call/song descriptions) were researched and written with the help of AI (Claude) – based on public sources such as NABU, BfN, DDA, IUCN, Wikipedia and state agencies, but not comprehensively cross-checked by ornithologists. Errors are possible, especially for less commonly covered species.",
      s2h: "Sources in detail", s2: "Sources actually used for frequency, difficulty, distribution and call/song descriptions: NABU (German nature conservation association), BfN (German Federal Agency for Nature Conservation), DDA (German Ornithologists' Association), IUCN Red List, Wikipedia, and various German state environmental agencies. Area occurrence comes from eBird.org (Cornell Lab of Ornithology), audio recordings from xeno-canto.org, species photos from Wikipedia/Wikimedia Commons (photographer and license are shown under each photo). Important: the background texts are not copies of these sources but independent summaries written in our own words, with AI assistance, drawing on multiple sources. In case of discrepancies, the linked original sources take precedence.",
      s3h: "Data quality in detail", s3: "eBird area occurrence is cumulative reporting (ever observed there), not a current population count – a species can be marked as \"present\" even if it was only reported there once, years ago. Species identification on xeno-canto recordings comes from the person who recorded it and is not verified by this app – occasional misidentifications are possible (use the \"Exclude\" button if a recording seems questionable to you). Frequency and difficulty ratings are ongoing, improving estimates, not an official status.",
      s4h: "A crowded stage: more than one species per recording", s4: "Birds don't follow our quiz rules: many xeno-canto recordings have one or more other voices audible in the background – sometimes even a species that's also listed among the answer options. So feel free to listen twice, and pay attention to which voice actually matches the sonogram before deciding. We take the species identification directly from xeno-canto as given and don't independently verify who else might be singing along in the background – that's simply outside what we, as an app, can control. As always, the \"Exclude\" button is there for recordings that are genuinely too confusing.",
      s5h: "A training tool, not a substitute for monitoring", s5: "This app is meant for practicing and refreshing call/song recognition, and as an aid when manually validating automated detections (e.g. BirdNET). It does not replace expert identification, an official species list, or scientific analysis.",
      s6h: "No warranty", s6: "This app is provided without warranty of correctness or completeness. If you doubt a piece of information: please cross-check it independently (e.g. via the linked sources) and let us know.",
      s7h: "Found an error?", s7: "Feedback is very welcome – please report it to {email}.",
    },
    anleitung: {
      heading: "❓ Quick guide",
      s1h: "1. Get an xeno-canto API key (one-time setup)",
      s1: '<ol><li>Create a free account at <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a> ("Sign in / Register" top right).</li><li>After logging in, click your username top right → "Your account".</li><li>Open the "API key" menu item there – your personal key (a string of characters) is shown.</li><li>Copy the key, click the ⚙️ gear icon top right in this app, paste the key, "Save".</li></ol><p class="hint">The key is only stored locally in your browser (localStorage), never sent to us. Without a key the app only works in a limited way (no real audio recordings).</p>',
      s2h: "2. The four modes",
      s2: "<ul><li><strong>Identify Species</strong>: quiz mode – listen to a recording, pick the right species from several options. The filters above (frequency, difficulty, area, species group, count, learning group) narrow down the scope.</li><li><strong>Compare Similar Species</strong>: listen to and compare two easily-confused species side by side.</li><li><strong>🔍 Validate</strong>: search for a specific species and go through all its xeno-canto recordings one by one – meant for cross-checking automated detection results (e.g. BirdNET) against the actual recording.</li><li><strong>📊 Progress</strong>: shows which species you already recognize reliably and how that has developed over time.</li></ul>",
      s3h: "3. Handy details",
      s3: '<ul><li>🚫 "Exclude this recording": if a recording has no audible sound or the species seems misidentified – the app remembers this permanently (only in this browser).</li><li>Switch language: button top right next to the gear icon.</li></ul>',
      s4h: "4. Install the app (optional)",
      s4: '<p>The app can be installed like a standalone app – it then opens e.g. by double-clicking an icon, with no address bar around it.</p><p><strong>On a computer (Chrome or Edge):</strong> open the page, then click the install icon in the address bar (a small screen with a down arrow, usually at the far right of the URL) and confirm "Install". If you don\'t see the icon: click the three dots ("⋮") top right → "Install app".</p><p><strong>On a phone (Android, Chrome):</strong> open the page, tap the three dots top right → "Add to Home screen" (or "Install app").</p><p><strong>On iPhone/iPad (Safari):</strong> open the page, tap the Share icon at the bottom (a square with an arrow pointing up) → scroll down → "Add to Home Screen".</p><p class="hint">Browser menus change from time to time, and not every browser supports installation equally well (Firefox, for example, only in a limited way). If you can\'t find the icon or menu item: just search "[browser name] install web app", or ask ChatGPT or Claude – they can walk you step by step through your specific device.</p>',
      s5h: "Questions?", s5: "For problems or questions: {email}",
    },
  },
};

const state = {
  mode: "erkennen",
  lang: "de",              // "de" | "en" – s. Abschnitt "---------- i18n ----------"
  score: { correct: 0, total: 0 },
  currentQuestion: null,
  recordingListCache: {}, // sciName -> array of recording objects (Lernmodus, gedeckelt)
  validationRecordingCache: {}, // sciName -> array of recording objects (Validierungs-Seite, ungedeckelt/vollständig)
  lastShownId: {},        // sciName -> zuletzt gezeigte xcId (um Wiederholung zu vermeiden)
  wikiImageCache: {},     // sciName -> { url, artist, license, sourceUrl } | null
  stats: {},              // speciesId -> { attempts, correct, streak, lastSeen }
  answerLog: [],          // [{ speciesId, correct, ts }] – für Verlauf über Zeit
  questionRequestId: 0,   // Schutz gegen Race Conditions bei schnellem Klicken
};

// ---------- i18n ----------
// Einfacher, selbstgebauter Übersetzungsmechanismus (kein Framework nötig):
// - STRINGS enthält alle UI-Texte (Buttons, Labels, Meldungen, Disclaimer-/
//   Anleitungs-Seite) doppelt, unter "de" und "en".
// - t("a.b.c", {var: "..."}) holt den Text per Punkt-Pfad, ersetzt optional
//   {platzhalter} durch vars, fällt bei fehlendem Schlüssel auf Deutsch zurück
//   (nie ein rohes "undefined" in der UI).
// - Artdaten (species-data.js) werden NICHT hier übersetzt, sondern haben
//   eigene Parallel-Strukturen: AREAS_EN/HABITAT_LABELS_EN/GROUP_ORDER_EN
//   (Kurztexte, immer vorhanden) sowie sp.background_en und
//   CONFUSION_NOTES[key].title_en/note_en (lange Fachtexte, werden
//   schrittweise ergänzt – s. areaName()/groupLabel()/habitatLabel()/
//   speciesBackground()/confusionTitle()/confusionNote() unten, die bei
//   fehlender Übersetzung automatisch auf den deutschen Text zurückfallen
//   und das per Hinweistext kenntlich machen).
const LANG_KEY = "vogeltrainer_lang";

function getStoredLang() {
  const v = localStorage.getItem(LANG_KEY);
  return v === "en" ? "en" : "de";
}

// ---------- Sicherheit: HTML-Escaping für extern eingebettete Daten ----------
// xeno-canto ist eine offene, community-befüllte Datenbank – Felder wie Aufnehmer-Name (rec),
// Bemerkungen (rmk), Lizenz-URL (lic) und Klangtyp (type) sind von den Hochladenden frei editierbar
// und NICHT von uns kontrolliert. Diese App rendert solche Werte per innerHTML bzw. als href/src.
// Ohne Escaping wäre ein böswillig präparierter xeno-canto-Eintrag (z.B. Aufnehmer-Name
// "<img src=x onerror=...>") ein Stored-XSS-Vektor: das Skript liefe im Ursprung dieser App und
// könnte u.a. den in localStorage gespeicherten xeno-canto-API-Key der Nutzerin auslesen.
// escapeHtml() neutralisiert HTML-Metazeichen für Text-/Attribut-Inhalte; safeHref() lässt für
// href/src zusätzlich nur http(s)- bzw. protokollrelative URLs zu, damit z.B. eine als Lizenz-URL
// eingeschleuste "javascript:..."-Adresse nicht ausgeführt werden kann.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function safeHref(url) {
  if (typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) return escapeHtml(trimmed);
  return "#";
}

function t(key, vars) {
  const path = key.split(".");
  const lookup = (dict) => path.reduce((node, p) => (node && typeof node === "object") ? node[p] : undefined, dict);
  let val = lookup(STRINGS[state.lang]);
  if (val === undefined) val = lookup(STRINGS.de); // Fallback: fehlende EN-Strings zeigen deutschen Text statt nichts
  if (typeof val !== "string") return key;
  if (vars) {
    // Platzhalter-Werte werden IMMER escaped (s. Sicherheits-Kommentar oben) – die STRINGS-Vorlage
    // selbst darf weiterhin bewusst HTML enthalten (z.B. settings.apiKeyIntro), nur die eingesetzten
    // Werte nicht. Ein href, der einen dynamischen Wert enthalten muss (z.B. audio.playError früher),
    // wird deshalb bewusst NICHT über {platzhalter} gebaut, sondern separat mit safeHref() zusammengesetzt.
    return val.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? escapeHtml(vars[k]) : m));
  }
  return val;
}

// Übersetzte Art-/Gebiets-/Gruppen-Hilfsfelder: fallen mangels Übersetzung
// automatisch auf den deutschen Wert zurück (nie eine leere/kaputte Anzeige).
function areaName(code) {
  return state.lang === "en" ? (AREAS_EN[code] || AREAS[code] || code) : (AREAS[code] || code);
}
// Kurzform für die Gebiets-Chips (s. AREAS_SHORT/AREAS_SHORT_EN in species-data.js) – voller Name
// bleibt über areaName() als title-Tooltip verfügbar.
function areaShortLabel(code) {
  const src = state.lang === "en" ? AREAS_SHORT_EN : AREAS_SHORT;
  return src[code] || areaName(code);
}
function habitatLabel(tag) {
  const src = state.lang === "en" ? HABITAT_LABELS_EN : HABITAT_LABELS;
  return src[tag] || HABITAT_LABELS[tag] || tag;
}
function groupLabel(deName) {
  if (!deName) return deName;
  return state.lang === "en" ? (GROUP_ORDER_EN[deName] || deName) : deName;
}
// sp.background_en wird schrittweise ergänzt (großes Übersetzungsprojekt,
// s. CLAUDE.md) – bis eine Art an der Reihe war, zeigt EN-Modus den
// deutschen Text plus kurzem Hinweis, statt nichts oder Deutsch ohne Hinweis.
function speciesBackground(sp) {
  if (state.lang !== "en") return { text: sp.background, translated: true };
  if (sp.background_en) return { text: sp.background_en, translated: true };
  return { text: sp.background, translated: false };
}
function confusionTitle(info) {
  return state.lang === "en" ? (info.title_en || info.title) : info.title;
}
function confusionNote(info) {
  if (state.lang !== "en") return { text: info.note, translated: true };
  if (info.note_en) return { text: info.note_en, translated: true };
  return { text: info.note, translated: false };
}

// Läuft über alle statisch in index.html stehenden Texte (data-i18n-*
// Attribute) und setzt sie auf die aktuelle Sprache. Wird beim Start und bei
// jedem Sprachwechsel aufgerufen.
function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    // innerHTML statt textContent: manche STRINGS-Werte (z.B. settings.apiKeyIntro,
    // footer.text) enthalten bewusst HTML (<strong>, <a>) - Inhalt kommt nur aus
    // unserem eigenen STRINGS-Objekt, nie aus Nutzereingaben, daher unbedenklich.
    el.innerHTML = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.documentElement.lang = state.lang;
  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) langBtn.textContent = state.lang === "de" ? "EN" : "DE";
}

// Sprachwechsel: State + Persistenz + statische Texte sofort aktualisieren,
// danach die aktuell sichtbare Ansicht neu rendern (dynamische Texte stecken
// in den render*-Funktionen, nicht im DOM).
function setupLangToggle() {
  state.lang = getStoredLang();
  const btn = document.getElementById("langToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    state.lang = state.lang === "de" ? "en" : "de";
    localStorage.setItem(LANG_KEY, state.lang);
    applyStaticTranslations();
    populateAreaFilter();
    populateGroupFilter();
    populateConfusionSelect();
    // applyStaticTranslations() setzt den Filter-Toggle-Button auf seinen data-i18n-Grundtext
    // ("Filter anzeigen") zurück, unabhängig vom tatsächlichen Ein-/Ausgeklappt-Zustand – hier
    // die passende Beschriftung für den aktuellen Zustand neu setzen (idempotent).
    const filtersSection = document.getElementById("filtersSection");
    if (filtersSection) setFiltersCollapsed(filtersSection.classList.contains("hidden"));
    const navSection = document.getElementById("modeTabsNav");
    if (navSection) setNavCollapsed(navSection.classList.contains("hidden"));
    rerenderCurrentView();
  });
}

function rerenderCurrentView() {
  if (state.mode === "erkennen") loadQuestion();
  else if (state.mode === "unterscheiden") renderConfusionPair();
  else if (state.mode === "fortschritt") renderFortschritt();
  else if (state.mode === "anleitung") renderAnleitung();
  else if (state.mode === "disclaimer") renderDisclaimer();
  else if (state.mode === "validieren" && state.validation && state.validation.sp) {
    renderValidationHeader(state.validation.sp);
    renderValidationDetails(state.validation.sp);
    if (state.validation.recordings.length) renderValidationRecording();
  }
}

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
  return t({ neu: "progress.statusNew", lernen: "progress.statusLearning", gut: "progress.statusGood", sicher: "progress.statusMastered" }[label] || "progress.statusNew");
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
    const weekSub = w.practicedThisWeek ? t("progress.practicedThisWeek", { n: w.practicedThisWeek }) : t("progress.noneThisWeek");
    return `
      <div class="progress-bar-col">
        <div class="progress-bar-stack" style="height:${maxH}px;">${segs}</div>
        <div class="chart-week-label">${formatWeekLabel(w.weekStart)}</div>
        <div class="chart-week-sub muted">${weekSub}${acc !== null ? ", " + acc + "%" : ""}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="progress-chart">${bars}</div>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch seg-sicher"></span>${t("progress.statusMastered")}</span>
      <span class="legend-item"><span class="legend-swatch seg-gut"></span>${t("progress.statusGood")}</span>
      <span class="legend-item"><span class="legend-swatch seg-lernen"></span>${t("progress.statusLearning")}</span>
      <span class="legend-item"><span class="legend-swatch seg-neu"></span>${t("progress.statusNew")}</span>
    </div>
    <p class="hint">${t("progress.chartHint", { n: totalSpecies })}</p>
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
  const area = getChipValue("areaFilterChips");
  const group = getChipValue("groupFilterChips");
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
    // Echter Dateiname inkl. Endung, falls die API ihn liefert. Wird aktuell nirgends mehr für
    // die Wiedergabe ausgewertet (s. Kommentar bei renderAudioSection zum Safari-Wiedergabe-Fix
    // vom 2026-09-22: die Endung erwies sich als kein verlässlicher Format-Indikator) – bleibt
    // trotzdem erhalten, falls sie für Diagnose oder eine künftige "Datei herunterladen unter
    // echtem Namen"-Funktion nützlich ist.
    fileName: pick["file-name"] || null,
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
  const country = rec.country || "?";
  if (rec.tier === "neighbor") return t("audio.neighborNote", { country });
  if (rec.tier === "europe") return t("audio.europeNote", { country });
  if (rec.tier === "world") return t("audio.worldNote", { country });
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
// Nutzt die öffentliche, CORS-freundliche Wikipedia REST-Summary-API für das Bild selbst,
// und zusätzlich die Wikimedia-Commons-API (imageinfo/extmetadata, ebenfalls CORS-offen via
// origin=*, kein API-Key nötig) für Fotograf:in/Lizenz/Quelllink – nötig für korrekte
// Bildattribution bei kommerzieller/institutioneller Nutzung (CC-Lizenzen verlangen i.d.R.
// Namensnennung, nicht nur "Bild: Wikipedia"). Rein dekorativ – schlägt der Abruf fehl
// (inkl. Attributionsdaten), wird einfach kein Bild bzw. keine Zusatzangabe gezeigt.

function commonsFilenameFromImageUrl(imgUrl) {
  try {
    const path = new URL(imgUrl).pathname.split("/").filter(Boolean);
    const thumbIdx = path.indexOf("thumb");
    // Thumb-URLs: .../commons/thumb/a/ab/Dateiname.jpg/300px-Dateiname.jpg
    if (thumbIdx !== -1 && path.length > thumbIdx + 3) return decodeURIComponent(path[thumbIdx + 3]);
    // Original-URLs: .../commons/a/ab/Dateiname.jpg
    return decodeURIComponent(path[path.length - 1]);
  } catch (e) {
    return null;
  }
}

function stripHtmlTags(str) {
  if (!str) return "";
  return String(str).replace(/<[^>]*>/g, "").trim();
}

async function fetchCommonsAttribution(imgUrl) {
  const filename = commonsFilenameFromImageUrl(imgUrl);
  if (!filename) return null;
  try {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + filename)}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query && data.query.pages;
    const page = pages && Object.values(pages)[0];
    const meta = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata;
    if (!meta) return null;
    const artist = stripHtmlTags(meta.Artist && meta.Artist.value);
    const license = (meta.LicenseShortName && meta.LicenseShortName.value) || "";
    const sourceUrl = (meta.ImageDescriptionURL && meta.ImageDescriptionURL.value) ||
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`;
    return { artist: artist || null, license: license || null, sourceUrl };
  } catch (e) {
    return null;
  }
}

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
        const attribution = await fetchCommonsAttribution(img);
        const result = {
          url: img,
          artist: attribution ? attribution.artist : null,
          license: attribution ? attribution.license : null,
          sourceUrl: attribution ? attribution.sourceUrl : null,
        };
        state.wikiImageCache[sp.sci] = result;
        return result;
      }
    } catch (e) {
      // still try next title / fail silently
    }
  }
  state.wikiImageCache[sp.sci] = null;
  return null;
}

// ---------- UI: Init ----------

// ---------- Filter-Chips (Gebiet/Artengruppe) ----------
// Ersetzt seit 2026-09-23 die vorherigen nativen <select>-Dropdowns für Gebiet und Artengruppe:
// Nutzerin-Feedback, dass die aufgeklappte Optionsliste eines <select> auf dem Handy vom
// Betriebssystem (nicht per CSS beeinflussbar) in schlichter System-Optik dargestellt wird, unpassend
// zum Rest der App. Antickbare Chip-Buttons (wie in einer von der Nutzerin gezeigten Referenz-App)
// sehen auf jedem Gerät gleich aus, weil sie ganz normale, selbst gestylte <button>-Elemente sind.
// Bewusst (noch) Single-Select – behält exakt das bisherige Verhalten (ein Gebiet/eine Gruppe
// gleichzeitig), nur die Optik ändert sich. Mehrfachauswahl (mehrere Gebiete/Gruppen gleichzeitig)
// wäre technisch machbar (currentFilteredSpecies() bräuchte dafür sp.areas.some(a => selected.has(a))
// statt eines Einzelvergleichs), wurde aber bewusst auf einen möglichen Folgeschritt verschoben, um
// diese erste, für sich schon nicht ganz kleine Umstellung zunächst einzeln am echten Handy zu
// verifizieren, bevor eine weitere Verhaltensänderung (nicht nur Optik) obendrauf kommt.
//
// "selected" wird als data-selected-Attribut am Container gespeichert (statt in einer globalen
// Variable), damit getChipValue() den aktuellen Wert jederzeit direkt aus dem DOM lesen kann – genau
// wie zuvor sel.value bei einem <select>.
function renderChipRow(containerId, options, selected, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const validValues = new Set(options.map(o => o.value));
  const resolved = validValues.has(selected) ? selected : options[0].value;
  el.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn" + (opt.value === resolved ? " active" : "");
    btn.dataset.value = opt.value;
    if (opt.title) btn.title = opt.title;
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      setChipValue(containerId, opt.value);
      onChange(opt.value);
    });
    el.appendChild(btn);
  });
  el.dataset.selected = resolved;
}

function getChipValue(containerId) {
  const el = document.getElementById(containerId);
  return (el && el.dataset.selected) || "all";
}

function setChipValue(containerId, value) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.selected = value;
  el.querySelectorAll(".chip-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

// Baut die Gebiets-Chips neu (behält die aktuelle Auswahl bei, wichtig beim Sprachwechsel).
function populateAreaFilter() {
  const options = [
    { value: "all", label: t("filters.area_all") },
    { value: "kern11", label: t("filters.area_kern11") },
    ...Object.keys(AREAS).map(code => ({ value: code, label: areaShortLabel(code), title: areaName(code) })),
  ];
  renderChipRow("areaFilterChips", options, getChipValue("areaFilterChips"), reloadAfterFilterChange);
}

// Nur Gruppen anzeigen, die tatsächlich im aktuellen Artenset vorkommen – in fester,
// alltagstauglicher Reihenfolge (GROUP_ORDER), nicht alphabetisch. sp.group bleibt immer der
// deutsche Name (Artdaten sind nicht übersetzt), nur die Anzeige wird per groupLabel() übersetzt.
function populateGroupFilter() {
  const present = new Set(SPECIES.map(sp => sp.group).filter(Boolean));
  const options = [
    { value: "all", label: t("filters.group_all") },
    ...GROUP_ORDER.filter(g => present.has(g)).map(g => ({ value: g, label: groupLabel(g) })),
  ];
  renderChipRow("groupFilterChips", options, getChipValue("groupFilterChips"), reloadAfterFilterChange);
}

function populateConfusionSelect() {
  const sel = document.getElementById("confusionSelect");
  const prev = sel.value;
  sel.innerHTML = "";
  Object.entries(CONFUSION_NOTES).forEach(([key, val]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = confusionTitle(val);
    sel.appendChild(opt);
  });
  if (Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
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
  document.getElementById("anleitungView").classList.toggle("hidden", mode !== "anleitung");
  document.getElementById("disclaimerView").classList.toggle("hidden", mode !== "disclaimer");
  // Die Quiz-Filterleiste (Häufigkeit/Schwierigkeit/Gebiet/...) und der zugehörige Toggle-Button
  // betreffen nur Erkennen/Unterscheiden/Fortschritt – auf der Validierungs-Seite sowie den reinen
  // Infoseiten (Anleitung/Disclaimer) wären sie nur verwirrend.
  // Wichtig (Bug gefunden & behoben 2026-09-23): hier NICHT einfach unconditional "hidden" entfernen,
  // wenn der Filterbereich relevant ist – das hätte den vom Filter-Toggle-Button gespeicherten
  // Ein-/Ausklapp-Zustand bei jedem Tab-Wechsel zurück zu Erkennen/Unterscheiden/Fortschritt
  // überschrieben (Filter wären dann immer wieder aufgeklappt aufgetaucht, egal was man vorher
  // eingestellt hatte). Stattdessen: bei irrelevanten Tabs hart verstecken, bei relevanten Tabs den
  // gespeicherten Collapse-Zustand über setFiltersCollapsed() wiederherstellen.
  const filtersRelevant = mode !== "validieren" && mode !== "anleitung" && mode !== "disclaimer";
  const filterToggleBtn = document.getElementById("filterToggleBtn");
  if (filterToggleBtn) filterToggleBtn.classList.toggle("hidden", !filtersRelevant);
  if (!filtersRelevant) {
    document.getElementById("filtersSection").classList.add("hidden");
  } else {
    const stored = localStorage.getItem(FILTERS_COLLAPSED_KEY);
    setFiltersCollapsed(stored === null ? true : stored === "1");
  }

  if (mode === "erkennen") {
    loadQuestion();
  } else if (mode === "unterscheiden") {
    if (opts.confusionKey) document.getElementById("confusionSelect").value = opts.confusionKey;
    renderConfusionPair();
  } else if (mode === "fortschritt") {
    renderFortschritt();
  } else if (mode === "anleitung") {
    renderAnleitung();
  } else if (mode === "disclaimer") {
    renderDisclaimer();
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
    hintEl.textContent = t("settings.learnGroupHintNone", { n: SPECIES.length });
  } else {
    const n = SPECIES.filter(sp => LEARN_GROUPS[sp.id] === val).length;
    hintEl.textContent = t("settings.learnGroupHintGroup", { g: val, n });
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

  document.getElementById("appVersionText").textContent = APP_VERSION;
  document.getElementById("checkUpdateBtn").addEventListener("click", checkForUpdate);
}

// ---------- PWA-Update-Mechanismus ----------
// Hintergrund: der Service Worker ist Network-First (s. service-worker.js) und bedient neue
// Deploys daher praktisch sofort bei jedem normalen Seitenaufruf – das eigentliche Problem ist nur,
// dass eine bereits offene Seite (v.a. die installierte App, die oft tagelang im selben Fenster
// offen bleibt) das *alte* app.js weiter im Speicher hat, selbst wenn der Server längst eine neue
// Version ausliefert. Der Banner + "Nach Updates suchen"-Button machen das sichtbar und geben eine
// bewusste Reload-Möglichkeit, statt die Seite ungefragt neu zu laden (das würde sonst mitten in
// einer Quiz-Runde passieren können).
//
// **Bug gefunden & behoben (2026-09-23, Nutzerin-Test)**: Die ursprüngliche Version dieses
// Mechanismus erkannte Updates AUSSCHLIESSLICH über `registration.update()` + das
// `controllerchange`-Event – das ist der Browser-eigene Mechanismus zum Erkennen einer geänderten
// `service-worker.js`-DATEI (reiner Byte-Vergleich dieser einen Datei). Der entscheidende
// Denkfehler: seit dem Network-First-Fix (s. Architektur-Abschnitt oben) ändert sich
// `service-worker.js` bei einem reinen Inhalts-Deploy (nur app.js/index.html/species-data.js
// geändert) überhaupt nicht mehr – das ist ja gerade der Sinn dieses Fixes, Inhalts-Updates
// unabhängig von einem Service-Worker-Datei-Update sofort auszuliefern. Der "Nach Updates
// suchen"-Button hat also zuverlässig geprüft, ob sich `service-worker.js` geändert hat (nein, wie
// erwartet), und daraus fälschlich "kein Update verfügbar" geschlossen, obwohl `app.js` auf dem
// Server längst neuer war. Von der Nutzerin bestätigt: Button meldete "neueste Version" in Chrome
// (und in der installierten App sogar über einen Tag hinweg), obwohl ein frisch geöffneter
// Safari-Tab zur selben Zeit bereits die neuen Änderungen zeigte.
//
// Gefixt: `checkForUpdate()`/die proaktive Prüfung fragen jetzt NICHT mehr den Service Worker,
// sondern laden `app.js` direkt per `fetch()` mit einem Cache-Busting-Query-Parameter (Zeitstempel)
// und `{ cache: "no-store" }` – das umgeht sowohl den Browser-Cache als auch einen eventuellen
// CDN-Edge-Cache von GitHub Pages (ein bloßes `cache: "no-store"` allein würde nur den
// Browser-Cache umgehen, nicht eine zwischengeschaltete CDN-Cache-Ebene; ein einzigartiger
// Query-Parameter erzwingt dagegen auf jeder Cache-Ebene einen echten Cache-Miss). Die darin
// enthaltene `APP_VERSION`-Zeile wird per Regex extrahiert und mit der aktuell im Speicher
// laufenden `APP_VERSION` verglichen. Das ist die tatsächlich relevante Frage ("ist der
// Server-Inhalt neuer als das, was hier gerade läuft?"), unabhängig davon, ob sich
// `service-worker.js` selbst je ändert. Der Service Worker wird weiterhin registriert (nötig fürs
// Offline-Caching/PWA-Grundgerüst), spielt für die Update-ERKENNUNG aber keine Rolle mehr.

function showUpdateBanner() {
  const el = document.getElementById("updateBanner");
  if (el) el.classList.remove("hidden");
}

// Lädt app.js frisch vom Server (Cache-Busting, s. Kommentar oben) und vergleicht die darin
// enthaltene APP_VERSION mit der aktuell laufenden. Rückgabe: true = Update gefunden (Banner wurde
// bereits eingeblendet), false = kein Update, null = Prüfung fehlgeschlagen (z.B. offline oder
// APP_VERSION im geladenen Text nicht gefunden).
async function fetchLatestVersionAndCompare() {
  try {
    const res = await fetch("app.js?cachebust=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/const APP_VERSION\s*=\s*"([^"]+)"/);
    if (!m) return null;
    if (m[1] !== APP_VERSION) {
      showUpdateBanner();
      return true;
    }
    return false;
  } catch {
    return null;
  }
}

function setupServiceWorker() {
  // Die eigentliche Update-Erkennung (fetchLatestVersionAndCompare(), s. Kommentar oben) hängt
  // nicht am Service Worker und lohnt sich auch ohne SW-Unterstützung – einmal direkt beim Laden,
  // danach jedes Mal, wenn die App wieder in den Vordergrund geholt wird (wichtig für eine
  // installierte App, die oft tagelang im selben Fenster offen bleibt).
  fetchLatestVersionAndCompare();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchLatestVersionAndCompare();
  });
  document.getElementById("updateReloadBtn")?.addEventListener("click", () => location.reload());

  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("service-worker.js", { updateViaCache: "none" })
    .then(reg => { state.swRegistration = reg; })
    .catch(() => {});
}

async function checkForUpdate() {
  const statusEl = document.getElementById("updateStatusText");
  statusEl.textContent = t("update.checking");
  const result = await fetchLatestVersionAndCompare();
  if (result === true) statusEl.textContent = "";
  else if (result === false) statusEl.textContent = t("update.upToDate");
  else statusEl.textContent = t("update.checkFailed");
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
    area: getChipValue("areaFilterChips"),
    group: getChipValue("groupFilterChips"),
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
  // Die Chip-Reihen sind zu diesem Zeitpunkt bereits gerendert (populateAreaFilter()/
  // populateGroupFilter() laufen in init() vor setupFilters()/restoreFilterState()) – hier reicht
  // es, den gespeicherten Wert zu übernehmen, falls er einer der vorhandenen Chips ist.
  const areaChips = document.getElementById("areaFilterChips");
  if (saved.area && areaChips && areaChips.querySelector(`.chip-btn[data-value="${CSS.escape(saved.area)}"]`)) {
    setChipValue("areaFilterChips", saved.area);
  }
  const groupChips = document.getElementById("groupFilterChips");
  if (saved.group && groupChips && groupChips.querySelector(`.chip-btn[data-value="${CSS.escape(saved.group)}"]`)) {
    setChipValue("groupFilterChips", saved.group);
  }
  const countSel = document.getElementById("countFilter");
  if (saved.count && Array.from(countSel.options).some(o => o.value === saved.count)) countSel.value = saved.count;
}

// Ob der Filterbereich ein-/ausgeklappt ist, wird separat von den Filterwerten selbst gemerkt
// (eigener Key, nicht Teil von FILTER_STATE_KEY) – Nutzerin-Wunsch 2026-09-23: nach "Nächste
// Aufnahme" musste man auf dem Handy erst am langen, immer ausgeklappten Filterblock
// vorbeiscrollen, um Sonogramm + Antwortoptionen zu sehen. Standardmäßig eingeklappt (auch für
// wiederkehrende Nutzer:innen ohne gespeicherten Zustand), macht aber keinen Unterschied bei den
// eigentlichen Filterwerten selbst (die bleiben wie gehabt gesetzt, auch wenn der Bereich
// eingeklappt ist).
const FILTERS_COLLAPSED_KEY = "vogeltrainer_filters_collapsed_v1";

function setFiltersCollapsed(collapsed) {
  const section = document.getElementById("filtersSection");
  const btn = document.getElementById("filterToggleBtn");
  section.classList.toggle("hidden", collapsed);
  btn.textContent = t(collapsed ? "filters.showBtn" : "filters.hideBtn");
  btn.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(FILTERS_COLLAPSED_KEY, collapsed ? "1" : "0");
}

function setupFilterToggle() {
  const stored = localStorage.getItem(FILTERS_COLLAPSED_KEY);
  // Kein gespeicherter Wert (erster Besuch) -> eingeklappt starten (s. Kommentar oben).
  setFiltersCollapsed(stored === null ? true : stored === "1");
  document.getElementById("filterToggleBtn").addEventListener("click", () => {
    const section = document.getElementById("filtersSection");
    setFiltersCollapsed(!section.classList.contains("hidden"));
  });
}

// Gleiches Muster wie beim Filterbereich (s. FILTERS_COLLAPSED_KEY oben), diesmal für die
// Mode-Tabs-Leiste (Arten erkennen/Verwechslungsarten/Validieren/…) – Nutzerin-Feedback
// 2026-09-23: nach dem Einklappen der Filter störte auf dem Handy noch die immer sichtbare
// Tab-Leiste oben. Eigener, unabhängiger Toggle-Button, ebenfalls standardmäßig eingeklappt.
const NAV_COLLAPSED_KEY = "vogeltrainer_nav_collapsed_v1";

function setNavCollapsed(collapsed) {
  const nav = document.getElementById("modeTabsNav");
  const btn = document.getElementById("navToggleBtn");
  nav.classList.toggle("hidden", collapsed);
  btn.textContent = t(collapsed ? "nav.showBtn" : "nav.hideBtn");
  btn.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
}

function setupNavToggle() {
  const stored = localStorage.getItem(NAV_COLLAPSED_KEY);
  setNavCollapsed(stored === null ? true : stored === "1");
  document.getElementById("navToggleBtn").addEventListener("click", () => {
    const nav = document.getElementById("modeTabsNav");
    setNavCollapsed(!nav.classList.contains("hidden"));
  });
}

// Gemeinsame Reaktion auf jede Filteränderung (Checkboxen, Chips, Anzahl-Select): Zustand
// speichern und die aktuell sichtbare Ansicht neu laden. Ausgelagert, damit die Chip-Reihen
// (Gebiet/Artengruppe) dieselbe Logik nutzen können wie die übrigen Filterelemente.
function reloadAfterFilterChange() {
  saveFilterState();
  if (state.mode === "erkennen") loadQuestion();
  else renderConfusionPair();
}

function setupFilters() {
  restoreFilterState();
  setupFilterToggle();

  document.querySelectorAll(".freq-filter, .diff-filter, .name-toggle").forEach(el => {
    el.addEventListener("change", reloadAfterFilterChange);
  });
  document.getElementById("countFilter").addEventListener("change", reloadAfterFilterChange);
  document.getElementById("nextBtn").addEventListener("click", loadQuestion);
  document.getElementById("confusionSelect").addEventListener("change", renderConfusionPair);
}

// ---------- Erkennen-Modus ----------

async function loadQuestion() {
  const card = document.getElementById("quizCard");
  const pool = currentFilteredSpecies();

  if (pool.length < 2) {
    card.innerHTML = `<p class="muted">${t("erkennen.tooFewSpecies", { total: SPECIES.length })}</p>`;
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

  card.innerHTML = `<p class="muted">${t("erkennen.loadingRecording")}</p>`;

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
    msg = t("audioError.noKey");
  } else if (err.message === "no-recordings") {
    msg = t("audioError.noRecordings");
  } else if (err.message === "network") {
    msg = t("audioError.network");
  } else {
    msg = t("audioError.generic", { msg: err.message });
  }
  card.innerHTML = `
    <div class="error-box">${msg}</div>
    <p><a href="${xcSpeciesPageUrl(target)}" target="_blank" rel="noopener">${t("audioError.viewManually")}</a></p>
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
// sondern bietet nur "Herunterladen" an. Zwei Fix-Versuche bisher:
// 1. (2026-09-22, verworfen) Ursprünglich wurde <source type="..."> pauschal auf "audio/mpeg"
//    gesetzt, weil xeno-cantos "file"-Download-URL nie eine Dateiendung enthält – bei einer
//    tatsächlich als .wav hochgeladenen Aufnahme lehnte Safari die Wiedergabe wegen des falsch
//    deklarierten Typs ab (Chrome/Firefox ignorieren einen falschen Typ eher und schnüffeln
//    selbst, Safari ist strikt).
// 2. (ebenfalls 2026-09-22, AUCH verworfen) Als Fix wurde versucht, den Typ stattdessen aus der
//    Dateiendung des von der API gelieferten "file-name"-Felds zu erraten. Von der Nutzerin im
//    echten Browser getestet: hat das Problem NICHT behoben – bei mindestens einer Aufnahme
//    ergab die Prüfung, dass die tatsächliche Kodierung mp4 war, obwohl der Dateiname anders
//    endete. Die Dateiendung im "file-name"-Feld ist also selbst kein verlässlicher Indikator
//    für das tatsächliche Format – geraten wird so oder so falsch, nur mit anderer Fehlerquote.
// **Aktueller Fix (2026-09-22, dritter Versuch)**: kein <source type="..."> mehr setzen, also gar
// nicht mehr raten. Der Browser lädt die Datei dann selbst und bestimmt den Typ anhand der
// tatsächlichen HTTP-Antwort (Content-Type-Header bzw. Byte-Signatur-Sniffing) – das ist exakt
// das, was Chrome/Firefox ohnehin schon immer gemacht haben (weshalb dort nie ein Problem
// auftrat), und sollte jetzt auch Safari zuverlässig das richtige, tatsächliche Format erkennen
// lassen, unabhängig davon, was Dateiname oder URL suggerieren. Konnte in der Cowork-Sandbox
// wie immer nicht gegen die echte xeno-canto-API getestet werden (Anubis-Bot-Schutz, s.o.) –
// braucht wieder einen echten Test durch die Nutzerin, diesmal insb. bei der zuvor als "mp4"
// identifizierten Aufnahme.
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
  const isExcluded = getExcludedIds().has(String(rec.xcId));
  const altLabel = opts.altLabel || t("audio.altRecBtn");
  const excludeLabel = opts.excludeLabel
    ? opts.excludeLabel(isExcluded)
    : t("audio.excludeBtnDefault");
  // rec.type/recordist/remarks/license/pageUrl/fileUrl/sonoUrl stammen von xeno-canto (offene,
  // community-befüllte API, nicht von uns kontrolliert) – s. Sicherheits-Kommentar bei escapeHtml()/
  // safeHref() oben: Text-Werte werden escaped, Links/Quellen über safeHref() geprüft, statt sie
  // roh in innerHTML/href/src einzusetzen.
  const licenseHtml = rec.license ? `${t("audio.license")}<a href="${safeHref(rec.license)}" target="_blank" rel="noopener">${t("audio.licenseLink")}</a>` : "";
  container.innerHTML = `
    <div class="audio-row">
      <button class="play-btn" id="playBtn">▶</button>
      <div>
        <div class="sound-type">${rec.type ? escapeHtml(rec.type) : t("audio.unknownType")}${rec.length ? t("audio.lengthLabel", { length: rec.length }) : ""}</div>
        <div class="attribution">${t("audio.recordingBy", { recordist: rec.recordist || t("audio.unknownRecordist") })}
          (<a href="${safeHref(rec.pageUrl)}" target="_blank" rel="noopener">${t("audio.source")}</a>${licenseHtml})
        </div>
        ${originNote(rec) ? `<div class="hint">${originNote(rec)}</div>` : ""}
        ${rec.remarks && rec.remarks.trim() ? `<div class="hint">${t("audio.remarksLabel", { remarks: rec.remarks.trim() })}</div>` : ""}
      </div>
    </div>
    <audio id="audioPlayer" preload="metadata">
      <source src="${safeHref(rec.fileUrl)}">
    </audio>
    ${rec.sonoUrl ? `
      <div class="sono-container">
        <div class="sono-yaxis" id="sonoYAxis"></div>
        <div class="sono-scroll" id="sonoScroll">
          <div class="sono-wrap" id="sonoWrap">
            <div class="sono-imgwrap" id="sonoImgWrap">
              <img class="spectrogram" id="sonoImg" src="${safeHref(rec.sonoUrl)}" alt="Sonogramm">
              <div class="playhead" id="playhead"></div>
            </div>
            <div class="sono-xaxis" id="sonoXAxis"></div>
          </div>
        </div>
      </div>
      <p class="hint">${isLongRecording
        ? t("audio.longRecordingHint", { length: rec.length })
        : t("audio.normalRecordingHint")
      }${rec.sampleRate ? "" : t("audio.unknownSampleRateSuffix")}</p>
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
  container.innerHTML = `<p class="muted">${t("swap.loading")}</p>`;
  try {
    const rec = await pickRecording(sp);
    renderAudioSection(rec, sp, containerId);
  } catch (err) {
    container.innerHTML = `<div class="error-box">${t("swap.error", { msg: err.message })}</div>`;
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
    // rec.fileUrl kommt von xeno-canto (externe, nicht von uns kontrollierte Daten) – nicht als
    // roher {platzhalter} in den href einsetzen (s. Sicherheits-Kommentar bei t()/escapeHtml()
    // oben), sondern über safeHref() geprüft separat als Link anhängen.
    const href = safeHref(rec.fileUrl);
    const linkHtml = href !== "#" ? ` <a href="${href}" target="_blank" rel="noopener">${t("audio.openFileLink")}</a>` : "";
    playError.innerHTML = `<div class="error-box">${t("audio.playError")}${linkHtml}</div>`;
  }

  // Safari-Blob-Fallback (2026-09-23, noch ungetestet): Fix-Versuch 3 (kein <source type="...">
  // mehr, s. Kommentar oben bei renderAudioSection) hat mp4-Aufnahmen gefixt, aber echte .wav-
  // Dateien spielen in Safari weiterhin nicht – ABER laut Test der Nutzerin spielt dieselbe .wav-
  // Datei in Safari anstandslos, wenn man sie direkt auf xeno-canto.org öffnet, UND in Chrome auch
  // innerhalb unserer App. Nur "Safari + unsere App" schlägt fehl. Das schließt ein grundsätzliches
  // Safari-Decoder-/Codec-Problem aus (Safari kann die Datei ja nachweislich abspielen) und deutet
  // stattdessen auf ein WebKit-Sonderverhalten hin: xeno-cantos "/download"-Endpunkt liefert
  // vermutlich einen "Content-Disposition: attachment"-Header (es ist wörtlich der Download-
  // Endpunkt) – Safari/WebKit ist dafür bekannt, diesen Header auch bei einer in <audio>
  // eingebetteten Ressource zu respektieren und die Anfrage als Download statt als abspielbares
  // Medium zu behandeln, während Chrome/Firefox die Disposition in einem Medien-Element-Kontext
  // ignorieren. Fallback: bei einem Wiedergabefehler die Datei stattdessen per fetch() + Blob laden
  // und als "blob:"-URL setzen – eine solche lokale Blob-URL hat keine Content-Disposition-Semantik
  // mehr, das Problem kann dort prinzipiell nicht auftreten. Voraussetzung: xeno-cantos Server
  // erlaubt Cross-Origin-fetch()-Lesezugriffe (Access-Control-Allow-Origin) – unbestätigt, aber bei
  // einer für Fremdeinbindung gedachten öffentlichen API plausibel. Falls nicht, schlägt der fetch()
  // selbst fehl (anderer, spezifischerer Fehler als bisher) statt den Blob-Umweg zu ermöglichen –
  // auch das wäre ein nützliches Diagnosesignal. Konnte in der Sandbox nicht gegen die echte API
  // getestet werden (Anubis-Bot-Schutz, s. CLAUDE.md) – braucht wieder einen echten Test durch die
  // Nutzerin, diesmal gezielt mit einer bisher fehlschlagenden .wav-Datei in Safari.
  let blobFallbackTried = false;
  function tryBlobFallback(thenPlay) {
    if (blobFallbackTried) {
      showPlayError();
      return;
    }
    blobFallbackTried = true;
    if (playError) playError.innerHTML = `<p class="hint">${t("audio.blobFallbackTrying")}</p>`;
    fetch(rec.fileUrl)
      .then(r => {
        if (!r.ok) throw new Error("http " + r.status);
        return r.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        if (playError) playError.innerHTML = "";
        audio.src = objectUrl;
        audio.load();
        if (thenPlay) audio.play().catch(() => {});
      })
      .catch(showPlayError);
  }

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => tryBlobFallback(true));
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("error", () => tryBlobFallback(autoplayAllowed));
  audio.addEventListener("play", () => { playBtn.textContent = "⏸"; });
  audio.addEventListener("pause", () => { playBtn.textContent = "▶"; });
  audio.addEventListener("ended", () => {
    playBtn.textContent = "▶";
    if (playhead) playhead.style.left = "0%";
  });

  if (autoplayAllowed) {
    audio.play().catch(err => {
      if (err && err.name === "NotAllowedError") {
        // Browser hat automatische Wiedergabe blockiert (Autoplay-Richtlinie, harmlos) – dann
        // einfach manuell über den Play-Button starten.
        if (playError) playError.innerHTML = `<p class="hint">${t("audio.autoplayBlocked")}</p>`;
      } else {
        // Anderer Fehler (z.B. NotSupportedError) – vermutlich das oben beschriebene Safari/WAV-
        // Problem, Blob-Fallback versuchen statt nur die generische Fehlermeldung zu zeigen.
        tryBlobFallback(true);
      }
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
    t("score.label", { correct: state.score.correct, total: state.score.total });
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
        ${t("details.confusionHint", { name: sp.de, partner: partner.de })}
        <button class="details-toggle" id="jumpConfusionBtn">${t("details.jumpConfusionBtn")}</button>
      </div>
    ` : ""}
    <button class="details-toggle" id="detailsToggleBtn">${t("details.moreAbout", { name: sp.de })}</button>
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
    toggleBtn.textContent = willShow ? t("details.lessInfo") : t("details.moreAbout", { name: sp.de });
    if (willShow && !loaded) {
      loaded = true;
      renderDetailsContent(sp, content);
    }
  });
}

async function renderDetailsContent(sp, content) {
  const areaNames = sp.areas.map(a => areaName(a)).join(", ");
  const confusion = sp.confusionGroup ? CONFUSION_NOTES[sp.confusionGroup] : null;
  const bg = speciesBackground(sp);
  const confNote = confusion ? confusionNote(confusion) : null;
  content.innerHTML = `
    <h3>${sp.de} <span class="muted">(${sp.en}, <em>${sp.sci}</em>)</span></h3>
    <div id="speciesImgWrap" class="muted" style="font-size:0.8rem;">${t("details.imageLoading")}</div>
    <p>${bg.text}${bg.translated ? "" : ` <span class="hint">${t("details.notYetTranslated")}</span>`}</p>
    <p>
      <span class="tag">${t("details.frequencyTag", { v: t("filters.freq_" + sp.frequency) })}</span>
      <span class="tag">${t("details.difficultyTag", { v: t("filters.diff_" + sp.difficulty) })}</span>
      ${sp.group ? `<span class="tag">${t("details.groupTag", { v: groupLabel(sp.group) })}</span>` : ""}
    </p>
    <p><strong>${t("details.areasLabel")}</strong><br>${areaNames || t("details.noAreaData")}</p>
    ${confusion ? `<div class="confusion-note"><strong>${t("details.confusionDangerPrefix", { title: confusionTitle(confusion) })}</strong> ${confNote.text}${confNote.translated ? "" : ` <span class="hint">${t("details.notYetTranslated")}</span>`}</div>` : ""}
    <button class="details-toggle" id="jumpValidationBtn">${t("details.jumpValidationBtn")}</button>
  `;
  document.getElementById("jumpValidationBtn").addEventListener("click", () => {
    switchMode("validieren", { speciesId: sp.id });
  });

  const imgWrap = document.getElementById("speciesImgWrap");
  try {
    const imgData = await fetchWikiImage(sp);
    if (imgData) {
      // imgData.url/.sourceUrl kommen von Wikipedia-/Commons-APIs (externe Quelle) – über
      // safeHref() prüfen statt roh als src/href einzusetzen (s. Sicherheits-Kommentar bei
      // escapeHtml()/safeHref() oben). artist/license laufen durch t()'s automatisches
      // Escaping (Platzhalter-Werte werden dort escaped).
      const creditText = imgData.artist
        ? t("details.imageCredit", { artist: imgData.artist, license: imgData.license || t("details.imageLicenseUnknown") })
        : t("details.imageCaption");
      const creditLink = imgData.sourceUrl
        ? ` <a href="${safeHref(imgData.sourceUrl)}" target="_blank" rel="noopener">${t("details.imageSourceLink")}</a>`
        : "";
      imgWrap.innerHTML = `<img class="species-photo" src="${safeHref(imgData.url)}" alt="${escapeHtml(sp.de)}"><div class="hint">${creditText}${creditLink}</div>`;
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

  const confNote = confusionNote(info);
  card.innerHTML = `
    <div class="confusion-note"><strong>${confusionTitle(info)}:</strong> ${confNote.text}${confNote.translated ? "" : ` <span class="hint">${t("details.notYetTranslated")}</span>`}</div>
    <div class="confusion-pair" id="pairGrid"></div>
  `;

  const grid = document.getElementById("pairGrid");
  for (const sp of pairSpecies) {
    const box = document.createElement("div");
    box.className = "confusion-species";
    const audioContainerId = `confAudio-${sp.id}`;
    const bg = speciesBackground(sp);
    box.innerHTML = `
      <h3>${formatName(sp)}</h3>
      <div id="${audioContainerId}"><p class="muted">${t("confusion.loadingRecording")}</p></div>
      <p>${bg.text}${bg.translated ? "" : ` <span class="hint">${t("details.notYetTranslated")}</span>`}</p>
    `;
    grid.appendChild(box);

    try {
      const rec = await pickRecording(sp);
      renderAudioSection(rec, sp, audioContainerId);
    } catch (err) {
      const msg = err.message === "no-key"
        ? t("confusion.noApiKey")
        : t("confusion.cannotAutoLoad");
      document.getElementById(audioContainerId).innerHTML = `
        <p class="muted">${msg}</p>
        <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">${t("confusion.viewManually")}</a></p>
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
      hint.textContent = input.value.trim() ? t("validation.noMatch") : "";
      return;
    }
    hint.textContent = count > 1 ? t("validation.multipleMatches", { count, name: match.de }) : "";
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
  return `<p><a href="https://ebird.org/species/${sp.ebirdCode}" target="_blank" rel="noopener">${t("validation.viewOnEbird")}</a></p>`;
}

function renderValidationHeader(sp) {
  const card = document.getElementById("validationHeaderCard");
  card.classList.remove("hidden");
  card.innerHTML = `
    <h3 style="margin-top:0;">${sp.de} <span class="muted">(${sp.en}, <em>${sp.sci}</em>)</span></h3>
    <p style="margin-bottom:0;">
      <span class="tag">${t("details.frequencyTag", { v: t("filters.freq_" + sp.frequency) })}</span>
      <span class="tag">${t("details.difficultyTag", { v: t("filters.diff_" + sp.difficulty) })}</span>
      ${sp.group ? `<span class="tag">${t("details.groupTag", { v: groupLabel(sp.group) })}</span>` : ""}
    </p>
  `;
}

const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function renderValidationDetails(sp) {
  const card = document.getElementById("validationDetailsCard");
  card.classList.remove("hidden");
  const areaNames = sp.areas.map(a => areaName(a)).join(", ") || t("details.noAreaData");
  const monthNames = state.lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_DE;
  // habitatDesc/habitatDesc_en: freier Beschreibungstext des typischen Lebensraums (unabhängig
  // von `habitat`), aktuell nur für einen Teil der Arten recherchiert (Start: die 54
  // frequency:"haeufig"-Arten, s. CLAUDE.md). `habitat` bleibt daneben die schmalere
  // Spezialisten-Tag-Liste fürs BirdNET-Plausibilitätscheck-Tool – beide können unabhängig
  // voneinander vorhanden sein (z.B. Feldlerche: Beschreibungstext UND Spezialisten-Tag
  // "farmland_open").
  const habitatDescText = state.lang === "en" ? sp.habitatDesc_en : sp.habitatDesc;
  const specialistTags = (sp.habitat && sp.habitat.length) ? sp.habitat.map(h => habitatLabel(h)).join(", ") : null;
  const habitatText = habitatDescText
    ? habitatDescText + (specialistTags ? ` <span class="hint">(${t("validation.habitatSpecialistNote", { tags: specialistTags })})</span>` : "")
    : (specialistTags || t("validation.noDataYet"));
  const seasonText = sp.vocalMonths
    ? `${monthNames[sp.vocalMonths[0] - 1]}–${monthNames[sp.vocalMonths[1] - 1]}`
    : (sp.habitat ? t("validation.yearRoundNoSeason") : t("validation.noDataYet"));
  const bg = speciesBackground(sp);

  card.innerHTML = `
    <div class="validation-info-grid">
      <div><h4>${t("validation.habitatLabel")}</h4>${habitatText}</div>
      <div><h4>${t("validation.seasonLabel")}</h4>${seasonText}</div>
      <div><h4>${t("validation.areasLabel")}</h4>${areaNames}</div>
    </div>
    <p style="margin-top:0.8rem;">${bg.text}${bg.translated ? "" : ` <span class="hint">${t("details.notYetTranslated")}</span>`}</p>
    <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">${t("validation.viewOnXc")}</a></p>
    ${ebirdSpeciesLinkHtml(sp)}
  `;
}

async function loadValidationSpecies(sp) {
  state.validation = { sp, recordings: [], index: 0 };
  document.getElementById("validationSearchInput").value = validationLabel(sp);
  renderValidationHeader(sp);
  renderValidationDetails(sp);
  const card = document.getElementById("validationCard");
  card.innerHTML = `<p class="muted">${t("validation.loadingRecordings")}</p>`;
  try {
    const list = await fetchAllRecordingsForSpecies(sp);
    state.validation.recordings = list;
    renderValidationRecording();
  } catch (err) {
    let msg;
    if (err.message === "no-key") {
      msg = t("validation.noKey");
    } else if (err.message === "no-recordings") {
      msg = t("validation.noRecordings");
    } else {
      msg = t("validation.genericError", { msg: err.message });
    }
    card.innerHTML = `
      <div class="error-box">${msg}</div>
      <p><a href="${xcSpeciesPageUrl(sp)}" target="_blank" rel="noopener">${t("audioError.viewManually")}</a></p>
    `;
  }
}

function renderValidationRecording() {
  const { sp, recordings, index } = state.validation;
  const card = document.getElementById("validationCard");
  if (!recordings.length) {
    card.innerHTML = `<div class="error-box">${t("validation.noRecordingsFound")}</div>`;
    return;
  }
  const rec = recordings[index];
  const isExcluded = getExcludedIds().has(String(rec.xcId));
  card.innerHTML = `
    <div class="validation-nav">
      <button id="valPrevBtn" ${index === 0 ? "disabled" : ""}>${t("validation.prevBtn")}</button>
      <span class="validation-counter">${t("validation.counter", { i: index + 1, n: recordings.length })}</span>
      <button id="valNextBtn" ${index === recordings.length - 1 ? "disabled" : ""}>${t("validation.nextBtn")}</button>
    </div>
    ${isExcluded ? `<div class="validation-excluded-badge">${t("validation.excludedBadge")}</div>` : ""}
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
      ? t("validation.unexcludeBtn")
      : t("validation.excludeBtn"),
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
      <h2 style="margin-top:0; color: var(--green-dark);">${t("progress.title")}</h2>
      <p class="muted">${t("progress.description")}</p>
      ${totalAttempts === 0 ? `<p class="muted">${t("progress.noAnswers")}</p>` : `
      <h3 style="color: var(--green-dark); margin-bottom:0.3rem;">${t("progress.weeklyAll", { n: SPECIES.length })}</h3>
      ${renderProgressChart(weeklyData)}
      ${filterIsActive ? `
      <h3 style="color: var(--green-dark); margin-top:1.6rem; margin-bottom:0.3rem;">${t("progress.weeklyFilter", { n: filterPool.length })}</h3>
      <p class="hint" style="margin-top:0;">${t("progress.filterHint")}</p>
      ${renderProgressChart(filterWeeklyData, filterPool.length)}
      ` : ""}
      <h3 style="color: var(--green-dark); margin-top:1.6rem;">${t("progress.allSpeciesDetail")}</h3>

      <table class="progress-table">
        <thead>
          <tr><th>${t("progress.colSpecies")}</th><th>${t("progress.colAttempts")}</th><th>${t("progress.colCorrect")}</th><th>${t("progress.colStatus")}</th><th>${t("progress.colLastPracticed")}</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${formatName(r.sp)}</td>
              <td>${r.info.attempts}</td>
              <td>${r.acc === null ? "–" : r.acc + "%"}</td>
              <td><span class="status-badge status-${r.info.label}">${statusLabelDe(r.info.label)}</span></td>
              <td>${r.info.lastSeen ? new Date(r.info.lastSeen).toLocaleDateString(state.lang === "en" ? "en-GB" : "de-DE") : "–"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      `}
      <button id="resetStatsBtn" class="details-toggle" style="margin-top:1.2rem;">${t("progress.resetBtn")}</button>
    </div>
  `;

  document.getElementById("resetStatsBtn").addEventListener("click", () => {
    if (confirm(t("progress.resetConfirm"))) {
      state.stats = {};
      state.answerLog = [];
      saveStats();
      saveLog();
      renderFortschritt();
    }
  });
}

// ---------- Disclaimer-Seite ----------
// Statischer, zweisprachiger Hinweistext (s. Task "Disclaimer-Seite bauen").
// Enthält v.a. den Hinweis auf KI-gestützt recherchierte/formulierte
// Artdaten und die bekannten Datenqualitäts-Einschränkungen (eBird kumulativ,
// xeno-canto-Artbestimmung ungeprüft) – s. STRINGS.*.disclaimer.
// E-Mail-Adresse der Nutzerin bewusst NICHT als zusammenhängender "name@domain"-String im
// Quellcode (Spam-Schutz vor E-Mail-Harvestern, die Webseiten nach genau diesem Muster
// durchsuchen) – Nutzer- und Domain-Teil getrennt gespeichert, zur Anzeige mit " (at) " statt
// "@" zusammengesetzt. Bewusst kein klickbarer mailto:-Link mehr (der würde die Adresse im
// gerenderten HTML wieder als kompletten String preisgeben und den Zweck untergraben).
const CONTACT_EMAIL_USER = "ursula.verfuss";
const CONTACT_EMAIL_DOMAIN = "natureanalytics.earth";
function contactEmailDisplay() {
  return `${CONTACT_EMAIL_USER} (at) ${CONTACT_EMAIL_DOMAIN}`;
}

function renderDisclaimer() {
  const view = document.getElementById("disclaimerView");
  const d = t; // kurz
  view.innerHTML = `
    <div class="card" style="max-width: 760px;">
      <h2 style="margin-top:0; color: var(--green-dark);">${d("disclaimer.heading")}</h2>
      <p class="muted">${d("disclaimer.intro")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s1h")}</h3>
      <p>${d("disclaimer.s1")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s2h")}</h3>
      <p>${d("disclaimer.s2")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s3h")}</h3>
      <p>${d("disclaimer.s3")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s4h")}</h3>
      <p>${d("disclaimer.s4")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s5h")}</h3>
      <p>${d("disclaimer.s5")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s6h")}</h3>
      <p>${d("disclaimer.s6")}</p>
      <h3 style="color: var(--green-dark);">${d("disclaimer.s7h")}</h3>
      <p>${d("disclaimer.s7", { email: contactEmailDisplay() })}</p>
    </div>
  `;
}

// ---------- Anleitungs-Seite ----------
function renderAnleitung() {
  const view = document.getElementById("anleitungView");
  const d = t;
  view.innerHTML = `
    <div class="card" style="max-width: 760px;">
      <h2 style="margin-top:0; color: var(--green-dark);">${d("anleitung.heading")}</h2>
      <h3 style="color: var(--green-dark);">${d("anleitung.s1h")}</h3>
      ${d("anleitung.s1")}
      <h3 style="color: var(--green-dark);">${d("anleitung.s2h")}</h3>
      ${d("anleitung.s2")}
      <h3 style="color: var(--green-dark);">${d("anleitung.s3h")}</h3>
      ${d("anleitung.s3")}
      <h3 style="color: var(--green-dark);">${d("anleitung.s4h")}</h3>
      ${d("anleitung.s4")}
      <h3 style="color: var(--green-dark);">${d("anleitung.s5h")}</h3>
      <p>${d("anleitung.s5", { email: contactEmailDisplay() })}</p>
    </div>
  `;
}

// ---------- Init ----------

function init() {
  state.lang = getStoredLang();
  loadStats();
  applyStaticTranslations();
  populateAreaFilter();
  populateGroupFilter();
  populateConfusionSelect();
  setupTabs();
  setupNavToggle();
  setupSettings();
  setupFilters();
  setupAutoplayToggle();
  setupValidationSearch();
  setupLangToggle();
  loadQuestion();
  setupServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
