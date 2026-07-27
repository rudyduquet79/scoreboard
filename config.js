/* ============================================================
   CONFIGURATION — le seul fichier que tu as besoin de modifier
   ============================================================ */

const SHEET_ID = "1EK3_I15ngb2GiJwy8XzV6zCcajL_ik78dlceRQ52W9g";

/* Les GID sont les identifiants des onglets du Google Sheet.
   Ces deux valeurs ont été vérifiées le 27 juillet 2026 — rien à changer.
   (Pour référence : on les trouve à la fin de l'URL, .../edit#gid=123456789) */
const GIDS = {
  fitness: "0",           // onglet One Fight Fitness  ✓ vérifié
  karate:  "1562111887"   // onglet Karaté             ✓ vérifié
};

/* Rafraîchissement automatique en minutes.
   Le tableau change une fois par semaine, mais un refresh horaire
   garantit que la TV affiche les nouvelles données sans intervention. */
const REFRESH_MINUTES = 60;

/* ---------- Métriques affichées sur chaque écran ----------
   header  : le nom exact de la colonne dans le Google Sheet
   label   : le nom affiché sur la TV
   dir      : "up" = plus haut c'est mieux | "down" = plus bas c'est mieux
   fmt      : "num" | "pct" | "money"                                     */

const BOARDS = {
  fitness: {
    title: "One Fight Fitness",
    metrics: [
      { header: "Total Membre Actif",            label: "Membres actifs",     dir: "up",   fmt: "num" },
      { header: "Publicités Facebook (Leads)",   label: "Leads Facebook",     dir: "up",   fmt: "num" },
      { header: "Nb Rendez-vous",                label: "Rendez-vous",        dir: "up",   fmt: "num" },
      { header: "Taux de conversion",            label: "Taux de conversion", dir: "up",   fmt: "pct" },
      { header: "Défi 6 Semaines",               label: "Défi 6 semaines",    dir: "up",   fmt: "num" },
      { header: "Membre Perdu",                  label: "Membres perdus",     dir: "down", fmt: "num" },
      { header: "Nouvelles visites sur le site", label: "Visites site web",   dir: "up",   fmt: "num" },
      { header: "Leads Call",                    label: "Leads Call",         dir: "up",   fmt: "num" }
    ]
  },
  karate: {
    title: "Karaté Shinka-ryu",
    metrics: [
      { header: "Membre Actif Total",            label: "Membres actifs",       dir: "up",   fmt: "num" },
      { header: "Abonnement Récurrent",          label: "Abonn. récurrents",    dir: "up",   fmt: "num" },
      { header: "Publicités Facebook (Leads)",   label: "Leads Facebook",       dir: "up",   fmt: "num" },
      { header: "Nb d'Introduction",             label: "Cours d'introduction", dir: "up",   fmt: "num" },
      { header: "Taux de conversion",            label: "Taux de conversion",   dir: "up",   fmt: "pct" },
      { header: "Membre Perdu",                  label: "Membres perdus",       dir: "down", fmt: "num" },
      { header: "Nouvelles visites sur le site", label: "Visites site web",     dir: "up",   fmt: "num" },
      { header: "Témoignages",                   label: "Témoignages",          dir: "up",   fmt: "num" }
    ]
  }
};
