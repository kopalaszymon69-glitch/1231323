#pragma once

#include <array>
#include <vector>

#include "core/DspMath.h"

namespace kestrel {

// Fractional delay line (linear interpolation), power-of-two length.
class DelayLine {
public:
    void prepare(int maxSamples);
    void reset() noexcept;
    inline void push(float x) noexcept {
        pos_ = (pos_ + 1) & mask_;
        buf_[size_t(pos_)] = x;
    }
    // delay in samples (>= 1), measured from the most recently pushed sample
    inline float read(float delay) const noexcept {
        const float d = clampv(delay, 0.0f, float(mask_ - 2));
        const int di = int(d);
        const float fr = d - float(di);
        const float a = buf_[size_t((pos_ - di) & mask_)];
        const float b = buf_[size_t((pos_ - di - 1) & mask_)];
        return a + (b - a) * fr;
    }
    int capacity() const noexcept { return mask_ + 1; }

private:
    std::vector<float> buf_;
    int mask_ = 0, pos_ = 0;
};

// MOD FX (owner's manual p.40): Flanger/Chorus, Ensemble, Phaser.
// [DOC] types, LFO SPEED, EFFECT DEPTH = depth + feedback, depth 0 = bypass.
// [ENG] delay times, LFO range, stage counts, mix law (no hardware data).
class ModFx {
public:
    void prepare(double fs);
    void reset() noexcept;
    void process(float* l, float* r, int n, int type, float speed, float depth) noexcept;

private:
    double fs_ = 48000.0;
    DelayLine dl_[2];
    double lfoPhase_ = 0.0, lfo2Phase_ = 0.0;
    float fb_[2] = { 0.0f, 0.0f };
    // phaser
    static constexpr int kStages = 6;
    std::array<std::array<float, kStages>, 2> apState_ {};
    float phFb_[2] = { 0.0f, 0.0f };
    int lastType_ = -1;
    LinearSmoother depthS_, speedS_;
};

// DELAY (owner's manual p.41): Stereo, Cross, L/R. [DOC] types, tempo sync note
// values, DELAY DEPTH = level + feedback. [ENG] time curve, feedback law, max time.
class DelayFx {
public:
    void prepare(double fs);
    void reset() noexcept;
    void process(float* l, float* r, int n, int type, double timeSeconds, float depth) noexcept;
    static constexpr double kMaxSeconds = 12.5; // 1/1 at 20 BPM = 12 s [DOC tempo range]

private:
    double fs_ = 48000.0;
    DelayLine dl_[2];
    float curDelay_ = 1000.0f; // smoothed delay in samples
    bool first_ = true;
    LinearSmoother depthS_;
};

// 2-band EQ (owner's manual p.42; MIDI imp. *T-10/*T-11): low/high frequency + gain +-12 dB.
// [ENG] shelving filters (RBJ, slope S = 1); type/Q undocumented.
class Eq2 {
public:
    void prepare(double fs) { fs_ = fs; reset(); }
    void reset() noexcept;
    void setParams(double lowHz, double lowDb, double hiHz, double hiDb) noexcept;
    void process(float* l, float* r, int n) noexcept;

private:
    struct Biquad {
        float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
        float z1[2] = { 0, 0 }, z2[2] = { 0, 0 };
        inline float tick(float x, int ch) noexcept {
            const float y = b0 * x + z1[ch];
            z1[ch] = b1 * x - a1 * y + z2[ch];
            z2[ch] = b2 * x - a2 * y;
            return y;
        }
    };
    static void shelf(Biquad& q, double fs, double hz, double db, bool high) noexcept;
    double fs_ = 48000.0;
    Biquad lo_, hi_;
    double cLoHz_ = -1, cLoDb_ = 99, cHiHz_ = -1, cHiDb_ = 99;
    bool active_ = false;
};

} // namespace kestrel
