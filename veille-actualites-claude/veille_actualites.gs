// ============================================================
// 🌾 VEILLE AGRICOLE PAR RUBRIQUE — Google Apps Script + Claude AI
// ============================================================
// AUTEUR      : Massaka SAS / NOVA AUTO
// DATE        : 2026-04-02
// VERSION     : 4.0.0
//
// Pipeline :
//   1. Récupérer les articles (NewsAPI → fallback RSS)
//   2. Analyser avec Claude (résumé + importance + sentiment)
//   3. Sauvegarder dans Google Sheets :
//        Onglet "Articles"  → 1 ligne par article
//        Onglet "Analyses"  → 1 ligne par rubrique (résumé complet)
//
// ─────────────────────────────────────────────────────────────
// INSTRUCTIONS D'INSTALLATION
// ─────────────────────────────────────────────────────────────
//  1. Aller sur https://script.google.com
//  2. Nouveau projet → coller ce fichier
//  3. Remplir NEWS_API_KEY et ANTHROPIC_KEY dans CONFIG
//  4. Créer un Google Sheet vide → coller son ID dans SHEETS_ID
//     (URL : docs.google.com/spreadsheets/d/[ID]/edit)
//  5. Exécuter "main" pour tester
//  6. Exécuter "configurerTrigger" pour activer l'automatisation
// ============================================================


// ============================================================
// 🔧 SECTION CONFIG GLOBALE
// ============================================================

const CONFIG = {

  // ── APIs ──────────────────────────────────────────────────
  // OPTION GRATUITE (recommandée) :
  //   Gemini : IA Google, gratuit, 1500 req/jour
  //   Clé en 2 min sur : https://aistudio.google.com → Get API key
  GEMINI_API_KEY: "REMPLACER_ICI",  // → https://aistudio.google.com

  // OPTION PAYANTE (si déjà client Anthropic) :
  ANTHROPIC_KEY: "",                // → https://console.anthropic.com

  // Fournisseur IA actif : "gemini" (gratuit) ou "anthropic" (payant)
  AI_FOURNISSEUR: "gemini",

  // ── Planification ─────────────────────────────────────────
  // Apps Script accepte : 1, 2, 4, 6, 8, 12 heures (pas 3)
  INTERVALLE_HEURES: 4,      // toutes les 4h (8h, 12h, 16h, 20h...)
  WEEKEND_ACTIF:     false,  // false = lundi→vendredi uniquement

  // ── Articles ──────────────────────────────────────────────
  NB_ARTICLES_POOL:  20,  // articles collectés (pool brut)
  NB_ARTICLES_FINAL: 5,   // articles retenus après scoring (max par run)
  NB_ARTICLES_JOUR:  5,   // quota max par rubrique par jour (anti-doublon)
  SCORE_MIN:         6,   // score minimum de pertinence (sur 10)

  // ── Période de recherche ───────────────────────────────────
  // "1h"  = dernière heure  (breaking news)
  // "1d"  = dernières 24h   (défaut — veille quotidienne)
  // "2d"  = 2 derniers jours
  // "7d"  = dernière semaine
  PERIODE: "1d",

  // ── Style du résumé Claude ────────────────────────────────
  // "professionnel" | "casual" | "bullet"
  TON: "professionnel",

  // ── Modele IA ─────────────────────────────────────────────
  // Gemini gratuit : "gemini-2.0-flash" (recommande) ou "gemini-2.0-flash-lite"
  GEMINI_MODEL:  "gemini-2.0-flash",
  // Anthropic (si AI_FOURNISSEUR = "anthropic") :
  CLAUDE_MODEL:  "claude-sonnet-4-6",
  AI_MAX_TOKENS: 2500,

  // ── Google Sheets (historique global) ─────────────────────
  // Coller l'ID du Google Sheet ici (laisser "" pour désactiver)
  SHEETS_ID:     "",
  SHEETS_ONGLET: "Historique",
};

// ============================================================
// 🌾 RUBRIQUES AGRICOLES — Veille Afrique
// ============================================================
// Chaque rubrique contient :
//   - id          : identifiant court (utilisé dans les logs)
//   - nom         : nom affiché dans le Sheets
//   - description : contexte de la rubrique
//   - sujets      : mots-clés pour NewsAPI (axés Afrique)
//   - rss         : flux RSS de sources africaines (fallback)
//
// Actualités chaudes : dernières 24h uniquement (from = hier).
// ============================================================

// Palette couleurs par rubrique (fond clair + texte foncé pour lisibilité)
// Utilisée pour colorier les lignes dans Google Sheets.
const COULEURS_RUBRIQUES = {
  agri_actu:    { fond: "#DCEDC8", texte: "#33691E" }, // vert clair
  agri_story:   { fond: "#B2DFDB", texte: "#004D40" }, // teal
  agri_climat:  { fond: "#BBDEFB", texte: "#0D47A1" }, // bleu
  agri_food:    { fond: "#FFE0B2", texte: "#BF360C" }, // orange
  agri_pub:     { fond: "#E1BEE7", texte: "#4A148C" }, // violet
  agri_astuces: { fond: "#FFF9C4", texte: "#F57F17" }, // jaune
  agri_techno:  { fond: "#C5CAE9", texte: "#1A237E" }, // indigo
};

const RUBRIQUES = [
  {
    id:          "agri_actu",
    nom:         "Agri_Actu",
    couleur:     COULEURS_RUBRIQUES.agri_actu,
    description: "L'essentiel de l'actualité agricole africaine. Politiques, marchés, filières : ce qu'il faut savoir aujourd'hui sur l'agriculture en Afrique.",
    sujets:      ["agriculture Afrique actualité", "politique agricole Afrique", "filière agricole Afrique", "marché agricole Afrique"],
    rss: [
      "https://www.rfi.fr/fr/rss/afrique.xml",
      "https://www.lemonde.fr/afrique/rss_full.xml",
    ],
  },
  {
    id:          "agri_story",
    nom:         "Agri_Story",
    couleur:     COULEURS_RUBRIQUES.agri_story,
    description: "Portraits et témoignages d'agriculteurs africains. Ceux qui nourrissent le continent et transforment leur exploitation au quotidien.",
    sujets:      ["agriculteur africain témoignage", "paysan Afrique portrait", "jeune agriculteur Afrique", "femme agriculture Afrique"],
    rss: [
      "https://www.rfi.fr/fr/rss/afrique.xml",
      "https://www.jeuneafrique.com/feed/",
    ],
  },
  {
    id:          "agri_climat",
    nom:         "Agri_Climat",
    couleur:     COULEURS_RUBRIQUES.agri_climat,
    description: "Sécheresse, inondations, El Niño : comprendre le climat africain qui change et ses impacts sur les cultures et les récoltes.",
    sujets:      ["sécheresse Afrique agriculture", "changement climatique Afrique cultures", "El Nino Afrique récoltes", "adaptation climatique agriculture Afrique"],
    rss: [
      "https://www.lemonde.fr/climat/rss_full.xml",
      "https://www.rfi.fr/fr/rss/afrique.xml",
    ],
  },
  {
    id:          "agri_food",
    nom:         "Agri_Food",
    couleur:     COULEURS_RUBRIQUES.agri_food,
    description: "Sécurité alimentaire, transformation locale, circuits courts : tout ce qui bouge entre le champ africain et l'assiette.",
    sujets:      ["sécurité alimentaire Afrique", "transformation agroalimentaire Afrique", "souveraineté alimentaire Afrique", "circuits courts Afrique"],
    rss: [
      "https://www.rfi.fr/fr/rss/afrique.xml",
      "https://www.lemonde.fr/afrique/rss_full.xml",
    ],
  },
  {
    id:          "agri_pub",
    nom:         "Agri_Pub",
    couleur:     COULEURS_RUBRIQUES.agri_pub,
    description: "Comment l'agriculture africaine se raconte et se vend. Agribusiness, image du secteur, communication des acteurs du continent.",
    sujets:      ["agribusiness Afrique", "communication agriculture Afrique", "marketing agricole Afrique", "investissement agricole Afrique"],
    rss: [
      "https://www.jeuneafrique.com/feed/",
      "https://www.lemonde.fr/afrique/rss_full.xml",
    ],
  },
  {
    id:          "agri_astuces",
    nom:         "Agri_Astuces",
    couleur:     COULEURS_RUBRIQUES.agri_astuces,
    description: "Techniques locales, agroécologie, bonnes pratiques : les conseils concrets pour mieux cultiver en Afrique.",
    sujets:      ["agroécologie Afrique", "agriculture durable Afrique", "techniques agricoles Afrique", "bonnes pratiques paysans Afrique"],
    rss: [
      "https://www.rfi.fr/fr/rss/afrique.xml",
      "https://www.jeuneafrique.com/feed/",
    ],
  },
  {
    id:          "agri_techno",
    nom:         "Agri_Techno",
    couleur:     COULEURS_RUBRIQUES.agri_techno,
    description: "Agritech, drones, mobile farming, IA : les innovations technologiques qui transforment l'agriculture africaine.",
    sujets:      ["agritech Afrique", "agriculture numérique Afrique", "innovation agricole Afrique", "drone agriculture Afrique"],
    rss: [
      "https://www.jeuneafrique.com/feed/",
      "https://www.lemonde.fr/pixels/rss_full.xml",
    ],
  },
];

// ============================================================
// FIN CONFIG
// ============================================================




// ============================================================
// 📡 SECTION FETCH — Récupération des actualités par rubrique
// ============================================================

/**
 * Point d'entrée : récupère les articles pour une rubrique donnée.
 * Bascule automatiquement sur RSS si NewsAPI échoue.
 * @param {Object} rubrique
 * @returns {Array} [{titre, description, url, source, date, sujet}]
 */
function fetchActualitesPourRubrique(rubrique) {
  if (!rubrique || !rubrique.id) {
    Logger.log("❌ FETCH — Appel invalide : rubrique manquante. Executer 'main' et non cette fonction directement.");
    return [];
  }
  Logger.log("📡 FETCH [" + rubrique.id + "] — Début de la récupération (dernières 24h)...");

  const articles = _fetchDepuisNewsApi(rubrique);

  if (articles.length === 0 && rubrique.rss && rubrique.rss.length > 0) {
    Logger.log("📡 FETCH [" + rubrique.id + "] — Basculement sur le fallback RSS...");
    return _fetchDepuisRss(rubrique.rss);
  }

  return articles;
}

/**
 * Récupère les articles via Google News RSS — gratuit, sans clé, compatible GAS.
 * Fallback automatique sur les RSS de la rubrique si Google News échoue.
 * @param {Object} rubrique
 * @private
 */
function _fetchDepuisNewsApi(rubrique) {
  return _fetchDepuisGoogleNews(rubrique);
}

/**
 * Google News RSS — aucune clé API, aucune limite connue, fonctionne depuis GAS.
 * URL : news.google.com/rss/search?q=SUJET&hl=fr&gl=FR&ceid=FR:fr
 * @param {Object} rubrique
 * @private
 */
function _fetchDepuisGoogleNews(rubrique) {
  const articles = [];
  const EXCLUSIONS_MOTS = ["emploi", "stage", "recrutement", "candidature"];
  const maxParSujet = Math.ceil(CONFIG.NB_ARTICLES_POOL / rubrique.sujets.length);

  rubrique.sujets.forEach(function(sujet) {
    try {
      Logger.log("  → Google News RSS : " + sujet);
      const periode = CONFIG.PERIODE || "1d";
      const url = "https://news.google.com/rss/search"
        + "?q=" + encodeURIComponent(sujet)
        + "&hl=fr&gl=FR&ceid=FR:fr"
        + "&when=" + periode;

      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log("  ⚠️ Google News inaccessible pour : " + sujet);
        return;
      }

      const xml   = XmlService.parse(response.getContentText());
      const items = xml.getRootElement().getChild("channel").getChildren("item");

      items.slice(0, maxParSujet).forEach(function(item) {
        const titre = (_getRssText(item, "title") || "").replace(/<[^>]+>/g, "").trim();
        const url_  = (_getRssText(item, "link")  || "#").trim();
        const desc  = (_getRssText(item, "description") || "").replace(/<[^>]+>/g, "").substring(0, 300).trim();
        const date  = _getRssText(item, "pubDate") || "";
        // Source = texte entre " - " et fin du titre Google News (ex: "Titre - Le Monde")
        const parts  = titre.split(" - ");
        const source = parts.length > 1 ? parts[parts.length - 1] : "Google News";
        const titreNet = parts.slice(0, -1).join(" - ") || titre;

        // Filtre emploi/stage
        const titreLower = titreNet.toLowerCase();
        if (EXCLUSIONS_MOTS.some(function(m) { return titreLower.indexOf(m) !== -1; })) return;

        if (titreNet) articles.push({ titre: titreNet, description: desc, url: url_, source: source, date: date, sujet: sujet });
      });

      Logger.log("  ✅ Google News : " + Math.min(items.length, maxParSujet) + " articles pour : " + sujet);
    } catch(e) {
      Logger.log("  ❌ Exception Google News '" + sujet + "' : " + e.message);
    }
  });

  return _dedupliquerEtLimiter(articles);
}

/**
 * Récupère les articles depuis des flux RSS.
 * @param {Array} feedUrls
 * @private
 */
function _fetchDepuisRss(feedUrls) {
  const articles = [];

  feedUrls.forEach(function(feedUrl) {
    try {
      Logger.log("  → RSS : " + feedUrl);
      const response = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true });

      if (response.getResponseCode() !== 200) {
        Logger.log("  ⚠️ RSS inaccessible : " + feedUrl);
        return;
      }

      const xml   = XmlService.parse(response.getContentText());
      const root  = xml.getRootElement();
      const ns    = root.getNamespace();
      let   items = [];

      try {
        items = root.getChild("channel", ns).getChildren("item", ns);
      } catch(e) {
        items = root.getChildren("item");
      }

      const limite = Math.ceil(CONFIG.NB_ARTICLES_POOL / feedUrls.length);
      const source = feedUrl.replace(/https?:\/\/(www\.)?/, "").split("/")[0];

      items.slice(0, limite).forEach(function(item) {
        const titre = (_getRssText(item, "title")       || "Sans titre").replace(/<[^>]+>/g, "").trim();
        const url   = (_getRssText(item, "link")        || "#").trim();
        const desc  = (_getRssText(item, "description") || "").replace(/<[^>]+>/g, "").substring(0, 300).trim();
        const date  =  _getRssText(item, "pubDate")     || "";

        articles.push({ titre: titre, description: desc, url: url, source: source, date: date, sujet: "RSS" });
      });

      Logger.log("  ✅ RSS : " + items.length + " items dans " + feedUrl);
    } catch(e) {
      Logger.log("  ❌ Exception RSS '" + feedUrl + "' : " + e.message);
    }
  });

  return _dedupliquerEtLimiter(articles);
}

/** @private */
function _getRssText(item, tag) {
  try {
    const child = item.getChild(tag);
    return child ? child.getText() : "";
  } catch(e) { return ""; }
}

/** @private */
function _dedupliquerEtLimiter(articles) {
  const vus = {};
  const uniques = articles.filter(function(a) {
    if (vus[a.url]) return false;
    vus[a.url] = true;
    return true;
  });
  const resultat = uniques.slice(0, CONFIG.NB_ARTICLES_POOL);
  Logger.log("📡 FETCH — " + resultat.length + " articles dans le pool.");
  return resultat;
}

/** @private */
function _buildNewsApiUrl(sujet, pageSize) {
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const fromDate = Utilities.formatDate(hier, "UTC", "yyyy-MM-dd");

  // Exclure systématiquement les offres d'emploi et stages
  const EXCLUSIONS = " -emploi -stage -recrutement -\"offre d'emploi\" -\"offre de stage\"";

  const params = {
    q:        encodeURIComponent(sujet + EXCLUSIONS),
    language: CONFIG.LANGUE,
    from:     fromDate,
    sortBy:   "publishedAt",
    pageSize: pageSize,
    apiKey:   CONFIG.NEWS_API_KEY,
  };

  return "https://newsapi.org/v2/everything?" + Object.keys(params)
    .map(function(k) { return k + "=" + params[k]; }).join("&");
}

// ============================================================
// FIN FETCH
// ============================================================




// ============================================================
// 🎯 SECTION SCORING — Pertinence via Claude (JSON)
// ============================================================
// Envoie le pool brut à Claude qui retourne un score 1-10
// pour chaque article. Critères :
//   - Pertinence avec la rubrique       (0-4 pts)
//   - Contexte africain identifiable    (0-3 pts)
//   - Valeur concrète / actionnable     (0-3 pts)
// Seuls les articles >= SCORE_MIN et non déjà vus
// aujourd'hui dans Sheets sont conservés (max NB_ARTICLES_FINAL).
// ============================================================

/**
 * Score les articles du pool et retourne les meilleurs.
 * @param {Array}  pool     — articles bruts fetchés
 * @param {Object} rubrique
 * @param {Array}  urlsDuJour — URLs déjà sauvegardées aujourd'hui
 * @returns {Array} articles filtrés et triés par score DESC
 */
function scorerPertinence(pool, rubrique, urlsDuJour) {
  Logger.log("🎯 SCORING [" + rubrique.id + "] — " + pool.length + " articles a evaluer...");

  // Retirer d'abord les doublons du jour
  const nouveaux = pool.filter(function(a) {
    return urlsDuJour.indexOf(a.url) === -1;
  });
  Logger.log("  → " + nouveaux.length + " nouveaux apres deduplication.");

  if (nouveaux.length === 0) {
    Logger.log("  ℹ️ Tous les articles ont deja ete vus aujourd'hui.");
    return [];
  }

  // Construire la liste pour Claude
  const listeResumee = nouveaux.map(function(a, i) {
    return (i + 1) + ". TITRE: " + a.titre + " | SOURCE: " + a.source + " | DESC: " + a.description.substring(0, 150);
  }).join("\n");

  const prompt =
    "Tu es un filtre de pertinence pour une veille agricole africaine.\n" +
    "Rubrique : " + rubrique.nom + " — " + rubrique.description + "\n" +
    "Mots-cles : " + rubrique.sujets.join(", ") + "\n\n" +
    "Evalue chaque article sur 10 selon :\n" +
    "  - Pertinence avec la rubrique (0-4 pts)\n" +
    "  - Contexte africain identifiable (0-3 pts)\n" +
    "  - Valeur concrete / actionnable (0-3 pts)\n\n" +
    "REGLES ABSOLUES :\n" +
    "  - Score 0 obligatoire si l'article parle d'offre d'emploi, stage, recrutement ou appel a candidature.\n" +
    "  - Score 0 si le sujet n'est pas lie a l'agriculture (ex: politique, sport, people).\n" +
    "  - La recherche doit reflechir des realites africaines : privilegier Afrique subsaharienne, Afrique de l'Ouest, Afrique centrale.\n\n" +
    "Articles a noter :\n" + listeResumee + "\n\n" +
    "Reponds UNIQUEMENT en JSON valide, sans texte autour, format exact :\n" +
    '[{"index":1,"score":8,"raison":"..."},{"index":2,"score":4,"raison":"..."},...]';

  try {
    const texteIA = _appellerIA(prompt, 1000);
    if (!texteIA) {
      Logger.log("  ❌ Scoring — pas de reponse IA. Fallback sur les " + CONFIG.NB_ARTICLES_FINAL + " premiers.");
      return nouveaux.slice(0, CONFIG.NB_ARTICLES_FINAL);
    }
    // Extraire le JSON (Gemini peut ajouter du texte autour)
    const jsonMatch = texteIA.match(/\[[\s\S]*\]/);
    const scores = JSON.parse(jsonMatch ? jsonMatch[0] : texteIA);

    // Associer scores aux articles, filtrer et trier
    const articlesScores = scores
      .filter(function(s) { return s.score >= CONFIG.SCORE_MIN; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, CONFIG.NB_ARTICLES_FINAL)
      .map(function(s) {
        const art = nouveaux[s.index - 1];
        if (!art) return null;
        art.score  = s.score;
        art.raison = s.raison;
        return art;
      })
      .filter(function(a) { return a !== null; });

    Logger.log("  ✅ " + articlesScores.length + " articles retenus (score >= " + CONFIG.SCORE_MIN + ").");
    articlesScores.forEach(function(a) {
      Logger.log("    [" + a.score + "/10] " + a.titre.substring(0, 60) + "...");
    });

    return articlesScores;

  } catch(e) {
    Logger.log("  ❌ Scoring exception : " + e.message + " — fallback sur les " + CONFIG.NB_ARTICLES_FINAL + " premiers.");
    return nouveaux.slice(0, CONFIG.NB_ARTICLES_FINAL);
  }
}

// ============================================================
// FIN SCORING
// ============================================================




// ============================================================
// 🤖 SECTION IA — Gemini (gratuit) ou Anthropic (payant)
// ============================================================

/**
 * Appelle l'IA configurée (Gemini ou Anthropic) et retourne le texte brut.
 * @param {string} prompt
 * @param {number} maxTokens
 * @returns {string|null} texte de la réponse, ou null si erreur
 */
function _appellerIA(prompt, maxTokens) {
  if (CONFIG.AI_FOURNISSEUR === "anthropic" && CONFIG.ANTHROPIC_KEY) {
    return _appellerAnthropic(prompt, maxTokens);
  }
  return _appellerGemini(prompt, maxTokens);
}

/** @private — Gemini 1.5 Flash (gratuit, 1500 req/jour) */
function _appellerGemini(prompt, maxTokens) {
  try {
    // Pause 5s pour rester sous la limite de 15 req/min (plan gratuit)
    Utilities.sleep(5000);
    const model = CONFIG.GEMINI_MODEL || "gemini-1.5-flash";
    const url   = "https://generativelanguage.googleapis.com/v1/models/"
                + model + ":generateContent?key=" + CONFIG.GEMINI_API_KEY;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens || 2500 },
    };
    const options = {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const code     = response.getResponseCode();
    const body     = JSON.parse(response.getContentText());

    if (code !== 200) {
      Logger.log("  ❌ Gemini erreur [" + code + "] : " + JSON.stringify(body).substring(0, 200));
      if (code === 429) Logger.log("  → Quota depassé (15 req/min sur plan gratuit). Attendre 60s et reessayer.");
      if (code === 400) Logger.log("  → GEMINI_API_KEY invalide. Verifier la cle sur https://aistudio.google.com");
      return null;
    }
    return body.candidates && body.candidates[0]
      ? body.candidates[0].content.parts[0].text
      : null;
  } catch(e) {
    Logger.log("  ❌ Gemini exception : " + e.message);
    return null;
  }
}

/** @private — Anthropic Claude (fallback payant) */
function _appellerAnthropic(prompt, maxTokens) {
  try {
    const payload = {
      model:      CONFIG.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens || 2500,
      messages:   [{ role: "user", content: prompt }],
    };
    const options = {
      method: "post", contentType: "application/json",
      headers: { "x-api-key": CONFIG.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    const code     = response.getResponseCode();
    const body     = JSON.parse(response.getContentText());

    if (code !== 200) {
      Logger.log("  ❌ Anthropic erreur [" + code + "]");
      return null;
    }
    return body.content && body.content[0] ? body.content[0].text : null;
  } catch(e) {
    Logger.log("  ❌ Anthropic exception : " + e.message);
    return null;
  }
}

/**
 * Analyse les articles avec l'IA et retourne du HTML.
 * @param {Array}  articles
 * @param {Object} rubrique
 * @returns {string} HTML
 */
function analyserAvecClaude(articles, rubrique) {
  Logger.log("🤖 IA [" + rubrique.id + "] — Analyse de " + articles.length + " articles (" + CONFIG.AI_FOURNISSEUR + ")...");

  if (!articles || articles.length === 0) {
    return "<p>Aucun article disponible aujourd'hui.</p>";
  }

  const contenu = _appellerIA(_construirePrompt(articles, rubrique), CONFIG.AI_MAX_TOKENS || 2500);
  if (!contenu) return "<p>Erreur analyse IA.</p>";

  Logger.log("🤖 IA [" + rubrique.id + "] — Termine. " + contenu.length + " caracteres.");
  return contenu;
}

/** @private */
function _construirePrompt(articles, rubrique) {
  const date = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");

  const listeArticles = articles.map(function(a, i) {
    return "ARTICLE " + (i + 1) + " :\n" +
      "Titre       : " + a.titre       + "\n" +
      "Source      : " + a.source      + "\n" +
      "Sujet       : " + a.sujet       + "\n" +
      "Description : " + a.description + "\n" +
      "URL         : " + a.url;
  }).join("\n\n---\n\n");

  const instructionTon = {
    "professionnel": "Adopte un ton professionnel, concis et factuel.",
    "casual":        "Adopte un ton décontracté et engageant.",
    "bullet":        "Utilise uniquement des bullet points courts. Maximum 1 ligne par point.",
  }[CONFIG.TON] || "Adopte un ton professionnel.";

  return `Tu es un assistant de veille stratégique spécialisé dans l'agriculture africaine. Nous sommes le ${date}.

Contexte : tu surveilles l'actualité agricole sur le continent africain (Afrique de l'Ouest, Afrique centrale, Afrique de l'Est, Afrique australe). Tes analyses doivent refléter les réalités du terrain africain : smallholders, filières locales, enjeux de souveraineté alimentaire, conditions climatiques du continent.

Tu traites la rubrique : ${rubrique.nom} — ${rubrique.description}

${instructionTon}

Voici ${articles.length} articles à analyser :

${listeArticles}

INSTRUCTIONS (respecter exactement) :
- Réponds UNIQUEMENT en HTML valide, sans balise <html>, <head> ou <body>
- Pour chaque article, génère un bloc avec :
    1. Badge importance :  🔥 CHAUD (rupture/tendance majeure) | 📌 UTILE (actionnable) | ℹ️ INFO (général)
    2. Badge sentiment :   😊 POSITIF (opportunité/succès) | 😐 NEUTRE (factuel) | ⚠️ NÉGATIF (risque/problème)
    3. Titre cliquable vers l'URL
    4. Source + date + pays/région africaine concernée si identifiable
    5. Résumé 2-3 lignes avec l'impact concret pour les agriculteurs africains

- En bas, une section "Tendances du jour — ${rubrique.nom}" :
    • 3 à 5 bullet points sur les tendances identifiées pour l'Afrique
    • 1 phrase de conclusion sur les implications pour le continent

STRUCTURE HTML (répéter pour chaque article) :
<div class="article">
  <div class="badges">
    <span class="badge-importance">[badge importance]</span>
    <span class="badge-sentiment">[badge sentiment]</span>
  </div>
  <h3><a href="[URL]">[TITRE]</a></h3>
  <p class="meta">[Source] — [Date]</p>
  <p class="resume">[Résumé]</p>
</div>

Puis :
<div class="tendances">
  <h2>Tendances du jour — ${rubrique.nom}</h2>
  <ul>[bullet points]</ul>
  <p class="conclusion">[Conclusion]</p>
</div>`;
}

// ============================================================
// FIN CLAUDE
// ============================================================








// ============================================================
// 📊 SECTION SHEETS — Historique dans Google Sheets
// ============================================================

/**
 * Initialise et met en forme les deux onglets du Google Sheet.
 * À appeler UNE FOIS via configurerTrigger() — idempotent (safe si relancé).
 *
 *   Onglet "Articles" :
 *     Date | Rubrique | Titre | Source | URL | Description | Score | Raison
 *   Onglet "Analyses" :
 *     Date | Rubrique | Nb articles | Analyse Claude (HTML)
 *
 * Style : en-têtes fond noir / texte blanc / Calibri 14 / centré.
 *         Données : Calibri 11, centré, bandes alternées vertes.
 */
function initialiserSheets() {
  if (!CONFIG.SHEETS_ID || CONFIG.SHEETS_ID.trim() === "") {
    Logger.log("🎨 INIT SHEETS — Désactivé (SHEETS_ID vide).");
    return;
  }

  Logger.log("🎨 INIT SHEETS — Mise en forme automatique des onglets...");

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    _configurerOngletArticles(ss);
    _configurerOngletAnalyses(ss);
    Logger.log("🎨 INIT SHEETS — Terminé. Onglets Articles + Analyses prêts.");
  } catch(e) {
    Logger.log("❌ INIT SHEETS — Erreur : " + e.message);
  }
}

/** @private */
function _configurerOngletArticles(ss) {
  var onglet = ss.getSheetByName("Articles");
  if (!onglet) onglet = ss.insertSheet("Articles");

  const ENTETES  = ["Date", "Rubrique", "Titre", "Source", "URL", "Description", "Score", "Raison"];
  const LARGEURS = [140,    150,        300,      160,      360,    380,           70,      280];
  const NB_COL   = ENTETES.length;

  // ── Supprimer les bandes existantes (on coloriera par rubrique) ──
  onglet.getBandings().forEach(function(b) { b.remove(); });

  // ── En-têtes : fond noir, texte blanc, taille 16 ──────────
  onglet.getRange(1, 1, 1, NB_COL).setValues([ENTETES]);
  onglet.setRowHeight(1, 48);

  onglet.getRange(1, 1, 1, NB_COL)
    .setBackground("#000000")
    .setFontColor("#ffffff")
    .setFontFamily("Calibri")
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, "#333333", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ── Largeurs de colonnes ───────────────────────────────────
  LARGEURS.forEach(function(w, i) { onglet.setColumnWidth(i + 1, w); });

  // ── Figer la ligne d'en-tête ──────────────────────────────
  onglet.setFrozenRows(1);

  // ── Zone de données (lignes 2-2000) : taille 14, fond blanc ──
  onglet.getRange(2, 1, 1999, NB_COL)
    .setFontFamily("Calibri")
    .setFontSize(14)
    .setFontColor("#000000")
    .setBackground("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  // ── Légende couleurs rubriques (ligne 1 de chaque feuille) ──
  // Les lignes de données seront colorées dynamiquement dans sauvegarderDansSheets()

  Logger.log("  ✅ Onglet 'Articles' formaté (" + NB_COL + " colonnes). Couleurs par rubrique actives.");
}

/** @private */
function _configurerOngletAnalyses(ss) {
  var onglet = ss.getSheetByName("Analyses");
  if (!onglet) onglet = ss.insertSheet("Analyses");

  const ENTETES  = ["Date", "Rubrique", "Nb articles", "Analyse Claude (HTML)"];
  const LARGEURS = [140,    150,        110,            780];
  const NB_COL   = ENTETES.length;

  // ── Supprimer les bandes existantes ───────────────────────
  onglet.getBandings().forEach(function(b) { b.remove(); });

  // ── En-têtes : fond noir, texte blanc, taille 16 ──────────
  onglet.getRange(1, 1, 1, NB_COL).setValues([ENTETES]);
  onglet.setRowHeight(1, 48);

  onglet.getRange(1, 1, 1, NB_COL)
    .setBackground("#000000")
    .setFontColor("#ffffff")
    .setFontFamily("Calibri")
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, "#333333", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ── Largeurs de colonnes ───────────────────────────────────
  LARGEURS.forEach(function(w, i) { onglet.setColumnWidth(i + 1, w); });

  // ── Figer la ligne d'en-tête ──────────────────────────────
  onglet.setFrozenRows(1);

  // ── Zone de données (lignes 2-2000) : taille 14, fond blanc ──
  onglet.getRange(2, 1, 1999, NB_COL)
    .setFontFamily("Calibri")
    .setFontSize(14)
    .setFontColor("#000000")
    .setBackground("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  Logger.log("  ✅ Onglet 'Analyses' formaté (" + NB_COL + " colonnes). Couleurs par rubrique actives.");
}

/**
 * Enregistre les articles et l'analyse Claude dans Google Sheets.
 *   Onglet "Articles" : 1 ligne par article
 *   Onglet "Analyses" : 1 ligne par rubrique (résumé complet Claude)
 * @param {Array}  articles
 * @param {Object} rubrique
 * @param {string} analyse   — HTML retourné par Claude
 */
function sauvegarderDansSheets(articles, rubrique, analyse) {
  if (!CONFIG.SHEETS_ID || CONFIG.SHEETS_ID.trim() === "") {
    Logger.log("📊 SHEETS — Désactivé (SHEETS_ID vide). Renseigner CONFIG.SHEETS_ID.");
    return;
  }

  Logger.log("📊 SHEETS [" + rubrique.id + "] — Sauvegarde...");

  try {
    const ss      = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    const dateNow = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy HH:mm");

    // Couleur de la rubrique (fallback blanc si non définie)
    const couleur = rubrique.couleur || { fond: "#ffffff", texte: "#000000" };

    // ── Onglet Articles ───────────────────────────────────────
    var ongletArticles = ss.getSheetByName("Articles");
    if (!ongletArticles) {
      ongletArticles = ss.insertSheet("Articles");
      ongletArticles.appendRow(["Date", "Rubrique", "Titre", "Source", "URL", "Description", "Score", "Raison"]);
    }
    const NB_COL_ART = 8;
    articles.forEach(function(art) {
      ongletArticles.appendRow([
        dateNow,
        rubrique.nom,
        art.titre,
        art.source,
        art.url,
        art.description.substring(0, 500),
        art.score  || "",
        art.raison || "",
      ]);
      // Colorier la ligne entière avec la couleur de la rubrique
      const ligne = ongletArticles.getLastRow();
      ongletArticles.getRange(ligne, 1, 1, NB_COL_ART)
        .setBackground(couleur.fond)
        .setFontColor(couleur.texte)
        .setFontSize(14)
        .setFontFamily("Calibri");
    });
    Logger.log("  ✅ Articles : " + articles.length + " lignes ajoutées (couleur " + couleur.fond + ").");

    // ── Onglet Analyses ───────────────────────────────────────
    var ongletAnalyses = ss.getSheetByName("Analyses");
    if (!ongletAnalyses) {
      ongletAnalyses = ss.insertSheet("Analyses");
      ongletAnalyses.appendRow(["Date", "Rubrique", "Nb articles", "Analyse Claude (HTML)"]);
    }
    const NB_COL_ANA = 4;
    ongletAnalyses.appendRow([dateNow, rubrique.nom, articles.length, analyse || "Aucune analyse"]);
    // Colorier la ligne de l'analyse
    const ligneAna = ongletAnalyses.getLastRow();
    ongletAnalyses.getRange(ligneAna, 1, 1, NB_COL_ANA)
      .setBackground(couleur.fond)
      .setFontColor(couleur.texte)
      .setFontSize(14)
      .setFontFamily("Calibri");
    Logger.log("  ✅ Analyse sauvegardée dans onglet Analyses.");

  } catch(e) {
    Logger.log("❌ SHEETS — Erreur : " + e.message);
    Logger.log("   Verifier SHEETS_ID et les permissions du script.");
  }
}

/**
 * Retourne les URLs des articles déjà sauvegardés aujourd'hui pour une rubrique.
 * Utilisé par scorerPertinence() pour éviter les doublons intra-journaliers.
 * @param {Spreadsheet} ss
 * @param {string}      rubriqueNom  — valeur de rubrique.nom (ex: "Agri_Actu")
 * @returns {Array.<string>} liste d'URLs
 * @private
 */
function _obtenirUrlsDuJourRubrique(ss, rubriqueNom) {
  try {
    const onglet = ss.getSheetByName("Articles");
    if (!onglet) return [];

    const aujourdHui = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");
    const donnees    = onglet.getDataRange().getValues();
    const urls       = [];

    // Colonnes : 0=Date, 1=Rubrique, 2=Titre, 3=Source, 4=URL, 5=Description, 6=Score
    for (var i = 1; i < donnees.length; i++) {
      const ligneDate    = String(donnees[i][0] || "").substring(0, 10); // "dd/MM/yyyy"
      const ligneRubrique = String(donnees[i][1] || "");
      const ligneUrl      = String(donnees[i][4] || "");

      if (ligneDate === aujourdHui && ligneRubrique === rubriqueNom && ligneUrl) {
        urls.push(ligneUrl);
      }
    }

    Logger.log("  → " + urls.length + " URL(s) déjà sauvegardées aujourd'hui pour " + rubriqueNom + ".");
    return urls;
  } catch(e) {
    Logger.log("  ⚠️ _obtenirUrlsDuJour — Exception : " + e.message + ". On continue sans dedup Sheets.");
    return [];
  }
}

// ============================================================
// FIN SHEETS
// ============================================================




// ============================================================
// 🚀 MAIN — Orchestrateur principal (boucle sur les rubriques)
// ============================================================
//
// Pipeline par rubrique (lun→ven, toutes les 4h) :
//   0. Vérifier si aujourd'hui est ouvré
//   1. Fetch pool brut (20 articles via NewsAPI → fallback RSS)
//   2. Récupérer les URLs déjà sauvegardées aujourd'hui (anti-doublon)
//   3. Scorer avec Claude (JSON) → garder top 5 (score >= 6)
//   4. Analyser les 5 retenus avec Claude (HTML)
//   5. Sauvegarder dans Google Sheets (articles + analyse)
//
// ============================================================

function main() {
  Logger.log("==============================================");
  Logger.log("🚀 MAIN — Démarrage de la veille agricole");
  Logger.log("   Date : " + new Date().toLocaleString("fr-FR"));
  Logger.log("   Rubriques : " + RUBRIQUES.length);
  Logger.log("   Pool : " + CONFIG.NB_ARTICLES_POOL + " articles → top " + CONFIG.NB_ARTICLES_FINAL + " (score >= " + CONFIG.SCORE_MIN + ")");
  Logger.log("==============================================");

  if (!CONFIG.WEEKEND_ACTIF) {
    const jour = new Date().getDay();
    if (jour === 0 || jour === 6) {
      Logger.log("⏸️ MAIN — Weekend détecté. Suspendu.");
      return;
    }
  }

  // Ouvrir le Sheets une seule fois pour toutes les rubriques
  var ss = null;
  if (CONFIG.SHEETS_ID && CONFIG.SHEETS_ID.trim() !== "") {
    try {
      ss = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    } catch(e) {
      Logger.log("⚠️ MAIN — Impossible d'ouvrir le Sheets (" + e.message + "). Dedup désactivé.");
    }
  }

  RUBRIQUES.forEach(function(rubrique) {
    Logger.log("\n──────────────────────────────────────────");
    Logger.log("🌾 " + rubrique.nom);
    Logger.log("──────────────────────────────────────────");

    try {
      // Étape 1 — Fetch pool brut
      Logger.log("[1/4] Fetch pool (" + CONFIG.NB_ARTICLES_POOL + " articles)...");
      const pool = fetchActualitesPourRubrique(rubrique);
      if (!pool || pool.length === 0) {
        Logger.log("⚠️ Aucun article trouvé pour " + rubrique.id + ". Rubrique ignorée.");
        return;
      }
      Logger.log("  ✅ " + pool.length + " articles dans le pool.");

      // Étape 2 — URLs déjà sauvegardées aujourd'hui (anti-doublon)
      const urlsDuJour = ss ? _obtenirUrlsDuJourRubrique(ss, rubrique.nom) : [];

      // Vérifier le quota journalier (max NB_ARTICLES_JOUR par rubrique par jour)
      if (urlsDuJour.length >= CONFIG.NB_ARTICLES_JOUR) {
        Logger.log("  ℹ️ Quota journalier atteint (" + urlsDuJour.length + "/" + CONFIG.NB_ARTICLES_JOUR + "). Rubrique ignorée.");
        return;
      }

      // Étape 3 — Scoring Claude (JSON) → top 5
      Logger.log("[2/4] Scoring pertinence (Claude JSON)...");
      const articles = scorerPertinence(pool, rubrique, urlsDuJour);
      if (!articles || articles.length === 0) {
        Logger.log("  ℹ️ Aucun article pertinent retenu pour " + rubrique.id + ".");
        return;
      }
      Logger.log("  ✅ " + articles.length + " articles retenus.");

      // Étape 4 — Analyse Claude (HTML narratif)
      Logger.log("[3/4] Analyse narrative (Claude HTML)...");
      const analyse = analyserAvecClaude(articles, rubrique);
      Logger.log("  ✅ Analyse terminée.");

      // Étape 5 — Sauvegarde Sheets
      Logger.log("[4/4] Sauvegarde Google Sheets...");
      sauvegarderDansSheets(articles, rubrique, analyse);
      Logger.log("  ✅ Sauvegardé.");

    } catch(e) {
      Logger.log("❌ Erreur rubrique " + rubrique.id + " : " + e.message);
    }
  });

  Logger.log("\n==============================================");
  Logger.log("🏁 MAIN — Terminé. " + RUBRIQUES.length + " rubriques traitées.");
  Logger.log("==============================================");
}

// ============================================================
// FIN MAIN
// ============================================================




// ============================================================
// ⏰ TRIGGER — Planification automatique (lun→ven)
// ============================================================

/**
 * Crée un trigger quotidien à CONFIG.HEURE_ENVOI.
 * À exécuter UNE SEULE FOIS. Si vous changez l'heure :
 * supprimerTrigger() puis configurerTrigger().
 */
function configurerTrigger() {
  // ── Étape 1 : Mettre en forme le Google Sheet ─────────────
  Logger.log("⚙️  INIT — Mise en forme du Google Sheet...");
  initialiserSheets();

  // ── Étape 2 : Supprimer les anciens triggers ───────────────
  supprimerTrigger(false);

  // ── Étape 3 : Créer le trigger récurrent ──────────────────
  ScriptApp.newTrigger("main")
    .timeBased()
    .everyHours(CONFIG.INTERVALLE_HEURES)
    .create();

  Logger.log("⏰ TRIGGER — Créé. Exécution toutes les " + CONFIG.INTERVALLE_HEURES + "h.");
  Logger.log("            Week-end : " + (CONFIG.WEEKEND_ACTIF ? "inclus" : "exclu (lun→ven)"));
  Logger.log("            Pool : " + CONFIG.NB_ARTICLES_POOL + " articles → top " + CONFIG.NB_ARTICLES_FINAL + " retenus (score >= " + CONFIG.SCORE_MIN + "/10).");
  Logger.log("            Quota : " + CONFIG.NB_ARTICLES_JOUR + " articles max/rubrique/jour, " + RUBRIQUES.length + " rubriques.");
  Logger.log("            Visible dans : Menu gauche > Declencheurs.");
  Logger.log("⚙️  INIT — Projet pret. Lancer 'main' pour un premier test.");
}

/**
 * Supprime tous les triggers liés à "main".
 * @param {boolean} [logConfirmation=true]
 */
function supprimerTrigger(logConfirmation) {
  if (logConfirmation === undefined) logConfirmation = true;
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "main") {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  if (logConfirmation) Logger.log("⏰ TRIGGER — " + count + " déclencheur(s) supprimé(s).");
}

// ============================================================
// FIN TRIGGER
// ============================================================




// ============================================================
// 🧪 TEST — Verification (Gemini + Google News RSS)
// ============================================================

function testerApis() {
  Logger.log("==============================================");
  Logger.log("🧪 TEST — Verification des APIs");
  Logger.log("   Fournisseur IA actif : " + CONFIG.AI_FOURNISSEUR);
  Logger.log("==============================================");

  // ── Test IA (Gemini ou Anthropic selon config) ────────────
  Logger.log("\n[1/2] Test IA (" + CONFIG.AI_FOURNISSEUR + ")...");
  try {
    const reponse = _appellerIA("Reponds uniquement par le mot : OK", 10);
    if (reponse) {
      Logger.log("  ✅ IA OK — Reponse : " + reponse.trim());
    } else {
      Logger.log("  ❌ IA — Pas de reponse.");
      if (CONFIG.AI_FOURNISSEUR === "gemini") {
        if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "REMPLACER_ICI")
          Logger.log("  → GEMINI_API_KEY non renseignee. Obtenir une cle gratuite sur https://aistudio.google.com");
        else
          Logger.log("  → Verifier GEMINI_API_KEY dans CONFIG.");
      } else {
        Logger.log("  → Verifier ANTHROPIC_KEY ou le solde de credits sur console.anthropic.com.");
      }
    }
  } catch(e) {
    Logger.log("  ❌ Exception IA : " + e.message);
  }

  // ── Test Google News RSS (source principale, sans cle) ────
  Logger.log("\n[2/2] Test Google News RSS (source principale)...");
  try {
    const url      = "https://news.google.com/rss/search?q=agriculture+Afrique&hl=fr&gl=FR&ceid=FR:fr";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code     = response.getResponseCode();
    if (code === 200) {
      const xml   = XmlService.parse(response.getContentText());
      const items = xml.getRootElement().getChild("channel").getChildren("item");
      Logger.log("  ✅ Google News RSS OK — " + items.length + " articles disponibles.");
      if (items.length > 0) {
        const titre = (_getRssText(items[0], "title") || "").replace(/<[^>]+>/g, "").trim();
        Logger.log("  Exemple : " + titre.substring(0, 80));
      }
    } else {
      Logger.log("  ❌ Google News RSS inaccessible [" + code + "].");
    }
  } catch(e) {
    Logger.log("  ❌ Exception Google News : " + e.message);
  }

  Logger.log("\n==============================================");
  Logger.log("🏁 TEST — Termine.");
  Logger.log("==============================================");
}
