#!/usr/bin/env bash
# Re-downloads the 8 page background photos from Pexels at 1920px (same names).
set -e; cd "$(dirname "$0")/.."; mkdir -p public/backgrounds
dl() { curl -fsSL -o "public/backgrounds/$1" "$2"; echo "fetched $1"; }
dl pricing.jpg        "https://images.pexels.com/photos/7130551/pexels-photo-7130551.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl audiobook.jpg      "https://images.pexels.com/photos/3394660/pexels-photo-3394660.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl voice-cloning.jpg  "https://images.pexels.com/photos/10942521/pexels-photo-10942521.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl coloring-book.jpg  "https://images.pexels.com/photos/68561/pexels-photo-68561.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl kids-book.jpg      "https://images.pexels.com/photos/8922399/pexels-photo-8922399.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl ebook-wizard.jpg   "https://images.pexels.com/photos/5186349/pexels-photo-5186349.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl dashboard.jpg      "https://images.pexels.com/photos/7794017/pexels-photo-7794017.jpeg?auto=compress&cs=tinysrgb&w=1920"
dl home.jpg           "https://images.pexels.com/photos/27135237/pexels-photo-27135237.jpeg?auto=compress&cs=tinysrgb&w=1920"
