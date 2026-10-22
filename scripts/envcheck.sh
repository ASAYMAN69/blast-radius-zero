#!/usr/bin/env bash
# envcheck — verify required environment variables are present.
# NEVER prints values. NEVER prints the key, not even a prefix.
# Exit 0 = all present. Exit 1 = something is missing.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

REQUIRED=(
  "OPENAI_API_KEY"
  "OPENAI_ENDPOINT"
  "OPENAI_MODEL"
)

missing=0

if [[ ! -f .env ]]; then
  echo "FAIL  .env not found at $(pwd)/.env"
  echo "      copy .env.example -> .env and fill it in"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

for var in "${REQUIRED[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "FAIL  $var is empty or missing"
    missing=1
  else
    echo "ok    $var is set"
  fi
done

# Endpoint must be an absolute https URL. Catches the classic copy-paste error.
if [[ -n "${OPENAI_ENDPOINT:-}" && ! "${OPENAI_ENDPOINT}" =~ ^https:// ]]; then
  echo "FAIL  OPENAI_ENDPOINT must start with https:// (got a redacted form, not the scheme check result)"
  missing=1
fi

if [[ "${missing}" -eq 0 ]]; then
  echo "PASS  all required variables present"
  exit 0
fi

echo "FAIL  one or more required variables are missing"
exit 1
