#!/bin/bash

# Convert icon.png for Android and high-resolution devices using ImageMagick.
magick convert icon.png -resize 192x192 android-chrome-192x192.png
magick convert icon.png -resize 384x384 android-chrome-384x384.png
magick convert icon.png -resize 512x512 icon-512x512.png

# iOS / Apple touch icons.
# For standard iPhone touch icon, we assume a default size.
# (Adjust the size parameter as needed)
magick convert icon.png -resize 180x180 touch-icon-iphone.png
magick convert icon.png -resize 152x152 touch-icon-ipad.png
magick convert icon.png -resize 180x180 touch-icon-iphone-retina.png
magick convert icon.png -resize 167x167 touch-icon-ipad-retina.png

# Favicons
magick convert icon.png -resize 32x32 favicon-32x32.png
magick convert icon.png -resize 16x16 favicon-16x16.png

# Apple's default touch icon usually doesn’t have a strict pixel size requirement.
# Use the 512x512 version or re-export a dedicated version if needed.
cp icon-512x512.png apple-touch-icon.png

# Note: For safari-pinned-tab.svg, you will need to create a vector-based SVG icon.
# Here is a placeholder command for a process you might use if you want to trace
# the PNG into an SVG using a tool like potrace, but the results might need refinement:
# (First convert PNG to PNM, then run potrace)
#
# magick convert icon.png -monochrome icon.pbm
# potrace -s icon.pbm -o public/icons/safari-pinned-tab.svg
# rm icon.pbm

