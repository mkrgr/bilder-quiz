(() => {
  const cfg = window.QUIZ_CONFIG;
  const $ = (id) => document.getElementById(id);

  const els = {
    setup: $("setup"), game: $("game"), ranking: $("ranking"),
    categories: $("categories"), loadError: $("loadError"),
    teamList: $("teamList"), roundChoice: $("roundChoice"), scoreboard: $("scoreboard"),
    categoryLabel: $("categoryLabel"), roundLabel: $("roundLabel"), stages: $("stages"), picture: $("picture"),
    loading: $("loading"), answer: $("answer"), timerBar: $("timerBar"), credit: $("credit"),
    guessControls: $("guessControls"), judgeControls: $("judgeControls"), nextControls: $("nextControls"),
    teamPicks: $("teamPicks"), pointsHint: $("pointsHint"),
    gameRankingCard: $("gameRankingCard"), gameRanking: $("gameRanking"),
    alltimeRanking: $("alltimeRanking"), alltimeEmpty: $("alltimeEmpty"),
  };

  const COLORS = ["#e63946", "#f77f00", "#2b9348", "#1d7bd8", "#7b2cbf", "#d63384", "#2a9d8f", "#8d5524"];
  const ROUND_OPTIONS = [5, 10, 15, 20];
  const STORE_TEAMS = "bilderquiz-teams";
  const STORE_ALLTIME = "bilderquiz-alltime";
  const STORE_ROUNDS = "bilderquiz-rounds";

  let categories = {};   // { "Filmfigur": [{ name, query }, ...] }
  let queue = [];        // gemischte Begriffe des aktuellen Spiels
  let currentCategory = null;
  let current = null;    // { name, query, category, credit }
  let step = 0;
  let timer = null;

  let teams = [];        // [{ name, color, score }]
  let picked = new Set(); // Indizes der Teams, die in dieser Runde Punkte bekommen
  let totalRounds = 10;
  let round = 0;
  let gameSaved = false;

  // ---------- Speicher (localStorage kann fehlen, z. B. im privaten Modus) ----------
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
  }

  // ---------- Begriffe-Datei lesen ----------
  // Format:  [Kategorie]  danach eine Zeile pro Begriff,
  // optional "Lösung | Suchbegriff", Zeilen mit # sind Kommentare.
  function parseTerms(text) {
    const result = {};
    let cat = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const header = line.match(/^\[(.+)\]$/);
      if (header) {
        cat = header[1].trim();
        result[cat] = result[cat] || [];
        continue;
      }
      if (!cat) continue;
      const [name, query] = line.split("|").map((s) => s.trim());
      result[cat].push({ name, query: query || name });
    }
    return result;
  }

  async function loadTerms() {
    try {
      const res = await fetch(cfg.termsFile, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      categories = parseTerms(await res.text());
      renderCategories();
    } catch (e) {
      els.loadError.hidden = false;
      els.loadError.textContent =
        `Die Datei „${cfg.termsFile}“ konnte nicht geladen werden. ` +
        "Starte die Seite über einen kleinen Webserver (siehe README).";
    }
  }

  function renderCategories() {
    els.categories.innerHTML = "";
    const all = Object.entries(categories).filter(([, terms]) => terms.length);
    const addButton = (label, count, onClick) => {
      const b = document.createElement("button");
      b.className = "btn cat-btn";
      b.innerHTML = `${label}<small>${count} Bilder</small>`;
      b.onclick = onClick;
      els.categories.appendChild(b);
    };
    for (const [cat, terms] of all) addButton(cat, terms.length, () => startGame(cat));
    const total = all.reduce((n, [, t]) => n + t.length, 0);
    addButton("🎲 Alles gemischt", total, () => startGame(null));
  }

  // ---------- Teams einrichten ----------
  function saveTeams() {
    save(STORE_TEAMS, teams.map(({ name, color }) => ({ name, color })));
  }

  function addTeam() {
    if (teams.length >= COLORS.length) return;
    const used = new Set(teams.map((t) => t.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    teams.push({ name: `Team ${teams.length + 1}`, color, score: 0 });
    saveTeams();
    renderTeamList();
  }

  function renderTeamList() {
    els.teamList.innerHTML = "";
    teams.forEach((team, i) => {
      const row = document.createElement("div");
      row.className = "team-row";
      row.style.setProperty("--team", team.color);

      const input = document.createElement("input");
      input.className = "team-name";
      input.value = team.name;
      input.maxLength = 20;
      input.setAttribute("aria-label", `Name von Team ${i + 1}`);
      input.oninput = () => { team.name = input.value; saveTeams(); };

      const swatches = document.createElement("div");
      swatches.className = "swatches";
      for (const c of COLORS) {
        const s = document.createElement("button");
        s.className = "swatch" + (c === team.color ? " active" : "");
        s.style.background = c;
        s.setAttribute("aria-label", "Farbe wählen");
        s.onclick = () => { team.color = c; saveTeams(); renderTeamList(); };
        swatches.appendChild(s);
      }

      const del = document.createElement("button");
      del.className = "btn remove";
      del.textContent = "✕";
      del.title = "Team entfernen";
      del.disabled = teams.length <= 1;
      del.onclick = () => { teams.splice(i, 1); saveTeams(); renderTeamList(); };

      row.append(input, swatches, del);
      els.teamList.appendChild(row);
    });
    $("btnAddTeam").disabled = teams.length >= COLORS.length;
  }

  function renderRoundChoice() {
    els.roundChoice.innerHTML = "";
    for (const n of ROUND_OPTIONS) {
      const b = document.createElement("button");
      b.className = "btn" + (n === totalRounds ? " primary" : "");
      b.textContent = `${n} Bilder`;
      b.onclick = () => { totalRounds = n; save(STORE_ROUNDS, n); renderRoundChoice(); };
      els.roundChoice.appendChild(b);
    }
  }

  function teamLabel(team) {
    return team.name.trim() || "Ohne Namen";
  }

  function renderScoreboard() {
    els.scoreboard.innerHTML = teams
      .map((t) => `<span class="chip" style="--team:${t.color}">${escapeHtml(teamLabel(t))} <b>${t.score}</b></span>`)
      .join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Bildersuche ----------
  async function searchGoogle(query) {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.search = new URLSearchParams({
      key: cfg.googleApiKey, cx: cfg.googleCx, q: query,
      searchType: "image", safe: "active", num: "10", imgSize: "large",
    });
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return shuffle((data.items || []).map((it) => ({ src: it.link, credit: it.displayLink })));
  }

  async function wikiImage(lang, params) {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({
      action: "query", format: "json", origin: "*", redirects: "1",
      prop: "pageimages", piprop: "thumbnail", pithumbsize: "1600", pilicense: "any",
      ...params,
    });
    const data = await (await fetch(url)).json();
    const page = Object.values(data.query?.pages || {})[0];
    return page?.thumbnail ? { src: page.thumbnail.source, credit: `Wikipedia (${lang}): ${page.title}` } : null;
  }

  async function searchWikipedia(query) {
    // Optionales Sprachpräfix, z. B. "en:Pikachu"
    let langs = ["de", "en"];
    const prefix = query.match(/^([a-z]{2}):(.+)$/);
    if (prefix) {
      langs = [prefix[1]];
      query = prefix[2];
    }
    // 1. Artikel mit genau diesem Titel (deutsch, dann englisch)
    for (const lang of langs) {
      const hit = await wikiImage(lang, { titles: query });
      if (hit) return [hit];
    }
    // 2. Sonst der beste Suchtreffer – weitere Treffer zeigen oft etwas anderes
    const found = [];
    for (const lang of ["de", "en"]) {
      const hit = await wikiImage(lang, { generator: "search", gsrsearch: query, gsrlimit: "1" });
      if (hit) found.push(hit);
    }
    return found;
  }

  function findImages(query) {
    const useGoogle = cfg.source === "google" && cfg.googleApiKey && cfg.googleCx;
    return useGoogle ? searchGoogle(query) : searchWikipedia(query);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.onload = () => (img.naturalWidth > 100 ? resolve(src) : reject());
      img.onerror = reject;
      img.src = src;
    });
  }

  // ---------- Spielablauf ----------
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue() {
    const entries = currentCategory
      ? categories[currentCategory].map((t) => ({ ...t, category: currentCategory }))
      : Object.entries(categories).flatMap(([c, ts]) => ts.map((t) => ({ ...t, category: c })));
    queue = shuffle(entries);
  }

  function showScreen(name) {
    els.setup.hidden = name !== "setup";
    els.game.hidden = name !== "game";
    els.ranking.hidden = name !== "ranking";
    els.scoreboard.hidden = name !== "game";
    document.body.classList.toggle("in-game", name === "game");
    if (name !== "game" && fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }

  // ---------- Präsentationsmodus (Vollbild) ----------
  // Safari (iPad) kennt teils nur die webkit-Varianten der Fullscreen-API.
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const root = document.documentElement;

  function togglePresentation() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) { document.body.classList.toggle("presenting"); return; }
    const p = req.call(root);
    if (p && p.catch) p.catch(() => document.body.classList.toggle("presenting"));
  }

  // Sichtbare Höhe messen statt 100vh zu vertrauen (iOS liefert im Vollbild
  // und nach Drehen veraltete Werte). Mehrfach nachmessen, weil Safari die
  // endgültige Größe erst nach der Animation meldet.
  function updateAppHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    root.style.setProperty("--app-h", `${Math.round(h)}px`);
  }
  function remeasure() {
    updateAppHeight();
    [100, 300, 700].forEach((ms) => setTimeout(updateAppHeight, ms));
  }
  window.addEventListener("resize", remeasure);
  window.addEventListener("orientationchange", remeasure);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", updateAppHeight);
  updateAppHeight();

  function onFullscreenChange() {
    const on = !!fsElement();
    document.body.classList.toggle("presenting", on);
    $("btnPresent").textContent = on ? "✕ Vollbild beenden" : "⛶ Präsentation";
    remeasure();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if ((e.key === "f" || e.key === "F") && !els.game.hidden) togglePresentation();
  });

  function startGame(cat) {
    currentCategory = cat;
    buildQueue();
    teams.forEach((t) => (t.score = 0));
    round = 0;
    gameSaved = false;
    renderScoreboard();
    showScreen("game");
    nextRound();
  }

  function showControls(which) {
    els.guessControls.hidden = which !== "guess";
    els.judgeControls.hidden = which !== "judge";
    els.nextControls.hidden = which !== "next";
  }

  function renderStages() {
    els.stages.innerHTML = cfg.zoomSteps
      .map((_, i) => `<span class="${i <= step ? "done" : ""}"></span>`)
      .join("");
  }

  function setZoom(scale, animate) {
    els.picture.style.transition = animate ? "" : "none";
    els.picture.style.transform = `scale(${scale})`;
  }

  function runTimerBar() {
    const bar = els.timerBar;
    bar.style.transition = "none";
    bar.style.width = "0%";
    void bar.offsetWidth; // Neustart der Animation erzwingen
    bar.style.transition = `width ${cfg.secondsPerStep}s linear`;
    bar.style.width = "100%";
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
    els.timerBar.style.transition = "none";
  }

  async function nextRound() {
    if (round >= totalRounds) return endGame();
    stopTimer();
    if (!queue.length) buildQueue();
    round++;
    els.roundLabel.textContent = `Bild ${round} von ${totalRounds}`;
    showControls(null);
    els.answer.hidden = true;
    els.credit.textContent = "";
    els.picture.style.visibility = "hidden";
    els.loading.hidden = false;
    els.loading.textContent = "Bild wird gesucht …";

    // Begriffe probieren, bis ein Bild gefunden und geladen ist
    while (queue.length) {
      current = queue.pop();
      try {
        for (const cand of await findImages(current.query)) {
          try {
            await loadImage(cand.src);
            return startZoom(cand);
          } catch { /* nächstes Bild versuchen */ }
        }
      } catch (e) {
        console.warn("Suche fehlgeschlagen:", current.query, e);
      }
    }
    els.loading.textContent = "Keine Bilder gefunden. Prüfe Internet/Einstellungen.";
    showControls("next");
  }

  function startZoom(cand) {
    els.categoryLabel.textContent = current.category;
    current.credit = cand.credit; // erst bei der Auflösung zeigen, sonst verrät es die Lösung
    step = 0;

    // Zufälliger Ausschnitt, nicht ganz am Rand
    const x = 30 + Math.random() * 40;
    const y = 30 + Math.random() * 40;
    els.picture.style.transformOrigin = `${x}% ${y}%`;
    setZoom(cfg.zoomSteps[0], false);
    els.picture.src = cand.src;
    els.picture.style.visibility = "visible";
    els.loading.hidden = true;

    renderStages();
    showControls("guess");
    scheduleStep();
  }

  function scheduleStep() {
    runTimerBar();
    timer = setTimeout(() => {
      if (step < cfg.zoomSteps.length - 1) {
        step++;
        setZoom(cfg.zoomSteps[step], true);
        renderStages();
        scheduleStep();
      } else {
        reveal();
      }
    }, cfg.secondsPerStep * 1000);
  }

  // Je früher erraten, desto mehr Punkte
  function roundPoints() {
    return cfg.zoomSteps.length - step;
  }

  function reveal() {
    stopTimer();
    setZoom(1, true);
    els.answer.textContent = current.name;
    els.answer.hidden = false;
    els.credit.textContent = `Bild: ${current.credit}`;
    picked = new Set();
    const pts = roundPoints();
    els.pointsHint.textContent = `(+${pts} ${pts === 1 ? "Punkt" : "Punkte"})`;
    renderTeamPicks();
    showControls("judge");
  }

  // Mehrere Teams wählbar, z. B. bei Gleichstand
  function renderTeamPicks() {
    els.teamPicks.innerHTML = "";
    teams.forEach((team, i) => {
      const b = document.createElement("button");
      b.className = "btn big team-pick" + (picked.has(i) ? " picked" : "");
      b.style.setProperty("--team", team.color);
      b.setAttribute("aria-pressed", picked.has(i));
      b.textContent = (picked.has(i) ? "✅ " : "") + teamLabel(team);
      b.onclick = () => {
        picked.has(i) ? picked.delete(i) : picked.add(i);
        renderTeamPicks();
      };
      els.teamPicks.appendChild(b);
    });
    $("btnAward").disabled = picked.size === 0;
  }

  function award(teamIndexes) {
    const pts = roundPoints();
    for (const i of teamIndexes) teams[i].score += pts;
    renderScoreboard();
    $("btnNext").textContent = round >= totalRounds ? "🏆 Zur Rangliste" : "➡️ Nächstes Bild";
    showControls("next");
  }

  // ---------- Rangliste ----------
  function sortedTeams() {
    return [...teams].sort((a, b) => b.score - a.score);
  }

  function saveAlltime() {
    if (gameSaved || round === 0) return;
    gameSaved = true;
    const alltime = load(STORE_ALLTIME, {});
    const best = Math.max(...teams.map((t) => t.score));
    for (const t of teams) {
      const key = teamLabel(t).toLowerCase();
      const entry = alltime[key] || { name: teamLabel(t), points: 0, wins: 0, games: 0 };
      entry.name = teamLabel(t);
      entry.color = t.color;
      entry.points += t.score;
      entry.games += 1;
      if (best > 0 && t.score === best) entry.wins += 1;
      alltime[key] = entry;
    }
    save(STORE_ALLTIME, alltime);
  }

  function renderGameRanking() {
    const medals = ["🥇", "🥈", "🥉"];
    let place = 0, lastScore = null;
    els.gameRanking.innerHTML = sortedTeams()
      .map((t, i) => {
        if (t.score !== lastScore) place = i; // gleiche Punkte = gleicher Platz
        lastScore = t.score;
        return `<li style="--team:${t.color}"><span class="medal">${medals[place] || place + 1 + "."}</span>
          <span class="dot"></span><span class="rank-name">${escapeHtml(teamLabel(t))}</span>
          <span class="rank-score">${t.score}</span></li>`;
      })
      .join("");
  }

  function renderAlltime() {
    const rows = Object.values(load(STORE_ALLTIME, {}))
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
    els.alltimeEmpty.hidden = rows.length > 0;
    els.alltimeRanking.innerHTML = rows
      .map((r, i) => `<tr><td>${i + 1}</td>
        <td><span class="dot" style="--team:${r.color || "#999"}"></span> ${escapeHtml(r.name)}</td>
        <td>${r.points}</td><td>${r.wins}</td><td>${r.games}</td></tr>`)
      .join("");
  }

  function endGame() {
    stopTimer();
    saveAlltime();
    renderGameRanking();
    renderAlltime();
    els.gameRankingCard.hidden = round === 0;
    showScreen("ranking");
  }

  function showAlltimeOnly() {
    renderAlltime();
    els.gameRankingCard.hidden = true;
    showScreen("ranking");
  }

  // ---------- Start ----------
  $("btnAddTeam").onclick = addTeam;
  $("btnGuess").onclick = reveal;
  $("btnAward").onclick = () => award(picked);
  $("btnNobody").onclick = () => award([]);
  $("btnNext").onclick = nextRound;
  $("btnEnd").onclick = endGame;
  $("btnPresent").onclick = togglePresentation;
  $("btnAgain").onclick = () => { showScreen("setup"); renderTeamList(); };
  $("btnShowAlltime").onclick = showAlltimeOnly;
  $("btnResetAlltime").onclick = () => {
    if (confirm("Ewige Rangliste wirklich löschen?")) {
      save(STORE_ALLTIME, {});
      renderAlltime();
    }
  };

  teams = load(STORE_TEAMS, []).map((t) => ({ ...t, score: 0 }));
  if (!teams.length) {
    teams = [
      { name: "Team Rot", color: COLORS[0], score: 0 },
      { name: "Team Blau", color: COLORS[3], score: 0 },
    ];
  }
  totalRounds = load(STORE_ROUNDS, 10);
  renderTeamList();
  renderRoundChoice();
  showScreen("setup");
  loadTerms();
})();
