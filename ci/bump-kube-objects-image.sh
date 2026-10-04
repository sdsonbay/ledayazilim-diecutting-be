#!/usr/bin/env bash
# kube-objects reposunda bir overlay'in imaj tag'ini günceller; ArgoCD değişikliği görüp senkronlar.
#   ci/bump-kube-objects-image.sh <be|fe> <dev|prod> <tag>
# Gerekli env: KUBE_OBJECTS_TOKEN (kube-objects reposuna contents:write yetkili token)
set -euo pipefail

COMPONENT="${1:?be|fe}"
ENVIRONMENT="${2:?dev|prod}"
IMAGE_TAG="${3:?tag}"

REPO="${KUBE_OBJECTS_REPO:-sdsonbay/ledayazilim-diecutting-kubeobjects}"
BRANCH="${KUBE_OBJECTS_BRANCH:-main}"
TOKEN="${KUBE_OBJECTS_TOKEN:?KUBE_OBJECTS_TOKEN gerekli}"
FILE="${COMPONENT}/overlays/${ENVIRONMENT}/kustomization.yaml"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

git clone --depth 1 --branch "$BRANCH" "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORKDIR/repo"
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
