# Veille Actualités — Google Apps Script + Claude AI

Automatisation quotidienne de veille d'actualités.
Récupère des articles via NewsAPI, les analyse avec Claude (Anthropic), envoie un email HTML.

---

## Structure du projet

```
veille-actualites-claude/
├── veille_actualites.gs     ← Script principal (tout-en-un)
├── TODO.md                  ← Liste des tâches et améliorations
└── README.md                ← Ce fichier
```

---

## Installation rapide

### Étape 1 — Créer le projet Apps Script
1. Aller sur [script.google.com](https://script.google.com)
2. Cliquer **+ Nouveau projet**
3. Renommer le projet (ex: "Veille Actualités")
4. Supprimer le code par défaut dans l'éditeur
5. Coller tout le contenu de `veille_actualites.gs`
6. Sauvegarder (Ctrl+S ou Cmd+S)

### Étape 2 — Obtenir les clés API

**NewsAPI** (gratuit jusqu'à 100 requêtes/jour) :
1. Aller sur [newsapi.org](https://newsapi.org)
2. Créer un compte gratuit
3. Copier la clé API depuis le tableau de bord

**Anthropic Claude** :
1. Aller sur [console.anthropic.com](https://console.anthropic.com)
2. Créer un compte et ajouter un moyen de paiement (pay-as-you-go)
3. Aller dans "API Keys" > créer une clé
4. Copier la clé (format : `sk-ant-...`)

### Étape 3 — Configurer le script

Dans `veille_actualites.gs`, modifier la section `CONFIG` :

```javascript
const CONFIG = {
  NEWS_API_KEY:        "votre-cle-newsapi",
  ANTHROPIC_KEY:       "sk-ant-votre-cle",
  EMAIL_DESTINATAIRE:  "vous@email.com",
  HEURE_ENVOI:         8,
  SUJETS:              ["intelligence artificielle", "startups", "technologie"],
  PAYS:                "fr",
  LANGUE:              "fr",
  NB_ARTICLES:         10,
  TON:                 "professionnel",
};
```

### Étape 4 — Tester manuellement

1. Dans l'éditeur Apps Script, sélectionner la fonction `main`
2. Cliquer **Exécuter**
3. Autoriser les permissions Gmail si demandé
4. Vérifier les logs (Vue > Journaux)
5. Vérifier que l'email est arrivé

### Étape 5 — Activer l'automatisation quotidienne

1. Sélectionner la fonction `configurerTrigger`
2. Cliquer **Exécuter**
3. Le script s'exécutera désormais tous les jours à l'heure configurée

Pour désactiver : exécuter `supprimerTrigger`

---

## Fonctions disponibles

| Fonction               | Description                                        |
|------------------------|----------------------------------------------------|
| `main()`               | Lance le pipeline complet (fetch → analyse → email) |
| `fetchActualites()`    | Récupère les articles depuis NewsAPI               |
| `analyserAvecClaude()` | Analyse les articles avec Claude                   |
| `construireEmail()`    | Construit le template HTML de l'email              |
| `envoyerEmail()`       | Envoie l'email via Gmail                           |
| `configurerTrigger()`  | Active le déclencheur quotidien automatique        |
| `supprimerTrigger()`   | Supprime tous les déclencheurs                     |

---

## Personnalisation du TON

Trois valeurs possibles dans `CONFIG.TON` :

| Valeur           | Résultat                                        |
|------------------|-------------------------------------------------|
| `"professionnel"` | Résumés formels, idéal pour usage business     |
| `"casual"`        | Ton décontracté, idéal pour newsletter perso   |
| `"bullet"`        | Bullet points courts et directs                |

---

## Limites et quotas

| Service          | Limite gratuite                    |
|------------------|------------------------------------|
| NewsAPI          | 100 requêtes/jour (plan gratuit)   |
| Google Apps Script | 6 min d'exécution par run        |
| Gmail (sendEmail) | 100 emails/jour (compte Google)  |
| Claude API       | Pay-as-you-go (~$0.003 / 1K tokens)|

---

## Coût estimé

Pour 10 articles analysés par jour avec claude-sonnet-4 :
- ~1 000 tokens en entrée + ~800 tokens en sortie
- Coût estimé : **< $0.01 / jour** soit **< $3 / mois**

---

## Dépannage

**Email non reçu :**
- Vérifier les logs (Vue > Journaux dans Apps Script)
- Vérifier les spams
- Relancer `main()` manuellement

**Erreur NewsAPI 401 :**
- Clé API invalide ou expirée → en générer une nouvelle

**Erreur Anthropic 401/403 :**
- Clé API invalide → vérifier dans console.anthropic.com
- Solde insuffisant → recharger le compte

**Erreur "Exceeded maximum execution time" :**
- Réduire `NB_ARTICLES` dans la CONFIG
- Réduire `CLAUDE_MAX_TOKENS`
