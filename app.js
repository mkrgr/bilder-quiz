(() => {
  const cfg = window.QUIZ_CONFIG;
  const $ = (id) => document.getElementById(id);

  const els = {
    setup: $("setup"), game: $("game"), categories: $("categories"), loadError: $("loadError"),
    categoryLabel: $("categoryLabel"), stages: $("stages"), picture: $("picture"),
    loading: $("loading"), answer: $("answer"), timerBar: $("timerBar"), credit: $("credit"),
    guessControls: $("guessControls"), judgeControls: $("judgeControls"), nextControls: $("nextControls"),
    score: $("score"),
  };

  let categories = {};   // { "Filmfigur": [{ name, query }, ...] }
  let queue = [];        // gemischte Begriffe der aktuellen Runde
  let currentCategory = null;
  let current = null;    // { name, query, category }
  let step = 0;
  let timer = null;
  let score = 0;

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
    for (const [cat, terms] of all) addButton(cat, terms.length, () => startCategory(cat));
    const total = all.reduce((n, [, t]) => n + t.length, 0);
    addButton("🎲 Alles gemischt", total, () => startCategory(null));
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

  function startCategory(cat) {
    currentCategory = cat;
    buildQueue();
    els.setup.hidden = true;
    els.game.hidden = false;
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
    stopTimer();
    if (!queue.length) buildQueue();
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

  function reveal() {
    stopTimer();
    setZoom(1, true);
    els.answer.textContent = current.name;
    els.answer.hidden = false;
    els.credit.textContent = `Bild: ${current.credit}`;
    showControls("judge");
  }

  function judge(correct) {
    if (correct) {
      // Je früher erraten, desto mehr Punkte
      score += cfg.zoomSteps.length - step;
      els.score.textContent = score;
    }
    showControls("next");
  }

  $("btnGuess").onclick = reveal;
  $("btnRight").onclick = () => judge(true);
  $("btnWrong").onclick = () => judge(false);
  $("btnNext").onclick = nextRound;
  $("btnMenu").onclick = () => {
    stopTimer();
    els.game.hidden = true;
    els.setup.hidden = false;
  };

  loadTerms();
})();
