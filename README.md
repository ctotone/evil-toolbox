# Evilbram Toolbox

Version : 1.2.0

Identifiant technique : `evilbram-toolbox`

## Compendiums

- EVILBRAM - Playlists JDR
- EVILBRAM - Bruitages & FX
- EVILBRAM - Macros

## Contenu

Le module regroupe les playlists et bruitages transversaux, un socle de macros réutilisables entre plusieurs worlds et des utilitaires d'interface communs.

Macros incluses :
- Afficher fiche personnage
- PROD - Lumière
- PROD - Couper musique
- PROD - Reset brouillard
- FX - Météo
- FX - Éclair
- FX - Tic Tac
- Console MJ

La catégorie JEU de la Console MJ est volontairement conservée comme zone de personnalisation locale propre à chaque world.



## Renommage technique 1.2.0

Le module a été renommé techniquement afin d'être cohérent avec son rôle actuel :

- ancien ID Foundry : `evil-playlist`
- nouvel ID Foundry : `evilbram-toolbox`
- dépôt GitHub : `ctotone/evil-toolbox`
- asset de release : `evil-toolbox.zip`

Les compendiums existants sont conservés tels quels ; leurs namespaces deviennent automatiquement
`evilbram-toolbox.playlists-jdr`, `evilbram-toolbox.soundboard-sfx` et `evilbram-toolbox.macros`.

Les anciennes copies de macros déjà importées dans des worlds et contenant encore `evil-playlist` doivent être migrées ponctuellement vers `evilbram-toolbox`.

## Visualisation des permissions

Evilbram Toolbox intègre la fonctionnalité **Ownership Viewer**.

Elle affiche directement dans les répertoires Foundry des marqueurs visuels indiquant les niveaux de propriété accordés aux joueurs pour les Documents compatibles (Actors, Journals, Items, Macros, RollTables, Cards, etc.).

- losange : accès Limited ;
- carré : accès Observer ;
- cercle : accès Owner ;
- couleur : couleur du joueur ;
- marqueur multicolore : permission appliquée à tous les joueurs.

La fonctionnalité est active automatiquement lorsque Evilbram Toolbox est activé.

## Compatibilité

- Foundry VTT minimum : v13
- Vérifié : v14

## Statut

Version stable 1.2.0 : renommage technique finalisé vers `evilbram-toolbox`, compendiums conservés et `FX - Éclair` compatible avec le nouveau namespace.
