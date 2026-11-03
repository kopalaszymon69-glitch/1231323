#include "Engine.h"

#include <cmath>
#include <cstring>

#include "core/Denormals.h"
#include "params/HardwareCc.h"
#include "params/Mapping.h"

namespace kestrel {

namespace {
constexpr float kSmoothSeconds = 0.010f;  // host parameter smoothing (not applied to modulation)
constexpr double kTailFade = 0.003;       // [ENG] stolen-voice fade

inline float clipF(float x) noexcept {
    if (x >= 1.0f) return 1.0f;
    if (x <= -1.0f) return -1.0f;
    return 1.5f * x - 0.5f * x * x * x;
}
inline float clipAD(float x) noexcept {
    const float a = std::fabs(x);
    if (a >= 1.0f) return a - 0.375f;
    const float x2 = x * x;
    return 0.75f * x2 - 0.125f * x2 * x2;
}
} // namespace

Engine::Engine() {
    for (int i = 0; i < kNumParams; ++i) {
        const ParamInfo& p = paramInfo(i);
        target_[size_t(i)] = p.defV;
        pv0_[size_t(i)] = pv1_[size_t(i)] = p.defV;
        smoothed_[size_t(i)] = p.kind == PKind::Float;
        smooth_[size_t(i)].reset(p.defV);
    }
    for (auto& e : uiVocEnv_) e.store(0.0f);
}

Engine::~Engine() = default;

int Engine::factorFor(double sampleRate, int q) noexcept {
    switch (q) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 4;
        default: return sampleRate < 88200.0 ? 2 : 1; // Auto
    }
}

int Engine::latencyFor(double sampleRate, int q) noexcept {
    return OversamplingChain::decimationLatencyFor(factorFor(sampleRate, q));
}

void Engine::prepare(double sampleRate, int maxBlockSize) {
    fs_ = sampleRate > 0 ? sampleRate : 48000.0;
    maxBlock_ = std::max(1, maxBlockSize);
    (void)sineLut(); // construct before the audio thread needs it
    const int smoothLen = std::max(1, int(kSmoothSeconds * fs_));
    for (auto& s : smooth_) s.setRampLength(smoothLen);
    masterGain_.setRampLength(smoothLen);

    const int maxOs = kChunk * OversamplingChain::kMaxFactor;
    osL_.assign(size_t(maxOs), 0.0f);
    osR_.assign(size_t(maxOs), 0.0f);
    in1Os_.assign(size_t(maxOs), 0.0f);
    in2Os_.assign(size_t(maxOs), 0.0f);
    baseL_.assign(size_t(kChunk), 0.0f);
    baseR_.assign(size_t(kChunk), 0.0f);
    carrier_.assign(size_t(kChunk), 0.0f);
    scratch_.assign(size_t(kChunk), 0.0f);
    in1Del_.assign(size_t(kChunk), 0.0f);
    in2Del_.assign(size_t(kChunk), 0.0f);
    for (auto& d : inDelay_) d.assign(256, 0.0f);
    inDelayPos_ = 0;
    os_.prepare(kChunk);

    modFx_.prepare(fs_);
    delay_.prepare(fs_);
    eq_.prepare(fs_);
    vocoder_.prepare(fs_);
    arp_.prepare(fs_);

    if (published_.load() == nullptr) setWaveTables(buildWaveTables(nullptr));

    osFactor_ = -1;
    applyOversamplingSetting();
    for (int t = 0; t < kNumTimbres; ++t) timbres_[size_t(t)].prepare(t, fs_, voices_.data(), this, &ageCounter_);
    lastMode_ = lastLimit_ = -1;
    lastAssign_ = { -1, -1 };
    // snap smoothers to the current targets
    for (int i = 0; i < kNumParams; ++i) {
        smooth_[size_t(i)].reset(target_[size_t(i)]);
        pv0_[size_t(i)] = pv1_[size_t(i)] = target_[size_t(i)];
    }
    masterGain_.reset(dbToGain(target_[size_t(pG(MasterVolume))]));
    dcR_ = float(std::exp(-2.0 * kPi * 5.0 / fs_));
    updateAllocation();
    prepared_ = 1;
    reset();
}

void Engine::applyOversamplingSetting() noexcept {
    const int f = factorFor(fs_, int(target_[size_t(pG(Quality))]));
    if (f == osFactor_) return;
    osFactor_ = f;
    os_.setFactor(f);
    const double fsOs = fs_ * double(f);
    for (int i = 0; i < kMaxVoices; ++i) voices_[size_t(i)].prepare(fs_, fsOs, f, uint32_t(i + 1));
    for (int i = 0; i < kMaxTails; ++i) tails_[size_t(i)].prepare(fs_, fsOs, f, uint32_t(100 + i));
    for (auto& t : timbres_) t.resetNoteState();
    latency_.store(os_.decimationLatency(), std::memory_order_relaxed);
    for (auto& d : inDelay_) std::fill(d.begin(), d.end(), 0.0f);
}

void Engine::reset() noexcept {
    for (auto& v : voices_) v.kill();
    for (auto& v : tails_) v.kill();
    for (auto& t : timbres_) t.resetNoteState();
    os_.reset();
    modFx_.reset();
    delay_.reset();
    eq_.reset();
    vocoder_.reset();
    arp_.reset();
    physicalDown_.fill(false);
    physicalKeys_ = 0;
    bendTarget_ = bendCur_ = 0.0f;
    modTarget_ = modCur_ = 0.0f;
    sustain_ = false;
    vocDistPrev_ = 0.0f;
    dcX_[0] = dcX_[1] = dcY_[0] = dcY_[1] = 0.0f;
    for (auto& d : inDelay_) std::fill(d.begin(), d.end(), 0.0f);
}

void Engine::setParam(int index, float v) noexcept {
    if (index < 0 || index >= kNumParams) return;
    v = sanitizeParamValue(index, v);
    target_[size_t(index)] = v;
    if (smoothed_[size_t(index)]) smooth_[size_t(index)].setTarget(v);
    else smooth_[size_t(index)].reset(v);
}

void Engine::setAllParamsImmediate(const float* values) noexcept {
    for (int i = 0; i < kNumParams; ++i) {
        const float v = sanitizeParamValue(i, values[i]);
        target_[size_t(i)] = v;
        smooth_[size_t(i)].reset(v);
        pv0_[size_t(i)] = pv1_[size_t(i)] = v;
    }
    masterGain_.reset(dbToGain(target_[size_t(pG(MasterVolume))]));
}

// ------------------------------------------------------------ wave tables
void Engine::setWaveTables(std::shared_ptr<const WaveTables> t) {
    if (!t) return;
    std::lock_guard<std::mutex> lock(ownedMutex_);
    owned_.push_back(t);
    published_.store(t.get());
}

void Engine::collectGarbage() {
    std::lock_guard<std::mutex> lock(ownedMutex_);
    const WaveTables* pub = published_.load();
    const WaveTables* use = inUse_.load();
    for (auto it = owned_.begin(); it != owned_.end();) {
        if (it->get() != pub && it->get() != use) it = owned_.erase(it);
        else ++it;
    }
}

std::shared_ptr<const WaveTables> Engine::currentWaveTables() const {
    std::lock_guard<std::mutex> lock(ownedMutex_);
    const WaveTables* pub = published_.load();
    for (const auto& t : owned_)
        if (t.get() == pub) return t;
    return {};
}

// ------------------------------------------------------------ allocation
void Engine::updateAllocation() noexcept {
    const int mode = int(target_[size_t(pG(VoiceMode))]);
    const int limit = int(target_[size_t(pG(VoiceLimit))]);
    const int a0 = int(target_[size_t(pT(0, VoiceAssign))]);
    const int a1 = int(target_[size_t(pT(1, VoiceAssign))]);
    const bool layer = mode == int(ProgMode::Layer);
    if (mode == lastMode_ && limit == lastLimit_ && a0 == lastAssign_[0] && (!layer || a1 == lastAssign_[1])) return;
    const bool extended = limit == 1;
    auto single = [&](int a) {
        if (a == int(Assign::Mono)) return 1;
        if (a == int(Assign::Unison)) return 4;
        return extended ? kExtendedPolyPerTimbre : 4;
    };
    int b0, b1 = 0;
    if (!layer) {
        b0 = single(a0);
    } else {
        // [DOC p.16 table] Mono+Poly = 1+3, Poly+Poly = 2+2, Unison+Mono = 2+1; others [ENG] by the same rule:
        // Mono uses 1 voice, Unison uses 2, Poly takes the rest of the 4-voice budget (2 if both Poly).
        auto layerNeed = [&](int a, int other) {
            if (a == int(Assign::Mono)) return 1;
            if (a == int(Assign::Unison)) return extended ? 4 : 2;
            if (extended) return kExtendedPolyPerTimbre;
            if (other == int(Assign::Mono)) return 3;
            return 2;
        };
        b0 = layerNeed(a0, a1);
        b1 = layerNeed(a1, a0);
    }
    budget_ = { b0, b1 };
    timbres_[0].setVoiceRange(0, b0);
    timbres_[1].setVoiceRange(b0, b1);
    lastMode_ = mode;
    lastLimit_ = limit;
    lastAssign_ = { a0, a1 };
}

void Engine::moveToTail(const Voice& v) noexcept {
    // pick the quietest/oldest tail slot
    int best = -1;
    for (int i = 0; i < kMaxTails; ++i) if (!tails_[size_t(i)].isActive()) { best = i; break; }
    if (best < 0) best = (nextTail_++) % kMaxTails;
    Voice& t = tails_[size_t(best)];
    t = v;
    t.beginFadeOut(kTailFade);
}

// ------------------------------------------------------------ MIDI
void Engine::dispatchToTimbres(bool on, int note, int vel, bool arpNote) noexcept {
    const ProgMode mode = ProgMode(int(target_[size_t(pG(VoiceMode))]));
    const int arpTarget = int(target_[size_t(pG(ArpTarget))]);
    for (int t = 0; t < kNumTimbres; ++t) {
        if (budget_[size_t(t)] <= 0) continue;
        if (t == 1 && mode != ProgMode::Layer) continue;
        const bool arpOn = target_[size_t(pG(ArpOn))] >= 0.5f;
        // Target timbre [DOC p.45]: in Layer, the arpeggiator plays Both / T1 / T2;
        // the other timbre is played directly from the keyboard.
        bool isArpTarget = true;
        if (mode == ProgMode::Layer) isArpTarget = (arpTarget == 0) || (arpTarget == t + 1);
        if (arpOn) {
            if (arpNote != isArpTarget) continue;
        } else if (arpNote) {
            continue;
        }
        VoiceContext ctx = makeContext(t, 1);
        if (on) timbres_[size_t(t)].noteOn(ctx, note, vel, arpNote);
        else timbres_[size_t(t)].noteOff(ctx, note);
    }
}

void Engine::noteOnInternal(int note, int vel) noexcept {
    const int fixedVel = int(target_[size_t(pG(VelocityCurve))]);
    if (fixedVel > 0) vel = fixedVel; // [DOC p.47] fixed velocity 1..127; "Curve" passes incoming MIDI velocity
    if (target_[size_t(pG(ArpOn))] >= 0.5f && physicalKeys_ == 0) {
        // first played key while the arpeggiator runs: KEY SYNC = Timbre restarts here
        const ProgMode mode = ProgMode(int(target_[size_t(pG(VoiceMode))]));
        const int arpTarget = int(target_[size_t(pG(ArpTarget))]);
        for (int t = 0; t < kNumTimbres; ++t) {
            if (t == 1 && mode != ProgMode::Layer) continue;
            if (mode == ProgMode::Layer && !(arpTarget == 0 || arpTarget == t + 1)) continue;
            timbres_[size_t(t)].resetTimbreSyncLfos(pv1_.data());
        }
    }
    if (note >= 0 && note < 128 && !physicalDown_[size_t(note)]) { physicalDown_[size_t(note)] = true; ++physicalKeys_; }
    arp_.keyOn(note, vel);
    dispatchToTimbres(true, note, vel, false);
}

void Engine::noteOffInternal(int note) noexcept {
    if (note >= 0 && note < 128 && physicalDown_[size_t(note)]) { physicalDown_[size_t(note)] = false; --physicalKeys_; }
    arp_.keyOff(note);
    dispatchToTimbres(false, note, 0, false);
}

void Engine::handleMidi(const MidiEvent& e) noexcept {
    if (e.size < 1) return;
    const uint8_t st = e.data[0] & 0xF0;
    const int d1 = e.data[1] & 0x7F, d2 = e.data[2] & 0x7F;
    switch (st) {
        case 0x90:
            if (d2 > 0) noteOnInternal(d1, d2);
            else noteOffInternal(d1);
            break;
        case 0x80: noteOffInternal(d1); break;
        case 0xE0: {
            const int v = (d2 << 7) | d1;
            bendTarget_ = clampv(float(v - 8192) / 8192.0f, -1.0f, 1.0f);
            break;
        }
        case 0xB0:
            switch (d1) {
                case 1: modTarget_ = float(d2) / 127.0f; break;
                case 64:
                    if (target_[size_t(pG(Damper))] >= 0.5f) {
                        const bool down = d2 >= 64;
                        if (down != sustain_) {
                            sustain_ = down;
                            for (int t = 0; t < kNumTimbres; ++t) {
                                VoiceContext ctx = makeContext(t, 1);
                                timbres_[size_t(t)].setSustain(ctx, down);
                            }
                        }
                    }
                    break;
                case 120: // All Sound Off
                    for (auto& t : timbres_) t.allSoundOff();
                    arp_.allKeysOff();
                    physicalDown_.fill(false);
                    physicalKeys_ = 0;
                    break;
                case 121: // Reset All Controllers
                    bendTarget_ = 0.0f;
                    modTarget_ = 0.0f;
                    if (sustain_) {
                        sustain_ = false;
                        for (int t = 0; t < kNumTimbres; ++t) {
                            VoiceContext ctx = makeContext(t, 1);
                            timbres_[size_t(t)].setSustain(ctx, false);
                        }
                    }
                    break;
                case 123: case 124: case 125: case 126: case 127: // All Notes Off (+ mode messages) [MI]
                    for (auto& t : timbres_) t.allNotesOff();
                    arp_.allKeysOff();
                    sustain_ = false;
                    physicalDown_.fill(false);
                    physicalKeys_ = 0;
                    break;
                default: {
                    if (target_[size_t(pG(CcMap))] < 0.5f) break;
                    const ProgMode mode = ProgMode(int(target_[size_t(pG(VoiceMode))]));
                    CcTarget out[2];
                    int nt = 0;
                    if (d1 == 99) { nrpnMsb_ = d2; break; }
                    if (d1 == 98) { nrpnLsb_ = d2; break; }
                    if (d1 == 95) { timbreSelect_ = d2 == 0 ? 0 : (d2 == 1 ? 1 : 2); break; } // TIMBRE SELECT [DOC p.53]
                    if (d1 == 6) {
                        if (nrpnMsb_ >= 0 && nrpnLsb_ >= 0)
                            nt = HardwareCcMap::nrpn(nrpnMsb_, nrpnLsb_, d2, mode, timbreSelect_, target_.data(), out);
                    } else {
                        nt = HardwareCcMap::controlChange(d1, d2, mode, timbreSelect_, target_.data(), out);
                    }
                    for (int k = 0; k < nt; ++k) applyControllerTarget(out[k].param, out[k].value);
                    break;
                }
            }
            break;
        default: break;
    }
}

void Engine::applyControllerTarget(int param, float value) noexcept {
    setParam(param, value);
    const uint32_t w = ccWrite_.load(std::memory_order_relaxed);
    if (w - ccRead_.load(std::memory_order_acquire) < kCcQueue) { // drop when the consumer lags (engine already updated)
        ccQueue_[w & (kCcQueue - 1)] = { param, target_[size_t(param)] };
        ccWrite_.store(w + 1, std::memory_order_release);
    }
}

// ------------------------------------------------------------ helpers
double Engine::tempoBpm() const noexcept {
    const int clock = int(target_[size_t(pG(Clock))]);
    if (clock != 0 && transport_.valid && transport_.bpm > 0.0) return clampv(transport_.bpm, 20.0, 300.0);
    return double(target_[size_t(pG(ArpTempo))]);
}

ArpParams Engine::arpParams() const noexcept {
    ArpParams p;
    p.on = target_[size_t(pG(ArpOn))] >= 0.5f;
    p.tempo = target_[size_t(pG(ArpTempo))];
    p.resolution = int(target_[size_t(pG(ArpResolution))]);
    p.gate = target_[size_t(pG(ArpGate))];
    p.type = int(target_[size_t(pG(ArpType))]);
    p.range = int(target_[size_t(pG(ArpRange))]);
    p.latch = target_[size_t(pG(ArpLatch))] >= 0.5f;
    p.swing = target_[size_t(pG(ArpSwing))];
    p.keySync = target_[size_t(pG(ArpKeySync))] >= 0.5f;
    p.lastStep = int(target_[size_t(pG(ArpLastStep))]);
    for (int i = 0; i < 8; ++i) p.steps[size_t(i)] = target_[size_t(pG(GP(ArpStep1 + i)))] >= 0.5f;
    const int arpTarget = int(target_[size_t(pG(ArpTarget))]);
    const ProgMode mode = ProgMode(int(target_[size_t(pG(VoiceMode))]));
    int poly = budget_[0];
    if (mode == ProgMode::Layer) poly = arpTarget == 2 ? budget_[1] : (arpTarget == 1 ? budget_[0] : std::min(budget_[0], budget_[1]));
    p.triggerPolyphony = std::max(1, poly);
    return p;
}

ArpClock Engine::arpClock(int offsetInBlock) const noexcept {
    ArpClock c;
    const int clock = int(target_[size_t(pG(Clock))]);
    c.hostPlaying = transport_.playing;
    c.useHost = (clock != 0) && transport_.valid && transport_.playing;
    c.hostBpm = transport_.valid ? clampv(transport_.bpm, 20.0, 300.0) : 120.0;
    c.hostPpq = transport_.ppq + double(offsetInBlock) * (c.hostBpm / 60.0) / fs_;
    return c;
}

VoiceContext Engine::makeContext(int timbre, int n) noexcept {
    VoiceContext c;
    c.pv0 = pv0_.data();
    c.pv1 = pv1_.data();
    c.timbre = timbre;
    c.n = n;
    c.osFactor = osFactor_;
    c.fs = fs_;
    c.fsOs = fs_ * double(osFactor_);
    c.bend = bendBuf_.data();
    c.modWheel = modBuf_.data();
    c.in1Os = in1Os_.data();
    c.in2Os = in2Os_.data();
    c.tables = tables_;
    c.a4Hz = target_[size_t(pG(MasterTune))];
    c.masterTranspose = int(target_[size_t(pG(MasterTranspose))]);
    c.tempoBpm = tempoBpm();
    c.vocoderCarrier = ProgMode(int(target_[size_t(pG(VoiceMode))])) == ProgMode::Vocoder;
    c.outL = osL_.data();
    c.outR = osR_.data();
    return c;
}

float Engine::distortCarrier(float x) noexcept {
    x *= float(mapping::kDistortionDrive);
    const float d = x - vocDistPrev_;
    float y;
    if (std::fabs(d) > 1e-5f) y = (clipAD(x) - clipAD(vocDistPrev_)) / d;
    else y = clipF(0.5f * (x + vocDistPrev_));
    vocDistPrev_ = x;
    return y;
}

// ------------------------------------------------------------ processing
void Engine::process(float* outL, float* outR, const float* in1, const float* in2, int numSamples,
                     const MidiEvent* events, int numEvents, const TransportInfo& transport) noexcept {
    ScopedNoDenormals noDenormals;
    if (!prepared_) {
        std::memset(outL, 0, sizeof(float) * size_t(numSamples));
        std::memset(outR, 0, sizeof(float) * size_t(numSamples));
        return;
    }
    // wave-table handoff (hazard pointer: announce before use, re-check)
    const WaveTables* p;
    do {
        p = published_.load();
        inUse_.store(p);
    } while (p != published_.load());
    tables_ = p;

    // transport edges: on stop, the arpeggiator releases its notes
    transport_ = transport;
    if (wasPlaying_ && !transport.playing) {
        ArpEvent ev[16];
        const int ne = arp_.stop(ev, 16);
        for (int k = 0; k < ne; ++k) dispatchToTimbres(false, ev[k].note, 0, true);
    }
    wasPlaying_ = transport.playing;

    applyOversamplingSetting();
    updateAllocation();

    // arpeggiator on/off transitions
    const bool arpOn = target_[size_t(pG(ArpOn))] >= 0.5f;
    if (arpOn != arpWasOn_) {
        if (arpOn) {
            // keyboard notes that were sounding directly are released; the arpeggio takes over
            for (auto& t : timbres_) t.allNotesOff();
        } else {
            ArpEvent ev[16];
            const int ne = arp_.stop(ev, 16);
            for (int k = 0; k < ne; ++k) {
                for (auto& t : timbres_) {
                    VoiceContext ctx = makeContext(int(&t - timbres_.data()), 1);
                    t.noteOff(ctx, ev[k].note);
                }
            }
        }
        arpWasOn_ = arpOn;
    }

    int pos = 0, ei = 0;
    ArpEvent arpEv[32];
    while (pos < numSamples) {
        while (ei < numEvents && events[ei].offset <= pos) handleMidi(events[ei++]);
        int end = numSamples;
        if (ei < numEvents) end = std::min(end, std::max(pos + 1, events[ei].offset));
        // arpeggiator: fire due events, then limit the segment to the next one
        const ArpParams ap = arpParams();
        ArpClock ac = arpClock(pos);
        int until = arp_.samplesUntilNextEvent(ap, ac);
        if (until == 0) {
            const int ne = arp_.fire(ap, ac, arpEv, 32);
            for (int k = 0; k < ne; ++k) dispatchToTimbres(arpEv[k].on, arpEv[k].note, arpEv[k].velocity, true);
            until = arp_.samplesUntilNextEvent(ap, ac);
            if (until == 0) until = 1;
        }
        end = std::min(end, pos + until);
        end = std::min(end, pos + kChunk);
        const int n = end - pos;
        blockOffset_ = pos;
        renderChunk(outL + pos, outR + pos, in1 ? in1 + pos : nullptr, in2 ? in2 + pos : nullptr, n);
        arp_.advance(n, ap, ac);
        pos = end;
    }
    while (ei < numEvents) handleMidi(events[ei++]); // events at/after the block end

    int active = 0;
    for (const auto& v : voices_) active += v.isActive() ? 1 : 0;
    uiActiveVoices_.store(active, std::memory_order_relaxed);
    uiArpStep_.store(arp_.anyNoteSounding() ? arp_.currentStep() : -1, std::memory_order_relaxed);
    const auto env = vocoder_.envelopes();
    for (int b = 0; b < Vocoder::kBands; ++b) uiVocEnv_[size_t(b)].store(env[size_t(b)], std::memory_order_relaxed);
    uiTempo_.store(tempoBpm(), std::memory_order_relaxed);
}

void Engine::renderChunk(float* outL, float* outR, const float* in1, const float* in2, int n) noexcept {
    // --- parameters: chunk start = previous end, advance smoothers
    pv0_ = pv1_;
    for (int i = 0; i < kNumParams; ++i) {
        if (smoothed_[size_t(i)]) pv1_[size_t(i)] = smooth_[size_t(i)].advance(n);
        else pv1_[size_t(i)] = target_[size_t(i)];
    }
    // --- controllers: short smoothing (~3 ms) to avoid zipper noise on bend / mod wheel
    const float cc = onePoleCoef(0.003, fs_);
    for (int i = 0; i < n; ++i) {
        bendCur_ += (bendTarget_ - bendCur_) * cc;
        modCur_ += (modTarget_ - modCur_) * cc;
        bendBuf_[size_t(i)] = bendCur_;
        modBuf_[size_t(i)] = modCur_;
    }
    const int os = osFactor_;
    const int nOs = n * os;
    std::fill(osL_.begin(), osL_.begin() + nOs, 0.0f);
    std::fill(osR_.begin(), osR_.begin() + nOs, 0.0f);

    // --- external input: aligned copy (delayed by the reported latency) for direct paths
    const int lat = os_.decimationLatency();
    const int dmask = int(inDelay_[0].size()) - 1;
    for (int i = 0; i < n; ++i) {
        const float a = in1 ? in1[i] : 0.0f;
        const float b = in2 ? in2[i] : 0.0f;
        inDelay_[0][size_t(inDelayPos_)] = a;
        inDelay_[1][size_t(inDelayPos_)] = b;
        const int rp = (inDelayPos_ - lat) & dmask;
        in1Del_[size_t(i)] = inDelay_[0][size_t(rp)];
        in2Del_[size_t(i)] = inDelay_[1][size_t(rp)];
        inDelayPos_ = (inDelayPos_ + 1) & dmask;
    }
    // --- OSC1 "Audio In" needs the input at the oscillator rate
    const ProgMode mode = ProgMode(int(pv1_[size_t(pG(VoiceMode))]));
    bool needInOs = int(pv1_[size_t(pT(0, Osc1Wave))]) == int(Wave1::AudioIn)
                    || (mode == ProgMode::Layer && int(pv1_[size_t(pT(1, Osc1Wave))]) == int(Wave1::AudioIn));
    if (needInOs && (in1 || in2)) {
        // reuse scratch for missing channels
        const float* a = in1 ? in1 : scratch_.data();
        const float* b = in2 ? in2 : scratch_.data();
        if (!in1 || !in2) std::fill(scratch_.begin(), scratch_.begin() + n, 0.0f);
        os_.upsample(a, b, in1Os_.data(), in2Os_.data(), n);
    } else {
        std::fill(in1Os_.begin(), in1Os_.begin() + nOs, 0.0f);
        std::fill(in2Os_.begin(), in2Os_.begin() + nOs, 0.0f);
    }

    // --- voices
    const double bpm = tempoBpm();
    for (int t = 0; t < kNumTimbres; ++t)
        if (budget_[size_t(t)] > 0) timbres_[size_t(t)].advanceReference(pv1_.data(), n, bpm);
    VoiceContext ctx[kNumTimbres] = { makeContext(0, n), makeContext(1, n) };
    for (auto& v : voices_)
        if (v.isActive()) v.render(ctx[v.timbre()]);
    for (auto& v : tails_)
        if (v.isActive()) v.render(ctx[v.timbre()]);

    // --- back to the host rate
    os_.downsample(osL_.data(), osR_.data(), baseL_.data(), baseR_.data(), n);
    const float vg = float(mapping::kVoiceOutputGain);
    for (int i = 0; i < n; ++i) { baseL_[size_t(i)] *= vg; baseR_[size_t(i)] *= vg; }

    // --- vocoder program
    if (mode == ProgMode::Vocoder) {
        const float inst = float(mapping::levelToGain(pv1_[size_t(pG(VocMixInst))]));
        const bool dist = pv1_[size_t(pG(VocDistortion))] >= 0.5f;
        for (int i = 0; i < n; ++i) {
            float c = baseL_[size_t(i)] + in2Del_[size_t(i)] * inst;
            if (dist) c = distortCarrier(c);
            carrier_[size_t(i)] = c;
        }
        VocoderParams vp;
        vp.gateSense = pv1_[size_t(pG(VocGateSense))];
        vp.threshold = pv1_[size_t(pG(VocThreshold))];
        vp.hpfLevel = pv1_[size_t(pG(VocHpfLevel))];
        vp.hpfGateEnabled = pv1_[size_t(pG(VocHpfGate))] >= 0.5f;
        vp.formantShiftChoice = int(pv1_[size_t(pG(VocFormantShift))]);
        vp.cutoff = pv1_[size_t(pG(VocCutoff))];
        vp.resonance = pv1_[size_t(pG(VocResonance))];
        vp.efSense = pv1_[size_t(pG(VocEfSense))];
        vp.directLevel = pv1_[size_t(pG(VocDirectLevel))];
        for (int c = 0; c < 8; ++c) {
            vp.chLevel[size_t(c)] = pv1_[size_t(pG(GP(VocCh1Level + c)))];
            vp.chPan[size_t(c)] = pv1_[size_t(pG(GP(VocCh1Pan + c)))];
        }
        // FC MOD source from the most recently played carrier voice
        float src = 0.0f;
        const Voice* lead = timbres_[0].leadVoice();
        const VoiceControlSnapshot s = lead ? lead->snapshot() : VoiceControlSnapshot {};
        switch (int(pv1_[size_t(pG(VocFcModSrc))])) {
            case 0: src = s.ampEg; break;
            case 1: src = s.lfo1; break;
            case 2: src = s.lfo2; break;
            case 3: src = s.velocity; break;
            case 4: src = s.kbd; break;
            case 5: src = bendCur_; break;
            case 6: src = modCur_; break;
            default: break;
        }
        const float fc = float(mapping::vocFcModSteps(src, pv1_[size_t(pG(VocFcModInt))]));
        const bool keyOn = timbres_[0].anyKeyHeld() || arp_.anyNoteSounding();
        vocoder_.process(carrier_.data(), in1Del_.data(), baseL_.data(), baseR_.data(), n, vp, fc, keyOn);
    }

    // --- effects: MOD FX -> DELAY -> EQ [DOC p.39]
    float* L = baseL_.data();
    float* R = baseR_.data();
    modFx_.process(L, R, n, int(pv1_[size_t(pG(ModFxType))]), pv1_[size_t(pG(ModFxSpeed))], pv1_[size_t(pG(ModFxDepth))]);
    double dtime;
    if (pv1_[size_t(pG(DelaySync))] >= 0.5f) dtime = mapping::delaySyncNoteBeats(int(pv1_[size_t(pG(DelaySyncNote))])) * 60.0 / bpm;
    else dtime = mapping::delayTimeSeconds(pv1_[size_t(pG(DelayTime))]);
    delay_.process(L, R, n, int(pv1_[size_t(pG(DelayType))]), dtime, pv1_[size_t(pG(DelayDepth))]);
    eq_.setParams(mapping::eqLowFreqHz(int(pv1_[size_t(pG(EqLowFreq))])), pv1_[size_t(pG(EqLowGain))],
                  mapping::eqHighFreqHz(int(pv1_[size_t(pG(EqHiFreq))])), pv1_[size_t(pG(EqHiGain))]);
    eq_.process(L, R, n);

    // --- AUDIO IN THRU [DOC p.47] and master volume
    const bool thru = pv1_[size_t(pG(AudioInThru))] >= 0.5f;
    masterGain_.setTarget(dbToGain(pv1_[size_t(pG(MasterVolume))]));
    bool bad = false;
    for (int i = 0; i < n; ++i) {
        const float g = masterGain_.next();
        float l = L[i], r = R[i];
        if (thru) { l += in1Del_[size_t(i)]; r += in2Del_[size_t(i)]; }
        l *= g;
        r *= g;
        // DC blocker: y = x - x1 + R y1
        const float yl = l - dcX_[0] + dcR_ * dcY_[0];
        const float yr = r - dcX_[1] + dcR_ * dcY_[1];
        dcX_[0] = l; dcX_[1] = r;
        // settle to exact zero once the input is silent and the tail is below -180 dB
        dcY_[0] = (l == 0.0f && std::fabs(yl) < 1e-9f) ? 0.0f : sanitize(yl);
        dcY_[1] = (r == 0.0f && std::fabs(yr) < 1e-9f) ? 0.0f : sanitize(yr);
        l = dcY_[0];
        r = dcY_[1];
        if (!isFiniteF(l) || !isFiniteF(r)) { bad = true; l = r = 0.0f; }
        outL[i] = l;
        outR[i] = r;
    }
    if (bad) {
        // Non-finite output: silence the chunk and reset every state that could hold it.
        nanEvents_.fetch_add(1, std::memory_order_relaxed);
        for (auto& v : voices_) v.kill();
        for (auto& v : tails_) v.kill();
        modFx_.reset();
        delay_.reset();
        eq_.reset();
        vocoder_.reset();
        os_.reset();
        dcX_[0] = dcX_[1] = dcY_[0] = dcY_[1] = 0.0f;
        for (int i = 0; i < n; ++i) outL[i] = outR[i] = 0.0f;
    }
}

} // namespace kestrel
