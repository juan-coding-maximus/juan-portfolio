#!/bin/bash
# One-time: push the promo order-email credentials to Vercel production and
# redeploy. Values are read from the agency's gmail bridge files at run time
# (bridges/gmail/client_secret.json and tokens/main.json); no secret lives in
# this script or ever prints to the terminal.
#
# Run from anywhere:  bash portfolio/scripts/push-promo-email-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("../bridges/gmail/client_secret.json")).installed.client_id)' \
  | vercel env add NB_GMAIL_CLIENT_ID production
node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("../bridges/gmail/client_secret.json")).installed.client_secret)' \
  | vercel env add NB_GMAIL_CLIENT_SECRET production
node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("../bridges/gmail/tokens/main.json")).refresh_token)' \
  | vercel env add NB_GMAIL_REFRESH_TOKEN production
printf 'juan@nutribiotic.com, juan.arenas.rec@gmail.com' \
  | vercel env add NB_ORDER_EMAIL_TO production

vercel deploy --prod --yes
echo "Done. Order emails are live."
