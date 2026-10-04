#!/usr/bin/env bash
# kube-objects reposunda bir overlay'in imaj tag'ini günceller; ArgoCD değişikliği görüp senkronlar.
#   ci/bump-kube-objects-image.sh <be|fe> <dev|prod> <tag>
# Kimlik (biri yeterli):
#   KUBE_OBJECTS_DEPLOY_KEY — kube-objects reposunda yazma yetkili deploy key'in özel anahtarı (tercih edilen)
#   KUBE_OBJECTS_TOKEN      — kube-objects reposuna contents:write yetkili token
set -euo pipefail

COMPONENT="${1:?be|fe}"
ENVIRONMENT="${2:?dev|prod}"
IMAGE_TAG="${3:?tag}"

REPO="${KUBE_OBJECTS_REPO:-sdsonbay/ledayazilim-diecutting-kubeobjects}"
BRANCH="${KUBE_OBJECTS_BRANCH:-main}"
FILE="${COMPONENT}/overlays/${ENVIRONMENT}/kustomization.yaml"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [ -n "${KUBE_OBJECTS_DEPLOY_KEY:-}" ]; then
  printf '%s\n' "$KUBE_OBJECTS_DEPLOY_KEY" > "$WORKDIR/deploy_key"
  chmod 600 "$WORKDIR/deploy_key"
  export GIT_SSH_COMMAND="ssh -i $WORKDIR/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  REMOTE="git@github.com:${REPO}.git"
elif [ -n "${KUBE_OBJECTS_TOKEN:-}" ]; then
  REMOTE="https://x-access-token:${KUBE_OBJECTS_TOKEN}@github.com/${REPO}.git"
else
  echo "KUBE_OBJECTS_DEPLOY_KEY veya KUBE_OBJECTS_TOKEN gerekli" >&2
  exit 1
fi

git clone --depth 1 --branch "$BRANCH" "$REMOTE" "$WORKDIR/repo"
cd "$WORKDIR/repo"

if [ ! -f "$FILE" ]; then
  echo "Bulunamadı: $FILE ($BRANCH)" >&2
  exit 1
fi

sed -i "s|^\([[:space:]]*newTag:\).*|\1 \"${IMAGE_TAG}\"|" "$FILE"

git config user.email "ci@ledayazilim.com"
git config user.name "github-actions[bot]"
git add "$FILE"
if git diff --staged --quiet; then
  echo "Tag zaten ${IMAGE_TAG}, değişiklik yok"
  exit 0
fi
git commit -m "ci: ${COMPONENT} ${ENVIRONMENT} → ${IMAGE_TAG}"

# Eşzamanlı FE/BE push'larında yarışa karşı birkaç deneme.
for attempt in 1 2 3 4 5; do
  if git push origin "HEAD:${BRANCH}"; then
    echo "kube-objects ${ENVIRONMENT}/${COMPONENT} → ${IMAGE_TAG}"
    exit 0
  fi
  sleep $((attempt * 2))
  git pull --rebase origin "$BRANCH"
done
echo "kube-objects push başarısız" >&2
exit 1
