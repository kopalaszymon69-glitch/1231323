#pragma once

#include <array>

#include "core/DspMath.h"
#include "filter/Svf.h"
#include "osc/Blep.h"
#include "osc/Wavetable.h"
#include "params/Params.h"

namespace kestrel {

// All oscillators run at the voice's (oversampled) rate and have exactly two
// samples of look-ahead latency (see osc/Blep.h), identical for every waveform.

// ---------------------------------------------------------------- OSC1
struct Osc1Input {
    Wave1 wave = Wave1::Saw;
    double dt = 0.0;          // phase increment (cycles / sample) at the oscillator rate
    float ctrl1 = 0.0f;       // effective CONTROL 1 (0..127) incl. LFO1 / patch modulation
    int dwgsIndex0 = 0;       // 0..63
    bool vocoderProgram = false;
    float osc2Sample = 0.0f;  // OSC2 output for sample n (cross modulation)
    float in1 = 0.0f, in2 = 0.0f; // external input for sample n (oscillator rate)
    float noiseResonance = 0.0f; // CONTROL 2 for Noise (0..127)
    double keyHz = 440.0;     // key pitch for the noise filter tracking
    double fsOs = 96000.0;
    int osFactor = 2;
};

class Osc1 {
public:
    void prepare(double fsOs, uint32_t seed);
    void reset(double startPhase = 0.0);
    void setTables(const WaveTables* t) noexcept { tables_ = t; }

    // Step 1: advance the master phase to the newest sample m. Returns true if the phase
    // wrapped between m-1 and m; `d` receives the time since the wrap at sample m (0..1].
    bool advance(double dt, float& d) noexcept;
    // Step 2: produce output sample m-2 (call after advance()).
    float render(const Osc1Input& in) noexcept;

    double phase() const noexcept { return phase_; }

private:
    float renderSaw(const Osc1Input& in) noexcept;
    float renderPulse(const Osc1Input& in) noexcept;
    float renderTriangle(const Osc1Input& in) noexcept;
    float renderSine(const Osc1Input& in) noexcept;
    float renderTable(const Osc1Input& in, bool vox) noexcept;
    float renderEndless(const Osc1Input& in) noexcept;
    float renderNoise(const Osc1Input& in) noexcept;

    const WaveTables* tables_ = nullptr;
    double fs_ = 96000.0;
    double phase_ = 0.0, prevPhase_ = 0.0, ppPhase_ = 0.0; // phase at m, m-1, m-2 (0..1)
    bool wrapped_ = false;
    float wrapD_ = 0.0f;
    Wave1 lastWave_ = Wave1::Saw;

    OscCorrector corr_;
    LookaheadDelay held_;  // naive values waiting for their corrections

    // saw: second saw phase offset tracking
    double sawOffset_ = 0.0;
    // pulse
    double pulseWidth_ = 0.5;
    // triangle fold
    // vocoder-program sine fold state
    float prevFoldIn_ = 0.0f;
    // tables
    double tablePhase_[2] = { 0.0, 0.0 };
    // endless (Shepard) partial phases
    std::array<double, 11> shepardPhase_ {};
    // noise
    Rng rng_;
    Svf noiseFilter_;
    float prevNoiseOut_ = 0.0f;
};

// ---------------------------------------------------------------- OSC2
enum class OscMod : int { Off = 0, Ring, Sync, RingSync };

class Osc2 {
public:
    void reset(double startPhase = 0.0) noexcept;
    // Produces output sample m-2. `syncWrap`/`syncD` come from Osc1::advance().
    // Returns the raw OSC2 waveform (before ring modulation).
    float process(int wave, double dt, bool sync, bool syncWrap, float syncD) noexcept;

private:
    static float value(int wave, double ph) noexcept;
    static float slope(int wave) noexcept; // d(value)/d(phase) sign helper for triangle

    double phase_ = 0.0;
    OscCorrector corr_;
    LookaheadDelay held_;
};

} // namespace kestrel
