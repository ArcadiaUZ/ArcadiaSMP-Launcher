# Launcher update manifest

`latest.yml` is the canonical update manifest read by the launcher's updater
(`electron/updater-engine.js`) before it falls back to the GitHub Releases copy.

For every release:

1. Build the installer and its `.blockmap`.
2. Copy `latest.yml` from `dist/` here and add:
   - `tag: v<version>` — the GitHub release tag;
   - `blockmap: update/ArcadiaSMP-Launcher-<version>-setup.exe.blockmap` — the
     new installer's blockmap, committed to the repo so the next update can be
     differential;
3. Commit `update/old/<version>.blockmap` (the blockmap of the installer that
   users are upgrading *from*). It is used by the next release's differential
   downloader.
4. Commit `update/ArcadiaSMP-Launcher-<version>-setup.exe.blockmap`.

The installer bytes are never trusted from the mirror: the final file must match
the `sha512`/`size` from this manifest.
