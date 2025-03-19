#!/bin/bash

# Resize screenshots with exact dimensions (no aspect ratio preservation)
# and replace the background with white
magick convert screenshot.png -background white -flatten -resize 390x844! mobile-home.png
magick convert screenshot.png -background white -flatten -resize 1280x800! desktop-home.png