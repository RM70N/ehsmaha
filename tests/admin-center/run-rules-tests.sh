#!/usr/bin/env bash
# يشغّل مُحاكيات Firebase بقواعد المستودع الحقيقية ثم اختبار القواعد. المتطلبات: java + مجلد فيه firebase-tools و@firebase/rules-unit-testing
# الاستخدام: FBEMU=/tmp/fbemu tests/admin-center/run-rules-tests.sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; FBEMU="${FBEMU:-/tmp/fbemu}"
RUN="$(mktemp -d)"; cat > "$RUN/firebase.json" <<J
{"firestore":{"rules":"$ROOT/firestore.rules"},"database":{"rules":"$ROOT/database.rules.json"},"emulators":{"firestore":{"port":8085},"database":{"port":9005},"ui":{"enabled":false}}}
J
cd "$RUN"
env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy "$FBEMU/node_modules/.bin/firebase" emulators:exec --only firestore,database --project demo-ehsmaha "FBEMU=$FBEMU node $ROOT/tests/admin-center/rules.test.mjs && FBEMU=$FBEMU node $ROOT/tests/admin-center/data-layer.test.mjs"
