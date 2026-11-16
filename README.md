# Evilbram Toolbox

Version : 1.6.0

Identifiant technique : `evil-toolbox`

## Compendiums

- EVILBRAM - Playlists JDR
- EVILBRAM - Bruitages & FX
- EVILBRAM - Macros
- EVILBRAM - Règles systèmes de jeu

## Contenu

Evilbram Toolbox regroupe des outils transversaux réutilisables entre plusieurs worlds Foundry VTT :
playlists et bruitages, macros MJ/joueur et utilitaires d'interface.

Macros incluses dans le compendium :
- Afficher fiche personnage
- PROD - Lumière
- PROD - Couper musique
- PROD - Reset brouillard
- FX - Météo
- FX - Éclair
- FX - Tic Tac
- Console MJ

La catégorie JEU de la Console MJ est volontairement conservée comme zone de personnalisation locale propre à chaque world.

## Visualisation des permissions

Evilbram Toolbox intègre la fonctionnalité **Ownership Viewer**.

Elle affiche directement dans les répertoires Foundry des marqueurs visuels indiquant les niveaux de propriété accordés aux joueurs pour les Documents compatibles (Actors, Journals, Items, Macros, RollTables, Cards, etc.).

- losange : accès Limited ;
- carré : accès Observer ;
- cercle : accès Owner ;
- couleur : couleur du joueur ;
- marqueur multicolore : permission appliquée à tous les joueurs.

La fonctionnalité est active automatiquement lorsque Evilbram Toolbox est activé.

## Visuels MJ

Evilbram Toolbox intègre une bibliothèque de visuels propre à chaque world.

- ajout d'images via le File Picker Foundry ;
- ajout possible par glisser-déposer d'une image déjà intégrée dans un Journal du world ;
- classement alphabétique selon le nom défini par le MJ ;
- galerie de vignettes scrollable côté MJ ;
- bordure rouge pour un visuel jamais affiché ;
- bordure verte pour un visuel déjà affiché ;
- confirmation MJ avant le premier affichage d'un visuel ;
- affichages suivants directs jusqu'à réinitialisation ;
- bouton de réinitialisation globale des avertissements ;
- affichage instantané du visuel chez tous les joueurs connectés ;
- un nouveau visuel remplace le précédent ;
- fermeture libre côté joueur ;
- croix de fermeture intégrée au visuel avec effet hover et tooltip ;
- fermeture forcée globale depuis la fenêtre MJ ;
- arrière-plan Foundry flouté pendant l'affichage côté joueur ;
- aucun titre ni nom interne visible côté joueur ;
- aucun changement de scène et aucun message dans le chat.

La bibliothèque ne stocke que les noms, chemins et états d'affichage dans un setting World.
Les fichiers image restent dans les données Foundry.

## Identité technique

- ID Foundry : `evil-toolbox`
- dépôt GitHub : `ctotone/evil-toolbox`
- asset de release : `evil-toolbox.zip`
- manifest : `releases/latest/download/module.json`


## Lighting Toolkit

Evil Toolbox intègre nativement **Evilbram Lighting Toolkit** :

- profils de scène Extérieur / Intérieur / Obscurité ;
- réglages Jour / Crépuscule / Nuit / Restaurer ;
- réglage de l’échelle de grille ;
- intégration optionnelle SmallTime ;
- presets de lumières intégrés ;
- clic pour charger un preset dans la palette native Foundry v14 ;
- glisser-déposer d’un preset directement sur la scène ;
- export d’une lumière sélectionnée en preset JSON.

Les formats historiques `evil-light-toolkit.ambient-light-preset` et les flags `evil-light-toolkit` sont conservés pour rester compatibles avec les presets et lumières existants.


## Messages privés

Evil Toolbox 1.5.2 généralise l'ancien centre `MP MJ` en messagerie privée accessible aux MJ et aux joueurs.

- conversations MJ ↔ joueurs et joueur ↔ joueur ;
- sélection d’un ou plusieurs contacts connectés ;
- un ChatMessage privé distinct est créé pour chaque destinataire ;
- mode classique : message privé dans le chat ;
- mode popup : message privé dans le chat + popup avec flou d’arrière-plan ;
- bouton `Répondre` sous chaque MP Toolbox reçu ;
- popup de réponse avec historique complet de la conversation ;
- notification compacte côté MJ pour un MP classique entrant lorsque le tableau de bord est fermé ;
- historique reconstruit depuis les ChatMessage whispers natifs Foundry ;
- compatibilité avec les anciens échanges `MP MJ` des versions 1.4.x ;
- commandes de jet privées `/r` et `/roll` prises en charge ;
- accès via `game.evilbramToolbox.privateMessages.open()` ;
- bouton `Messages privés` dans le répertoire Actors pour tous les utilisateurs ;
- bouton dans les outils de token accessible aux MJ et aux joueurs, sans sélection de token.

## Assistant MJ CoC7

Evil Toolbox 1.6.0 ajoute un monitoring passif dédié à **L’Appel de Cthulhu 7e édition**.

- activation uniquement lorsque le système du world est `CoC7` ;
- monitoring uniquement côté MJ ; un seul MJ actif émet les alertes ;
- aucune règle n’est appliquée automatiquement : aucun jet, état ou changement de fiche n’est effectué par Toolbox ;
- surveillance des principaux seuils mécaniques liés aux PV, blessures graves, état mourant et SAN ;
- petite notification rouge inspirée de la mini-notification Messenger ;
- détail de la règle et marche à suivre envoyé au MJ sous forme de whisper Foundry privé, sans style spécifique ;
- regroupement des événements liés afin d’éviter les notifications en cascade ou contradictoires.

Le compendium `EVILBRAM - Règles systèmes de jeu` est rangé dans le dossier `EVILBRAM - Toolbox`.

## Compatibilité

- Foundry VTT minimum : v14
- Vérifié : v14

## Statut

Version 1.6.0 : ajout de l’Assistant MJ CoC7 et du compendium transversal de règles.


### Messages privés — 1.5.2

La messagerie privée Toolbox reprend désormais les évolutions du module autonome Evil Messenger : conversations utilisateur ↔ utilisateur, envois classiques ou Popup, multi-destinataires individuels, jets privés `/r` et `/roll`, accusés de lecture « Vu », indicateur de saisie « écrit… », présence en ligne/hors ligne, historique par contact et interface harmonisée. Les messages restent des `ChatMessage` whisper natifs Foundry et les historiques Toolbox existants restent compatibles.

