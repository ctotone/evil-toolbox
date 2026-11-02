# Evilbram Toolbox

Version : 1.2.0

Identifiant technique : `evil-toolbox`

## Compendiums

- EVILBRAM - Playlists JDR
- EVILBRAM - Bruitages & FX
- EVILBRAM - Macros

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

## Compatibilité

- Foundry VTT minimum : v13
- Vérifié : v14

## Statut

Version 1.2.0 finalisée et validée sur Foundry VTT v14.
