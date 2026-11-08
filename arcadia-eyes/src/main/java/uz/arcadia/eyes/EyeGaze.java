package uz.arcadia.eyes;

import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Computes the pupil offset for the player EMF is currently animating.
 *
 * <p>Two behaviours, both entirely client-side:</p>
 * <ul>
 *   <li><b>Other players</b> — when the local crosshair is on/near them, their
 *       eyes look at the local camera. A wider release cone (with a short grace
 *       period) keeps eye contact when the crosshair is moved slightly away.</li>
 *   <li><b>The local player</b> (visible in F5) — eyes look at the player nearest
 *       to the crosshair; if there is none, they look at the crosshair point.</li>
 * </ul>
 *
 * <p>Angles are converted into the Just Expressions pupil coordinate system:
 * {@code dx} is the pack's {@code JEface_pupils_x} (about -0.5..0.5) and
 * {@code dy} is the absolute {@code JEface_pupil_y} (about 0.2..0.8).</p>
 */
final class EyeGaze {
    // Crosshair acquisition/release cone. Acquire is tight, release is wider so
    // the pupils stay locked to the person while the aim slides off them.
    private static final float ACQUIRE_DEG = 14.0f;
    private static final float RELEASE_DEG = 27.0f;
    private static final double ACQUIRE_DIST = 32.0;
    private static final double RELEASE_DIST = 40.0;
    private static final long LOCK_GRACE_NS = 700_000_000L;

    // How many degrees of head-relative offset map to the full pupil travel.
    private static final float YAW_RANGE_DEG = 38.0f;
    private static final float PITCH_RANGE_DEG = 26.0f;

    // Just Expressions pupil space.
    private static final float PUPIL_X_SCALE = 0.50f;
    private static final float PUPIL_Y_CENTER = 0.50f;
    private static final float PUPIL_Y_SCALE = 0.30f;

    // Flip these if the in-game test shows the pupils moving the wrong way.
    private static final long CACHE_NS = 3_000_000L;
    private static boolean frontForced;

    private static final Map<Integer, State> STATES = new ConcurrentHashMap<>();

    private EyeGaze() {
    }

    static float dx() {
        return sample().x;
    }

    static float dy() {
        return sample().y;
    }

    static float weight() {
        return sample().weight;
    }

    private static Sample sample() {
        Player self = ArcadiaEyesClient.currentEntity();
        if (self == null) {
            return Sample.IDLE;
        }
        Minecraft mc = Minecraft.getInstance();
        if (EyesConfig.DEBUG) {
            if (EyesConfig.FORCE_FRONT_CAMERA && !frontForced
                    && mc.options.getCameraType() != CameraType.THIRD_PERSON_FRONT) {
                frontForced = true;
                mc.execute(() -> mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT));
            }
            double phase = (System.nanoTime() % 4_000_000_000L) / 4_000_000_000.0 * Math.PI * 2.0;
            float signX = EyesConfig.INVERT_X ? -1.0f : 1.0f;
            float signY = EyesConfig.INVERT_Y ? -1.0f : 1.0f;
            float x = (float) Math.sin(phase) * PUPIL_X_SCALE;
            float y = PUPIL_Y_CENTER + signY * (float) Math.cos(phase) * PUPIL_Y_SCALE;
            return new Sample(x * signX, y, 1.0f);
        }
        Player local = mc.player;
        if (local == null || mc.level == null) {
            return Sample.IDLE;
        }

        long now = System.nanoTime();
        State state = STATES.computeIfAbsent(self.getId(), id -> new State());
        if (state.lastNanos != 0 && now - state.lastNanos < CACHE_NS) {
            return state.sample;
        }
        float dt = state.lastNanos == 0
                ? 0.05f
                : Math.min(0.20f, (now - state.lastNanos) / 1_000_000_000.0f);
        state.lastNanos = now;

        Vec3 target;
        if (self == local) {
            target = selfTarget(mc, local, state);
        } else if (isEyeContact(mc, local, self, state, now)) {
            target = local.getEyePosition();
        } else {
            target = null;
        }

        float want = target == null ? 0.0f : 1.0f;
        float blend = 1.0f - (float) Math.exp(-dt / 0.10f);
        state.weight += (want - state.weight) * blend;
        if (state.weight < 0.002f) {
            state.weight = 0.0f;
        }

        if (target == null || state.weight <= 0.001f) {
            state.sample = new Sample(0.0f, PUPIL_Y_CENTER, state.weight);
            return state.sample;
        }

        Vec3 eye = self.getEyePosition();
        Vec3 toTarget = target.subtract(eye);
        double horizontal = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
        if (horizontal < 1.0e-4 && Math.abs(toTarget.y) < 1.0e-4) {
            state.sample = new Sample(0.0f, PUPIL_Y_CENTER, state.weight);
            return state.sample;
        }

        float targetYaw = (float) Math.toDegrees(Math.atan2(-toTarget.x, toTarget.z));
        float targetPitch = (float) -Math.toDegrees(Math.atan2(toTarget.y, horizontal));
        float dYaw = Mth.wrapDegrees(targetYaw - self.getYHeadRot());
        float dPitch = Mth.wrapDegrees(targetPitch - self.getXRot());

        float signX = EyesConfig.INVERT_X ? -1.0f : 1.0f;
        float signY = EyesConfig.INVERT_Y ? -1.0f : 1.0f;
        float x = signX * Mth.clamp(dYaw / YAW_RANGE_DEG, -1.0f, 1.0f) * PUPIL_X_SCALE;
        float y = PUPIL_Y_CENTER
                + signY * Mth.clamp(dPitch / PITCH_RANGE_DEG, -1.0f, 1.0f) * PUPIL_Y_SCALE;

        state.sample = new Sample(x, y, state.weight);
        return state.sample;
    }

    /** Local player in F5: nearest player to the crosshair, else the crosshair point. */
    private static Vec3 selfTarget(Minecraft mc, Player local, State state) {
        Player best = findClosestToCrosshair(mc, local, ACQUIRE_DEG, ACQUIRE_DIST);
        if (best != null) {
            state.selfTargetId = best.getId();
            return best.getEyePosition();
        }

        if (state.selfTargetId != -1) {
            Player previous = playerById(mc, state.selfTargetId);
            if (previous != null && previous.isAlive() && !previous.isInvisible()
                    && angleTo(local, previous) <= RELEASE_DEG
                    && distanceTo(local, previous) <= RELEASE_DIST) {
                return previous.getEyePosition();
            }
            state.selfTargetId = -1;
        }

        Vec3 view = local.getViewVector(1.0f);
        return local.getEyePosition().add(view.scale(8.0));
    }

    /** Other players: eye contact while the local crosshair is on/near them. */
    private static boolean isEyeContact(Minecraft mc, Player local, Player target,
                                        State state, long now) {
        if (!target.isAlive() || target.isInvisible()) {
            state.locked = false;
            return false;
        }

        double angle = angleTo(local, target);
        double distance = distanceTo(local, target);

        if (angle <= ACQUIRE_DEG && distance <= ACQUIRE_DIST) {
            state.locked = true;
            state.lockUntil = now + LOCK_GRACE_NS;
            return true;
        }

        if (!state.locked) {
            return false;
        }

        if (angle <= RELEASE_DEG && distance <= RELEASE_DIST) {
            state.lockUntil = now + LOCK_GRACE_NS;
            return true;
        }

        // Outside the release cone: keep contact briefly, then let the eyes idle.
        if (now <= state.lockUntil) {
            return true;
        }
        state.locked = false;
        return false;
    }

    private static Player findClosestToCrosshair(Minecraft mc, Player local,
                                                 float maxAngle, double maxDistance) {
        Vec3 eye = local.getEyePosition();
        Vec3 view = local.getViewVector(1.0f);
        Player best = null;
        double bestScore = Double.MAX_VALUE;

        for (AbstractClientPlayer candidate : mc.level.players()) {
            if (candidate == local || !candidate.isAlive() || candidate.isInvisible()) {
                continue;
            }
            Vec3 toCandidate = candidate.getEyePosition().subtract(eye);
            double distance = toCandidate.length();
            if (distance < 0.1 || distance > maxDistance) {
                continue;
            }
            double dot = toCandidate.normalize().dot(view);
            double angle = Math.toDegrees(Math.acos(Mth.clamp(dot, -1.0, 1.0)));
            if (angle > maxAngle) {
                continue;
            }
            double score = angle + distance * 0.12;
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
        return best;
    }

    private static Player playerById(Minecraft mc, int id) {
        for (AbstractClientPlayer candidate : mc.level.players()) {
            if (candidate.getId() == id) {
                return candidate;
            }
        }
        return null;
    }

    private static double angleTo(Player local, Player target) {
        Vec3 toTarget = target.getEyePosition().subtract(local.getEyePosition());
        double distance = toTarget.length();
        if (distance < 1.0e-4) {
            return 0.0;
        }
        double dot = toTarget.normalize().dot(local.getViewVector(1.0f));
        return Math.toDegrees(Math.acos(Mth.clamp(dot, -1.0, 1.0)));
    }

    private static double distanceTo(Player local, Player target) {
        return target.getEyePosition().distanceTo(local.getEyePosition());
    }

    private record Sample(float x, float y, float weight) {
        static final Sample IDLE = new Sample(0.0f, PUPIL_Y_CENTER, 0.0f);
    }

    private static final class State {
        long lastNanos;
        float weight;
        boolean locked;
        long lockUntil;
        int selfTargetId = -1;
        Sample sample = Sample.IDLE;
    }
}
