# Arcadia Eyes

Client-side Fabric mod for the ArcadiaSMP launcher (Minecraft 26.3).

It registers three [Entity Model Features](https://modrinth.com/mod/entity-model-features) animation
variables that the bundled Arcadia Eyes resource pack (a derivative of Just Expressions) reads:

| Variable | Meaning |
| --- | --- |
| `arcadia_eye_dx` | Horizontal pupil position (`JEface_pupils_x`, about -0.5..0.5) |
| `arcadia_eye_dy` | Vertical pupil position (`JEface_pupil_y`, about 0.2..0.8) |
| `arcadia_eye_w` | Gaze weight: 0 = idle/random, 1 = locked on a target |

## Behaviour

- **Other players** — if the local crosshair is on/near a player, their eyes look at the local
  camera. A wider release cone plus a 700 ms grace period keeps eye contact when the aim slides
  slightly off them. Outside that, the pack's natural random eye movement is used.
- **The local player** (visible in third person) — eyes look at the player closest to the crosshair,
  otherwise at the crosshair point.
- No head rotation is applied; only the pupils move.

Everything is client-side. The server does not need the mod.

## Build

Requires JDK 25 and Gradle 9.x, and the new non-remapping Loom plugin
(`net.fabricmc.fabric-loom`) because Minecraft 26.1+ is unobfuscated:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-25'
gradle build
```

The jar is written to `build/libs/arcadia-eyes-1.0.0.jar`.

## Config

`config/arcadia-eyes.properties` is created on first launch:

```properties
debug=false
invertX=false
invertY=false
forceFrontCameraInDebug=true
```

- `debug=true` sweeps the pupils in a circle and forces the third-person front camera, which is
  useful for checking the axes.
- `invertX` / `invertY` flip a pupil axis without rebuilding.

## Resource pack

The pack source is in `pack/`. It is a derivative of
[Just Expressions 1.2.1](https://modrinth.com/resourcepack/just-expressions) by FreshLX and Ithan,
licensed CC BY-NC-SA 4.0. See `pack/CREDITS.txt` and `pack/LICENSE-JustExpressions.txt`.

## License

MIT (mod code). The resource pack keeps the upstream CC BY-NC-SA 4.0 license.
