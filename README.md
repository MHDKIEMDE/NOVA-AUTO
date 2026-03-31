# NOVA AUTO

> Automatisations intelligentes propulsées par l'IA — Massaka SAS

---

## Présentation

**NOVA AUTO** est un ensemble d'outils d'automatisation développés par **Massaka SAS**.
Chaque module est autonome, prêt à déployer, et conçu pour réduire les tâches répétitives grâce à l'intelligence artificielle.

---

## Modules disponibles

### Veille Actualités — Google Apps Script + Claude AI

> Recevez chaque matin un email de veille stratégique, analysé par l'IA.

| Attribut | Détail |
|---|---|
| Dossier | `veille-actualites-claude/` |
| Plateforme | Google Apps Script |
| Sources | NewsAPI |
| IA | Claude Sonnet (Anthropic) |
| Livraison | Email HTML via Gmail |
| Déclenchement | Trigger quotidien automatique |

**Ce que ça fait :**
1. Récupère les derniers articles selon vos mots-clés (IA, startups, tech...)
2. Les soumet à Claude pour résumé + analyse des tendances
3. Envoie un email HTML propre avec badges d'importance (🔥 Chaud / 📌 Utile / ℹ️ Info)

**Démarrage rapide :**
```
1. Aller sur script.google.com
2. Coller veille-actualites-claude/veille_actualites.gs
3. Remplir NEWS_API_KEY et ANTHROPIC_KEY dans la CONFIG
4. Exécuter main() pour tester
5. Exécuter configurerTrigger() pour automatiser
```

Documentation complète : [veille-actualites-claude/README.md](veille-actualites-claude/README.md)

---

## Structure du repo

```
NOVA-AUTO/
├── README.md                          ← Vue d'ensemble du projet
│
└── veille-actualites-claude/          ← Module veille d'actualités
    ├── veille_actualites.gs           ← Script principal (tout-en-un)
    ├── TODO.md                        ← Roadmap et tâches
    └── README.md                      ← Guide d'installation détaillé
```

---

## Stack technique

| Outil | Rôle |
|---|---|
| Google Apps Script | Exécution serverless + triggers automatiques |
| NewsAPI | Agrégation d'articles d'actualité |
| Anthropic Claude | Analyse IA, résumé, détection de tendances |
| Gmail API (GmailApp) | Envoi des emails HTML |

---

## Prérequis

- Compte Google (pour Apps Script + Gmail)
- Clé API NewsAPI — [newsapi.org](https://newsapi.org) *(gratuit)*
- Clé API Anthropic — [console.anthropic.com](https://console.anthropic.com) *(pay-as-you-go)*

**Coût estimé :** moins de 3$/mois pour 10 articles analysés par jour.

---

## Roadmap

- [x] Module veille actualités (NewsAPI + Claude + Gmail)
- [ ] Module résumé de réunions (transcription audio → compte-rendu IA)
- [ ] Module veille concurrentielle (analyse automatique de sites concurrents)
- [ ] Module reporting hebdomadaire (Google Sheets → email synthèse)

---

## Auteur

**Massaka SAS** — [github.com/MHDKIEMDE](https://github.com/MHDKIEMDE)
