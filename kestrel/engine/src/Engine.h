#pragma once

#include <array>
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

#include "arp/Arpeggiator.h"
#include "core/DspMath.h"
#include "core/Oversampler.h"
#include "fx/Effects.h"
#include "osc/Wavetable.h"
#include "params/Params.h"
#include "timbre/Timbre.h"
#include "vocoder/Vocoder.h"
#include "voice/Voice.h"

namespace kestrel {

struct MidiEvent {
    int offset = 0;       // sample offset within the block
    uint8_t data[3] { 0, 0, 0 };
    uint8_t size = 0;
};

struct TransportInfo {
    bool valid = false;   // host supplied tempo/position
    bool playing = false;
    double bpm = 120.0;
    double ppq = 0.0;     // quarter-note position at the start of the block
};

// The complete sound engine. Pure C++ (no JUCE). Thread model:
//   prepare(), setWaveTables(), collectGarbage(): non-realtime thread(s)
//   setParam(), process(), MIDI: audio thread (lock-free, allocation-free)
class Engine final : public VoiceTailSink {
public:
    static constexpr int kMaxVoices = 32;      // 4 in Compatibility mode, up to 16 per timbre in Extended
    static constexpr int kMaxTails = 8;        // short fade-outs of stolen voices (not counted as polyphony)
    static constexpr int kChunk = 32;          // max render chunk (control-update granularity)
    static constexpr int kExtendedPolyPerTimbre = 16;

    Engine();
    ~Engine() override;

    void prepare(double sampleRate, int maxBlockSize);
    void reset() noexcept;                     // silence everything, clear states (audio thread safe)

    void setParam(int index, float plainValue) noexcept;
    float param(int index) const noexcept { return target_[size_t(index)]; }
    void setAllParamsImmediate(const float* values) noexcept; // no smoothing (preset load / tests)

    // Wave tables (DWGS/VOX). Called from a non-realtime thread; the swap is lock-free.
    void setWaveTables(std::shared_ptr<const WaveTables> t);
    void collectGarbage();                     // frees tables no longer in use (non-realtime)
    std::shared_ptr<const WaveTables> currentWaveTables() const;

    void process(float* outL, float* outR, const float* in1, const float* in2, int numSamples,
                 const MidiEvent* events, int numEvents, const TransportInfo& transport) noexcept;

    // Latency (samples at the host rate) introduced by the current oversampling setting.
    int latencySamples() const noexcept { return latency_.load(std::memory_order_relaxed); }
    static int latencyFor(double sampleRate, int qualityChoice) noexcept;
    static int factorFor(double sampleRate, int qualityChoice) noexcept;

    // Vocoder formant-hold data (stored with the program).
    std::array<float, Vocoder::kBands> vocoderHoldLevels() const noexcept { return vocoder_.holdLevels(); }
    void setVocoderHoldLevels(const std::array<float, Vocoder::kBands>& h) noexcept { vocoder_.setHoldLevels(h); }
    bool vocoderHoldValid() const noexcept { return vocoder_.holdValid(); }

    // UI telemetry (relaxed atomics, written once per block)
    int activeVoices() const noexcept { return uiActiveVoices_.load(std::memory_order_relaxed); }
    int arpStep() const noexcept { return uiArpStep_.load(std::memory_order_relaxed); }
    float vocoderBand(int b) const noexcept { return uiVocEnv_[size_t(b)].load(std::memory_order_relaxed); }
    int voiceBudget(int timbre) const noexcept { return budget_[size_t(timbre)]; }
    double currentTempo() const noexcept { return uiTempo_.load(std::memory_order_relaxed); }
    uint64_t nonFiniteEvents() const noexcept { return nanEvents_.load(std::memory_order_relaxed); }

    void moveToTail(const Voice& v) noexcept override;

    // Parameter changes caused by received MIDI CC/NRPN (hardware map). Single producer
    // (audio thread) / single consumer (e.g. the plug-in's message thread, to update host
    // parameters). Returns false when empty.
    bool popControllerChange(int& paramIndex, float& value) noexcept {
        const uint32_t r = ccRead_.load(std::memory_order_relaxed);
        if (r == ccWrite_.load(std::memory_order_acquire)) return false;
        paramIndex = ccQueue_[r & (kCcQueue - 1)].first;
        value = ccQueue_[r & (kCcQueue - 1)].second;
        ccRead_.store(r + 1, std::memory_order_release);
        return true;
    }

    // Read-only introspection for tests / tools (not used by the plug-in).
    const Voice& debugVoice(int i) const noexcept { return voices_[size_t(i)]; }
    int debugActiveTails() const noexcept {
        int c = 0;
        for (const auto& t : tails_) c += t.isActive() ? 1 : 0;
        return c;
    }
    int osFactor() const noexcept { return osFactor_; }

private:
    void handleMidi(const MidiEvent& e) noexcept;
    void noteOnInternal(int note, int vel) noexcept;
    void noteOffInternal(int note) noexcept;
    void dispatchToTimbres(bool on, int note, int vel, bool arpNote) noexcept;
    void renderChunk(float* outL, float* outR, const float* in1, const float* in2, int n) noexcept;
    void updateAllocation() noexcept;
    void applyOversamplingSetting() noexcept;
    ArpParams arpParams() const noexcept;
    ArpClock arpClock(int offsetInBlock) const noexcept;
    VoiceContext makeContext(int timbre, int n) noexcept;
    double tempoBpm() const noexcept;
    float distortCarrier(float x) noexcept;

    double fs_ = 48000.0;
    int maxBlock_ = 512;
    int osFactor_ = 1;
    int prepared_ = 0;

    // parameters
    std::array<float, kNumParams> target_ {};
    std::array<float, kNumParams> pv0_ {}, pv1_ {};
    std::array<LinearSmoother, kNumParams> smooth_ {};
    std::array<bool, kNumParams> smoothed_ {};

    // voices
    std::array<Voice, kMaxVoices> voices_;
    std::array<Voice, kMaxTails> tails_;
    std::array<Timbre, kNumTimbres> timbres_;
    std::array<int, kNumTimbres> budget_ { 4, 0 };
    std::array<int, kNumTimbres> lastAssign_ { -1, -1 };
    int lastMode_ = -1, lastLimit_ = -1;
    uint64_t ageCounter_ = 0;
    int nextTail_ = 0;

    // controllers (per channel-wide)
    float bendTarget_ = 0.0f, modTarget_ = 0.0f, bendCur_ = 0.0f, modCur_ = 0.0f;
    bool sustain_ = false;
    std::array<float, kChunk> bendBuf_ {}, modBuf_ {};

    // arpeggiator
    Arpeggiator arp_;
    bool arpWasOn_ = false;
    int physicalKeys_ = 0;              // keys held on the input (before the arpeggiator)
    std::array<bool, 128> physicalDown_ {};
    TransportInfo transport_;
    int blockOffset_ = 0;
    bool wasPlaying_ = false;

    // buffers
    OversamplingChain os_;
    std::vector<float> osL_, osR_, in1Os_, in2Os_, baseL_, baseR_, carrier_, scratch_;
    // input alignment delay (vocoder / thru / inst paths follow the reported latency)
    std::vector<float> inDelay_[2];
    int inDelayPos_ = 0;
    std::vector<float> in1Del_, in2Del_;

    // effects
    ModFx modFx_;
    DelayFx delay_;
    Eq2 eq_;
    Vocoder vocoder_;
    float vocDistPrev_ = 0.0f;
    LinearSmoother masterGain_;
    // Output DC blocker (~5 Hz, first order) [ENG]: stands in for the AC-coupled analog
    // output stage of the hardware (unmeasured); removes the DC of e.g. hard-synced saws.
    float dcX_[2] { 0.0f, 0.0f }, dcY_[2] { 0.0f, 0.0f }, dcR_ = 0.9993f;

    // wave tables: hazard-pointer style handoff
    std::atomic<const WaveTables*> published_ { nullptr };
    std::atomic<const WaveTables*> inUse_ { nullptr };
    const WaveTables* tables_ = nullptr;
    mutable std::mutex ownedMutex_; // non-realtime side only
    std::vector<std::shared_ptr<const WaveTables>> owned_;

    std::atomic<int> latency_ { 0 };
    std::atomic<int> uiActiveVoices_ { 0 };
    std::atomic<int> uiArpStep_ { 0 };
    std::array<std::atomic<float>, Vocoder::kBands> uiVocEnv_ {};
    std::atomic<double> uiTempo_ { 120.0 };
    std::atomic<uint64_t> nanEvents_ { 0 };

    // hardware CC / NRPN reception
    void applyControllerTarget(int param, float value) noexcept;
    int timbreSelect_ = 0;
    int nrpnMsb_ = -1, nrpnLsb_ = -1;
    static constexpr uint32_t kCcQueue = 512;
    std::array<std::pair<int, float>, kCcQueue> ccQueue_ {};
    std::atomic<uint32_t> ccWrite_ { 0 }, ccRead_ { 0 };
};

} // namespace kestrel
