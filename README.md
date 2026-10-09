# Organisateur

Remplit ton Google Agenda à partir de ta liste de tâches (ponctuelles, chaque semaine, chaque mois…), en évitant tes rendez-vous. Chaque soir, tu valides ou tu reportes, et l'appli replace ce qui doit l'être.

C'est une application web sans serveur :
- elle s'installe sur l'écran d'accueil de l'iPhone et s'ouvre aussi sur le Mac ;
- elle parle directement à ton compte Google, sans ordinateur à laisser allumé ;
- tes données sont gardées dans **ton Google Drive**, dans un dossier privé que seule l'appli voit (il n'apparaît pas dans tes fichiers) ;
- les tâches sont écrites dans un agenda Google dédié, « Tâches ».

## Mise en ligne (une seule fois, environ 20 min)

### 1. Héberger l'appli sur GitHub Pages (gratuit)

1. Crée un compte sur https://github.com (si tu n'en as pas).
2. **New repository** : nom `organisateur`, visibilité **Public** (obligatoire pour Pages en gratuit ; le code ne contient aucune donnée personnelle).
3. Sur la page du dépôt : **Add file → Upload files**, puis glisse **tous les fichiers de ce dossier**. Valide avec **Commit changes**.
4. **Settings → Pages** : Source « Deploy from a branch », branche `main`, dossier `/ (root)`, **Save**.
5. Une ou deux minutes plus tard, l'appli est en ligne à l'adresse `https://TON-PSEUDO.github.io/organisateur/`. Elle affiche alors « Il manque l'identifiant Google », ce qui est normal à cette étape.

### 2. Autoriser l'appli sur Google Cloud

1. Va sur https://console.cloud.google.com/ et crée un projet (ex. « Organisateur »).
2. **API et services → Bibliothèque** : active **Google Calendar API** et **Google Drive API**.
3. **Écran de consentement OAuth** (ou « Google Auth Platform ») :
   - type **Externe**, nom « Organisateur », ton e-mail ;
   - dans **Utilisateurs test**, ajoute ton adresse Gmail ;
   - puis **Publier l'application** (statut « En production »). Pas besoin de validation par Google pour un usage personnel. À la connexion, tu verras un écran « Application non validée » : clique *Paramètres avancés* → *Accéder à Organisateur*.
4. **Identifiants → Créer des identifiants → ID client OAuth**, type **Application Web** :
   - **Origines JavaScript autorisées** : `https://TON-PSEUDO.github.io`
   - **URI de redirection autorisés** : `https://TON-PSEUDO.github.io/organisateur/` (barre oblique finale comprise)
5. Copie l'**ID client** (il se termine par `.apps.googleusercontent.com`).

### 3. Renseigner l'identifiant

Sur GitHub, ouvre le fichier `config.js`, clique sur le crayon ✏️, colle l'ID client entre les guillemets de `clientId: ""`, puis **Commit changes**.

Une minute plus tard, ouvre l'adresse de l'appli et clique **Se connecter avec Google**. Coche les deux autorisations demandées : ton agenda, et le dossier privé de l'appli dans Google Drive.

## Sur l'iPhone

1. Ouvre l'adresse de l'appli dans **Safari**.
2. Partager → **Sur l'écran d'accueil**.
3. Ouvre l'appli depuis cette icône et connecte-toi à Google une fois. L'appli de l'écran d'accueil a sa propre connexion, distincte de celle de Safari.

Ensuite, la connexion se renouvelle toute seule : au besoin, l'appli fait un aller-retour éclair par Google à l'ouverture.

## Fonctionnement

- **Synchronisation** : à l'ouverture de l'appli, quelques secondes après chaque changement, puis toutes les 10 minutes tant qu'elle est ouverte. Le Mac et l'iPhone partagent les mêmes données.
- **Pas de serveur** : rien ne tourne quand l'appli est fermée. Elle écrit à l'avance deux semaines de tâches dans ton agenda, donc les rappels sonnent même sans l'ouvrir. Le bilan du soir suffit à garder le planning à jour.
- **Ton agenda** :
  - les tâches vont dans l'agenda « Tâches », à la couleur de leur catégorie, avec un rappel 10 min avant ;
  - un événement quotidien « Bilan du soir » te prévient chaque soir ;
  - tes autres agendas sont seulement lus. Dans Réglages, choisis ceux dont les rendez-vous bloquent des créneaux ;
  - ne bloquent pas : les événements sur la journée entière, ceux marqués « Disponible », et les invitations refusées.
- **Modifier depuis Google Agenda** :
  - une tâche **déplacée** dans Google Agenda est suivie par l'appli, qui l'épingle à ce nouvel horaire ;
  - une tâche **supprimée** dans Google Agenda est recréée. Pour l'enlever vraiment, utilise l'appli (Sauter, Abandonner, ou mettre la tâche en pause).
- **Hors connexion** : l'appli s'ouvre avec la dernière version enregistrée sur l'appareil, et envoie tes changements dès que la connexion revient.
- **Deux appareils en même temps** : si une modification a été faite ailleurs entre-temps, l'appli recharge la version à jour et te prévient. Rien n'est écrasé.

## Réglages (`config.js`)

| Clé | Rôle |
|---|---|
| `clientId` | Identifiant OAuth « Application Web » (étape 2) |
| `nomAgendaTaches` | Nom de l'agenda Google où sont écrites les tâches |
| `rappelMinutes` | Notification avant chaque tâche |

Les plages horaires, la charge par jour, les catégories et les absences se règlent dans l'appli (onglet **Réglages**).

## Tester sur le Mac avant la mise en ligne (facultatif)

Ajoute `http://localhost:8080` aux origines **et** `http://localhost:8080/` aux URI de redirection de l'ID client, puis :

```bash
cd ~/Desktop/PRIVATE/"Projet perso claude"/organisateur-web
python3 -m http.server 8080
```

Ouvre ensuite http://localhost:8080.

## Fichiers

| Fichier | Rôle |
|---|---|
| `moteur.js` | Planification : périodes, placement, reports, saisie en langage naturel |
| `ui.js`, `index.html`, `style.css` | L'interface |
| `google.js` | Connexion Google, stockage sur Drive, lecture et écriture de l'agenda |
| `config.js` | Identifiant Google et réglages |
| `sw.js`, `manifest.webmanifest`, `icone.png` | Installation sur l'écran d'accueil et ouverture hors connexion |
