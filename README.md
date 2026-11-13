# glance-admin

Interface de gestion pour [Glance](https://github.com/glanceapp/glance) : édition des fichiers YAML
de config (comme en SSH à la main) et formulaire propre pour les widgets `monitor`.

- **Monitors** : tableau WYSIWYG de toutes les sections (`type: monitor`), aperçu des icônes, glisser-déposer, ajout/suppression de sites et de sections.
  édition des sites (titre, URL, icône, options avancées), ordre, ajout/suppression.
  Les commentaires et la mise en forme du YAML sont conservés.
- **Fichiers YAML** : vrai éditeur de code (CodeMirror) : coloration, validation en direct, autocomplétion des widgets et options Glance, thème clair/sombre/système.
- Écriture en place + sauvegarde `fichier.yml.bak`, détection de modification concurrente.
  Glance recharge sa config tout seul.

Accès aux fichiers : SSH (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `GLANCE_CONFIG_DIR`, clé) — voir
`docker-compose.yml`. En dev : `npm run dev` (compile l'éditeur, utilise `./sample`).

## Banque d'images

L'onglet **Images** envoie des images (png, jpg, gif, webp, svg, ico, avif ; 5 Mo max) dans le dossier
`GLANCE_ASSETS_DIR` du LXC (défaut : `<GLANCE_CONFIG_DIR>/assets`). Dans un monitor, le bouton 🖼 du champ
« Icône » les propose, ce qui écrit `/assets/<nom>`.

Pour que Glance les serve, ajoute dans `glance.yml` (le dossier doit être celui de `GLANCE_ASSETS_DIR`, vu depuis Glance) :

```yaml
server:
  assets-path: /app/assets
```

Si ton préfixe d'URL diffère de `/assets`, règle `ASSETS_URL`.
