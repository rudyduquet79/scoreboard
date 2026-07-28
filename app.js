/* ============================================================
   TV Dashboard — logique
   Lit le Google Sheet en direct et calcule les métriques dérivées
   ============================================================ */

/* ---------- Normalisation de texte pour comparer les en-têtes ---------- */
function norm(s) {
  if (s === null || s === undefined) return "";
  var out = String(s).replace(/\s+/g, " ").trim().toLowerCase();
  if (String.prototype.normalize) {
    // ̀-ͯ = accents combinants, en échappement ASCII
    // pour rester insensible à l'encodage du fichier servi
    out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  return out.replace(/[^a-z0-9%$ ]/g, "").replace(/\s+/g, " ").trim();
}

/* ---------- Parsing d'un nombre au format québécois ---------- */
function toNum(raw) {
  if (raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  if (!s) return null;

  var isPct = s.indexOf("%") !== -1;
  s = s.replace(/[\s   ]/g, "")
       .replace(/[$€%]/g, "")
       .replace(/,/g, ".");

  var parts = s.split(".");
  if (parts.length > 2) {
    s = parts.slice(0, parts.length - 1).join("") + "." + parts[parts.length - 1];
  }

  var n = parseFloat(s);
  if (!isFinite(n)) return null;
  return { n: n, isPct: isPct };
}

/* ---------- Formatage ---------- */
function nf(n) {
  try { return n.toLocaleString("fr-CA"); } catch (e) { return String(n); }
}

function fmtValue(n, fmt) {
  if (n === null || n === undefined) return "—";
  if (fmt === "pct") {
    // sous 10 %, deux décimales (2,59 %) ; au-delà, entier (23 %)
    var r = Math.abs(n) < 10 ? Math.round(n * 100) / 100 : Math.round(n);
    return nf(r) + " %";
  }
  if (fmt === "money") return "$" + nf(Math.round(n));
  var v = (Math.abs(n) < 10 && n % 1 !== 0) ? Math.round(n * 10) / 10 : Math.round(n);
  return nf(v);
}

/* Même valeur, mais le symbole (%, $) est enveloppé pour être affiché un peu
   plus petit que le chiffre : plus lisible, et ça libère de la largeur dans
   les tuiles où la valeur et l'écart hebdomadaire se disputent la place. */
function fmtValueHtml(n, fmt) {
  var t = fmtValue(n, fmt);
  if (fmt === "pct") return t.replace(/\s*%$/, '<span class="unit">%</span>');
  if (fmt === "money") return t.replace(/^\$/, '<span class="unit">$</span>');
  return t;
}

/* ---------- Récupération du Sheet ----------
   JSONP plutôt que fetch : l'endpoint gviz de Google ne renvoie pas
   d'en-tête Access-Control-Allow-Origin, donc un fetch depuis un autre
   domaine échoue avec « Failed to fetch ». Une balise <script> n'est
   pas soumise à cette restriction.                                     */

function tableToGrid(table) {
  var rows = table.rows || [];
  var grid = [];

  /* Ligne 0 : les libellés de colonnes construits par Google.
     Le paramètre headers=0 n'est pas respecté en mode JSON : Google consomme
     les lignes d'en-tête du Sheet et en concatène le texte dans ces libellés
     (« MARKETING Publicités Facebook (Leads) »). On les place donc en tête de
     la grille. Si Google respecte headers=0, les libellés sont vides et les
     vraies lignes suivent — le repérage de « MÉTRIQUE » fonctionne dans les
     deux cas.                                                              */
  var cols = table.cols || [];
  var labels = [];
  for (var c = 0; c < cols.length; c++) {
    labels.push(cols[c] && cols[c].label ? cols[c].label : "");
  }
  grid.push(labels);

  for (var i = 0; i < rows.length; i++) {
    var cells = (rows[i] && rows[i].c) || [];
    var line = [];
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j];
      if (!cell) { line.push(""); continue; }
      // f = valeur formatée telle qu'affichée dans le Sheet ("50%", "1 000,00 $")
      if (cell.f !== undefined && cell.f !== null) line.push(cell.f);
      else if (cell.v !== undefined && cell.v !== null) line.push(cell.v);
      else line.push("");
    }
    grid.push(line);
  }
  return grid;
}

function fetchTab(gid) {
  return new Promise(function (resolve, reject) {
    var cb = "__gvizcb" + Date.now() + Math.floor(Math.random() * 100000);
    var script = document.createElement("script");
    var settled = false;

    function cleanup() {
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = function (res) {
      if (settled) return;
      settled = true; cleanup();
      if (!res || !res.table) {
        reject(new Error("Le Sheet a répondu, mais sans données exploitables."));
        return;
      }
      try { resolve(tableToGrid(res.table)); }
      catch (e) { reject(e); }
    };

    script.onerror = function () {
      if (settled) return;
      settled = true; cleanup();
      reject(new Error("Impossible de joindre le Google Sheet."));
    };

    setTimeout(function () {
      if (settled) return;
      settled = true; cleanup();
      reject(new Error("Le Google Sheet n'a pas répondu à temps."));
    }, 20000);

    /* Pas de paramètre headers : il faut laisser Google détecter lui-même les
       deux lignes d'en-tête du Sheet. Avec headers=0, Google type chaque
       colonne d'après ses données — une colonne de chiffres devient
       « numérique » et le texte de son en-tête est purement supprimé de la
       réponse JSON. En le laissant détecter, les noms sont conservés dans
       cols[].label, préfixés de leur section.                              */
    script.charset = "utf-8";
    script.src = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq"
               + "?tqx=out:json;responseHandler:" + cb
               + "&gid=" + encodeURIComponent(gid)
               + "&_=" + Date.now();
    document.head.appendChild(script);
  });
}

/* ============================================================
   EXTRACTION
   ============================================================ */

function extract(grid, board) {
  /* --- ligne d'en-tête : celle qui contient « MÉTRIQUE » --- */
  var hRow = -1;
  for (var r = 0; r < Math.min(grid.length, 12) && hRow === -1; r++) {
    var head = grid[r].slice(0, 4);
    for (var k = 0; k < head.length; k++) {
      if (norm(head[k]) === "metrique") { hRow = r; break; }
    }
  }
  if (hRow === -1) hRow = 1;

  var headers = grid[hRow].map(norm);

  /* Les libellés arrivent souvent préfixés de leur section
     (« MARKETING Publicités Facebook (Leads) »), d'où la recherche en
     trois passes, de la plus stricte à la plus permissive.              */
  function colOf(headerName) {
    if (!headerName) return -1;
    var target = norm(headerName);
    if (!target) return -1;

    // 1. correspondance exacte
    var idx = headers.indexOf(target);
    if (idx !== -1) return idx;

    // 2. le libellé se termine par le nom cherché (cas du préfixe de section)
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (h && h.length > target.length &&
          h.slice(h.length - target.length) === target) return i;
    }

    // 3. le libellé contient le nom cherché
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] && headers[j].indexOf(target) !== -1) return j;
    }

    return -1;
  }

  /* --- lignes « Semaine N » et ligne « Objectif » --- */
  var weeks = [], goalRow = null;
  for (var rr = hRow + 1; rr < grid.length; rr++) {
    var a = norm(grid[rr][0]);
    if (/^semaine \d+$/.test(a)) {
      weeks.push({ r: rr, num: parseInt(a.replace(/\D/g, ""), 10) });
    } else if (a === "objectif") {
      goalRow = rr;
    }
  }

  function cell(row, col) {
    if (col === -1 || row === null || row === undefined) return null;
    var line = grid[row];
    return line ? line[col] : null;
  }
  function num(row, col) {
    var v = toNum(cell(row, col));
    return v ? v.n : null;
  }
  function goalOf(headerName) {
    return goalRow === null ? null : num(goalRow, colOf(headerName));
  }

  /* --- toutes les colonnes suivies, pour repérer la semaine courante --- */
  var tracked = [];
  for (var i = 0; i < board.rows.length; i++) {
    for (var j = 0; j < board.rows[i].length; j++) {
      var m = board.rows[i][j];
      [m.header, m.num, m.den, m.lost, m.base].forEach(function (h) {
        if (h) { var c = colOf(h); if (c !== -1 && tracked.indexOf(c) === -1) tracked.push(c); }
      });
    }
  }

  var current = null;
  for (var w = weeks.length - 1; w >= 0 && !current; w--) {
    for (var t = 0; t < tracked.length; t++) {
      var v = cell(weeks[w].r, tracked[t]);
      if (v !== null && v !== undefined && String(v).trim() !== "") { current = weeks[w]; break; }
    }
  }
  if (!current && weeks.length) current = weeks[weeks.length - 1];

  var curIdx = -1;
  if (current) for (var z = 0; z < weeks.length; z++) if (weeks[z].r === current.r) curIdx = z;

  /* ---------- métrique simple : lecture directe d'une colonne ---------- */
  function readSimple(m) {
    var col = colOf(m.header);
    if (col === -1) {
      return { found: false, value: null, prev: null, goal: null };
    }

    var cur = current ? num(current.r, col) : null;

    // historique décroissant avant la semaine courante
    var hist = [];
    for (var q = curIdx - 1; q >= 0; q--) {
      var p = num(weeks[q].r, col);
      if (p !== null) hist.push({ n: p, num: weeks[q].num });
    }

    var value = cur, stale = null, prev = hist.length ? hist[0].n : null;
    if (value === null && hist.length) {          // case vide → dernière valeur connue
      value = hist[0].n;
      stale = hist[0].num;
      prev  = hist.length > 1 ? hist[1].n : null;
    }

    return {
      found: true, value: value, prev: prev, goal: goalOf(m.header),
      tag: stale ? "sem. " + stale : null
    };
  }

  /* ---------- ratio : num ÷ den, en pourcentage ---------- */
  function readRatio(m) {
    var cn = colOf(m.num), cd = colOf(m.den);
    if (cn === -1 || cd === -1) return { found: false, value: null, prev: null, goal: null };

    function at(row) {
      var a = num(row, cn), b = num(row, cd);
      if (a === null || b === null || b === 0) return null;
      return { pct: a / b * 100, a: a, b: b };
    }

    var cur = current ? at(current.r) : null;
    var prev = null;
    for (var q = curIdx - 1; q >= 0 && !prev; q--) prev = at(weeks[q].r);

    return {
      found: true,
      value: cur ? cur.pct : null,
      prev:  prev ? prev.pct : null,
      goal:  goalOf(m.goalHeader || m.num),
      tag:   cur ? (nf(cur.a) + " / " + nf(cur.b) + (m.unitLabel ? " " + m.unitLabel : "")) : null
    };
  }

  /* ---------- churn : pertes cumulées ÷ effectif de départ ---------- */
  function readChurn(m) {
    var cl = colOf(m.lost), cb = colOf(m.base);
    if (cl === -1 || cb === -1) return { found: false, value: null, prev: null, goal: null };

    var n = m.weeks || 4;

    // semaines disposant d'une valeur de pertes, dans l'ordre chronologique
    var seq = [];
    for (var q = 0; q <= (curIdx === -1 ? weeks.length - 1 : curIdx); q++) {
      var lost = num(weeks[q].r, cl);
      if (lost !== null) seq.push({ r: weeks[q].r, num: weeks[q].num, lost: lost });
    }

    // période de n semaines se terminant à l'index `end`
    function period(end) {
      var start = end - n + 1;
      if (start < 0) return null;
      var sum = 0;
      for (var k = start; k <= end; k++) sum += seq[k].lost;
      var base = num(seq[start].r, cb);
      if (base === null || base === 0) return null;
      return { pct: sum / base * 100, from: seq[start].num, to: seq[end].num };
    }

    var cur  = seq.length     ? period(seq.length - 1)     : null;
    var prev = seq.length > n ? period(seq.length - 1 - n) : null;

    return {
      found: true,
      value: cur  ? cur.pct  : null,
      prev:  prev ? prev.pct : null,
      goal:  goalOf(m.goalHeader),
      tag:   cur ? ("S" + cur.from + "–S" + cur.to) : null,
      note:  prev ? ("Objectif " + fmtValue(goalOf(m.goalHeader), "pct")
                     + " · préc. " + fmtValue(prev.pct, "pct")) : null
    };
  }

  /* --- assemblage --- */
  var out = board.rows.map(function (row) {
    return row.map(function (m) {
      var d = m.calc === "ratio" ? readRatio(m)
            : m.calc === "churn" ? readChurn(m)
            : readSimple(m);
      return {
        label: m.label, dir: m.dir, fmt: m.fmt, calc: m.calc || null,
        found: d.found, value: d.value, prev: d.prev, goal: d.goal,
        tag: d.tag || null, note: d.note || null
      };
    });
  });

  return { rows: out, week: current ? current.num : null };
}

/* ============================================================
   RENDU
   ============================================================ */

function renderCard(m) {
  var el = document.createElement("div");

  var has = m.value !== null && m.value !== undefined;
  var hg  = m.goal !== null && m.goal !== undefined && m.goal !== 0;

  var ratio = null;
  if (has && hg) {
    ratio = (m.dir === "down") ? (m.value === 0 ? 1 : m.goal / m.value) : m.value / m.goal;
    if (!isFinite(ratio)) ratio = null;
  }

  var state = ratio === null ? "none" : (ratio >= 1 ? "ok" : (ratio >= 0.8 ? "close" : "miss"));
  el.className = "card " + state + (m.found ? "" : " todo");

  /* écart avec la période précédente */
  var deltaHtml = "";
  if (has && m.prev !== null && m.prev !== undefined) {
    var d = m.value - m.prev;
    var rounded = Math.abs(d) < 10 ? Math.round(d * 100) / 100 : Math.round(d);
    var good = (m.dir === "down") ? d < 0 : d > 0;
    var cls  = rounded === 0 ? "flat" : (good ? "up" : "down");
    var ar   = rounded === 0 ? "→" : (d > 0 ? "↑" : "↓");
    var sg   = rounded > 0 ? "+" : (rounded < 0 ? "−" : "");
    deltaHtml = '<span class="delta ' + cls + '">' + ar + " " + sg
              + nf(Math.abs(rounded))
              + (m.fmt === "pct" ? '<span class="unit">pt</span>' : "") + "</span>";
  }

  var pctTxt = ratio === null ? "—" : Math.round(Math.min(ratio, 9.99) * 100) + " %";
  var barW   = ratio === null ? 0 : Math.min(100, Math.max(2, ratio * 100));

  var note = m.note ? m.note
           : hg ? ("Objectif " + fmtValue(m.goal, m.fmt))
           : (m.found ? "Aucun objectif" : "Colonne manquante");

  var tag = m.tag ? '<span class="tag' + (m.calc ? " calc" : "") + '">' + m.tag + "</span>"
        : (m.found ? "" : '<span class="tag warn">à créer</span>');

  el.innerHTML =
    '<div class="card-label">' + m.label + tag + "</div>" +
    '<div class="card-value">' +
      '<span class="value' + (has ? "" : " empty") + '">' + fmtValueHtml(m.value, m.fmt) + "</span>" +
      deltaHtml +
    "</div>" +
    '<div class="card-foot">' +
      '<div class="goal-row"><span class="txt">' + note + '</span><span class="pct">' + pctTxt + "</span></div>" +
      '<div class="bar"><i></i></div>' +
    "</div>";

  setTimeout(function () {
    var bar = el.querySelector(".bar > i");
    if (bar) bar.style.width = barW + "%";
  }, 60);

  return el;
}

/* ---------- Horloge ---------- */
function startClock() {
  var t = document.getElementById("clock-time");
  var d = document.getElementById("clock-date");
  if (!t) return;
  function tick() {
    var now = new Date();
    try {
      t.textContent = now.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
      d.textContent = now.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
    } catch (e) {
      t.textContent = now.getHours() + "h" + ("0" + now.getMinutes()).slice(-2);
    }
  }
  tick();
  setInterval(tick, 20000);
}

/* ============================================================
   BOUCLE PRINCIPALE
   ============================================================ */

function boot(boardKey) {
  var board = BOARDS[boardKey];
  var gid   = GIDS[boardKey];

  document.title = board.title + " — Scoreboard";
  document.getElementById("board-title").textContent = board.title;

  var loading = document.getElementById("loading");
  var errBox  = document.getElementById("error");
  var host    = document.getElementById("grid");
  var dot     = document.getElementById("dot");
  var syncTxt = document.getElementById("sync-text");

  host.className = "rows";   // rangées de hauteur égale

  function fail(msg) {
    loading.hidden = true;
    errBox.hidden = false;
    document.getElementById("error-msg").innerHTML = msg;
    dot.className = "dot err";
  }

  if (!gid || gid === "REMPLACER") {
    fail("Le <code>gid</code> de l'onglet <strong>" + board.title + "</strong> n'est pas configuré dans <code>config.js</code>.");
    return;
  }

  function load() {
    return fetchTab(gid).then(function (grid) {
      var res = extract(grid, board);

      // diagnostic : aucune colonne reconnue
      var found = 0, total = 0;
      for (var i = 0; i < res.rows.length; i++) {
        for (var j = 0; j < res.rows[i].length; j++) {
          total++; if (res.rows[i][j].found) found++;
        }
      }
      if (found === 0) {
        fail("Le Sheet répond, mais aucune colonne n'a été reconnue dans l'onglet <code>gid=" + gid + "</code>."
           + "<br><br>Vérifie que la ligne d'en-tête contient toujours <code>MÉTRIQUE</code> en colonne B.");
        syncTxt.textContent = "Colonnes non reconnues";
        return;
      }

      host.innerHTML = "";
      res.rows.forEach(function (row) {
        var rowEl = document.createElement("div");
        rowEl.className = "row";
        row.forEach(function (m) { rowEl.appendChild(renderCard(m)); });
        host.appendChild(rowEl);
      });

      document.getElementById("week-value").textContent =
        res.week ? "Semaine " + res.week : "—";

      dot.className = "dot";
      var now = new Date();
      syncTxt.textContent = "Synchronisé à " + now.getHours() + "h" + ("0" + now.getMinutes()).slice(-2);

      loading.hidden = true;
      errBox.hidden = true;
    }).catch(function (e) {
      dot.className = "dot err";
      syncTxt.textContent = "Échec de synchronisation";
      if (!host.children.length) {
        fail(e.message + "<br><br>Vérifie que le Sheet est partagé en « Tous les utilisateurs disposant du lien — Lecteur ».");
      }
    });
  }

  startClock();
  load();

  setInterval(load, Math.max(1, REFRESH_MINUTES) * 60 * 1000);

  // rechargement complet vers 4 h : stabilité sur plusieurs semaines
  setInterval(function () {
    var h = new Date();
    if (h.getHours() === 4 && h.getMinutes() < 5) location.reload();
  }, 4 * 60 * 1000);

  // refresh manuel : touche R, ou clic / tap
  window.addEventListener("keydown", function (e) {
    if (e.key && e.key.toLowerCase() === "r") load();
  });
  window.addEventListener("click", function () { load(); });
}
