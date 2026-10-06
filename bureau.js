/* ============================================================
   Dashboard Bureau — entonnoirs de vente des deux entreprises
   Réutilise les fonctions de lecture d'app.js (fetchTab, norm,
   toNum, nf) et applique son propre rendu en entonnoir.
   ============================================================ */

/* Chaque étape :
     label   texte affiché
     header  colonne du Sheet
     goal    colonne où lire l'objectif (souvent la même)
     rate    true  = on affiche le taux de conversion depuis l'étape d'avant
   La première étape n'a pas de taux : c'est le point de départ.        */

/* Nombre de semaines cumulées dans la fenêtre affichée.
   4 semaines = 28 jours. Mettre 1 pour revenir à la semaine seule. */
var WINDOW_WEEKS = 4;

var FUNNELS = {
  fitness: {
    title: "One Fight Fitness",
    gid: GIDS.fitness,
    steps: [
      { label: "Rendez-vous bookés",  header: "Nb Rendez-vous" },
      { label: "Show",                header: "Show",                   rate: true },
      { label: "Ventes",              header: "Défi 6 Semaines",        rate: true },
      { label: "Conversion abonnement", header: "Conversion Défi Annuel", rate: true }
    ]
  },
  karate: {
    title: "Karaté Shinka-ryu",
    gid: GIDS.karate,
    steps: [
      { label: "Introductions bookées", header: "Nb d'Introduction" },
      { label: "Intégration",           header: "Abonnement 6-9 Semaines", rate: true },
      { label: "Conversion annuelle",   header: "Conversion Annuel",       rate: true }
    ]
  }
};

/* ---------- Lecture d'un onglet et extraction des étapes ---------- */
function readFunnel(grid, funnel) {
  var hRow = -1;
  for (var r = 0; r < Math.min(grid.length, 12) && hRow === -1; r++) {
    var head = grid[r].slice(0, 4);
    for (var k = 0; k < head.length; k++) {
      if (norm(head[k]) === "metrique") { hRow = r; break; }
    }
  }
  if (hRow === -1) hRow = 1;

  var headers = grid[hRow].map(norm);

  function colOf(name) {
    if (!name) return -1;
    var t = norm(name);
    if (!t) return -1;
    var i = headers.indexOf(t);
    if (i !== -1) return i;
    for (var a = 0; a < headers.length; a++) {
      var h = headers[a];
      if (h && h.length > t.length && h.slice(h.length - t.length) === t) return a;
    }
    for (var b = 0; b < headers.length; b++) {
      if (headers[b] && headers[b].indexOf(t) !== -1) return b;
    }
    return -1;
  }

  var weeks = [], goalRow = null;
  for (var rr = hRow + 1; rr < grid.length; rr++) {
    var a0 = norm(grid[rr][0]);
    if (/^semaine \d+$/.test(a0)) weeks.push({ r: rr, num: parseInt(a0.replace(/\D/g, ""), 10) });
    else if (a0 === "objectif") goalRow = rr;
  }

  function cellAt(row, col) {
    if (col === -1 || row === null || row === undefined) return null;
    var line = grid[row];
    return line ? line[col] : null;
  }
  function numAt(row, col) {
    var v = toNum(cellAt(row, col));
    return v ? v.n : null;
  }

  var cols = funnel.steps.map(function (s) { return colOf(s.header); });

  /* ---- fenêtre glissante de 4 semaines (28 jours) ----
     On cumule les 4 dernières semaines saisies plutôt que d'afficher
     la dernière seule : une semaine isolée est trop bruyante pour juger
     d'un entonnoir, surtout quand le volume hebdomadaire est faible.
     L'écart compare cette fenêtre aux 4 semaines qui la précèdent.     */

  function rowHasData(r) {
    for (var c = 0; c < cols.length; c++) {
      var v = cellAt(r, cols[c]);
      if (v !== null && v !== undefined && String(v).trim() !== "") return true;
    }
    return false;
  }

  /* dernière semaine saisie = fin de la fenêtre */
  var lastIdx = -1;
  for (var w = weeks.length - 1; w >= 0 && lastIdx === -1; w--) {
    if (rowHasData(weeks[w].r)) lastIdx = w;
  }
  if (lastIdx === -1) lastIdx = weeks.length - 1;

  var startIdx = Math.max(0, lastIdx - WINDOW_WEEKS + 1);
  var curWin   = weeks.slice(startIdx, lastIdx + 1);
  var prevWin  = weeks.slice(Math.max(0, startIdx - WINDOW_WEEKS), startIdx);

  /* Somme sur une fenêtre. Une case vide vaut zéro, mais une fenêtre
     entièrement vide reste nulle : « rien de saisi » et « zéro vente »
     ne doivent pas s'afficher pareil.                                  */
  function sumOver(win, col) {
    if (col === -1 || !win.length) return null;
    var total = null;
    for (var k = 0; k < win.length; k++) {
      var v = toNum(cellAt(win[k].r, col));
      if (v) total = (total === null ? 0 : total) + v.n;
    }
    return total;
  }

  var out = funnel.steps.map(function (s, i) {
    var col = cols[i];

    /* Un objectif peut être un nombre (20 rendez-vous) ou un pourcentage
       (50 % de show). Le nombre est une cible hebdomadaire : sur 4 semaines
       il faut le multiplier. Le pourcentage, lui, porte sur le taux de
       conversion et ne se multiplie pas.                                 */
    var graw = goalRow !== null ? toNum(cellAt(goalRow, col)) : null;
    var isPct = !!(graw && graw.isPct);

    return {
      label: s.label, found: col !== -1,
      value: sumOver(curWin, col),
      prev:  sumOver(prevWin, col),
      goal:  graw ? (isPct ? graw.n : graw.n * curWin.length) : null,
      goalIsPct: isPct,
      rate: !!s.rate
    };
  });

  /* taux de conversion d'une étape à l'autre */
  for (var i2 = 1; i2 < out.length; i2++) {
    var cur = out[i2], before = out[i2 - 1];
    if (cur.rate && cur.value !== null && before.value !== null && before.value !== 0) {
      cur.pct = cur.value / before.value * 100;
      cur.from = before.label;
    } else {
      cur.pct = null;
    }
  }

  return {
    steps: out,
    from:  curWin.length ? curWin[0].num : null,
    to:    curWin.length ? curWin[curWin.length - 1].num : null,
    nWeeks: curWin.length
  };
}

/* ---------- Rendu d'un entonnoir ---------- */
function renderFunnel(host, data, funnel) {
  host.innerHTML = "";

  // la plus grande valeur donne l'échelle des barres
  var max = 0;
  data.steps.forEach(function (s) { if (s.value !== null && s.value > max) max = s.value; });

  data.steps.forEach(function (s, i) {
    var el = document.createElement("div");
    el.className = "step";

    var has = s.value !== null;

    /* écart avec la semaine précédente */
    var deltaHtml = "";
    if (has && s.prev !== null) {
      var d = s.value - s.prev;
      var cls = d === 0 ? "flat" : (d > 0 ? "up" : "down");
      var ar  = d === 0 ? "→" : (d > 0 ? "↑" : "↓");
      var sg  = d > 0 ? "+" : (d < 0 ? "−" : "");
      deltaHtml = '<span class="st-delta ' + cls + '">' + ar + " " + sg + nf(Math.abs(d)) + "</span>";
    }

    /* taux de conversion depuis l'étape précédente */
    var rateHtml = "";
    if (s.rate) {
      if (s.pct === null) {
        rateHtml = '<div class="st-rate none"><span class="arrow">↓</span><span class="pc">—</span></div>';
      } else {
        var p = Math.round(s.pct);
        // au-delà de 100 %, l'étape reçoit plus que l'étape d'avant : on le signale
        var over = s.pct > 100 ? " over" : "";
        var goalTxt = (s.goal && s.goalIsPct)
          ? '<span class="src rate-goal">cible ' + nf(s.goal) + " %</span>" : "";
        rateHtml = '<div class="st-rate' + over + '"><span class="arrow">↓</span>'
                 + '<span class="pc">' + nf(p) + '<span class="unit">%</span></span>'
                 + '<span class="src">de ' + s.from.toLowerCase() + "</span>"
                 + goalTxt + "</div>";
      }
    }

    /* barre proportionnelle */
    var width = (has && max > 0) ? Math.max(6, s.value / max * 100) : 0;

    /* état : on compare le taux si la cible est un pourcentage, sinon le nombre */
    var state = "";
    if (s.goal) {
      var actual = s.goalIsPct ? s.pct : s.value;
      if (actual !== null && actual !== undefined) {
        var ratio = actual / s.goal;
        state = ratio >= 1 ? "ok" : (ratio >= 0.8 ? "close" : "miss");
      }
    }

    el.innerHTML =
      rateHtml +
      '<div class="st-card ' + state + (has ? "" : " empty") + '">' +
        '<div class="st-head">' +
          '<span class="st-label">' + s.label + "</span>" +
          (s.goal && !s.goalIsPct ? '<span class="st-goal">cible ' + nf(s.goal) + "</span>" : "") +
        "</div>" +
        '<div class="st-main">' +
          '<span class="st-value' + (has ? "" : " empty") + '">' + (has ? nf(s.value) : "—") + "</span>" +
          deltaHtml +
        "</div>" +
        '<div class="st-bar"><i style="width:' + width + '%"></i></div>' +
      "</div>";

    host.appendChild(el);
  });
}

/* ---------- Démarrage ---------- */
function bootBureau() {
  var box = {
    fitness: document.getElementById("funnel-fitness"),
    karate:  document.getElementById("funnel-karate")
  };
  var weekEl = document.getElementById("bureau-week");
  var syncEl = document.getElementById("bureau-sync");
  var dotEl  = document.getElementById("bureau-dot");

  var lastOk = 0;
  var weeks = {};

  function loadOne(key) {
    var f = FUNNELS[key];
    return fetchTab(f.gid).then(function (grid) {
      var data = readFunnel(grid, f);
      weeks[key] = (data.from && data.to)
        ? (data.from === data.to ? "S" + data.to : "S" + data.from + " – S" + data.to)
        : null;
      renderFunnel(box[key], data, f);
      return true;
    }).catch(function (e) {
      box[key].innerHTML = '<div class="st-error">' + e.message + "</div>";
      return false;
    });
  }

  function load() {
    return Promise.all([loadOne("fitness"), loadOne("karate")]).then(function (res) {
      var ok = res[0] || res[1];
      if (ok) {
        lastOk = Date.now();
        var n = new Date();
        syncEl.textContent = "Synchronisé à " + n.getHours() + "h" + ("0" + n.getMinutes()).slice(-2);
        dotEl.className = "dot";
      } else {
        dotEl.className = "dot err";
        syncEl.textContent = "Échec de synchronisation";
      }
      // les deux onglets peuvent couvrir des semaines différentes
      var wf = weeks.fitness, wk = weeks.karate;
      weekEl.textContent = (wf && wk && wf !== wk)
        ? "Fitness " + wf + " · Karaté " + wk
        : (wf || wk || "—");
    });
  }

  /* même stratégie de rafraîchissement que les écrans TV :
     battement court + reprise dès que la page redevient visible */
  var refreshMs = Math.max(1, REFRESH_MINUTES) * 60 * 1000;
  function refreshIfStale() {
    if (lastOk === 0 || Date.now() - lastOk >= refreshMs) load();
  }

  load();
  setInterval(refreshIfStale, 60 * 1000);
  if (typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refreshIfStale();
    });
  }
  window.addEventListener("focus", refreshIfStale);
  window.addEventListener("online", function () { load(); });

  window.addEventListener("keydown", function (e) {
    if (e.key && e.key.toLowerCase() === "r") load();
  });
  window.addEventListener("click", function () { load(); });
}
