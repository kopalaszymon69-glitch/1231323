#include "osc/Oscillators.h"

#include <cmath>

#include "params/Mapping.h"

namespace kestrel {

namespace {

inline double fracd(double x) noexcept { return x - std::floor(x); }

inline float triValue(double p) noexcept { // p in [0,1), tri(0)=0 rising, peak +1 at 0.25
    if (p < 0.25) return float(4.0 * p);
    if (p < 0.75) return float(2.0 - 4.0 * p);
    return float(4.0 * p - 4.0);
}

inline float foldValue(float x) noexcept {
    float m = std::fmod(x + 1.0f, 4.0f);
    if (m < 0.0f) m += 4.0f;
    return 1.0f - std::fabs(m - 2.0f);
}

inline float foldSlope(float x) noexcept { // derivative of foldValue (+1 / -1)
    float m = std::fmod(x + 1.0f, 4.0f);
    if (m < 0.0f) m += 4.0f;
    return m < 2.0f ? 1.0f : -1.0f;
}

// Adds BLAMP corrections for every odd-integer crossing of a linear segment u(a)->u(b)
// of the fold input. pa/pb are unwrapped phases, p1 is the phase at sample n+1.
inline void foldCrossings(OscCorrector& c, double pa, double pb, float ua, float ub, double p1, double dt) noexcept {
    if (ua == ub || pb <= pa) return;
    const float lo = std::min(ua, ub), hi = std::max(ua, ub);
    const float dir = ub > ua ? 1.0f : -1.0f;
    const float duPerSample = float((double(ub) - double(ua)) / ((pb - pa) / dt));
    // odd integers strictly inside (lo, hi)
    int k = int(std::floor(lo));
    if ((k & 1) == 0) ++k;          // first odd >= floor(lo)
    if (float(k) <= lo) k += 2;
    for (; float(k) < hi; k += 2) {
        const double pk = pa + (double(k) - double(ua)) / (double(ub) - double(ua)) * (pb - pa);
        const float d = float(clampv((p1 - pk) / dt, 0.0, 1.0));
        const float sBefore = foldSlope(float(k) - 0.5f * dir) * duPerSample;
        c.addCorner(-2.0f * sBefore, d);
    }
}

} // namespace

// =================================================================== OSC1
void Osc1::prepare(double fsOs, uint32_t seed) {
    fs_ = fsOs;
    rng_.seed(seed);
    reset(0.0);
}

void Osc1::reset(double startPhase) {
    phase_ = prevPhase_ = ppPhase_ = fracd(startPhase);
    wrapped_ = false;
    wrapD_ = 0.0f;
    corr_.reset();
    held_.reset();
    sawOffset_ = 0.0;
    pulseWidth_ = 0.5;
    prevFoldIn_ = 0.0f;
    tablePhase_[0] = tablePhase_[1] = phase_;
    for (size_t k = 0; k < shepardPhase_.size(); ++k) shepardPhase_[k] = 0.0;
    noiseFilter_.reset();
    prevNoiseOut_ = 0.0f;
}

bool Osc1::advance(double dt, float& d) noexcept {
    dt = clampv(dt, 0.0, 0.5);
    ppPhase_ = prevPhase_;
    prevPhase_ = phase_;
    phase_ += dt;
    wrapped_ = false;
    if (phase_ >= 1.0) {
        phase_ -= 1.0;
        wrapped_ = true;
        wrapD_ = dt > 0.0 ? float(clampv(phase_ / dt, 1e-9, 1.0)) : 1.0f;
    }
    d = wrapD_;
    return wrapped_;
}

float Osc1::render(const Osc1Input& in) noexcept {
    if (in.wave != lastWave_) {
        corr_.reset();
        held_.reset();
        lastWave_ = in.wave;
        sawOffset_ = mapping::sawPhaseOffset(in.ctrl1);
        pulseWidth_ = mapping::pulseWidth(in.ctrl1);
        tablePhase_[0] = ppPhase_;
    }
    switch (in.wave) {
        case Wave1::Saw: return renderSaw(in);
        case Wave1::Square: return renderPulse(in);
        case Wave1::Triangle: return renderTriangle(in);
        case Wave1::Sine: return renderSine(in);
        case Wave1::Vox: return renderTable(in, true);
        case Wave1::Dwgs:
            if (in.dwgsIndex0 == dwgs::kEndlessIndex0 && tables_ != nullptr && !tables_->dwgsUserSupplied[size_t(dwgs::kEndlessIndex0)])
                return renderEndless(in);
            return renderTable(in, false);
        case Wave1::Noise: return renderNoise(in);
        case Wave1::AudioIn: {
            const float b = float(mapping::audioInBalanceIn1(in.ctrl1));
            return in.in1 * b + in.in2 * (1.0f - b);
        }
    }
    return 0.0f;
}

// Two half-amplitude saws, the second offset by 0..180 degrees (fig 3-1).
float Osc1::renderSaw(const Osc1Input& in) noexcept {
    const double dt = phase_ - prevPhase_ + (wrapped_ ? 1.0 : 0.0);
    const double off0 = sawOffset_;
    const double off1 = mapping::sawPhaseOffset(in.ctrl1);
    sawOffset_ = off1;
    // saw A (master phase)
    if (wrapped_) corr_.addStep(-1.0f, wrapD_);
    // saw B: unwrapped phase prevPhase_+off0 -> prevPhase_+dt+off1
    const double b0 = prevPhase_ + off0;
    const double b1 = prevPhase_ + dt + off1;
    const double fb0 = std::floor(b0), fb1 = std::floor(b1);
    const double delta = b1 - b0;
    if (fb1 > fb0 && delta > 0.0) {
        const double since = b1 - fb1; // phase since the wrap
        corr_.addStep(-1.0f, float(clampv(since / delta, 1e-9, 1.0)));
    } else if (fb1 < fb0 && delta < 0.0) {
        const double since = fb0 - b1;
        corr_.addStep(1.0f, float(clampv(since / -delta, 1e-9, 1.0)));
    }
    const float naive = 0.5f * (float(2.0 * phase_ - 1.0) + float(2.0 * fracd(phase_ + off1) - 1.0));
    return held_.push(naive, corr_);
}

// DC-compensated pulse: width 50% .. 0% (silent at 0%) (fig 3-2).
float Osc1::renderPulse(const Osc1Input& in) noexcept {
    const double w0 = pulseWidth_;
    const double w1 = mapping::pulseWidth(in.ctrl1);
    pulseWidth_ = w1;
    const double p0 = prevPhase_;
    const double p1 = phase_ + (wrapped_ ? 1.0 : 0.0);
    // rising edge at the wrap
    if (wrapped_) corr_.addStep(2.0f, wrapD_);
    // falling edges at unwrapped positions w and 1+w
    for (int k = 0; k < 2; ++k) {
        const double e0 = p0 - (w0 + k);
        const double e1 = p1 - (w1 + k);
        if (e0 < 0.0 && e1 >= 0.0) corr_.addStep(-2.0f, float(clampv(e1 / (e1 - e0), 1e-9, 1.0)));
        else if (e0 >= 0.0 && e1 < 0.0) corr_.addStep(2.0f, float(clampv(-e1 / (e0 - e1), 1e-9, 1.0)));
    }
    const float high = (phase_ < w1) ? 1.0f : -1.0f;
    const float naive = high - float(2.0 * w1 - 1.0);
    return held_.push(naive, corr_);
}

// Triangle through a wavefolder, gain 1..3 (fig 3-3: 127 = octave + fifth).
float Osc1::renderTriangle(const Osc1Input& in) noexcept {
    const float g = float(mapping::triangleFoldGain(in.ctrl1));
    const double p0 = prevPhase_;
    const double dt = phase_ - prevPhase_ + (wrapped_ ? 1.0 : 0.0);
    const double p1 = p0 + dt;
    if (dt > 0.0) {
        // segment breakpoints at triangle peaks (0.25, 0.75 [+1])
        double bp[6];
        int nb = 0;
        bp[nb++] = p0;
        for (double pk : { 0.25, 0.75, 1.25, 1.75 })
            if (pk > p0 && pk < p1) bp[nb++] = pk;
        bp[nb++] = p1;
        for (int s = 0; s + 1 < nb; ++s) {
            const double a = bp[s], b = bp[s + 1];
            // evaluate the (linear) triangle on this segment
            const double mid = fracd(0.5 * (a + b));
            const double slopeTri = (mid < 0.25 || mid >= 0.75) ? 4.0 : -4.0; // per cycle
            const float ua = g * triValue(fracd(a));
            const float ub = float(double(ua) + double(g) * slopeTri * (b - a));
            foldCrossings(corr_, a, b, ua, ub, p1, dt);
            if (s + 1 < nb - 1) {
                // corner at the triangle peak b
                const float upk = ub;
                const float dirBefore = slopeTri > 0.0 ? 1.0f : -1.0f;
                const float duBefore = float(double(g) * slopeTri * dt);
                const float sBefore = foldSlope(upk - 1e-4f * dirBefore) * duBefore;
                const float d = float(clampv((p1 - b) / dt, 0.0, 1.0));
                corr_.addCorner(-2.0f * sBefore, d);
            }
        }
    }
    const float naive = foldValue(g * triValue(phase_));
    return held_.push(naive, corr_);
}

float Osc1::renderSine(const Osc1Input& in) noexcept {
    const SineLut& s = sineLut();
    if (!in.vocoderProgram) {
        // Synth program: cross modulation by OSC2 (phase modulation [ENG]).
        const double depth = mapping::crossModDepthCycles(in.ctrl1);
        return s(ppPhase_ + depth * double(in.osc2Sample));
    }
    // Vocoder program: "CONTROL 1 modifies the waveform" (undocumented shape).
    // Placeholder [ENG]: sine through the same folder as the triangle wave.
    const float g = float(mapping::triangleFoldGain(in.ctrl1));
    const float u1 = g * s(phase_);
    const float u0 = prevFoldIn_;
    if (u1 != u0) {
        const float lo = std::min(u0, u1), hi = std::max(u0, u1);
        const float dir = u1 > u0 ? 1.0f : -1.0f;
        int k = int(std::floor(lo));
        if ((k & 1) == 0) ++k;
        if (float(k) <= lo) k += 2;
        for (; float(k) < hi; k += 2) {
            const float d = (u1 - float(k)) / (u1 - u0);
            corr_.addCorner(-2.0f * foldSlope(float(k) - 0.5f * dir) * (u1 - u0), clampv(d, 0.0f, 1.0f));
        }
    }
    prevFoldIn_ = u1;
    const float naive = foldValue(u1);
    return held_.push(naive, corr_);
}

float Osc1::renderTable(const Osc1Input& in, bool vox) noexcept {
    if (tables_ == nullptr) return 0.0f;
    const double fHz = in.dt * in.fsOs;
    if (vox) {
        const WaveBank& bank = tables_->vox;
        const int level = selectMipLevel(fHz, in.fsOs, in.osFactor);
        const double fpos = clampv(double(in.ctrl1), 0.0, 127.0) / 127.0 * double(vox::kNumFrames - 1);
        const int f0 = std::min(int(fpos), vox::kNumFrames - 2);
        const float w = float(fpos - double(f0));
        const double ph = ppPhase_;
        const float a = bank.lookup(f0, level, ph);
        const float b = bank.lookup(f0 + 1, level, ph);
        return a + (b - a) * w;
    }
    const WaveBank& bank = tables_->dwgs;
    const int idx = clampv(in.dwgsIndex0, 0, dwgs::kNumWaves - 1);
    const int div = bank.pitchDivisor(idx);
    if (div == 1) {
        const int level = selectMipLevel(fHz, in.fsOs, in.osFactor);
        return bank.lookup(idx, level, ppPhase_);
    }
    const double tdt = in.dt / double(div);
    const double ph = tablePhase_[0];
    tablePhase_[0] = fracd(ph + tdt);
    const int level = selectMipLevel(fHz / double(div), in.fsOs, in.osFactor);
    return bank.lookup(idx, level, ph);
}

// "Endless" (DWGS 35): octave-spaced partials under a fixed spectral envelope over
// absolute frequency, so notes an octave apart are identical (Shepard tone).
float Osc1::renderEndless(const Osc1Input& in) noexcept {
    const SineLut& s = sineLut();
    const double f = in.dt * in.fsOs;
    float acc = 0.0f, norm = 0.0f;
    for (size_t k = 0; k < shepardPhase_.size(); ++k) {
        const double ratio = std::exp2(double(int(k)) - 5.0);
        const double fk = f * ratio;
        const double oct = std::log2(std::max(fk, 1e-3) / 600.0) / 1.4;
        const float w = float(std::exp(-0.5 * oct * oct));
        if (fk < 0.45 * in.fsOs) acc += w * s(shepardPhase_[k]);
        norm += w;
        shepardPhase_[k] = fracd(shepardPhase_[k] + in.dt * ratio);
    }
    return norm > 0.0f ? acc / (0.45f * norm + 0.55f) : 0.0f;
}

// White noise through a resonant low-pass tracking the key (fig 3-6, p.20).
float Osc1::renderNoise(const Osc1Input& in) noexcept {
    const double fc = mapping::noiseCutoffHz(in.ctrl1, in.keyHz);
    const float g = svfG(fc, in.fsOs);
    const float k = float(mapping::resonanceToDamping12(in.noiseResonance));
    const float x = rng_.bipolar() * 1.7320508f; // unit RMS white noise
    return noiseFilter_.lowpass(x, g, k) * 0.7f;
}

// =================================================================== OSC2
void Osc2::reset(double startPhase) noexcept {
    phase_ = startPhase - std::floor(startPhase);
    corr_.reset();
    held_.reset();
}

float Osc2::value(int wave, double p) noexcept {
    switch (wave) {
        case 0: return float(2.0 * p - 1.0);
        case 1: return p < 0.5 ? 1.0f : -1.0f;
        default: return triValue(p);
    }
}

namespace {
// natural discontinuities of OSC2 between unwrapped phases a < b; event "d" measured from tEnd
// where tEnd (in samples) is the time between phase b and sample n+1 (added to d).
inline void osc2Events(OscCorrector& c, int wave, double a, double b, double dt, float dExtra) {
    if (b <= a || dt <= 0.0) return;
    auto dOf = [&](double p) { return float(clampv((b - p) / dt + double(dExtra), 1e-9, 1.0)); };
    const double ka = std::floor(a);
    for (double base = ka; base < b; base += 1.0) {
        if (wave == 0) {
            const double e = base + 1.0;
            if (e > a && e <= b) c.addStep(-2.0f, dOf(e));
        } else if (wave == 1) {
            const double e1 = base + 0.5, e2 = base + 1.0;
            if (e1 > a && e1 <= b) c.addStep(-2.0f, dOf(e1));
            if (e2 > a && e2 <= b) c.addStep(2.0f, dOf(e2));
        } else {
            const double e1 = base + 0.25, e2 = base + 0.75;
            if (e1 > a && e1 <= b) c.addCorner(float(-8.0 * dt), dOf(e1));
            if (e2 > a && e2 <= b) c.addCorner(float(8.0 * dt), dOf(e2));
        }
    }
}
inline float triSlopePerCycle(double p) { return (p < 0.25 || p >= 0.75) ? 4.0f : -4.0f; }
} // namespace

float Osc2::process(int wave, double dt, bool sync, bool syncWrap, float syncD) noexcept {
    dt = clampv(dt, 0.0, 0.5);
    const double p0 = phase_;
    if (sync && syncWrap) {
        // master wrapped syncD samples before n+1: slave runs (1-syncD) samples, resets, runs syncD.
        const double r = p0 + (1.0 - double(syncD)) * dt;
        osc2Events(corr_, wave, p0, r, dt, syncD);
        const double pr = r - std::floor(r);
        const float before = value(wave, pr);
        const float after = value(wave, 0.0);
        if (before != after) corr_.addStep(after - before, syncD);
        if (wave == 2) {
            const float sb = triSlopePerCycle(pr) * float(dt);
            const float sa = 4.0f * float(dt);
            if (sb != sa) corr_.addCorner(sa - sb, syncD);
        }
        const double q = double(syncD) * dt;
        osc2Events(corr_, wave, 0.0, q, dt, 0.0f);
        phase_ = q - std::floor(q);
    } else {
        const double p1 = p0 + dt;
        osc2Events(corr_, wave, p0, p1, dt, 0.0f);
        phase_ = p1 - std::floor(p1);
    }
    const float naive = value(wave, phase_);
    return held_.push(naive, corr_);
}

} // namespace kestrel
