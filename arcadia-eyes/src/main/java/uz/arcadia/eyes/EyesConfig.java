package uz.arcadia.eyes;

import net.fabricmc.loader.api.FabricLoader;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Tiny client config. Lives at {@code config/arcadia-eyes.properties}.
 *
 * <p>{@code debug=true} makes the pupils sweep in a circle and forces the
 * third-person front camera, which is useful for checking the axis directions.
 * {@code invertX}/{@code invertY} flip the pupil axes without a rebuild.</p>
 */
final class EyesConfig {
    static boolean DEBUG;
    static boolean INVERT_X;
    static boolean INVERT_Y;
    static boolean FORCE_FRONT_CAMERA = true;

    private EyesConfig() {
    }

    static void load() {
        Path file = FabricLoader.getInstance().getConfigDir().resolve("arcadia-eyes.properties");
        Properties props = new Properties();
        try {
            if (Files.exists(file)) {
                try (InputStream in = Files.newInputStream(file)) {
                    props.load(in);
                }
            } else {
                props.setProperty("debug", "false");
                props.setProperty("invertX", "false");
                props.setProperty("invertY", "false");
                props.setProperty("forceFrontCameraInDebug", "true");
                Files.createDirectories(file.getParent());
                try (OutputStream out = Files.newOutputStream(file)) {
                    props.store(out, "Arcadia Eyes client config");
                }
            }
        } catch (Throwable ignored) {
            // A missing/unreadable config must never block the game.
        }

        DEBUG = readBool(props, "debug", Boolean.getBoolean("arcadiaeyes.debug"));
        INVERT_X = readBool(props, "invertX", Boolean.getBoolean("arcadiaeyes.invertX"));
        INVERT_Y = readBool(props, "invertY", Boolean.getBoolean("arcadiaeyes.invertY"));
        FORCE_FRONT_CAMERA = readBool(props, "forceFrontCameraInDebug", true);

        System.out.println(ArcadiaEyesClient.LOG_PREFIX + "config: debug=" + DEBUG
                + " invertX=" + INVERT_X + " invertY=" + INVERT_Y);
    }

    private static boolean readBool(Properties props, String key, boolean fallback) {
        String value = props.getProperty(key);
        return value == null ? fallback : Boolean.parseBoolean(value.trim());
    }
}
