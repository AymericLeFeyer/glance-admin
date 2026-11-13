// Connaissance minimale de la config Glance pour l'autocomplétion.
// Volontairement tolérante : ça suggère, ça n'interdit rien.

export const WIDGET_TYPES = {
  bookmarks: "Groupes de liens",
  calendar: "Calendrier",
  "change-detection": "Suivi de changements de pages",
  clock: "Horloge",
  "custom-api": "Widget alimenté par une API",
  "dns-stats": "Stats Pi-hole / AdGuard",
  "docker-containers": "Conteneurs Docker",
  extension: "Extension externe",
  group: "Groupe de widgets (onglets)",
  "hacker-news": "Hacker News",
  html: "HTML libre",
  iframe: "Page intégrée",
  lobsters: "Lobsters",
  markets: "Cours de marché",
  monitor: "Disponibilité de services",
  reddit: "Subreddit",
  releases: "Releases GitHub/GitLab…",
  repository: "Dépôt GitHub",
  rss: "Flux RSS",
  search: "Barre de recherche",
  "server-stats": "Stats du serveur",
  "split-column": "Colonnes dans une colonne",
  "to-do": "Liste de tâches",
  "twitch-channels": "Chaînes Twitch",
  "twitch-top-games": "Top jeux Twitch",
  videos: "Vidéos YouTube",
  weather: "Météo",
};

const COMMON = ["type", "title", "title-url", "cache", "css-class", "hide-header"];

export const SITE_KEYS = [
  "title", "url", "icon", "check-url", "error-url", "timeout",
  "allow-insecure", "same-tab", "alt-status-codes", "basic-auth", "hide-url",
];

export const WIDGET_KEYS = {
  monitor: ["sites", "style", "show-failing-only"],
  clock: ["hour-format", "timezones"],
  weather: ["location", "units", "hour-format", "hide-location", "forecast-mode"],
  rss: ["feeds", "style", "limit", "collapse-after", "thumbnail-height", "card-height", "single-line-titles", "preserve-order"],
  reddit: ["subreddit", "style", "limit", "collapse-after", "show-thumbnails", "sort-by", "top-period", "app-auth"],
  "hacker-news": ["limit", "collapse-after", "comments-url-template", "sort-by"],
  "docker-containers": ["hide-by-default", "sock-path", "format-container-names"],
  "custom-api": ["url", "template", "method", "headers", "parameters", "body-type", "request-body", "subrequests", "options", "frameless", "allow-insecure", "title-url"],
  iframe: ["source", "height"],
  html: [],
  bookmarks: ["groups"],
  calendar: ["first-day-of-week"],
  releases: ["repositories", "show-source-icon", "limit", "collapse-after", "token"],
  repository: ["repository", "pull-requests-limit", "issues-limit", "commits-limit", "token"],
  videos: ["channels", "playlists", "limit", "style", "video-url-template", "collapse-after", "collapse-after-rows"],
  markets: ["markets", "sort-by", "chart-link-template", "symbol-link-template"],
  "server-stats": ["servers"],
  "dns-stats": ["service", "url", "token", "username", "password", "allow-insecure", "hour-format", "hide-graph", "hide-top-domains", "hide-by-default"],
  "change-detection": ["watches", "instance-url", "token", "limit", "collapse-after", "expand-url"],
  group: ["widgets"],
  "split-column": ["widgets", "max-columns"],
  search: ["search-engine", "new-tab", "autofocus", "placeholder", "bangs"],
  "to-do": ["id"],
  "twitch-channels": ["channels", "collapse-after", "sort-by"],
  "twitch-top-games": ["exclude", "limit", "collapse-after"],
  lobsters: ["instance-url", "custom-url", "limit", "collapse-after", "sort-by", "tags"],
  extension: ["url", "allow-potentially-insecure-html", "parameters", "cache"],
};

export const ROOT_KEYS = ["server", "document", "branding", "theme", "pages"];
export const SERVER_KEYS = ["host", "port", "proxied", "base-url", "assets-path"];
export const THEME_KEYS = ["light", "background-color", "primary-color", "positive-color", "negative-color", "contrast-multiplier", "text-saturation-multiplier", "custom-css-file", "presets"];
export const BRANDING_KEYS = ["hide-footer", "custom-footer", "logo-text", "logo-url", "favicon-url", "favicon-type", "app-name", "app-icon-url", "app-background-color"];
export const PAGE_KEYS = ["name", "slug", "width", "columns", "head-widgets", "center-vertically", "hide-desktop-navigation", "show-mobile-header", "desktop-navigation-width"];
export const COLUMN_KEYS = ["size", "widgets"];

export const VALUES = {
  "hour-format": ["12h", "24h"],
  style: ["compact", "vertical-list", "detailed-list", "horizontal-cards", "horizontal-cards-2", "grid-cards", "grid"],
  units: ["metric", "imperial"],
  size: ["small", "full"],
  width: ["default", "slim", "wide"],
  "first-day-of-week": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  "forecast-mode": ["hourly", "daily"],
  method: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  service: ["pihole", "pihole-v6", "adguard"],
  "sort-by": ["rank", "top", "hot", "new"],
  light: ["true", "false"],
  "allow-insecure": ["true", "false"],
  "same-tab": ["true", "false"],
  "hide-header": ["true", "false"],
  "show-failing-only": ["true", "false"],
  cache: ["30s", "1m", "5m", "10m", "30m", "1h", "12h", "1d"],
  timeout: ["3s", "5s", "10s"],
};

export const KEY_DOCS = {
  "check-url": "URL réellement testée (si différente de url)",
  "alt-status-codes": "Codes HTTP supplémentaires considérés comme OK, ex. [401, 403]",
  "allow-insecure": "Accepter un certificat TLS invalide",
  "same-tab": "Ouvrir le lien dans le même onglet",
  cache: "Durée de cache du widget : 30s, 1m, 1h…",
  icon: "si:nom (Simple Icons), sh:nom (selfh.st), mdi:nom, di:nom ou URL",
  slug: "Segment d'URL de la page",
};

export { COMMON };
