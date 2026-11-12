## 1.5.1

- correction des chemins CSS des assets Messages privés depuis `styles/tools/` (`../../assets/...`).
### Messages privés — intégration des évolutions Evil Messenger 1.0.0
- intégration dans Evil Toolbox des évolutions fonctionnelles et visuelles validées dans le module autonome Evil Messenger, sans intégrer sa couche de localisation ;
- accusés de lecture persistants « Vu », enregistrés par interlocuteur dans le flag User `evil-toolbox.readThrough` lorsque la conversation est réellement consultée dans l’interface Toolbox ;
- indicateur de saisie « écrit… » synchronisé en temps réel via le canal natif `module.evil-toolbox`, sans transmission ni persistance du texte saisi ;
- contacts regroupés dynamiquement entre utilisateurs connectés et hors ligne, avec actualisation à la connexion/déconnexion ;
- sélection automatique du contact actif comme destinataire, tout en conservant la sélection multiple manuelle ;
- conservation de l’historique consultable pour les contacts hors ligne, avec envoi désactivé vers les destinataires déconnectés ;
- interface Messages privés, popup de réponse et notification MJ alignées sur le design d’Evil Messenger : textures, surfaces, scrollbars, bulles compactes, boutons et palette harmonisés ;
- ajout de `chat-texture.webp`, `gm-avatar.webp` et `pm-read-indicator.webp` aux assets Toolbox ;
- avatar MJ dédié dans les contacts et en-têtes ; portrait du personnage attribué (`user.character.img`) pour les joueurs, avec avatar utilisateur en repli ;
- indicateur « Vu » en image sur les messages sortants effectivement consultés ;
- popup de réponse portée à 670 × 600 px et cohérente avec la fenêtre principale ;
- notification MJ enrichie avec le portrait de l’expéditeur et conservée uniquement lorsque le centre MP n’est ni ouvert ni déjà affiché sur ce contact ;
- comportement de scroll préservé : ouverture sur le dernier message, mais aucun scroll forcé pendant la lecture d’anciens messages lorsque l’interlocuteur commence à écrire ;
- commandes privées `/r` et `/roll`, envoi classique, envoi Popup, multi-destinataires individuels et réponses depuis le chat conservés ;
- compatibilité maintenue avec les anciens flags MP MJ Evil Toolbox 1.4.x (`gmUserId` / `playerUserId`) afin de ne pas perdre les historiques existants ;
- API publique conservée : `game.evilbramToolbox.privateMessages.open()` ;
- aucune modification des compendiums.

# Changelog

## 1.5.0

- bouton `Messages privés` : visuel détouré définitif intégré et ratio CSS ajusté à 2048 × 543.
- ajustement du bouton `Messages privés` dans le répertoire Actors : ratio natif du visuel respecté, suppression du cadre CSS et repositionnement du libellé ;
- généralisation de `MP MJ` en `Messages privés` accessible aux MJ et aux joueurs ;
- ajout des conversations privées joueur ↔ joueur et joueur ↔ MJ ;
- conservation des whispers Foundry comme source de vérité, sans base de messages parallèle ;
- compatibilité de lecture avec les anciens historiques MP MJ 1.4.x ;
- nouveaux messages marqués avec expéditeur et destinataire explicites tout en conservant les champs historiques lorsqu’un MJ est impliqué ;
- accès joueur via un bouton `Messages privés` injecté au-dessus de la liste des Actors dans le volet de droite ;
- intégration du visuel définitif du bouton `Messages privés` fourni par l’utilisateur ;
- conservation des envois `Envoi classique` et `Envoi Popup` ;
- bouton de chat généralisé en `Répondre` pour tout MP Toolbox reçu ;
- popup de réponse généralisée avec historique du contact ;
- commandes `/r` et `/roll` conservées pour tous les échanges privés ;
- accès historique `game.evilbramToolbox.privateMessages.open()` conservé ;
- contrôle Scene `Messages privés` conservé pour le MJ ;
- compendiums inchangés.

## 1.4.2

- correction de l’organisation du compendium `EVILBRAM - Playlists JDR` depuis le world Foundry de production ;
- mise à jour du compendium `EVILBRAM - Playlists JDR` depuis le world Foundry de production ;
- mise à jour du compendium `EVILBRAM - Bruitages & FX` depuis le world Foundry de production ;
- aucun changement fonctionnel du code du module ;
- compendium `EVILBRAM - Macros` conservé sans modification.

## 1.4.1
- MP MJ : historique automatiquement positionné sur le dernier message à l’ouverture et au changement de conversation, côté MJ et joueur.
- Correction du rendu des jets dans l’historique MP : résultat et détail visibles pour les participants du MP.

- MP MJ : prise en charge des commandes de jet `/r` et `/roll` dans les champs de saisie MJ et joueur ;
- les jets sont créés comme de vrais jets Foundry tout en conservant le whisper privé MP MJ ;
- les résultats de jet sont affichés dans l’historique du tableau de bord MJ et dans la popup joueur ;
- en envoi multiple, un jet distinct est effectué pour chaque joueur destinataire ;
- aucun changement des compendiums.

## 1.4.0

- Visuels MJ : ajout du glisser-déposer d’images déjà intégrées dans des Journaux du world ;
- prise en charge des pages de Journal de type Image ;
- prise en charge des images HTML glissées depuis le contenu d’un Journal ;
- les images des pages texte sont explicitement rendues draggables au rendu des feuilles Journal V1/V2 ;
- capture renforcée du drag/drop pour les images HTML des pages texte (payload Toolbox + phase de capture) ;
- normalisation des URLs locales du navigateur vers des chemins Foundry ;
- zone de dépôt visuelle dans la fenêtre Visuels MJ ;
- MP MJ : ajout d’un tableau de bord MJ pour les messages privés ;
- envoi individuel ou multiple avec un ChatMessage distinct par joueur ;
- modes Envoi classique et Popup + chat ;
- bouton de réponse sous les MP reçus par les joueurs ;
- popup de réponse joueur avec flou d’arrière-plan ;
- popup joueur enrichie avec l’historique complet des échanges ;
- notification compacte côté MJ uniquement lorsque le tableau de bord MP MJ est fermé ;
- historique reconstruit depuis les ChatMessage privés natifs Foundry ;
- Console MJ mise à jour avec un accès natif à MP MJ dans la section PROD ;
- ajout de la macro autonome `PROD - Gestion MP` dans `EVILBRAM - Macros`.

## 1.3.0

- intégration native de `Evilbram Lighting Toolkit` dans Evil Toolbox ;
- compatibilité minimale portée à Foundry VTT v14 ;
- conservation des presets intégrés et de l’intégration optionnelle SmallTime ;
- conservation du schéma historique `evil-light-toolkit.ambient-light-preset` et des flags `evil-light-toolkit` ;
- ajout de l’API `game.evilbramToolbox.lighting.open()` ;
- maintien du bouton Lighting Toolkit dans les contrôles d’éclairage Foundry ;
- préparation d’une Console MJ générique avec accès natif à Lighting Toolkit et Visuels MJ.

## 1.2.0

- ID Foundry finalisé en `evil-toolbox` ;
- dépôt et URLs de distribution alignés sur `ctotone/evil-toolbox` ;
- conservation des compendiums existants sans reconstruction des playlists ;
- mise à jour de `FX - Éclair` pour utiliser `evil-toolbox.soundboard-sfx` ;
- ajout de la fonctionnalité `Visuels MJ` :
  - bibliothèque propre à chaque world ;
  - ajout d'images via le File Picker natif ;
  - tri alphabétique selon le nom défini par le MJ ;
  - galerie scrollable avec barre d'actions fixe ;
  - confirmation avant le premier affichage ;
  - mémorisation de l'état déjà affiché ;
  - réinitialisation globale des avertissements ;
  - bordure rouge pour les visuels jamais affichés et verte après affichage ;
  - diffusion aux joueurs via le socket natif `module.evil-toolbox` ;
  - popup sans titre ni nom interne ;
  - centrage automatique dans le viewport ;
  - flou d'arrière-plan ;
  - croix de fermeture intégrée au visuel avec hover et tooltip ;
  - fermeture libre côté joueur et fermeture forcée globale côté MJ ;
  - aucun changement de scène et aucun message dans le chat.
- `Ownership Viewer` conservé sans modification fonctionnelle.

## 1.1.0

- intégration de la fonctionnalité `Ownership Viewer` directement dans Evilbram Toolbox ;
- affichage des marqueurs de permissions/propriété dans les répertoires Foundry compatibles ;
- prise en charge des répertoires Actors, Journals, Items, Macros, RollTables et Cards ainsi que des pages de Journal ;
- conservation du comportement v13/v14 du module d'origine ;
- ajout des fichiers `scripts/tools/ownership-viewer.js` et `styles/tools/ownership-viewer.css` ;
- ajout d'une attribution tierce CC BY 4.0 ;
- aucun changement des compendiums, playlists ou macros existants.

## 1.0.0

- première version stable de `Evilbram Toolbox` ;
- promotion fonctionnelle de la candidate 0.2.1 sans changement de comportement ;
- conservation de l'identifiant technique `evil-playlist` ;
- trois compendiums distribués :
  - `EVILBRAM - Playlists JDR`
  - `EVILBRAM - Bruitages & FX`
  - `EVILBRAM - Macros`

## 0.2.1

- renommage des compendiums avec le préfixe `EVILBRAM -` ;
- intégration du pack Macro final réécrit par Foundry ;
- correction de `FX - Éclair` : sélection aléatoire parmi les quatre coups de tonnerre de la playlist `Bruitages` ;
- lecture du tonnerre comme bruitage ponctuel ;
- conservation du comportement visuel validé de l'éclair.

## 0.2.0

- renommage affiché du module en `Evilbram Toolbox` ;
- conservation de l'identifiant technique `evil-playlist` ;
- mise à jour des packs audio depuis le world atelier ;
- ajout du compendium de macros transversal.
