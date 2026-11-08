package uz.arcadia.eyes;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.world.entity.player.Player;

import java.lang.reflect.Method;
import java.util.function.Supplier;

/**
 * Arcadia Eyes — client-side eye contact for ArcadiaSMP.
 *
 * <p>The actual pupil movement is done by the Arcadia Eyes resource pack (a
 * derivative of Just Expressions). This mod only registers three EMF animation
 * variables that the pack reads: {@code arcadia_eye_dx}, {@code arcadia_eye_dy}
 * and {@code arcadia_eye_w}. Everything is client-side; the server does not need
 * to know about it.</p>
 */
public final class ArcadiaEyesClient implements ClientModInitializer {
    public static final String MOD_ID = "arcadia_eyes";
    public static final String LOG_PREFIX = "[ArcadiaEyes] ";

    private static final String EMF_API = "traben.entity_model_features.EMFAnimationApi";
    private static Method getCurrentEntity;
    private static boolean loggedEntityType;

    @Override
    public void onInitializeClient() {
        EyesConfig.load();
        try {
            Class<?> api = Class.forName(EMF_API);
            getCurrentEntity = api.getMethod("getCurrentEntity");
            Method register = api.getMethod(
                    "registerSingletonAnimationVariable",
                    String.class, String.class, String.class, Supplier.class);

            register.invoke(null, "arcadia_eyes", "arcadia_eye_dx",
                    "Arcadia Eyes horizontal pupil position", (Supplier<Float>) EyeGaze::dx);
            register.invoke(null, "arcadia_eyes", "arcadia_eye_dy",
                    "Arcadia Eyes vertical pupil position", (Supplier<Float>) EyeGaze::dy);
            register.invoke(null, "arcadia_eyes", "arcadia_eye_w",
                    "Arcadia Eyes gaze weight (0 = idle, 1 = looking)", (Supplier<Float>) EyeGaze::weight);

            System.out.println(LOG_PREFIX + "registered EMF gaze variables");
            if (EyesConfig.DEBUG) {
                System.out.println(LOG_PREFIX + "debug pupil sweep enabled");
            }
        } catch (ClassNotFoundException e) {
            System.out.println(LOG_PREFIX + "Entity Model Features not installed; gaze disabled");
        } catch (Throwable t) {
            System.out.println(LOG_PREFIX + "could not register EMF variables: " + t);
        }
    }

    /** The entity currently being animated by EMF, or {@code null}. */
    static Player currentEntity() {
        if (getCurrentEntity == null) {
            return null;
        }
        try {
            Object value = getCurrentEntity.invoke(null);
            if (!loggedEntityType && value != null) {
                loggedEntityType = true;
                System.out.println(LOG_PREFIX + "current entity class: " + value.getClass().getName());
            }
            return value instanceof Player player ? player : null;
        } catch (Throwable t) {
            return null;
        }
    }
}
