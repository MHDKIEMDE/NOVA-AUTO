# TODO — Veille Actualités Claude

> Tâches organisées par priorité et catégorie.
> Mise à jour : 2026-03-31

---

## INSTALLATION & CONFIGURATION

- [ ] Créer le projet sur script.google.com
- [ ] Coller le fichier `veille_actualites.gs` dans l'éditeur
- [ ] Créer un compte NewsAPI et récupérer la clé API
- [ ] Créer un compte Anthropic et récupérer la clé API
- [ ] Remplir `NEWS_API_KEY` dans la CONFIG
- [ ] Remplir `ANTHROPIC_KEY` dans la CONFIG
- [ ] Remplir `EMAIL_DESTINATAIRE` dans la CONFIG
- [ ] Définir les `SUJETS` selon votre veille (ex: "IA", "crypto")
- [ ] Choisir le `TON` du résumé (professionnel / casual / bullet)
- [ ] Exécuter `main()` manuellement pour tester
- [ ] Vérifier la réception de l'email test
- [ ] Exécuter `configurerTrigger()` pour activer l'automatisation

---

## TESTS

- [ ] Tester avec 1 sujet d'abord avant d'en ajouter plusieurs
- [ ] Vérifier les logs dans Vue > Journaux
- [ ] Confirmer que l'email HTML s'affiche correctement sur mobile
- [ ] Confirmer que les liens d'articles sont cliquables
- [ ] Tester les 3 TON : professionnel, casual, bullet
- [ ] Tester avec 0 résultat NewsAPI (sujet obscur) → pas d'erreur

---

## AMÉLIORATIONS FUTURES (optionnelles)

### Sources
- [ ] Ajouter Google News RSS comme source alternative à NewsAPI
- [ ] Ajouter des flux RSS personnalisés (TechCrunch, Le Monde Tech...)
- [ ] Permettre de filtrer par domaine (ex: exclure clickbait.fr)

### Analyse IA
- [ ] Ajouter un score de sentiment (positif / négatif / neutre)
- [ ] Détecter les "fake news" potentielles
- [ ] Générer un résumé audio (Text-to-Speech) en plus de l'email
- [ ] Traduire automatiquement les articles anglais en français

### Email & Notification
- [ ] Ajouter un lien "Voir en ligne" dans l'email (Google Drive)
- [ ] Option : envoyer vers plusieurs destinataires
- [ ] Option : format texte brut en plus du HTML
- [ ] Ajouter un bouton "Voir tous les articles" en bas d'email

### Automatisation
- [ ] Créer un déclencheur du lundi au vendredi uniquement
- [ ] Ajouter un mode "alerte urgente" si article 🔥 CHAUD détecté
- [ ] Stocker les articles dans Google Sheets pour historique
- [ ] Créer un tableau de bord Google Data Studio des tendances

### Interface
- [ ] Créer un formulaire Google Forms pour modifier la CONFIG sans code
- [ ] Ajouter une interface de prévisualisation de l'email dans Drive

---

## BUGS CONNUS / À SURVEILLER

- [ ] NewsAPI gratuit bloque après 100 req/jour → prévoir fallback
- [ ] Si Claude renvoie du HTML mal formé, l'email peut casser
- [ ] Le trigger Google peut décaler de ±1h selon la charge serveur
- [ ] Les articles "[Removed]" de NewsAPI sont filtrés (normal)

---

## FAIT ✅

- [x] Script principal complet avec 7 sections modulaires
- [x] Section CONFIG centralisée et commentée
- [x] Fonction fetchActualites() avec déduplification par URL
- [x] Prompt Claude adaptatif selon le TON configuré
- [x] Template email HTML responsive (desktop + mobile)
- [x] Gestion des erreurs try/catch sur chaque appel API
- [x] Logs Logger.log() détaillés à chaque étape
- [x] Email d'alerte automatique en cas d'erreur fatale
- [x] configurerTrigger() et supprimerTrigger()
- [x] README complet avec instructions d'installation
- [x] Estimation des coûts API

### v2.0.0 — Améliorations (2026-03-31)
- [x] Score de sentiment par article (😊 POSITIF / 😐 NEUTRE / ⚠️ NÉGATIF)
- [x] Multi-destinataires — EMAIL_DESTINATAIRES accepte string ou tableau
- [x] Trigger lundi→vendredi — WEEKEND_ACTIF = false dans CONFIG
- [x] Stockage Google Sheets — sauvegarderDansSheets() avec création auto de l'onglet
- [x] Fallback RSS — bascule automatique si NewsAPI dépasse le quota (426/429)
- [x] Légende des badges dans l'email (importance + sentiment)
