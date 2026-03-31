// ============================================================
// 📦 VEILLE ACTUALITÉS — Google Apps Script + Claude AI
// ============================================================
// AUTEUR      : Massaka SAS / NOVA AUTO
// DATE        : 2026-03-31
// VERSION     : 2.0.0
//
// NOUVEAUTÉS v2 :
//   - Score de sentiment par article (positif / neutre / négatif)
//   - Multi-destinataires (liste d'emails)
//   - Trigger lundi→vendredi uniquement (pas de veille le weekend)
//   - Stockage automatique dans Google Sheets (historique)
//   - Fallback RSS si NewsAPI dépasse le quota gratuit
//
// ─────────────────────────────────────────────────────────────
// INSTRUCTIONS D'INSTALLATION
// ─────────────────────────────────────────────────────────────
//  1. Aller sur https://script.google.com
//  2. Nouveau projet → coller ce fichier
//  3. Remplir NEWS_API_KEY, ANTHROPIC_KEY dans CONFIG
//  4. Créer un Google Sheet vide → coller son ID dans SHEETS_ID
//     (URL : docs.google.com/spreadsheets/d/[ID]/edit)
//  5. Exécuter "main" pour tester
//  6. Exécuter "configurerTrigger" pour activer l'automatisation
// ============================================================


// ============================================================
// 🔧 SECTION CONFIG — Modifier selon vos besoins
// ============================================================

const CONFIG = {

  // ── APIs ──────────────────────────────────────────────────
  NEWS_API_KEY:  "REMPLACER_ICI",   // → https://newsapi.org
  ANTHROPIC_KEY: "REMPLACER_ICI",   // → https://console.anthropic.com

  // ── Email ─────────────────────────────────────────────────
  // Un seul  : "toi@email.com"
  // Plusieurs : ["toi@email.com", "collegue@email.com"]
  EMAIL_DESTINATAIRES:  "ton@email.com",
  EMAIL_EXPEDITEUR_NOM: "Veille IA",

  // ── Planification ─────────────────────────────────────────
  HEURE_ENVOI:   8,      // 8 = 8h00 du matin (format 24h)
  WEEKEND_ACTIF: false,  // false = lundi→vendredi uniquement

  // ── Critères de recherche ─────────────────────────────────
  SUJETS: [
    "intelligence artificielle",
    "startups france",
    "technologie"
  ],
  PAYS:        "fr",
  LANGUE:      "fr",
  NB_ARTICLES: 10,

  // ── Fallback RSS (si NewsAPI quota dépassé) ───────────────
  // Laisser [] pour désactiver le fallback
  RSS_FALLBACK: [
    "https://www.lemonde.fr/technologies/rss_full.xml",
    "https://www.usine-digitale.fr/rss/all.xml",
  ],

  // ── Style du résumé Claude ────────────────────────────────
  // "professionnel" | "casual" | "bullet"
  TON: "professionnel",

  // ── Modèle Claude ─────────────────────────────────────────
  CLAUDE_MODEL:      "claude-sonnet-4-20250514",
  CLAUDE_MAX_TOKENS: 2500,

  // ── Google Sheets (historique) ────────────────────────────
  // Coller l'ID du Google Sheet ici (laisser "" pour désactiver)
  SHEETS_ID:     "",
  SHEETS_ONGLET: "Historique",
};

// ============================================================
// FIN CONFIG
// ============================================================




// ============================================================
// 📡 SECTION FETCH — Récupération des actualités
// ============================================================
// Stratégie :
//   1. Tentative via NewsAPI
//   2. Si quota dépassé (426/429) ou 0 résultat → fallback RSS
// ============================================================

/**
 * Point d'entrée principal pour la récupération.
 * Bascule automatiquement sur RSS si NewsAPI échoue.
 * @returns {Array} [{titre, description, url, source, date, sujet}]
 */
function fetchActualites() {
  Logger.log("📡 FETCH — Début de la récupération...");

  const articles = _fetchDepuisNewsApi();

  if (articles.length === 0 && CONFIG.RSS_FALLBACK.length > 0) {
    Logger.log("📡 FETCH — Basculement sur le fallback RSS...");
    return _fetchDepuisRss();
  }

  return articles;
}

/**
 * Récupère les articles depuis NewsAPI.
 * @private
 */
function _fetchDepuisNewsApi() {
  const articles    = [];
  const maxParSujet = Math.ceil(CONFIG.NB_ARTICLES / CONFIG.SUJETS.length);

  CONFIG.SUJETS.forEach(function(sujet) {
    try {
      Logger.log("  → NewsAPI : " + sujet);
      const response = UrlFetchApp.fetch(_buildNewsApiUrl(sujet, maxParSujet), { muteHttpExceptions: true });
      const code     = response.getResponseCode();
      const body     = JSON.parse(response.getContentText());

      if (code === 426 || code === 429) {
        Logger.log("  ⚠️ NewsAPI quota dépassé (code " + code + "). Fallback RSS activé.");
        return;
      }
      if (code !== 200) {
        Logger.log("  ⚠️ NewsAPI erreur [" + code + "] : " + body.message);
        return;
      }
      if (!body.articles || body.articles.length === 0) {
        Logger.log("  ℹ️ Aucun article pour : " + sujet);
        return;
      }

      body.articles.forEach(function(art) {
        if (!art.title || art.title === "[Removed]") return;
        articles.push({
          titre:       art.title       || "Sans titre",
          description: art.description || "Pas de description disponible.",
          url:         art.url         || "#",
          source:      art.source ? art.source.name : "Source inconnue",
          date:        art.publishedAt || "",
          sujet:       sujet,
        });
      });

      Logger.log("  ✅ " + body.articles.length + " articles pour : " + sujet);
    } catch(e) {
      Logger.log("  ❌ Exception NewsAPI '" + sujet + "' : " + e.message);
    }
  });

  return _dedupliquerEtLimiter(articles);
}

/**
 * Récupère les articles depuis les flux RSS de fallback.
 * @private
 */
function _fetchDepuisRss() {
  const articles = [];

  CONFIG.RSS_FALLBACK.forEach(function(feedUrl) {
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

      const limite = Math.ceil(CONFIG.NB_ARTICLES / CONFIG.RSS_FALLBACK.length);
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
  const resultat = uniques.slice(0, CONFIG.NB_ARTICLES);
  Logger.log("📡 FETCH — " + resultat.length + " articles retenus.");
  return resultat;
}

/** @private */
function _buildNewsApiUrl(sujet, pageSize) {
  const params = {
    q: encodeURIComponent(sujet), language: CONFIG.LANGUE,
    pageSize: pageSize, sortBy: "publishedAt", apiKey: CONFIG.NEWS_API_KEY,
  };
  return "https://newsapi.org/v2/everything?" + Object.keys(params)
    .map(function(k) { return k + "=" + params[k]; }).join("&");
}

// ============================================================
// FIN FETCH
// ============================================================




// ============================================================
// 🤖 SECTION CLAUDE — Analyse IA des actualités
// ============================================================
// Inclut pour chaque article :
//   - Badge d'importance : 🔥 CHAUD / 📌 UTILE / ℹ️ INFO
//   - Score de sentiment : 😊 POSITIF / 😐 NEUTRE / ⚠️ NÉGATIF
//   - Résumé 2-3 lignes
// Plus une section "Tendances du jour" en bas.
// ============================================================

/**
 * Soumet les articles à Claude et retourne du HTML.
 * @param {Array} articles
 * @returns {string} HTML prêt à insérer dans l'email
 */
function analyserAvecClaude(articles) {
  Logger.log("🤖 CLAUDE — Analyse de " + articles.length + " articles...");

  if (!articles || articles.length === 0) {
    return "<p>Aucun article disponible aujourd'hui.</p>";
  }

  try {
    const payload = {
      model:      CONFIG.CLAUDE_MODEL,
      max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
      messages:   [{ role: "user", content: _construirePrompt(articles) }],
    };

    const options = {
      method: "post", contentType: "application/json",
      headers: { "x-api-key": CONFIG.ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    Logger.log("  → Appel API Anthropic...");
    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    const code     = response.getResponseCode();
    const body     = JSON.parse(response.getContentText());

    if (code !== 200) {
      Logger.log("  ❌ Erreur Anthropic [" + code + "] : " + JSON.stringify(body));
      return "<p>Erreur analyse IA (code " + code + ").</p>";
    }

    const contenu = body.content && body.content[0] ? body.content[0].text : "";
    Logger.log("🤖 CLAUDE — Terminé. " + contenu.length + " caractères générés.");
    return contenu;

  } catch(e) {
    Logger.log("❌ CLAUDE — Exception : " + e.message);
    return "<p>Erreur inattendue : " + e.message + "</p>";
  }
}

/** @private */
function _construirePrompt(articles) {
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

  return `Tu es un assistant de veille stratégique. Nous sommes le ${date}.

${instructionTon}

Voici ${articles.length} articles à analyser :

${listeArticles}

INSTRUCTIONS (respecter exactement) :
- Réponds UNIQUEMENT en HTML valide, sans balise <html>, <head> ou <body>
- Pour chaque article, génère un bloc avec :
    1. Badge importance :  🔥 CHAUD (rupture/tendance majeure) | 📌 UTILE (actionnable) | ℹ️ INFO (général)
    2. Badge sentiment :   😊 POSITIF (opportunité/succès) | 😐 NEUTRE (factuel) | ⚠️ NÉGATIF (risque/problème)
    3. Titre cliquable vers l'URL
    4. Source + date
    5. Résumé 2-3 lignes

- En bas, une section "Tendances du jour" :
    • 3 à 5 bullet points sur les tendances identifiées
    • 1 phrase de conclusion

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
  <h2>Tendances du jour</h2>
  <ul>[bullet points]</ul>
  <p class="conclusion">[Conclusion]</p>
</div>`;
}

// ============================================================
// FIN CLAUDE
// ============================================================




// ============================================================
// 📧 SECTION EMAIL — Template HTML
// ============================================================

/**
 * Enveloppe le contenu HTML dans un template email complet.
 * @param {string} contenuHtml
 * @returns {string} HTML complet
 */
function construireEmail(contenuHtml) {
  Logger.log("📧 EMAIL — Construction du template...");

  const date        = Utilities.formatDate(new Date(), "Europe/Paris", "EEEE dd MMMM yyyy", "fr");
  const dateCapital = date.charAt(0).toUpperCase() + date.slice(1);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veille du ${dateCapital}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
      background-color: #f4f6f9; color: #1a1a2e; line-height: 1.6;
    }
    .wrapper {
      max-width: 680px; margin: 32px auto; background: #fff;
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
      padding: 36px 40px; text-align: center;
    }
    .header .label {
      font-size: 11px; font-weight: 700; letter-spacing: 3px;
      color: #e94560; text-transform: uppercase; margin-bottom: 10px;
    }
    .header h1 { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .header .date { font-size: 14px; color: rgba(255,255,255,0.6); }
    .body { padding: 36px 40px; }

    /* Légende */
    .legende {
      display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px;
      padding: 10px 14px; background: #f8f9fc; border-radius: 8px;
      font-size: 12px; color: #666;
    }

    /* Articles */
    .article {
      border: 1px solid #e8ecf0; border-radius: 10px;
      padding: 20px 24px; margin-bottom: 20px;
    }
    .article:hover { border-color: #c5d0de; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .badge-importance, .badge-sentiment {
      display: inline-block; font-size: 12px; font-weight: 700;
      padding: 3px 10px; border-radius: 20px;
    }
    .badge-importance { background: #f0f4ff; color: #3a56d4; }
    .badge-sentiment  { background: #f5f5f5; color: #555; }
    .article h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; line-height: 1.4; }
    .article h3 a { color: #0f3460; text-decoration: none; }
    .article h3 a:hover { color: #e94560; text-decoration: underline; }
    .article .meta { font-size: 12px; color: #888ea8; margin-bottom: 10px; }
    .article .resume { font-size: 14px; color: #444; line-height: 1.65; }

    /* Tendances */
    .tendances {
      background: linear-gradient(135deg, #f8f9ff 0%, #eef1fb 100%);
      border: 1px solid #d6ddf8; border-radius: 10px;
      padding: 24px 28px; margin-top: 28px;
    }
    .tendances h2 { font-size: 17px; font-weight: 800; color: #0f3460; margin-bottom: 14px; }
    .tendances ul { padding-left: 20px; margin-bottom: 14px; }
    .tendances ul li { font-size: 14px; color: #333; margin-bottom: 8px; line-height: 1.55; }
    .tendances .conclusion {
      font-size: 13px; font-style: italic; color: #667;
      border-top: 1px solid #d6ddf8; padding-top: 12px;
    }

    /* Footer */
    .footer {
      background: #f8f9fc; border-top: 1px solid #eaecf0;
      padding: 24px 40px; text-align: center;
    }
    .footer p { font-size: 12px; color: #9a9fb0; line-height: 1.7; }
    .footer a { color: #3a56d4; text-decoration: none; }
    .footer .powered { font-size: 11px; color: #bbb; margin-top: 8px; }

    @media (max-width: 600px) {
      .wrapper { margin: 0; border-radius: 0; }
      .header, .body, .footer { padding: 24px 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <div class="header">
      <p class="label">Veille stratégique</p>
      <h1>Actualités du jour</h1>
      <p class="date">${dateCapital}</p>
    </div>

    <div class="body">
      <div class="legende">
        <strong>Importance :</strong>
        <span>🔥 Chaud</span><span>📌 Utile</span><span>ℹ️ Info</span>
        &nbsp;&nbsp;
        <strong>Sentiment :</strong>
        <span>😊 Positif</span><span>😐 Neutre</span><span>⚠️ Négatif</span>
      </div>

      ${contenuHtml}
    </div>

    <div class="footer">
      <p>Veille automatique — Sujets : <strong>${CONFIG.SUJETS.join(", ")}</strong></p>
      <p class="powered">
        Propulsé par <a href="https://newsapi.org">NewsAPI</a> &amp;
        <a href="https://anthropic.com">Claude</a> via Google Apps Script
      </p>
    </div>

  </div>
</body>
</html>`;

  Logger.log("📧 EMAIL — Template construit.");
  return html;
}

// ============================================================
// FIN EMAIL
// ============================================================




// ============================================================
// 📬 SECTION SEND — Envoi via Gmail (multi-destinataires)
// ============================================================

/**
 * Envoie l'email à tous les destinataires de CONFIG.EMAIL_DESTINATAIRES.
 * Accepte une string (1 email) ou un tableau (plusieurs emails).
 * @param {string} htmlBody
 */
function envoyerEmail(htmlBody) {
  Logger.log("📬 SEND — Préparation de l'envoi...");

  const date  = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");
  const sujet = "Veille du " + date + " — " + CONFIG.SUJETS.slice(0, 2).join(", ");

  // Normaliser en tableau
  const destinataires = Array.isArray(CONFIG.EMAIL_DESTINATAIRES)
    ? CONFIG.EMAIL_DESTINATAIRES
    : CONFIG.EMAIL_DESTINATAIRES.split(",").map(function(e) { return e.trim(); });

  destinataires.forEach(function(email) {
    if (!email) return;
    try {
      GmailApp.sendEmail(email, sujet,
        "Votre client email ne supporte pas le HTML.",
        { htmlBody: htmlBody, name: CONFIG.EMAIL_EXPEDITEUR_NOM }
      );
      Logger.log("  ✅ Envoyé à : " + email);
    } catch(e) {
      Logger.log("  ❌ Échec pour " + email + " : " + e.message);
    }
  });

  Logger.log("📬 SEND — Terminé. Sujet : " + sujet);
}

// ============================================================
// FIN SEND
// ============================================================




// ============================================================
// 📊 SECTION SHEETS — Historique dans Google Sheets
// ============================================================
// Colonnes : Date | Titre | Source | Sujet | URL | Description
// Crée l'onglet et les en-têtes automatiquement si absents.
// Désactivé si SHEETS_ID est vide.
// ============================================================

/**
 * Enregistre les articles dans Google Sheets.
 * @param {Array} articles
 */
function sauvegarderDansSheets(articles) {
  if (!CONFIG.SHEETS_ID || CONFIG.SHEETS_ID.trim() === "") {
    Logger.log("📊 SHEETS — Désactivé (SHEETS_ID vide).");
    return;
  }

  Logger.log("📊 SHEETS — Sauvegarde de " + articles.length + " articles...");

  try {
    const ss     = SpreadsheetApp.openById(CONFIG.SHEETS_ID);
    let   onglet = ss.getSheetByName(CONFIG.SHEETS_ONGLET);

    // Créer l'onglet + en-têtes si absent
    if (!onglet) {
      onglet = ss.insertSheet(CONFIG.SHEETS_ONGLET);
      onglet.appendRow(["Date", "Titre", "Source", "Sujet", "URL", "Description"]);
      onglet.getRange(1, 1, 1, 6)
        .setFontWeight("bold")
        .setBackground("#0f3460")
        .setFontColor("#ffffff");
      Logger.log("  → Onglet '" + CONFIG.SHEETS_ONGLET + "' créé.");
    }

    const dateNow = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy HH:mm");

    articles.forEach(function(art) {
      onglet.appendRow([
        dateNow,
        art.titre,
        art.source,
        art.sujet,
        art.url,
        art.description.substring(0, 500),
      ]);
    });

    Logger.log("📊 SHEETS — " + articles.length + " lignes ajoutées.");
  } catch(e) {
    Logger.log("❌ SHEETS — Erreur : " + e.message);
    Logger.log("   Vérifiez SHEETS_ID et les permissions du script sur le fichier.");
  }
}

// ============================================================
// FIN SHEETS
// ============================================================




// ============================================================
// 🚀 MAIN — Orchestrateur principal
// ============================================================

/**
 * Pipeline complet :
 *   0. Vérifier si aujourd'hui est ouvré (si WEEKEND_ACTIF = false)
 *   1. Récupérer les articles (NewsAPI → fallback RSS si quota dépassé)
 *   2. Sauvegarder dans Google Sheets
 *   3. Analyser avec Claude (résumé + importance + sentiment)
 *   4. Construire l'email HTML
 *   5. Envoyer à tous les destinataires
 */
function main() {
  Logger.log("==============================================");
  Logger.log("🚀 MAIN — Démarrage de la veille automatique");
  Logger.log("   Date : " + new Date().toLocaleString("fr-FR"));
  Logger.log("==============================================");

  try {

    // Étape 0 — Vérification jour ouvré
    if (!CONFIG.WEEKEND_ACTIF) {
      const jour = new Date().getDay(); // 0 = dimanche, 6 = samedi
      if (jour === 0 || jour === 6) {
        Logger.log("⏸️ MAIN — Weekend détecté. Envoi suspendu (WEEKEND_ACTIF = false).");
        return;
      }
    }

    // Étape 1 — Récupération
    Logger.log("\n[1/5] Récupération des actualités...");
    const articles = fetchActualites();
    if (!articles || articles.length === 0) {
      Logger.log("⚠️ MAIN — Aucun article trouvé. Arrêt.");
      return;
    }
    Logger.log("  ✅ " + articles.length + " articles.");

    // Étape 2 — Sauvegarde Sheets
    Logger.log("\n[2/5] Sauvegarde Google Sheets...");
    sauvegarderDansSheets(articles);

    // Étape 3 — Analyse Claude
    Logger.log("\n[3/5] Analyse par Claude...");
    const contenuHtml = analyserAvecClaude(articles);
    Logger.log("  ✅ Analyse terminée.");

    // Étape 4 — Construction email
    Logger.log("\n[4/5] Construction du template email...");
    const emailHtml = construireEmail(contenuHtml);
    Logger.log("  ✅ Template construit.");

    // Étape 5 — Envoi
    Logger.log("\n[5/5] Envoi de l'email...");
    envoyerEmail(emailHtml);
    Logger.log("  ✅ Email envoyé.\n");

  } catch(e) {
    Logger.log("❌ MAIN — Erreur fatale : " + e.message);
    try {
      const dest = Array.isArray(CONFIG.EMAIL_DESTINATAIRES)
        ? CONFIG.EMAIL_DESTINATAIRES[0]
        : CONFIG.EMAIL_DESTINATAIRES.split(",")[0].trim();
      GmailApp.sendEmail(
        dest,
        "[ERREUR] Veille automatique — " + new Date().toLocaleDateString("fr-FR"),
        "Erreur lors de l'exécution :\n\n" + e.message + "\n\nConsultez les logs Apps Script.",
        { name: CONFIG.EMAIL_EXPEDITEUR_NOM }
      );
    } catch(mailErr) {
      Logger.log("❌ Impossible d'envoyer l'email d'erreur : " + mailErr.message);
    }
  }

  Logger.log("==============================================");
  Logger.log("🏁 MAIN — Fin du processus.");
  Logger.log("==============================================");
}

// ============================================================
// FIN MAIN
// ============================================================




// ============================================================
// ⏰ TRIGGER — Planification automatique (lun→ven)
// ============================================================
// Google Apps Script exécute main() chaque jour à HEURE_ENVOI.
// La vérification du weekend est faite dans main() directement
// (plus fiable que les triggers conditionnels natifs).
//
// configurerTrigger() → active l'automatisation
// supprimerTrigger()  → désactive tout
// ============================================================

/**
 * Crée un trigger quotidien à CONFIG.HEURE_ENVOI.
 * À exécuter UNE SEULE FOIS. Si vous changez l'heure :
 * supprimerTrigger() puis configurerTrigger().
 */
function configurerTrigger() {
  supprimerTrigger(false);

  ScriptApp.newTrigger("main")
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.HEURE_ENVOI)
    .create();

  Logger.log("⏰ TRIGGER — Créé. Exécution à " + CONFIG.HEURE_ENVOI + "h00 chaque jour.");
  Logger.log("            Week-end : " + (CONFIG.WEEKEND_ACTIF ? "inclus" : "exclu (lun→ven)"));
  Logger.log("            Visible dans : Menu gauche > Déclencheurs.");
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
