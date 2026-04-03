# TODO — Veille Actualités Claude

> Tâches organisées par priorité et catégorie.
> Mise à jour : 2026-04-03

---

## EN COURS / PRIORITAIRE

### Filtrage du contenu
- [x] Désactiver le correcteur orthographique anglais sur les fichiers `.gs` dans VS Code (ajouter `"cSpell.enabled": false` dans `.vscode/settings.json` ou exclure le dossier)
- [ ] Tester que les exclusions NewsAPI (`-emploi -stage -recrutement`) filtrent bien en production
- [ ] Vérifier que Claude donne bien un score 0 aux articles emploi/stage qui passent quand même

### Configuration
- [ ] Remplir `NEWS_API_KEY` dans la CONFIG
- [ ] Remplir `ANTHROPIC_KEY` dans la CONFIG
- [ ] Remplir `SHEETS_ID` dans la CONFIG (Google Sheet vide créé au préalable)
- [ ] Exécuter `testerApis()` pour valider les clés
- [ ] Exécuter `main()` manuellement pour tester le pipeline complet
- [ ] Exécuter `configurerTrigger()` pour activer l'automatisation

---

## VIDÉOS COURTES (nouveau module à créer)

> Objectif : générer automatiquement des scripts de vidéos courtes (~1 minute) par rubrique
> pour informer l'audience agricole africaine sur les plateformes sociales (Instagram Reels, TikTok, YouTube Shorts).

### Script & génération
- [ ] Créer la fonction `genererScriptVideo(articles, rubrique)` qui demande à Claude de produire :
  - Un titre accrocheur (max 8 mots)
  - Un hook d'ouverture (5 sec) — question ou stat choc
  - 3 points clés (15 sec chacun) — formulés pour être dits à voix haute
  - Un call-to-action de clôture (5 sec) — ex: "Commente si tu pratiques ça"
  - Hashtags recommandés (10 max, en français + anglais)
- [ ] Ajouter un onglet `"Videos"` dans Google Sheets pour stocker les scripts générés
- [ ] Stocker par rubrique : Date | Rubrique | Titre_video | Script | Hashtags
- [ ] Intégrer la génération vidéo dans le pipeline `main()` après l'analyse Claude

### Format & contraintes
- [ ] Le script doit durer ~60 secondes à lire (environ 130-150 mots)
- [ ] Ton adapté au grand public rural africain — simple, concret, oral
- [ ] Pas de jargon technique — vulgariser
- [ ] Une seule idée principale par vidéo (pas de liste de 10 trucs)
- [ ] S'appuyer uniquement sur les articles déjà scorés (pas de nouvelle recherche)

### Distribution (futur)
- [ ] Étudier l'API Canva ou CapCut pour générer une vidéo à partir du script
- [ ] Option : envoyer le script par email avec le résumé quotidien
- [ ] Option : poster automatiquement sur un compte Buffer/Later

---

## TESTS

- [ ] Tester avec 1 rubrique d'abord avant de tout lancer
- [ ] Vérifier les logs dans Vue > Journaux (GAS)
- [ ] Confirmer que les articles emploi/stage sont bien exclus des résultats
- [ ] Confirmer que max 5 articles par rubrique par jour est respecté
- [ ] Tester le fallback RSS quand NewsAPI est à court de quota
- [ ] Tester la génération de script vidéo sur 2-3 rubriques

---

## AMÉLIORATIONS FUTURES

### Sources
- [ ] Ajouter Google News RSS comme source alternative à NewsAPI
- [ ] Permettre de filtrer par pays africain spécifique (Sénégal, Côte d'Ivoire, Mali...)

### Analyse IA
- [ ] Détecter les "fake news" potentielles
- [ ] Traduire automatiquement les articles anglais en français avant analyse
- [ ] Ajouter un mode "alerte urgente" si article 🔥 CHAUD détecté (email immédiat)

### Reporting
- [ ] Créer un tableau de bord Google Data Studio des tendances par rubrique
- [ ] Rapport hebdomadaire : top 5 articles de la semaine + tendances

---

## BUGS CONNUS / À SURVEILLER

- [ ] NewsAPI gratuit bloque après 100 req/jour → fallback RSS activé automatiquement
- [ ] Si Claude renvoie du HTML mal formé, le Sheets peut stocker du contenu cassé
- [ ] Le trigger Google peut décaler de ±1h selon la charge serveur
- [ ] `CONFIG.LANGUE` était manquant (référencé mais non défini) → corrigé en v4.1

---

## FAIT ✅

- [x] Script principal complet avec 7 rubriques agricoles africaines
- [x] Section CONFIG centralisée (LANGUE, INTERVALLE_HEURES, SCORE_MIN, etc.)
- [x] Fetch NewsAPI avec fallback automatique sur RSS si quota dépassé
- [x] Scoring Claude (JSON) — score 1-10 avec critères rubrique + contexte africain
- [x] Analyse Claude (HTML) — badges importance + sentiment, résumé + tendances
- [x] Sauvegarde Google Sheets — onglets "Articles" + "Analyses" avec mise en forme
- [x] Déduplication par URL (intra-run + inter-run via Sheets)
- [x] Quota max 5 articles par rubrique par jour
- [x] Trigger lundi→vendredi uniquement (WEEKEND_ACTIF = false)
- [x] Multi-destinataires email (string ou tableau)
- [x] Gestion erreurs try/catch à chaque étape + logs détaillés
- [x] Exclusion offres d'emploi/stage — requêtes NewsAPI + règle de scoring Claude
- [x] Correction bug CONFIG.LANGUE (manquant, ajouté en v4.1)
- [x] README complet avec instructions d'installation et estimation des coûts
