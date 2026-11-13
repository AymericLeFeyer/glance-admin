# glance-admin

Interface de gestion pour [Glance](https://github.com/glanceapp/glance) : édition des fichiers YAML
de config (comme en SSH à la main) et formulaire propre pour les widgets `monitor`.

- **Monitors** : tous les widgets `type: monitor` de tous les fichiers (y compris les `$include`),
  édition des sites (titre, URL, icône, options avancées), ordre, ajout/suppression.
  Les commentaires et la mise en forme du YAML sont conservés.
- **Fichiers YAML** : éditeur texte brut pour tout le reste, validation du YAML avant écriture.
- Écriture en place + sauvegarde `fichier.yml.bak`, détection de modification concurrente.
  Glance recharge sa config tout seul.

Accès aux fichiers : SSH (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `GLANCE_CONFIG_DIR`, clé) — voir
`docker-compose.yml`. En dev : `GLANCE_LOCAL_DIR=./sample npm start`.
