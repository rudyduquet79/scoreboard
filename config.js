/* ============================================================
   CONFIGURATION — le seul fichier à modifier
   ============================================================ */

const SHEET_ID = "1EK3_I15ngb2GiJwy8XzV6zCcajL_ik78dlceRQ52W9g";

/* Identifiants des onglets — vérifiés, rien à changer.
   (On les trouve à la fin de l'URL du Sheet : .../edit#gid=123456789) */
const GIDS = {
  fitness: "0",           // onglet One Fight Fitness
  karate:  "1562111887"   // onglet Karaté
};

/* Rafraîchissement automatique, en minutes. */
const REFRESH_MINUTES = 60;


/* ============================================================
   MÉTRIQUES AFFICHÉES
   ============================================================

   Les tuiles sont groupées en rangées. Chaque rangée occupe le tiers de
   la hauteur de l'écran, et ses tuiles se partagent la largeur.

   Champs d'une tuile :
     label   texte affiché sur la TV
     header  nom exact de la colonne du Sheet (accents et casse indifférents)
     dir     "up"   = plus haut c'est mieux
             "down" = plus bas c'est mieux
     fmt     "num" | "pct" | "money"

   Tuiles calculées (le dashboard fait le calcul, la colonne n'existe pas) :

     calc: "ratio"    →  num ÷ den, exprimé en pourcentage
                         num, den   = colonnes du Sheet
                         goalHeader = colonne où lire l'objectif

     calc: "churn"    →  somme de `lost` sur les N dernières semaines
                         ÷ effectif de `base` à la 1re de ces semaines
                         weeks      = nombre de semaines (4 = 28 jours)
                         goalHeader = colonne où lire l'objectif
   ============================================================ */

const BOARDS = {

  fitness: {
    title: "One Fight Fitness",
    rows: [
      [
        { label: "Membre actif",   header: "Total Membre Actif", dir: "up",   fmt: "num" },
        { label: "Nouveau membre", header: "Nouveau membre",     dir: "up",   fmt: "num" },
        { label: "Membre perdu",   header: "Membre Perdu",       dir: "down", fmt: "num" },
        { label: "Churn 28 jours", calc: "churn", weeks: 4,      dir: "down", fmt: "pct",
          lost: "Membre Perdu", base: "Total Membre Actif", goalHeader: "Churn Rate" },
        { label: "Défi 6 semaines", header: "Défi 6 Semaines",   dir: "up",   fmt: "num" }
      ],
      [
        { label: "Lead Ads (META)", header: "Publicités Facebook (Leads)", dir: "up", fmt: "num" },
        { label: "Nb de RDV",       header: "Nb Rendez-vous",              dir: "up", fmt: "num" },
        { label: "Show",            calc: "ratio",                         dir: "up", fmt: "pct",
          num: "Show", den: "Nb Rendez-vous", goalHeader: "Show", unitLabel: "RDV" },
        { label: "Taux de conversion", header: "Taux de conversion",       dir: "up", fmt: "pct" },
        { label: "Vente Fit pour Vrai", header: "Vente FIT pour Vrai",     dir: "up", fmt: "num" }
      ],
      [
        { label: "Visite site web",   header: "Nouvelles visites sur le site", dir: "up", fmt: "num" },
        { label: "Nouveau follower",  header: "Nouveau follower All around",   dir: "up", fmt: "num" },
        { label: "Nb follower total", header: "Nb follower Total",             dir: "up", fmt: "num" },
        { label: "Témoignages",       header: "Témoignages",                   dir: "up", fmt: "num" }
      ]
    ]
  },

  karate: {
    title: "Karaté Shinka-ryu",
    rows: [
      [
        { label: "Membre actif",   header: "Membre Actif Total", dir: "up",   fmt: "num" },
        { label: "Nouveau membre", header: "Nouveau membre",     dir: "up",   fmt: "num" },
        { label: "Membre perdu",   header: "Membre Perdu",       dir: "down", fmt: "num" },
        { label: "Churn 28 jours", calc: "churn", weeks: 4,      dir: "down", fmt: "pct",
          lost: "Membre Perdu", base: "Membre Actif Total", goalHeader: "Churn Rate" },
        // « Intégration » = le programme 6 semaines
        { label: "Intégration",    header: "Abonnement 6 Semaines", dir: "up", fmt: "num" }
      ],
      [
        { label: "Lead Ads (META)",     header: "Publicités Facebook (Leads)", dir: "up", fmt: "num" },
        { label: "Nb d'intros",         header: "Nb d'Introduction",           dir: "up", fmt: "num" },
        { label: "Conversion annuelle", header: "Conversion Annuel",           dir: "up", fmt: "num" },
        // « Leadership » : le Sheet contient une coquille (« Progrmme »),
        // on cible donc le mot-clé plutôt que le libellé exact
        { label: "Leadership",          header: "Leadership",                  dir: "up", fmt: "num" }
      ],
      [
        { label: "Visite site web",   header: "Nouvelles visites sur le site", dir: "up", fmt: "num" },
        { label: "Nouveau follower",  header: "Nouveau follower All around",   dir: "up", fmt: "num" },
        { label: "Nb follower total", header: "Nb follower Total",             dir: "up", fmt: "num" },
        { label: "Témoignages",       header: "Témoignages",                   dir: "up", fmt: "num" }
      ]
    ]
  }
};
