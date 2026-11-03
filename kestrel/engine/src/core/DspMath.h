#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace kestrel {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTwoPi = 6.28318530717958647692;
constexpr float kPiF = 3.14159265358979323846f;
constexpr float kTwoPiF = 6.28318530717958647692f;

template <typename T>
constexpr T clampv(T v, T lo, T hi) noexcept { return v < lo ? lo : (v > hi ? hi : v); }

inline bool isFiniteF(float x) noexcept {
    uint32_t u;
    std::memcpy(&u, &x, sizeof u);
    return (u & 0x7f800000u) != 0x7f800000u;
}

// Replace denormals/non-finite values by zero (used on filter/delay states).
inline float sanitize(float x) noexcept {
    uint32_t u;
    std::memcpy(&u, &x, sizeof u);
    const uint32_t e = u & 0x7f800000u;
    if (e == 0x7f800000u) return 0.0f;           // inf / nan
    if (e == 0u) return 0.0f;                    // denormal / zero
    return x;
}

inline double fastExp2(double x) noexcept { return std::exp2(x); }

inline float semitonesToRatio(float s) noexcept { return std::exp2(s * (1.0f / 12.0f)); }

inline float dbToGain(float db) noexcept { return std::pow(10.0f, db * 0.05f); }

inline float lerp(float a, float b, float t) noexcept { return a + (b - a) * t; }

// One-pole coefficient for a time constant in seconds (time to reach 1-1/e).
inline float onePoleCoef(double tauSeconds, double sampleRate) noexcept {
    if (tauSeconds <= 0.0) return 1.0f;
    return float(1.0 - std::exp(-1.0 / (tauSeconds * sampleRate)));
}

// Linear ramp smoother for host parameter changes (never used on modulation).
class LinearSmoother {
public:
    void reset(float v) noexcept { cur_ = target_ = v; steps_ = 0; inc_ = 0.0f; }
    void setRampLength(int samples) noexcept { rampLen_ = std::max(1, samples); }
    void setTarget(float t) noexcept {
        if (!(t < target_) && !(t > target_)) return; // unchanged
        target_ = t;
        steps_ = rampLen_;
        inc_ = (target_ - cur_) / float(steps_);
    }
    float next() noexcept {
        if (steps_ > 0) {
            cur_ += inc_;
            if (--steps_ == 0) cur_ = target_;
        }
        return cur_;
    }
    // Advance by n samples at once (used at control rate).
    float advance(int n) noexcept {
        if (steps_ <= 0) return cur_;
        if (n >= steps_) { cur_ = target_; steps_ = 0; }
        else { cur_ += inc_ * float(n); steps_ -= n; }
        return cur_;
    }
    float current() const noexcept { return cur_; }
    float target() const noexcept { return target_; }
    bool isSmoothing() const noexcept { return steps_ > 0; }

private:
    float cur_ = 0.0f, target_ = 0.0f, inc_ = 0.0f;
    int steps_ = 0, rampLen_ = 480;
};

// 4096-point sine lookup with linear interpolation (error < -120 dB).
// Construct once (sineLut() is called in Engine::prepare before audio starts).
struct SineLut {
    static constexpr int N = 4096;
    float t[N + 1];
    SineLut() noexcept {
        for (int i = 0; i <= N; ++i) t[i] = float(std::sin(kTwoPi * double(i) / double(N)));
    }
    float operator()(double phase) const noexcept {
        const double p = phase - std::floor(phase);
        const double x = p * double(N);
        int i = int(x);
        if (i >= N) i = N - 1;
        const float f = float(x - double(i));
        return t[i] + (t[i + 1] - t[i]) * f;
    }
};
inline const SineLut& sineLut() noexcept {
    static const SineLut lut;
    return lut;
}

// Deterministic xorshift RNG (reproducible renders; seeded per instance).
class Rng {
public:
    explicit Rng(uint32_t seed = 0x12345678u) noexcept : s_(seed ? seed : 1u) {}
    void seed(uint32_t s) noexcept { s_ = s ? s : 1u; }
    uint32_t nextU32() noexcept {
        uint32_t x = s_;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        s_ = x;
        return x;
    }
    // Uniform in [-1, 1)
    float bipolar() noexcept { return float(int32_t(nextU32())) * (1.0f / 2147483648.0f); }
    // Uniform in [0, 1)
    float unipolar() noexcept { return float(nextU32() >> 8) * (1.0f / 16777216.0f); }

private:
    uint32_t s_;
};

} // namespace kestrel
