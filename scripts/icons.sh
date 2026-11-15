#!/bin/sh
# Renders the extension icons from assets/icon/*.svg (needs rsvg-convert, from librsvg).
# 16 and 32 come from the pixel-aligned small drawing so they stay sharp in toolbars and tabs.
set -e
cd "$(dirname "$0")/.."
for size in 16 32; do rsvg-convert -w $size -h $size assets/icon/icon-small.svg -o public/icon/$size.png; done
for size in 48 96 128; do rsvg-convert -w $size -h $size assets/icon/icon.svg -o public/icon/$size.png; done
