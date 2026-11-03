#pragma once

#include "core/DspMath.h"

namespace kestrel {

// Topology-preserving-transform (trapezoidal, zero-delay-feedback) state-variable
// filter (Zavalishin; Simper formulation). Chosen because it stays well behaved
// under per-sample, audio-rate cutoff/resonance modulation. This is a generic
// digital filter structure — NOT a claim about the reference hardware's internals.
//
// g = tan(pi * fc / fs), k = 1/Q (damping; may be slightly negative for
// self-oscillation, bounded by an amplitude-dependent damping term).
struct Svf {
    float ic1 = 0.0f, ic2 = 0.0f;
    float lastBp = 0.0f, lastLp = 0.0f;

    void reset() noexcept { ic1 = ic2 = lastBp = lastLp = 0.0f; }

    // Amplitude limiter for self-oscillation (documented stability measure, not a
    // circuit model): extra damping proportional to the state energy above kLimit^2.
    // It only acts when the damping k is near/below zero (resonance close to
    // self-oscillation, k < kLimitOn), fading in smoothly; ordinary filtering
    // (k >= kLimitOn) is strictly linear at any signal level.
    static constexpr float kLimit = 1.0f;
    static constexpr float kLimitStrength = 0.6f;
    static constexpr float kLimitOn = 0.06f;

    inline void tick(float v0, float g, float k, float& lp, float& bp, float& hp) noexcept {
        if (k < kLimitOn) {
            const float e = lastBp * lastBp + lastLp * lastLp;
            if (e > kLimit * kLimit) {
                const float w = std::min(1.0f, (kLimitOn - k) / kLimitOn);
                k += w * kLimitStrength * (e - kLimit * kLimit);
            }
        }
        tickLinear(v0, g, k, lp, bp, hp);
    }

    // Plain linear SVF (no amplitude limiter) for non-resonant uses.
    inline void tickLinear(float v0, float g, float k, float& lp, float& bp, float& hp) noexcept {
        const float a1 = 1.0f / (1.0f + g * (g + k));
        const float a2 = g * a1;
        const float a3 = g * a2;
        const float v3 = v0 - ic2;
        const float v1 = a1 * ic1 + a2 * v3;
        const float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2.0f * v1 - ic1;
        ic2 = 2.0f * v2 - ic2;
        lp = v2;
        bp = v1;
        hp = v0 - k * v1 - v2;
        lastBp = v1;
        lastLp = v2;
    }

    inline float lowpass(float v0, float g, float k) noexcept {
        float lp, bp, hp;
        tick(v0, g, k, lp, bp, hp);
        return lp;
    }
    inline float lowpassLinear(float v0, float g, float k) noexcept {
        float lp, bp, hp;
        tickLinear(v0, g, k, lp, bp, hp);
        return lp;
    }

    // Guards against non-finite states (e.g. after extreme modulation); returns true if reset.
    inline bool sanitizeState() noexcept {
        if (!isFiniteF(ic1) || !isFiniteF(ic2) || std::fabs(ic1) > 1e4f || std::fabs(ic2) > 1e4f) {
            reset();
            return true;
        }
        ic1 = sanitize(ic1); // flush denormals even if FTZ is unavailable
        ic2 = sanitize(ic2);
        return false;
    }
};

// Prewarped SVF coefficient for a cutoff in Hz at rate fs (clamped below Nyquist).
inline float svfG(double hz, double fs) noexcept {
    const double f = clampv(hz, 1.0, fs * 0.49);
    return float(std::tan(kPi * f / fs));
}

} // namespace kestrel
