#!/usr/bin/env python3
import os
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW_DIR = os.path.join(ROOT_DIR, 'www')
os.makedirs(WWW_DIR, exist_ok=True)

COPY_FILES = [
  'index.html',
  'app.js',
  'config.js',
  'privacy.html',
  'terms.html',
  'support.html',
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
]

count = 0
for f in COPY_FILES:
    src = os.path.join(ROOT_DIR, f)
    dst = os.path.join(WWW_DIR, f)
    if os.path.exists(src):
        shutil.copy2(src, dst)
        count += 1

print(f"[Build Py] Synchronized {count} files to www/")
