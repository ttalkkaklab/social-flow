# Preserve historical speaking-video identities

New speech bindings identify their source format with version 2 and retain hashes of decoded frames, the encoded video stream, and the audible PCM when present. An unversioned picture hash can match either historical format. A freshly attached source still detects the original footage after a driver change when the old file has been overwritten.

The reel builder verifies unchanged older bindings against their actual media. For a binding from before stream fingerprints, attachment can compare the old source while it still exists. When its bytes are gone, replacing that visible performance needs a completed render receipt or restoration of the old file. The regression cases use a public A2V attachment and a real export of neighboring cuts from a shared native video.
