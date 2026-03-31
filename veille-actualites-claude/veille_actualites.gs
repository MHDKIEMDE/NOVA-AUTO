// ============================================================
// 📦 VEILLE ACTUALITÉS — Google Apps Script + Claude AI
// ============================================================
// AUTEUR      : Massaka SAS / NOVA AUTO
// DATE        : 2026-03-31
// VERSION     : 1.0.0
//
// DESCRIPTION :
//   Script d'automatisation de veille d'actualités.
//   Chaque matin, il récupère des articles via NewsAPI,
//   les fait analyser par Claude (Anthropic), puis envoie
//   un email HTML propre et lisible.
//
// ─────────────────────────────────────────────────────────────
// INSTRUCTIONS D'INSTALLATION (lire avant tout)
// ─────────────────────────────────────────────────────────────
//
//  1. Aller sur https://script.google.com
//  2. Créer un nouveau projet (+ Nouveau projet)
//  3. Coller tout ce fichier dans l'éditeur
//  4. Remplir la section CONFIG ci-dessous avec vos clés API
//     - NewsAPI  → https://newsapi.org  (gratuit jusqu'à 100 req/jour)
//     - Anthropic → https://console.anthropic.com
//  5. Cliquer sur "Exécuter" > sélectionner la fonction "main"
//     pour tester une première fois manuellement
//  6. Cliquer sur "Exécuter" > sélectionner "configurerTrigger"
//     pour activer l'envoi automatique quotidien
//  7. Vérifier les permissions Gmail quand Google le demande
//
// NOTE : Le trigger quotidien apparaîtra dans
//        Déclencheurs (horloge) dans le menu de gauche.
// ============================================================


// ============================================================
// 🔧 SECTION CONFIG — Modifier selon vos besoins
// ============================================================

const CONFIG = {

  // ── APIs ──────────────────────────────────────────────────
  NEWS_API_KEY:   "REMPLACER_ICI",   // → https://newsapi.org
  ANTHROPIC_KEY:  "REMPLACER_ICI",   // → https://console.anthropic.com

  // ── Email ─────────────────────────────────────────────────
  EMAIL_DESTINATAIRE: "ton@email.com",
  EMAIL_EXPEDITEUR_NOM: "Veille IA",

  // ── Planification ─────────────────────────────────────────
  HEURE_ENVOI: 8,  // 8 = 8h00 du matin (format 24h, entier)

  // ── Critères de recherche ─────────────────────────────────
  // Mots-clés surveillés (chaque sujet = une requête séparée)
  SUJETS: [
    "intelligence artificielle",
    "startups france",
    "technologie"
  ],
  PAYS:        "fr",   // Code pays ISO 3166-1 (fr, us, gb, de...)
  LANGUE:      "fr",   // Code langue ISO 639-1 (fr, en, de...)
  NB_ARTICLES: 10,     // Nombre total d'articles récupérés

  // ── Style du résumé Claude ────────────────────────────────
  // Valeurs possibles : "professionnel" | "casual" | "bullet"
  TON: "professionnel",

  // ── Modèle Claude ────────────────────────────────────────
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
  CLAUDE_MAX_TOKENS: 2048,
};

// ============================================================
// FIN CONFIG
// ============================================================




// ============================================================
// 📡 SECTION FETCH — Récupération des actualités (NewsAPI)
// ============================================================

/**
 * Récupère les articles depuis NewsAPI selon la CONFIG.
 * Fait une requête par sujet et fusionne les résultats.
 *
 * @returns {Array} Liste d'articles [{titre, description, url, source, date}]
 */
function fetchActualites() {
  Logger.log("📡 FETCH — Début de la récupération des actualités...");

  const articles = [];
  const maxParSujet = Math.ceil(CONFIG.NB_ARTICLES / CONFIG.SUJETS.length);

  CONFIG.SUJETS.forEach(function(sujet) {
    try {
      const url = _buildNewsApiUrl(sujet, maxParSujet);
      Logger.log("  → Requête NewsAPI pour : " + sujet);

      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code     = response.getResponseCode();
      const body     = JSON.parse(response.getContentText());

      if (code !== 200) {
        Logger.log("  ⚠️ Erreur NewsAPI [" + code + "] pour '" + sujet + "' : " + body.message);
        return;
      }

      if (!body.articles || body.articles.length === 0) {
        Logger.log("  ℹ️ Aucun article trouvé pour : " + sujet);
        return;
      }

      body.articles.forEach(function(art) {
        // Filtrer les articles sans titre ou supprimés
        if (!art.title || art.title === "[Removed]") return;

        articles.push({
          titre:       art.title        || "Sans titre",
          description: art.description  || "Pas de description disponible.",
          url:         art.url          || "#",
          source:      art.source ? art.source.name : "Source inconnue",
          date:        art.publishedAt  || "",
          sujet:       sujet,
        });
      });

      Logger.log("  ✅ " + body.articles.length + " articles récupérés pour : " + sujet);

    } catch(e) {
      Logger.log("  ❌ Exception lors du fetch pour '" + sujet + "' : " + e.message);
    }
  });

  // Dédupliquer par URL
  const vus  = {};
  const uniques = articles.filter(function(a) {
    if (vus[a.url]) return false;
    vus[a.url] = true;
    return true;
  });

  // Limiter au nombre configuré
  const resultat = uniques.slice(0, CONFIG.NB_ARTICLES);
  Logger.log("📡 FETCH — " + resultat.length + " articles uniques retenus.");
  return resultat;
}

/**
 * Construit l'URL NewsAPI pour un sujet donné.
 * @private
 */
function _buildNewsApiUrl(sujet, pageSize) {
  const base   = "https://newsapi.org/v2/everything";
  const params = {
    q:        encodeURIComponent(sujet),
    language: CONFIG.LANGUE,
    pageSize: pageSize,
    sortBy:   "publishedAt",
    apiKey:   CONFIG.NEWS_API_KEY,
  };
  const query = Object.keys(params)
    .map(function(k) { return k + "=" + params[k]; })
    .join("&");
  return base + "?" + query;
}

// ============================================================
// FIN FETCH
// ============================================================




// ============================================================
// 🤖 SECTION CLAUDE — Analyse IA des actualités
// ============================================================

/**
 * Envoie les articles à Claude pour analyse et résumé HTML.
 *
 * @param {Array} articles - Tableau retourné par fetchActualites()
 * @returns {string} HTML formaté prêt à insérer dans l'email
 */
function analyserAvecClaude(articles) {
  Logger.log("🤖 CLAUDE — Début de l'analyse des articles...");

  if (!articles || articles.length === 0) {
    Logger.log("🤖 CLAUDE — Aucun article à analyser.");
    return "<p>Aucun article disponible aujourd'hui.</p>";
  }

  const prompt = _construirePrompt(articles);

  try {
    const payload = {
      model:      CONFIG.CLAUDE_MODEL,
      max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
      messages: [
        {
          role:    "user",
          content: prompt,
        }
      ]
    };

    const options = {
      method:             "post",
      contentType:        "application/json",
      headers: {
        "x-api-key":         CONFIG.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    Logger.log("  → Appel API Anthropic en cours...");
    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    const code     = response.getResponseCode();
    const body     = JSON.parse(response.getContentText());

    if (code !== 200) {
      Logger.log("  ❌ Erreur Anthropic [" + code + "] : " + JSON.stringify(body));
      return "<p>Erreur lors de l'analyse IA (code " + code + "). Vérifiez votre clé API.</p>";
    }

    const contenu = body.content && body.content[0] ? body.content[0].text : "";
    Logger.log("🤖 CLAUDE — Analyse terminée. " + contenu.length + " caractères générés.");
    return contenu;

  } catch(e) {
    Logger.log("❌ CLAUDE — Exception : " + e.message);
    return "<p>Erreur inattendue lors de l'analyse IA : " + e.message + "</p>";
  }
}

/**
 * Construit le prompt envoyé à Claude selon le TON configuré.
 * @private
 */
function _construirePrompt(articles) {
  const date = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");

  // Formater la liste d'articles pour Claude
  const listeArticles = articles.map(function(a, i) {
    return (
      "ARTICLE " + (i + 1) + " :\n" +
      "Titre : " + a.titre + "\n" +
      "Source : " + a.source + "\n" +
      "Sujet surveillé : " + a.sujet + "\n" +
      "Description : " + a.description + "\n" +
      "URL : " + a.url
    );
  }).join("\n\n---\n\n");

  // Instruction de ton
  const instructionTon = {
    "professionnel": "Adopte un ton professionnel, concis et factuel. Idéal pour un cadre en entreprise.",
    "casual":        "Adopte un ton décontracté, accessible et engageant. Idéal pour une newsletter grand public.",
    "bullet":        "Utilise uniquement des bullet points courts et percutants. Maximum 1 ligne par point.",
  }[CONFIG.TON] || "Adopte un ton professionnel et factuel.";

  return `Tu es un assistant de veille stratégique. Aujourd'hui nous sommes le ${date}.

${instructionTon}

Voici ${articles.length} articles d'actualité à analyser :

${listeArticles}

INSTRUCTIONS DE FORMATAGE (IMPORTANT) :
- Réponds UNIQUEMENT en HTML valide, sans balise <html>, <head> ou <body>
- Pour chaque article, génère un bloc HTML avec :
    • Un titre cliquable avec l'URL
    • Un résumé de 2 à 3 lignes maximum
    • Un badge d'importance :
        🔥 CHAUD    → info urgente ou très tendance
        📌 UTILE    → info pertinente et actionnable
        ℹ️ INFO     → information générale à garder en tête
    • La source et la date si disponible
- Après tous les articles, ajoute une section "Tendances du jour" :
    • 3 à 5 bullet points sur les grandes tendances identifiées dans ces articles
    • Un mot de conclusion en 1 phrase

STRUCTURE HTML ATTENDUE (répéter pour chaque article) :
<div class="article">
  <div class="badge">[badge ici]</div>
  <h3><a href="[URL]">[TITRE]</a></h3>
  <p class="meta">[Source] — [Date formatée]</p>
  <p class="resume">[Résumé 2-3 lignes]</p>
</div>

Puis à la fin :
<div class="tendances">
  <h2>Tendances du jour</h2>
  <ul>[bullet points]</ul>
  <p class="conclusion">[Mot de conclusion]</p>
</div>`;
}

// ============================================================
// FIN CLAUDE
// ============================================================




// ============================================================
// 📧 SECTION EMAIL — Template HTML de l'email
// ============================================================

/**
 * Enveloppe le contenu HTML de Claude dans un template email complet.
 * Design responsive, lisible sur desktop et mobile.
 *
 * @param {string} contenuHtml - HTML généré par analyserAvecClaude()
 * @returns {string} HTML complet de l'email
 */
function construireEmail(contenuHtml) {
  Logger.log("📧 EMAIL — Construction du template HTML...");

  const date        = Utilities.formatDate(new Date(), "Europe/Paris", "EEEE dd MMMM yyyy", "fr");
  const dateCapital = date.charAt(0).toUpperCase() + date.slice(1);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veille du ${dateCapital}</title>
  <style>
    /* ── Reset & base ── */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
      background-color: #f4f6f9;
      color: #1a1a2e;
      line-height: 1.6;
    }

    /* ── Wrapper ── */
    .wrapper {
      max-width: 680px;
      margin: 32px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
      padding: 36px 40px;
      text-align: center;
    }
    .header .label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #e94560;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .header h1 {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .header .date {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
    }

    /* ── Corps ── */
    .body {
      padding: 36px 40px;
    }

    /* ── Articles ── */
    .article {
      border: 1px solid #e8ecf0;
      border-radius: 10px;
      padding: 20px 24px;
      margin-bottom: 20px;
      transition: border-color 0.2s;
      position: relative;
    }
    .article:hover { border-color: #c5d0de; }

    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      margin-bottom: 10px;
      background-color: #f0f4ff;
      color: #3a56d4;
    }

    .article h3 {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 6px;
      line-height: 1.4;
    }
    .article h3 a {
      color: #0f3460;
      text-decoration: none;
    }
    .article h3 a:hover { color: #e94560; text-decoration: underline; }

    .article .meta {
      font-size: 12px;
      color: #888ea8;
      margin-bottom: 10px;
    }

    .article .resume {
      font-size: 14px;
      color: #444;
      line-height: 1.65;
    }

    /* ── Tendances ── */
    .tendances {
      background: linear-gradient(135deg, #f8f9ff 0%, #eef1fb 100%);
      border: 1px solid #d6ddf8;
      border-radius: 10px;
      padding: 24px 28px;
      margin-top: 28px;
    }
    .tendances h2 {
      font-size: 17px;
      font-weight: 800;
      color: #0f3460;
      margin-bottom: 14px;
    }
    .tendances ul {
      padding-left: 20px;
      margin-bottom: 14px;
    }
    .tendances ul li {
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;
      line-height: 1.55;
    }
    .tendances .conclusion {
      font-size: 13px;
      font-style: italic;
      color: #667;
      border-top: 1px solid #d6ddf8;
      padding-top: 12px;
      margin-top: 4px;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: #eee;
      margin: 28px 0;
    }

    /* ── Footer ── */
    .footer {
      background: #f8f9fc;
      border-top: 1px solid #eaecf0;
      padding: 24px 40px;
      text-align: center;
    }
    .footer p {
      font-size: 12px;
      color: #9a9fb0;
      line-height: 1.7;
    }
    .footer a { color: #3a56d4; text-decoration: none; }
    .footer .powered {
      font-size: 11px;
      color: #bbb;
      margin-top: 8px;
    }

    /* ── Mobile ── */
    @media (max-width: 600px) {
      .wrapper { margin: 0; border-radius: 0; }
      .header, .body, .footer { padding: 24px 20px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- HEADER -->
    <div class="header">
      <p class="label">Veille stratégique</p>
      <h1>Actualités du jour</h1>
      <p class="date">${dateCapital}</p>
    </div>

    <!-- CORPS -->
    <div class="body">
      ${contenuHtml}
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p>
        Vous recevez cet email car vous avez configuré une veille automatique.<br>
        Sujets surveillés : <strong>${CONFIG.SUJETS.join(", ")}</strong>
      </p>
      <p class="powered">
        Propulsé par <a href="https://newsapi.org">NewsAPI</a> &amp;
        <a href="https://anthropic.com">Claude (Anthropic)</a> via Google Apps Script
      </p>
    </div>

  </div>
</body>
</html>`;

  Logger.log("📧 EMAIL — Template construit avec succès.");
  return html;
}

// ============================================================
// FIN EMAIL
// ============================================================




// ============================================================
// 📬 SECTION SEND — Envoi de l'email via Gmail
// ============================================================

/**
 * Envoie l'email HTML via GmailApp.
 *
 * @param {string} htmlBody - HTML complet retourné par construireEmail()
 */
function envoyerEmail(htmlBody) {
  Logger.log("📬 SEND — Préparation de l'envoi...");

  const date  = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");
  const sujet = "Veille du " + date + " — " + CONFIG.SUJETS.slice(0, 2).join(", ");

  try {
    GmailApp.sendEmail(
      CONFIG.EMAIL_DESTINATAIRE,
      sujet,
      "Votre client email ne supporte pas le HTML. Consultez un client compatible.",
      {
        htmlBody: htmlBody,
        name:     CONFIG.EMAIL_EXPEDITEUR_NOM,
      }
    );
    Logger.log("📬 SEND — Email envoyé avec succès à : " + CONFIG.EMAIL_DESTINATAIRE);
    Logger.log("         Sujet : " + sujet);

  } catch(e) {
    Logger.log("❌ SEND — Échec de l'envoi : " + e.message);
    throw new Error("Impossible d'envoyer l'email : " + e.message);
  }
}

// ============================================================
// FIN SEND
// ============================================================




// ============================================================
// 🚀 MAIN — Fonction principale à exécuter
// ============================================================

/**
 * Fonction principale — orchestrateur du pipeline complet.
 * C'est cette fonction que le trigger quotidien appelle.
 *
 * Pipeline :
 *   1. Récupérer les actualités (NewsAPI)
 *   2. Analyser avec Claude (Anthropic)
 *   3. Construire l'email HTML
 *   4. Envoyer via Gmail
 */
function main() {
  Logger.log("==============================================");
  Logger.log("🚀 MAIN — Démarrage de la veille automatique");
  Logger.log("   Date : " + new Date().toLocaleString("fr-FR"));
  Logger.log("==============================================");

  try {
    // Étape 1 — Récupération des articles
    Logger.log("\n[1/4] Récupération des actualités...");
    const articles = fetchActualites();

    if (!articles || articles.length === 0) {
      Logger.log("⚠️ MAIN — Aucun article trouvé. Arrêt du processus.");
      return;
    }
    Logger.log("  ✅ " + articles.length + " articles récupérés.");

    // Étape 2 — Analyse par Claude
    Logger.log("\n[2/4] Analyse par Claude...");
    const contenuHtml = analyserAvecClaude(articles);
    Logger.log("  ✅ Analyse terminée.");

    // Étape 3 — Construction de l'email
    Logger.log("\n[3/4] Construction du template email...");
    const emailHtml = construireEmail(contenuHtml);
    Logger.log("  ✅ Template construit.");

    // Étape 4 — Envoi
    Logger.log("\n[4/4] Envoi de l'email...");
    envoyerEmail(emailHtml);
    Logger.log("  ✅ Email envoyé.\n");

  } catch(e) {
    Logger.log("❌ MAIN — Erreur fatale : " + e.message);
    // Notifier l'administrateur en cas d'erreur
    try {
      GmailApp.sendEmail(
        CONFIG.EMAIL_DESTINATAIRE,
        "[ERREUR] Veille automatique — " + new Date().toLocaleDateString("fr-FR"),
        "Une erreur est survenue lors de l'exécution de la veille :\n\n" + e.message +
        "\n\nConsultez les logs dans Apps Script pour plus de détails.",
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
// ⏰ TRIGGER — Planification automatique
// ============================================================

/**
 * Crée un déclencheur quotidien à l'heure définie dans CONFIG.HEURE_ENVOI.
 * À exécuter UNE SEULE FOIS manuellement pour activer l'automatisation.
 *
 * ⚠️ Si vous modifiez HEURE_ENVOI, lancez d'abord supprimerTrigger()
 *    puis re-lancez configurerTrigger().
 */
function configurerTrigger() {
  // Supprimer les anciens triggers "main" pour éviter les doublons
  supprimerTrigger(false);

  ScriptApp.newTrigger("main")
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.HEURE_ENVOI)
    .create();

  Logger.log("⏰ TRIGGER — Trigger quotidien créé avec succès.");
  Logger.log("            Exécution tous les jours à " + CONFIG.HEURE_ENVOI + "h00.");
  Logger.log("            Vérifiable dans : Menu > Déclencheurs.");
}

/**
 * Supprime tous les déclencheurs liés à la fonction "main".
 * Utile pour réinitialiser ou désactiver l'automatisation.
 *
 * @param {boolean} [logConfirmation=true] - Afficher un log de confirmation
 */
function supprimerTrigger(logConfirmation) {
  if (logConfirmation === undefined) logConfirmation = true;

  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "main") {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });

  if (logConfirmation) {
    Logger.log("⏰ TRIGGER — " + count + " déclencheur(s) supprimé(s).");
  }
}

// ============================================================
// FIN TRIGGER
// ============================================================
