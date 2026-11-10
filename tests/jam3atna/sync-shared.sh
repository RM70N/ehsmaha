#!/bin/sh
# ينسخ ملفات المحاكاة المشتركة إلى نسخة الخادم (المقارنة تتم بالاختبار). الصوت وعدّة three لا تُنسخ.
cd "$(dirname "$0")/../.." && D=tiktok-relay/src/jam3atna/shared && mkdir -p $D && rm -rf $D/maps && cp jam3atna/shared/city-sim.js jam3atna/shared/prop-core.js jam3atna/shared/prop-sim.js $D/ && cp -r jam3atna/shared/maps $D/maps && echo synced
