#pragma once

#include <cstdint>

#include "env/Envelope.h"
#include "filter/MultimodeFilter.h"
#include "lfo/Lfo.h"
#include "osc/Oscillators.h"
#include "params/Params.h"

namespace kestrel {

// Everything a voice needs for one render chunk (built by the engine).
struct VoiceContext {
    const float* pv0 = nullptr; // parameter values at chunk start (full table, plain units)
    const float* pv1 = nullptr; // ... at chunk end (linear interpolation in between)
    int timbre = 0;
    int n = 0;                  // base-rate samples in this chunk
    int osFactor = 1;
    double fs = 48000.0, fsOs = 48000.0;
    const float* bend = nullptr;    // per base sample, -1..1 (smoothed)
    const float* modWheel = nullptr;// per base sample, 0..1 (smoothed)
    const float* in1Os = nullptr;   // external inputs at the oscillator rate (n * osFactor)
    const float* in2Os = nullptr;
    const WaveTables* tables = nullptr;
    double a4Hz = 440.0;
    int masterTranspose = 0;
    double tempoBpm = 120.0;
    bool vocoderCarrier = false;    // vocoder program: OSC1 + noise carrier only
    float* outL = nullptr;          // oscillator-rate accumulators (n * osFactor)
    float* outR = nullptr;
};

// Snapshot of per-voice control values exposed to the vocoder FC MOD.
struct VoiceControlSnapshot {
    float ampEg = 0.0f, lfo1 = 0.0f, lfo2 = 0.0f, velocity = 0.0f, kbd = 0.0f;
};

class Voice {
public:
    void prepare(double fs, double fsOs, int osFactor, uint32_t seed);

    // Starts a note. lfoRefs: timbre reference LFOs (phase source for KEY SYNC Off/Timbre).
    // glideFromPitch: previous pitch for portamento (NaN = no glide).
    void start(const VoiceContext& ctx, int note, int velocity, double detuneCents, bool resetEg1, bool resetEg2,
               bool retriggerLfo, const Lfo* lfoRefs, double glideFromPitch, uint64_t age) noexcept;
    // Mono/unison legato: change pitch, optionally retrigger EGs/LFOs.
    void legato(const VoiceContext& ctx, int note, int velocity, bool retrigger, bool resetEg1, bool resetEg2,
                const Lfo* lfoRefs, uint64_t age) noexcept;
    void release() noexcept;
    void kill() noexcept;
    // Fast linear fade (used for stolen voices moved to the tail pool).
    void beginFadeOut(double seconds) noexcept;

    // Renders one chunk, accumulating into ctx.outL/outR. Returns false if the voice became idle.
    bool render(const VoiceContext& ctx) noexcept;

    bool isActive() const noexcept { return active_; }
    bool isReleasing() const noexcept { return active_ && !gate_; }
    bool gate() const noexcept { return gate_; }
    int note() const noexcept { return note_; }
    int timbre() const noexcept { return timbre_; }
    uint64_t age() const noexcept { return age_; }
    float ampLevel() const noexcept { return eg2_.level(); }
    double currentPitch() const noexcept { return glidePitch_; }
    void setDetune(double cents) noexcept { detuneCents_ = cents; }
    const VoiceControlSnapshot& snapshot() const noexcept { return snap_; }
    bool isFading() const noexcept { return fading_; }

private:
    void configureEgs(const float* pv, int tb, bool vocoder) noexcept;

    // state
    bool active_ = false, gate_ = false, fading_ = false;
    int note_ = 60, velocity_ = 100, timbre_ = 0;
    uint64_t age_ = 0;
    double targetPitch_ = 60.0, glidePitch_ = 60.0, detuneCents_ = 0.0;
    double fs_ = 48000.0, fsOs_ = 48000.0;
    int osFactor_ = 1;
    float fadeGain_ = 1.0f, fadeStep_ = 0.0f;

    Osc1 osc1_;
    Osc2 osc2_;
    MultimodeFilter filter_;
    Envelope eg1_, eg2_;
    Lfo lfo_[2];
    Rng noiseRng_;
    float lfo2FreqMod_ = 0.0f;   // patch modulation (units) applied to LFO2 frequency
    float prevAmp_ = 0.0f, prevPanL_ = 1.0f, prevPanR_ = 1.0f;
    float distPrev_ = 0.0f;      // ADAA state
    bool firstSample_ = true;
    VoiceControlSnapshot snap_;
};

} // namespace kestrel
