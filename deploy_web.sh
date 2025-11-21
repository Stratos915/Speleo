#!/usr/bin/env bash
set -e

BRANCH="main"

echo "=== 1) Build Flutter Web ==="
flutter build web --release --base-href "/Speleo/"

echo "=== 2) Copio i file in docs/ ==="
mkdir -p docs
cp -R build/web/* docs/

echo "=== 3) Preparo i file per il commit ==="
git add docs
git add .

if git diff --cached --quiet; then
  echo "Nessuna modifica da committare. Esco."
  exit 0
fi

COMMIT_MSG="Deploy web $(date '+%Y-%m-%d %H:%M')"
echo "Eseguo commit: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "=== 4) Push su origin/$BRANCH ==="
git push origin "$BRANCH"

echo "=== FATTO! ==="
echo "Tra 1-2 minuti controlla: https://stratos915.github.io/Speleo/"
