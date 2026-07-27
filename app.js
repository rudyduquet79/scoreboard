/* ============================================================
   TV Dashboard — logique
   Lit le Google Sheet en direct via l'endpoint public gviz
   ============================================================ */

/* ---------- Parseur CSV (gère guillemets et sauts de ligne) ---------- */
function parseCSV(text) {
  var rows = [], row = [], cell = "", inQ = false;

  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* ignore */ }
      else cell += c;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- Normalisation de texte pour comparer les en-têtes ---------- */
function norm(s) {
  if (s === null || s === undefined) return "";
  var out = String(s).replace(/\s+/g, " ").trim().toLowerCase();
  if (String.prototype.normalize) {
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
  s = s.replace(/[\s   ]/g, "")   // espaces, insécables, fines
       .replace(/[$€%]/g, "")
       .replace(/,/g, ".");

  // "1.000.00" → on ne garde que le dernier point comme séparateur décimal
  var parts = s.split(".");
  if (parts.length > 2) {
    s = parts.slice(0, parts.length - 1).join("") + "." + parts[parts.length - 1];
  }

  var n = parseFloat(s);
  if (!isFinite(n)) return null;
  return { n: n, isPct: isPct };
}

/* ---------- Formatage pour l'affichage ---------- */
function nf(n) {
  try { return n.toLocaleString("fr-CA"); }
  catch (e) { return String(n); }
}

function fmtValue(n, fmt) {
  if (n === null) return "—";
  if (fmt === "pct") {
    var v = (n > 0 && n <= 1) ? n * 100 : n;
    return (Math.round(v * 10) / 10) + " %";
  }
  if (fmt === "money") return "$" + nf(Math.round(n));
  var r = (Math.abs(n) < 10 && n % 1 !== 0) ? Math.round(n * 10) / 10 : Math.round(n);
  return nf(r);
}

/* ---------- Récupération du Sheet ---------- */
function fetchTab(gid) {
  var url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq"
          + "?tqx=out:csv&headers=0&gid=" + encodeURIComponent(gid)
          + "&_=" + Date.now();

  return fetch(url, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("Réponse HTTP " + res.status);
      return res.text();
    })
    .then(function (txt) {
      if (/^\s*(<!DOCTYPE|<html)/i.test(txt)) {
        throw new Error("Le Google Sheet n'est pas accessible publiquement.");
      }
      return parseCSV(txt);
    });
}

/* ---------- Extraction des données ---------- */
function extract(grid, metrics) {
  // ligne d'en-tête = celle qui contient "MÉTRIQUE" dans les premières colonnes
  var hRow = -1;
  for (var r = 0; r < Math.min(grid.length, 12); r++) {
    var head = grid[r].slice(0, 4);
    for (var k = 0; k < head.length; k++) {
      if (norm(head[k]) === "metrique") { hRow = r; break; }
    }
    if (hRow !== -1) break;
  }
  if (hRow === -1) hRow = 1;

  var headers = grid[hRow].map(norm);

  // index de colonne pour chaque métrique
  var cols = metrics.map(function (m) {
    var target = norm(m.header);
    var idx = headers.indexOf(target);
    if (idx === -1) {
      for (var i = 0; i < headers.length; i++) {
        var h = headers[i];
        if (h && (h.indexOf(target) !== -1 || target.indexOf(h) !== -1)) { idx = i; break; }
      }
    }
    return idx;
  });

  // lignes "Semaine N" et ligne "Objectif"
  var weeks = [], goalRow = null;
  for (var rr = hRow + 1; rr < grid.length; rr++) {
    var a = norm(grid[rr][0]);
    if (/^semaine \d+$/.test(a)) {
      weeks.push({ r: rr, num: parseInt(a.replace(/\D/g, ""), 10) });
    } else if (a === "objectif") {
      goalRow = rr;
    }
  }

  function cellOf(row, col) {
    if (col === -1 || row === null || row === undefined) return null;
    var line = grid[row];
    return line ? line[col] : null;
  }

  // dernière semaine ayant au moins une donnée parmi les métriques suivies
  var current = null;
  for (var w = weeks.length - 1; w >= 0; w--) {
    var hasData = false;
    for (var c = 0; c < cols.length; c++) {
      var v = cellOf(weeks[w].r, cols[c]);
      if (v !== null && v !== undefined && String(v).trim() !== "") { hasData = true; break; }
    }
    if (hasData) { current = weeks[w]; break; }
  }
  if (!current && weeks.length) current = weeks[weeks.length - 1];

  var out = metrics.map(function (m, i) {
    var col  = cols[i];
    var cur  = current ? toNum(cellOf(current.r, col)) : null;
    var goal = goalRow !== null ? toNum(cellOf(goalRow, col)) : null;

    // index de la semaine courante
    var ci = -1;
    if (current) {
      for (var z = 0; z < weeks.length; z++) if (weeks[z].r === current.r) ci = z;
    }

    // historique décroissant des valeurs présentes avant la semaine courante
    var hist = [];
    for (var k2 = ci - 1; k2 >= 0; k2--) {
      var p = toNum(cellOf(weeks[k2].r, col));
      if (p !== null) hist.push({ n: p.n, num: weeks[k2].num });
    }

    // si la case de la semaine courante est vide, on retombe sur la dernière
    // valeur connue et on l'indique discrètement (données pas encore saisies)
    var value = cur ? cur.n : null;
    var staleWeek = null;
    var prev = hist.length ? hist[0].n : null;

    if (value === null && hist.length) {
      value = hist[0].n;
      staleWeek = hist[0].num;
      prev = hist.length > 1 ? hist[1].n : null;
    }

    return {
      header: m.header,
      label:  m.label,
      dir:    m.dir,
      fmt:    m.fmt,
      found:  col !== -1,
      value:  value,
      prev:   prev,
      goal:   goal ? goal.n : null,
      stale:  staleWeek
    };
  });

  return { metrics: out, week: current ? current.num : null };
}

/* ---------- Rendu d'une carte ---------- */
function renderCard(m) {
  var el = document.createElement("div");
  el.className = "card";

  var hasVal  = m.value !== null;
  var hasGoal = m.goal !== null && m.goal !== 0;

  // ratio d'atteinte de l'objectif
  var ratio = null;
  if (hasVal && hasGoal) {
    ratio = (m.dir === "down") ? (m.value === 0 ? 1 : m.goal / m.value) : m.value / m.goal;
    if (!isFinite(ratio)) ratio = null;
  }

  var state = "none";
  if (ratio !== null) state = ratio >= 1 ? "ok" : (ratio >= 0.8 ? "close" : "miss");
  el.className = "card " + state;

  // delta vs semaine précédente
  var deltaHtml = "";
  if (hasVal && m.prev !== null) {
    var d = m.value - m.prev;
    var good = (m.dir === "down") ? d < 0 : d > 0;
    var cls = d === 0 ? "flat" : (good ? "up" : "down");
    var sign = d > 0 ? "+" : (d < 0 ? "−" : "");
    var abs = Math.abs(d);
    var txt = (m.fmt === "pct")
      ? (Math.round(abs * 10) / 10) + " pt"
      : nf((abs < 10 && abs % 1 !== 0) ? Math.round(abs * 10) / 10 : Math.round(abs));
    var arrow = d === 0 ? "→" : (d > 0 ? "↑" : "↓");
    deltaHtml = '<span class="delta ' + cls + '">' + arrow + " " + sign + txt + "</span>";
  }

  var pctTxt  = ratio !== null ? Math.round(ratio * 100) + " %" : "—";
  var barW    = ratio !== null ? Math.min(100, Math.max(2, ratio * 100)) : 0;
  var goalTxt = hasGoal
    ? "Objectif " + fmtValue(m.goal, m.fmt)
    : (m.found ? "Aucun objectif" : "Colonne introuvable");

  var staleTag = m.stale ? '<span class="stale-tag">sem. ' + m.stale + "</span>" : "";

  el.innerHTML =
    '<div class="card-label">' + m.label + staleTag + "</div>" +
    '<div class="card-value">' +
      '<span class="value' + (hasVal ? "" : " empty") + '">' + fmtValue(m.value, m.fmt) + "</span>" +
      deltaHtml +
    "</div>" +
    '<div class="card-foot">' +
      '<div class="goal-row"><span>' + goalTxt + '</span><span class="pct">' + pctTxt + "</span></div>" +
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

/* ---------- Boucle principale ---------- */
function boot(boardKey) {
  var board = BOARDS[boardKey];
  var gid   = GIDS[boardKey];

  document.title = board.title + " — Scoreboard";
  document.getElementById("board-title").textContent = board.title;

  var loading = document.getElementById("loading");
  var errBox  = document.getElementById("error");
  var grid    = document.getElementById("grid");
  var dot     = document.getElementById("dot");
  var syncTxt = document.getElementById("sync-text");

  if (!gid || gid === "REMPLACER") {
    loading.hidden = true;
    errBox.hidden = false;
    document.getElementById("error-msg").innerHTML =
      "Le <code>gid</code> de cet onglet n'est pas encore configuré.<br><br>" +
      "Ouvre le Google Sheet, clique sur l'onglet <strong>" + board.title + "</strong>, " +
      "copie le chiffre après <code>#gid=</code> dans l'URL, puis colle-le dans " +
      "<code>config.js</code> à la ligne <code>" + boardKey + ': "REMPLACER"</code>.';
    return;
  }

  function load() {
    return fetchTab(gid).then(function (gridData) {
      var res = extract(gridData, board.metrics);

      grid.innerHTML = "";
      res.metrics.forEach(function (m) { grid.appendChild(renderCard(m)); });

      document.getElementById("week-value").textContent =
        res.week ? "Semaine " + res.week : "—";

      dot.className = "dot";
      var now = new Date();
      syncTxt.textContent = "Synchronisé à " +
        now.getHours() + "h" + ("0" + now.getMinutes()).slice(-2);

      loading.hidden = true;
      errBox.hidden = true;
    }).catch(function (e) {
      dot.className = "dot err";
      syncTxt.textContent = "Échec de synchronisation";
      if (!grid.children.length) {
        loading.hidden = true;
        errBox.hidden = false;
        document.getElementById("error-msg").innerHTML =
          e.message + "<br><br>Vérifie que le Google Sheet est partagé en " +
          "« Tous les utilisateurs disposant du lien — Lecteur ».";
      }
    });
  }

  startClock();
  load();

  // rafraîchissement automatique
  setInterval(load, Math.max(1, REFRESH_MINUTES) * 60 * 1000);

  // rechargement complet vers 4 h du matin : évite toute dérive mémoire
  // si la TV reste allumée pendant des semaines
  setInterval(function () {
    var h = new Date();
    if (h.getHours() === 4 && h.getMinutes() < 5) location.reload();
  }, 4 * 60 * 1000);

  // refresh manuel : touche R (ou clic / tap n'importe où sur l'écran)
  window.addEventListener("keydown", function (e) {
    if (e.key && e.key.toLowerCase() === "r") load();
  });
  window.addEventListener("click", function () { load(); });
}
