#!/bin/sh
# Reconstruit /tmp/ssh_key à partir de SSH_PRIVATE_KEY, même si la variable d'environnement
# a perdu ses sauts de ligne (collage dans Dockhand, retours Windows, "\n" littéraux, guillemets).
# Accepte aussi la clé entière encodée en base64.
set -eu
umask 077
raw=$(printf '%s' "${SSH_PRIVATE_KEY:-}" | tr -d '\r"')
case "$raw" in
  *"PRIVATE KEY-----"*) ;;
  *) raw=$(printf '%s' "$raw" | tr -d ' \n' | base64 -d 2>/dev/null | tr -d '\r' || true) ;;
esac
label=$(printf '%s' "$raw" | grep -o 'BEGIN [A-Z ]*PRIVATE KEY' | head -1 | sed 's/^BEGIN //' || true)
if [ -n "$label" ]; then
  body=$(printf '%s' "$raw" | sed -e "s/-----BEGIN $label-----//" -e "s/-----END $label-----//" -e 's/\\n/ /g' | tr -d ' \n\t')
  { echo "-----BEGIN $label-----"; printf '%s' "$body" | fold -w 70; echo; echo "-----END $label-----"; } > /tmp/ssh_key
  if ssh-keygen -y -f /tmp/ssh_key >/dev/null 2>&1; then
    echo "[glance-admin] clé SSH OK ($label)"
  else
    echo "[glance-admin] clé SSH illisible : passphrase (non supportée) ou clé tronquée ?" >&2
  fi
else
  echo "[glance-admin] SSH_PRIVATE_KEY vide ou sans en-tête BEGIN … PRIVATE KEY" >&2
  : > /tmp/ssh_key
fi
export SSH_KEY_PATH=/tmp/ssh_key SSH_KNOWN_HOSTS=/data/known_hosts
exec node server/main.js
