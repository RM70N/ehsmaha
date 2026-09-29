#!/bin/sh
# يعيد توليد الطبقات المولَّدة ثم يحقن الـCSS في index.html
set -e
cd "$(dirname "$0")/../.."
python3 redesign/tools/extract_behavior.py > redesign/css/00-behavior.css
python3 redesign/tools/build_css.py index.html
