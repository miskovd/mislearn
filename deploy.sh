#!/usr/bin/env bash
set -Eeuo pipefail

# First use, after this file was pushed to GitHub:
#   1. In the project folder run: git pull --ff-only origin main
#   2. Then run: ./deploy.sh
#
# Later, from this project folder, run only: ./deploy.sh

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only origin main
sudo docker compose up -d --build --remove-orphans
sudo docker compose ps
