#pragma once

#include <array>

#include "filter/Svf.h"

namespace kestrel {

// 8-channel (16 band-pass filters used in pairs) vocoder (owner's manual p.31-38).
// [DOC] filter frequency grid and formant-shift indexing (table 6-1), channel
//       level/pan, E.F. SENSE with Hold, THRESHOLD / GATE SENSE, HPF LEVEL/GATE,
//       DIRECT LEVEL, FC MOD.
// [ENG] band-pass order and Q, follower ballistics, gate law, HPF corner, output gain.
struct VocoderParams {
    float gateSense = 32, threshold = 0, hpfLevel = 0;
    bool hpfGateEnabled = true;
    int formantShiftChoice = 0;   // choice index (0,+1,+2,-1,-2)
    float cutoff = 0;             // -63..63
    float resonance = 0;          // 0..127
    float efSense = 40;           // 0..126, >= 127 = Hold
    float directLevel = 0;        // 0..127
    std::array<float, 8> chLevel { 127, 127, 127, 127, 127, 127, 127, 127 };
    std::array<float, 8> chPan {};
};

class Vocoder {
public:
    static constexpr int kBands = 16;
    void prepare(double fs);
    void reset() noexcept;

    // carrier/modulator mono at base rate; writes stereo output (overwrites).
    // fcModSteps: additional synthesis-filter shift in grid steps (FC MOD, per block).
    // keyOn: any key held (for HPF GATE).
    void process(const float* carrier, const float* modulator, float* outL, float* outR, int n,
                 const VocoderParams& p, float fcModSteps, bool keyOn) noexcept;

    // Formant hold levels (saved with the program, MIDI imp. TABLE 3 "E.F Hold Level").
    std::array<float, kBands> holdLevels() const noexcept { return hold_; }
    void setHoldLevels(const std::array<float, kBands>& h) noexcept { hold_ = h; holdValid_ = true; }
    bool holdValid() const noexcept { return holdValid_; }
    // Current band envelopes (for metering / UI).
    std::array<float, kBands> envelopes() const noexcept { return env_; }

    static double analysisHz(int band) noexcept;

private:
    void updateSynthesisCoefs(double shiftSteps, float resonance) noexcept;

    double fs_ = 48000.0;
    struct Band {
        Svf a1, a2;      // analysis: two cascaded 2-pole band-passes (4th order)
        Svf s1, s2;      // synthesis
        float ga = 0.1f, ka = 0.3f;
        float gs = 0.1f, ks = 0.3f;
        float comp = 1.0f;
    };
    std::array<Band, kBands> bands_;
    std::array<float, kBands> env_ {};
    std::array<float, kBands> hold_ {};
    bool holdValid_ = false;
    bool wasHolding_ = false;
    double lastShift_ = 1e9;
    float lastRes_ = -1.0f;
    float gateEnv_ = 0.0f, gateGain_ = 1.0f;
    Svf hpf1_, hpf2_;
    float keyGate_ = 0.0f;
};

} // namespace kestrel
