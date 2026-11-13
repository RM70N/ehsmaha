#!/usr/bin/env bash
# يشغّل كل اختبارات متصفح الأحداث الخاصة (كل ملف في متصفح مستقل: ألعاب WebGL الثقيلة لا تُجمَع بصفحة واحدة)
# المتطلبات: محاكيات Firebase + http.server على 8790 + e2e-server على 8791 (انظر tests/batmish/README.md)
set -u
cd "$(dirname "$0")/../.."
fail=0
for f in e2e_events e2e_events2 e2e_events_3d_a e2e_events_3d_b e2e_events_3d_c e2e_events_3d_d e2e_events_3d_e; do
  echo "=== $f"; node tests/batmish/$f.mjs 2>&1 | tail -n 3 || fail=1
done
exit $fail
