#include "vocoder/Vocoder.h"

#include <cmath>

#include "params/Mapping.h"

namespace kestrel {

namespace {
constexpr int kGridOffset = 4;          // shift 0: filter 1 = grid index 4 (125 Hz) [DOC table 6-1]
constexpr float kOutputGain = 5.0f;     // [ENG] calibrated by the test harness
// Q of one 2-pole section from the local grid spacing (one band per grid step).
double bandQ(double centre, double lo, double hi) {
    const double bw = std::max(1.0, 0.5 * (hi - lo));
    return std::clamp(centre / bw, 1.5, 12.0);
}
} // namespace

double Vocoder::analysisHz(int band) noexcept { return mapping::vocGridHz(kGridOffset + band); }

void Vocoder::prepare(double fs) {
    fs_ = fs;
    for (int b = 0; b < kBands; ++b) {
        const int gi = kGridOffset + b;
        const double fc = mapping::vocGridHz(gi);
        const double q = bandQ(fc, mapping::vocGridHz(gi - 1), mapping::vocGridHz(gi + 1));
        bands_[size_t(b)].ga = svfG(fc, fs);
        bands_[size_t(b)].ka = float(1.0 / q);
    }
    reset();
}

void Vocoder::reset() noexcept {
    for (auto& b : bands_) { b.a1.reset(); b.a2.reset(); b.s1.reset(); b.s2.reset(); }
    env_.fill(0.0f);
    gateEnv_ = 0.0f;
    gateGain_ = 1.0f;
    hpf1_.reset();
    hpf2_.reset();
    keyGate_ = 0.0f;
    lastShift_ = 1e9;
    lastRes_ = -1.0f;
}

void Vocoder::updateSynthesisCoefs(double shift, float res) noexcept {
    if (std::fabs(shift - lastShift_) < 1e-4 && res == lastRes_) return;
    lastShift_ = shift;
    lastRes_ = res;
    const double resMul = 1.0 + 3.0 * double(res) / 127.0; // RESONANCE narrows the carrier BPFs [ENG]
    for (int b = 0; b < kBands; ++b) {
        const double pos = double(kGridOffset + b) + shift;
        const double fc = mapping::vocGridHzInterp(pos);
        const double q = bandQ(fc, mapping::vocGridHzInterp(pos - 1.0), mapping::vocGridHzInterp(pos + 1.0)) * resMul;
        bands_[size_t(b)].gs = svfG(fc, fs_);
        bands_[size_t(b)].ks = float(1.0 / q);
        bands_[size_t(b)].comp = float(std::sqrt(resMul)); // narrower bands keep roughly constant power [ENG]
    }
}

void Vocoder::process(const float* carrier, const float* modulator, float* outL, float* outR, int n,
                      const VocoderParams& p, float fcModSteps, bool keyOn) noexcept {
    const double shift = double(mapping::formantShiftSteps(p.formantShiftChoice)) + mapping::vocCutoffSteps(p.cutoff)
                         + double(fcModSteps);
    updateSynthesisCoefs(std::clamp(shift, -4.5, 4.5), p.resonance);

    const bool holding = p.efSense >= 127.0f;
    if (holding && !wasHolding_ && !holdValid_) {
        hold_ = env_;     // FORMANT HOLD: freeze the analysed character at this moment
        holdValid_ = true;
    }
    if (!holding) holdValid_ = false;
    wasHolding_ = holding;

    const float atk = onePoleCoef(mapping::vocFollowerAttack(p.efSense), fs_);
    const float rel = onePoleCoef(mapping::vocFollowerRelease(p.efSense), fs_);
    const float thr = float(mapping::vocGateThreshold(p.threshold));
    const float gateRel = onePoleCoef(mapping::vocGateRelease(p.gateSense), fs_);
    const float gateAtk = onePoleCoef(0.001, fs_);
    const float detRel = onePoleCoef(0.02, fs_);
    const float hpfG = svfG(mapping::kVocHpfCutoffHz, fs_);
    const float hpfLevel = float(mapping::levelToGain(p.hpfLevel));
    const float direct = float(mapping::levelToGain(p.directLevel));
    const float keyCoef = onePoleCoef(0.004, fs_);

    float panL[8], panR[8], lvl[8];
    for (int c = 0; c < 8; ++c) {
        mapping::panGains(p.chPan[size_t(c)], panL[c], panR[c]);
        lvl[c] = float(mapping::levelToGain(p.chLevel[size_t(c)]));
    }

    for (int i = 0; i < n; ++i) {
        float m = modulator[i];
        // ---- modulator gate (THRESHOLD / GATE SENSE)
        const float a = std::fabs(m);
        gateEnv_ += (a > gateEnv_ ? 0.5f : detRel) * (a - gateEnv_);
        if (thr > 0.0f) {
            const float target = gateEnv_ > thr ? 1.0f : 0.0f;
            gateGain_ += (target > gateGain_ ? gateAtk : gateRel) * (target - gateGain_);
        } else {
            gateGain_ = 1.0f;
        }
        m *= gateGain_;

        const float c = carrier[i];
        float l = 0.0f, r = 0.0f;
        for (int b = 0; b < kBands; ++b) {
            Band& B = bands_[size_t(b)];
            float lp, bp, hp;
            float e;
            if (!holding) {
                B.a1.tickLinear(m, B.ga, B.ka, lp, bp, hp);
                B.a2.tickLinear(bp * B.ka, B.ga, B.ka, lp, bp, hp);
                bp *= B.ka; // unity peak gain per section
                const float rect = std::fabs(bp);
                float& ev = env_[size_t(b)];
                ev += (rect > ev ? atk : rel) * (rect - ev);
                e = ev;
            } else {
                e = hold_[size_t(b)];
            }
            B.s1.tickLinear(c, B.gs, B.ks, lp, bp, hp);
            B.s2.tickLinear(bp * B.ks, B.gs, B.ks, lp, bp, hp);
            const int ch = b >> 1;
            const float y = bp * B.ks * B.comp * e * lvl[ch];
            l += y * panL[ch];
            r += y * panR[ch];
        }
        // ---- HPF LEVEL (+ HPF GATE) and DIRECT LEVEL from AUDIO IN 1
        keyGate_ += ((keyOn || !p.hpfGateEnabled) ? 1.0f - keyGate_ : -keyGate_) * keyCoef;
        float lp, bp, hp;
        hpf1_.tickLinear(m, hpfG, 1.414f, lp, bp, hp);
        float hp1 = hp;
        hpf2_.tickLinear(hp1, hpfG, 1.414f, lp, bp, hp);
        const float hiPart = hp * hpfLevel * keyGate_;
        const float dry = modulator[i] * gateGain_ * direct;
        outL[i] = l * kOutputGain + hiPart + dry;
        outR[i] = r * kOutputGain + hiPart + dry;
    }
    for (auto& b : bands_) { b.a1.sanitizeState(); b.a2.sanitizeState(); b.s1.sanitizeState(); b.s2.sanitizeState(); }
    hpf1_.sanitizeState();
    hpf2_.sanitizeState();
}

} // namespace kestrel
