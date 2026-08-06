MAP MARKER SCREENSHOT ASSETS
============================

Every standalone map marker automatically looks for an image whose filename
matches the marker id in constants.js. It tries WebP first and then PNG:

  assets/markers/<marker id>.webp
  assets/markers/<marker id>.png

Examples:

  assets/markers/desert_ledge.webp
  assets/markers/kakariko_well.webp
  assets/markers/old_man.webp
  assets/markers/hookshot_cave.webp

Use a 16:9 crop at 640x360 or 960x540. WebP is preferred because it keeps the
offline tracker package small. Images are loaded only when their marker is
hovered or tapped and are cached after the first successful load.

Until an image is added, the guide displays a "Screenshot coming soon"
placeholder. Dungeon check screenshots continue to use assets/dungeons/ as
described in that folder's README.txt.

In Practice mode, pin a marker guide and click its image to open the large
viewer. Screenshot guides and the viewer are completely disabled in Race Legal
mode.
