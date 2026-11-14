# Door duplicate wall regression

Duplicating a door must preserve dimensions, style and pose while assigning a fresh identity and no route links. Attached doors must remain attached at a valid new nonoverlapping position on their host, using the nearest free candidate and failing explicitly if no fit exists. An explicit duplicate offset targets a nearby wall and revalidates the result. Never silently detach or overlap an attached copy. Freeform legacy duplicate behavior stays supported.

Moving a door body onto another wall should use the same nearby-wall selection, center projection, wall orientation and validation as new placement. Ambiguous corners, outside endpoints, overlap or excessive opening height fail without mutation. Resize/rotation and wall-free legacy editing retain their paths. Re-evaluate room ownership after snapped relocation, update only the moved door route anchor if present, never inherit a source route link. One undo restores exact original state. Studio must display a duplicate rejection rather than silently doing nothing.

Work only in existing feat/save-v2; no saved map writes, commits, staging, user tabs/locks, environment reads or second server. Checkpoint before edits. Serial512MB tests and isolated real-component browser verification.
