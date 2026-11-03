#include "voice/Voice.h"

#include <cmath>
#include <limits>

#include "params/Mapping.h"

namespace kestrel {

namespace {

// First-order antiderivative anti-aliased soft clipper (distortion ON).
// Static odd-symmetric polynomial with a hard ceiling. [ENG] — the hardware's
// distortion curve is undocumented; this is NOT presented as a circuit model.
inline float clipF(float x) noexcept {
    if (x >= 1.0f) return 1.0f;
    if (x <= -1.0f) return -1.0f;
    return 1.5f * x - 0.5f * x * x * x;
}
inline float clipAD(float x) noexcept { // antiderivative of clipF
    const float a = std::fabs(x);
    if (a >= 1.0f) return a - 0.375f;
    const float x2 = x * x;
    return 0.75f * x2 - 0.125f * x2 * x2;
}
inline float distortADAA(float x, float& prev) noexcept {
    const float d = x - prev;
    float y;
    if (std::fabs(d) > 1e-5f) y = (clipAD(x) - clipAD(prev)) / d;
    else y = clipF(0.5f * (x + prev));
    prev = x;
    return y;
}

inline void panGainsFast(float pan, float& gl, float& gr) noexcept {
    // equal-power, normalised to unity at centre; uses the sine LUT
    const double p = (double(clampv(pan, -63.0f, 63.0f)) + 63.0) / 126.0; // 0..1
    const SineLut& s = sineLut();
    gl = float(1.41421356 * s(0.25 + 0.25 * p)); // cos(p*pi/2)
    gr = float(1.41421356 * s(0.25 * p));        // sin(p*pi/2)
}

inline double lfoRateHz(const float* pv, int tb, int lfo, float freqUnits, double bpm) noexcept {
    const TP sync = lfo == 0 ? Lfo1TempoSync : Lfo2TempoSync;
    if (pv[tb + sync] >= 0.5f) {
        const TP note = lfo == 0 ? Lfo1SyncNote : Lfo2SyncNote;
        const double beats = mapping::lfoSyncNoteBeats(int(pv[tb + note]));
        return (bpm / 60.0) / beats;
    }
    return mapping::lfoFreqHz(freqUnits);
}

} // namespace

void Voice::prepare(double fs, double fsOs, int osFactor, uint32_t seed) {
    fs_ = fs;
    fsOs_ = fsOs;
    osFactor_ = osFactor;
    osc1_.prepare(fsOs, seed * 2654435761u + 17u);
    // Free-running oscillators: deterministic, voice-dependent initial phases [ENG].
    osc1_.reset(double((seed * 0.2718281828) - std::floor(seed * 0.2718281828)));
    osc2_.reset(double((seed * 0.5772156649) - std::floor(seed * 0.5772156649)));
    filter_.reset();
    eg1_.setSampleRate(fs);
    eg2_.setSampleRate(fs);
    lfo_[0].setSampleRate(fs);
    lfo_[1].setSampleRate(fs);
    noiseRng_.seed(seed * 747796405u + 2891336453u);
    active_ = gate_ = fading_ = false;
    eg1_.kill();
    eg2_.kill();
}

void Voice::configureEgs(const float* pv, int tb, bool vocoder) noexcept {
    using namespace mapping;
    if (!vocoder)
        eg1_.setParams(egTimeSeconds(pv[tb + FegAttack]), egTimeSeconds(pv[tb + FegDecay]),
                       egSustainLevel(pv[tb + FegSustain]), egTimeSeconds(pv[tb + FegRelease]));
    else
        eg1_.setParams(0.0, 0.0, 1.0, 0.0); // vocoder data: EG1 fixed A0 D0 S127 R0 (MIDI imp. TABLE 3)
    eg2_.setParams(egTimeSeconds(pv[tb + AegAttack]), egTimeSeconds(pv[tb + AegDecay]),
                   egSustainLevel(pv[tb + AegSustain]), egTimeSeconds(pv[tb + AegRelease]));
}

void Voice::start(const VoiceContext& ctx, int note, int velocity, double detuneCents, bool resetEg1, bool resetEg2,
                  bool retriggerLfo, const Lfo* lfoRefs, double glideFromPitch, uint64_t age) noexcept {
    const bool wasActive = active_;
    timbre_ = ctx.timbre;
    note_ = note;
    velocity_ = velocity;
    age_ = age;
    detuneCents_ = detuneCents;
    targetPitch_ = double(note);
    glidePitch_ = std::isnan(glideFromPitch) ? double(note) : glideFromPitch;
    const int tb = ctx.timbre * TP_COUNT;
    configureEgs(ctx.pv1, tb, ctx.vocoderCarrier);
    eg1_.noteOn(resetEg1 || !wasActive);
    eg2_.noteOn(resetEg2 || !wasActive);
    for (int i = 0; i < 2; ++i) {
        const TP ks = i == 0 ? Lfo1KeySync : Lfo2KeySync;
        const int mode = int(ctx.pv1[tb + ks]);
        if (mode == 2) { // Voice
            if (retriggerLfo || !wasActive) lfo_[i].resetPhase();
        } else if (lfoRefs != nullptr && (retriggerLfo || !wasActive)) {
            lfo_[i] = lfoRefs[i]; // Off / Timbre: follow the timbre's reference phase
        }
    }
    if (wasActive && resetEg2) {
        // the old sound was handed to a fade tail; the new note starts from silence
        prevAmp_ = 0.0f;
        distPrev_ = 0.0f;
    }
    if (!wasActive) {
        filter_.reset();
        filter_.seed();
        prevAmp_ = 0.0f;
        distPrev_ = 0.0f;
        firstSample_ = true;
        lfo2FreqMod_ = 0.0f;
    }
    active_ = true;
    gate_ = true;
    fading_ = false;
    fadeGain_ = 1.0f;
    fadeStep_ = 0.0f;
}

void Voice::legato(const VoiceContext& ctx, int note, int velocity, bool retrigger, bool resetEg1, bool resetEg2,
                   const Lfo* lfoRefs, uint64_t age) noexcept {
    note_ = note;
    velocity_ = velocity;
    age_ = age;
    targetPitch_ = double(note);
    gate_ = true;
    if (retrigger) {
        const int tb = ctx.timbre * TP_COUNT;
        configureEgs(ctx.pv1, tb, ctx.vocoderCarrier);
        eg1_.noteOn(resetEg1);
        eg2_.noteOn(resetEg2);
        for (int i = 0; i < 2; ++i) {
            const TP ks = i == 0 ? Lfo1KeySync : Lfo2KeySync;
            const int mode = int(ctx.pv1[tb + ks]);
            if (mode == 2) lfo_[i].resetPhase();
            else if (lfoRefs != nullptr && mode == 1) lfo_[i] = lfoRefs[i];
        }
    } else if (eg2_.stage() == Envelope::Stage::Release || !eg2_.isActive()) {
        // a sustained/held legato voice that had been released: re-open the gate
        eg1_.noteOn(false);
        eg2_.noteOn(false);
    }
}

void Voice::release() noexcept {
    if (!active_) return;
    gate_ = false;
    eg1_.noteOff();
    eg2_.noteOff();
}

void Voice::kill() noexcept {
    active_ = gate_ = fading_ = false;
    eg1_.kill();
    eg2_.kill();
}

void Voice::beginFadeOut(double seconds) noexcept {
    fading_ = true;
    gate_ = false;
    const double n = std::max(1.0, seconds * fs_);
    fadeStep_ = float(fadeGain_ / n);
}

bool Voice::render(const VoiceContext& ctx) noexcept {
    if (!active_) return false;
    using namespace mapping;
    const int tb = ctx.timbre * TP_COUNT;
    const float* A = ctx.pv0 + tb;
    const float* B = ctx.pv1 + tb;
    const float* G0 = ctx.pv0 + pG(GP(0));
    const float* G1 = ctx.pv1 + pG(GP(0));
    const int n = ctx.n;
    const int os = ctx.osFactor;
    const bool voc = ctx.vocoderCarrier;
    const float invN = 1.0f / float(n);

    configureEgs(ctx.pv1, tb, voc);

    // discrete parameters (take chunk-end values)
    const Wave1 wave1 = Wave1(int(B[Osc1Wave]));
    const int wave2 = int(B[Osc2Wave]);
    const int oscMod = int(B[Osc2Mod]);
    const bool ring = (oscMod == 1 || oscMod == 3) && !voc;
    const bool sync = (oscMod == 2 || oscMod == 3) && !voc;
    const FilterKind ftype = FilterKind(int(B[FilterType]));
    const bool distOn = !voc && B[Distortion] >= 0.5f;
    const int dwgsIdx = int(B[Osc1Dwgs]) - 1;
    const Lfo::Shape sh1 = Lfo::shapeFor(0, int(B[Lfo1Wave]));
    const Lfo::Shape sh2 = Lfo::shapeFor(1, int(B[Lfo2Wave]));
    const bool lfo2Sync = B[Lfo2TempoSync] >= 0.5f;
    const double portaTau = portamentoTau(B[Portamento]);
    const float portaCoef = portaTau > 0.0 ? onePoleCoef(portaTau, fs_) : 1.0f;
    const int semis2 = int(B[Osc2Semitone]);
    const double transpose = double(B[Transpose]) + double(ctx.masterTranspose);
    const int bendRange = int(B[BendRange]);
    const float vel01 = float(velocity_) / 127.0f;

    // patch routing (synth only; "Virtual Patches are not available" in vocoder programs)
    int pSrc[4], pDst[4];
    float pInt0[4], pInt1[4];
    int numPatches = 0;
    if (!voc) {
        const TP srcs[4] = { P1Src, P2Src, P3Src, P4Src };
        const TP dsts[4] = { P1Dst, P2Dst, P3Dst, P4Dst };
        const TP ints[4] = { P1Int, P2Int, P3Int, P4Int };
        for (int k = 0; k < 4; ++k) {
            if (A[ints[k]] == 0.0f && B[ints[k]] == 0.0f) continue;
            pSrc[numPatches] = int(B[srcs[k]]);
            pDst[numPatches] = int(B[dsts[k]]);
            pInt0[numPatches] = A[ints[k]];
            pInt1[numPatches] = B[ints[k]];
            ++numPatches;
        }
    }

    lfo_[0].setFrequency(lfoRateHz(ctx.pv1, tb, 0, B[Lfo1Freq], ctx.tempoBpm));

    Osc1Input oin;
    oin.wave = wave1;
    oin.dwgsIndex0 = dwgsIdx;
    oin.vocoderProgram = voc;
    oin.fsOs = fsOs_;
    oin.osFactor = os;
    osc1_.setTables(ctx.tables);

    float* outL = ctx.outL;
    float* outR = ctx.outR;
    const float invOs = 1.0f / float(os);

    for (int i = 0; i < n; ++i) {
        const float t = float(i + 1) * invN;
        auto P = [&](TP p) { return A[p] + (B[p] - A[p]) * t; };
        auto PG = [&](GP p) { return G0[p] + (G1[p] - G0[p]) * t; };

        // ---- modulators
        const float l1 = lfo_[0].process(sh1);
        const float l2 = lfo_[1].process(sh2);
        const float e1 = eg1_.process();
        const float e2 = eg2_.process();

        glidePitch_ += (targetPitch_ - glidePitch_) * double(portaCoef);
        const float bend = ctx.bend[i];
        const float modw = ctx.modWheel[i];
        // keyboard track follows bend + transpose, not vibrato / patch [DOC p.25]
        const double kbdNote = glidePitch_ + transpose + double(bend) * double(bendRange);
        const float kbdSrc = clampv(float((kbdNote - 60.0) / 64.0), -1.0f, 1.0f);

        float dPitchCents = 0.0f, dTune2 = 0.0f, dCtrl1 = 0.0f, dNoise = 0.0f, dCut = 0.0f, dAmp = 0.0f, dPan = 0.0f, dLfo2 = 0.0f;
        if (numPatches > 0) {
            const float srcv[8] = { e1, e2, l1, l2, vel01, kbdSrc, bend, modw };
            for (int k = 0; k < numPatches; ++k) {
                const float intensity = pInt0[k] + (pInt1[k] - pInt0[k]) * t;
                const float v = srcv[pSrc[k]] * intensity; // -63..63
                switch (PatchDst(pDst[k])) {
                    case PatchDst::Pitch: dPitchCents += float(pitchModCents(v)); break;
                    case PatchDst::Osc2Tune: dTune2 += v; break;
                    case PatchDst::Osc1Ctrl1: dCtrl1 += v * (127.0f / 63.0f); break;
                    case PatchDst::NoiseLevel: dNoise += v * (127.0f / 63.0f); break;
                    case PatchDst::Cutoff: dCut += v * 2.0f; break;
                    case PatchDst::Amp: dAmp += v * (127.0f / 63.0f); break;
                    case PatchDst::Pan: dPan += v; break;
                    case PatchDst::Lfo2Freq: dLfo2 += v * (127.0f / 63.0f); break;
                }
            }
        }
        // LFO2 rate (patch modulation ignored when tempo-synced [DOC p.29/30])
        if (lfo2Sync) lfo_[1].setFrequency(lfoRateHz(ctx.pv1, tb, 1, 0.0f, ctx.tempoBpm));
        else lfo_[1].setFrequency(lfoFreqHz(clampv(P(Lfo2Freq) + dLfo2, 0.0f, 127.0f)));

        // vibrato: LFO2 x MOD wheel x VIBRATO INT [DOC p.17, p.53]
        const float vib = float(pitchModCents(double(P(VibratoInt)) * double(modw))) * l2;

        const double pitch = glidePitch_ + transpose + double(P(Tune)) * 0.01 + double(bend) * double(bendRange)
                             + double(dPitchCents + vib) * 0.01 + detuneCents_ * 0.01;
        const double f1 = std::min(noteToHz(pitch, ctx.a4Hz), 0.45 * fsOs_);
        const double tune2 = osc2TuneCents(clampv(double(P(Osc2Tune)) + double(dTune2), -63.0, 63.0));
        const double f2 = std::min(f1 * std::exp2((double(semis2) + tune2 * 0.01) / 12.0), 0.45 * fsOs_);
        const double dt1 = f1 / fsOs_;
        const double dt2 = f2 / fsOs_;

        // OSC1 control 1 (+ LFO1 via CONTROL 2 [DOC p.18], + patch)
        const float ctrl2 = P(Osc1Ctrl2);
        float ctrl1 = P(Osc1Ctrl1) + dCtrl1;
        if (wave1 != Wave1::Dwgs && wave1 != Wave1::Noise) ctrl1 += l1 * float(ctrl2Depth(ctrl2));
        oin.ctrl1 = clampv(ctrl1, 0.0f, 127.0f);
        oin.noiseResonance = (wave1 == Wave1::Noise) ? clampv(ctrl2, 0.0f, 127.0f) : 0.0f;
        oin.keyHz = f1;

        // mixer
        float g1, g2, gn;
        if (!voc) {
            g1 = float(levelToGain(P(MixOsc1)));
            g2 = float(levelToGain(P(MixOsc2)));
            gn = float(levelToGain(clampv(P(MixNoise) + dNoise, 0.0f, 127.0f)));
        } else {
            g1 = float(levelToGain(PG(VocMixOsc1)));
            g2 = 0.0f;
            gn = float(levelToGain(PG(VocMixNoise)));
        }

        // filter (synth only)
        if (!voc) {
            const double steps = double(P(Cutoff)) + filterEgSteps(e1, P(FilterEgInt))
                                 + filterKeyTrackSteps(kbdNote - 60.0, P(FilterKeyTrack))
                                 + filterVelSenseSteps(vel01, P(FilterVelSense)) + double(dCut);
            filter_.setCoefficients(ftype, cutoffStepsToHz(steps), P(Resonance), fsOs_);
        }

        // amp: VCA (EG2, key track, velocity sense) -> [distortion] -> LEVEL -> PAN
        float preGain, level, pan;
        if (!voc) {
            preGain = e2 * float(ampKeyTrackGain(kbdNote - 60.0, P(AmpKeyTrack)) * ampVelSenseGain(vel01, P(AmpVelSense)));
            level = float(levelToGain(clampv(P(AmpLevel) + dAmp, 0.0f, 127.0f)));
            pan = clampv(P(AmpPan) + dPan, -63.0f, 63.0f);
        } else {
            preGain = e2 * float(ampKeyTrackGain(kbdNote - 60.0, PG(VocKeyTrack)) * ampVelSenseGain(vel01, PG(VocVelSense)));
            level = float(levelToGain(PG(VocLevel)));
            pan = 0.0f;
        }
        float gl = 1.0f, gr = 1.0f;
        if (!voc) panGainsFast(pan, gl, gr);
        const float postGain = level * fadeGain_;
        if (fading_) {
            fadeGain_ -= fadeStep_;
            if (fadeGain_ <= 0.0f) { fadeGain_ = 0.0f; kill(); }
        }
        if (firstSample_) { prevAmp_ = preGain; prevPanL_ = gl * postGain; prevPanR_ = gr * postGain; firstSample_ = false; }
        const float curL = gl * postGain, curR = gr * postGain;

        // ---- oscillator-rate inner loop
        for (int j = 0; j < os; ++j) {
            const int k = i * os + j;
            const float tj = float(j + 1) * invOs;
            float wrapD = 0.0f;
            const bool wrapped = osc1_.advance(dt1, wrapD);
            float o2 = 0.0f;
            if (!voc) o2 = osc2_.process(wave2, dt2, sync, wrapped, wrapD);
            oin.osc2Sample = o2;
            oin.dt = dt1;
            oin.in1 = ctx.in1Os != nullptr ? ctx.in1Os[k] : 0.0f;
            oin.in2 = ctx.in2Os != nullptr ? ctx.in2Os[k] : 0.0f;
            const float o1 = osc1_.render(oin);
            const float osc2Out = ring ? o1 * o2 : o2;
            const float noise = noiseRng_.bipolar();
            float x = o1 * g1 + osc2Out * g2 + noise * gn;
            if (!voc) x = filter_.process(x);
            const float amp = prevAmp_ + (preGain - prevAmp_) * tj;
            x *= amp;
            if (distOn) x = distortADAA(x * float(kDistortionDrive), distPrev_);
            const float pl = prevPanL_ + (curL - prevPanL_) * tj;
            const float pr = prevPanR_ + (curR - prevPanR_) * tj;
            outL[k] += x * pl;
            outR[k] += x * pr;
        }
        prevAmp_ = preGain;
        prevPanL_ = curL;
        prevPanR_ = curR;

        snap_.ampEg = e2;
        snap_.lfo1 = l1;
        snap_.lfo2 = l2;
        snap_.velocity = vel01;
        snap_.kbd = kbdSrc;

        if (!active_) break; // fade finished
        if (!eg2_.isActive()) { active_ = false; gate_ = false; break; }
    }

    if (filter_.sanitize()) { /* state was non-finite: filter reset, voice continues */ }
    return active_;
}

} // namespace kestrel
