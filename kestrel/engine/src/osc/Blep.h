#pragma once

// Four-point band-limited step (BLEP) and ramp (BLAMP) residuals derived from the
// cubic B-spline (integrated once for steps, twice for ramps). Closed-form, applied
// at the oscillator's (oversampled) rate.
//
// Convention: an event (step of height h, or slope change of s per sample) happens
// `d` samples (0 < d <= 1) BEFORE the newest computed sample m, i.e. between m-1 and m.
// The kernels span the samples m-2 .. m+1, so oscillators run with two samples of
// look-ahead: they compute the naive value for m and output sample m-2 with its
// completed correction. This two-sample delay is common to every oscillator path.
//
// Residuals with B(x) = integral of the cubic B-spline (support [-2,2]) and
// R(x) = integral of the step residual:
//   step : r(x) = B(x) - u(x)          ramp : R(x) (even function)
//   B(x) on [-2,-1] = (x+2)^4/24,  on [-1,0] = 1/2 + (4x - 2x^3 - 3x^4/4)/6,  r odd
//   R(x) on [-2,-1] = (x+2)^5/120, on [-1,0] = 1/120 + (x+1)/2 + (2x^2 - x^4/2 - 0.15 x^5)/6 - 0.275

namespace kestrel {

struct OscCorrector {
    float c[4] = { 0.0f, 0.0f, 0.0f, 0.0f }; // corrections for samples m-2, m-1, m, m+1

    static inline float Bneg(float x) noexcept { // x in [-1, 0]
        const float x3 = x * x * x;
        return 0.5f + (4.0f * x - 2.0f * x3 - 0.75f * x3 * x) * (1.0f / 6.0f);
    }
    static inline float Rneg(float x) noexcept { // x in [-1, 0]
        const float x2 = x * x, x4 = x2 * x2, x5 = x4 * x;
        return (1.0f / 120.0f) + 0.5f * (x + 1.0f) + (2.0f * x2 - 0.5f * x4 - 0.15f * x5) * (1.0f / 6.0f) - 0.275f;
    }

    void addStep(float h, float d) noexcept {
        const float d2 = d * d, d4 = d2 * d2;
        const float u = 1.0f - d, u2 = u * u, u4 = u2 * u2;
        c[0] += h * d4 * (1.0f / 24.0f);
        c[1] += h * Bneg(d - 1.0f);
        c[2] -= h * Bneg(-d);
        c[3] -= h * u4 * (1.0f / 24.0f);
    }
    void addCorner(float s, float d) noexcept {
        const float d2 = d * d, d5 = d2 * d2 * d;
        const float u = 1.0f - d, u2 = u * u, u5 = u2 * u2 * u;
        c[0] += s * d5 * (1.0f / 120.0f);
        c[1] += s * Rneg(d - 1.0f);
        c[2] += s * Rneg(-d);
        c[3] += s * u5 * (1.0f / 120.0f);
    }
    // Returns the correction for sample m-2 and shifts the window.
    float pop() noexcept {
        const float r = c[0];
        c[0] = c[1];
        c[1] = c[2];
        c[2] = c[3];
        c[3] = 0.0f;
        return r;
    }
    void reset() noexcept { c[0] = c[1] = c[2] = c[3] = 0.0f; }
};

// Two-sample delay used by every band-limited oscillator path.
struct LookaheadDelay {
    float d1 = 0.0f, d2 = 0.0f; // naive values for m-1 and m-2
    inline float push(float naiveM, OscCorrector& c) noexcept {
        const float out = d2 + c.pop();
        d2 = d1;
        d1 = naiveM;
        return out;
    }
    void reset() noexcept { d1 = d2 = 0.0f; }
};

} // namespace kestrel
