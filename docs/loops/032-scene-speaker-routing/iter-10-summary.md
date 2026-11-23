# Verify prior native performances during attachment and assembly

Speech attachment compares bound dialogue revisions and authored source intervals across shots in the episode. A clip cannot supply different performances over the same source interval. Distinct cuts can still use adjacent sections of a longer scene. The check recognizes the same decoded soundtrack after a container or metadata change. It also compares the original video stream for visible dialogue, so replacing the audio under existing footage cannot supply a new performance.

Assembly applies the same ownership check to saved bindings. It also reads local generation receipts for source clips and retained native audio, checks the receipt against the bytes, and rejects post-render lip-sync before export. The earlier independent reproducers now fail at attachment and at assembly preparation respectively.
