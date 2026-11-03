#include "fx/Effects.h"

#include <cmath>

#include "params/Mapping.h"

namespace kestrel {

// ------------------------------------------------------------------ DelayLine
void DelayLine::prepare(int maxSamples) {
    int n = 1;
    while (n < maxSamples + 4) n <<= 1;
    buf_.assign(size_t(n), 0.0f);
    mask_ = n - 1;
    pos_ = 0;
}

void DelayLine::reset() noexcept {
    std::fill(buf_.begin(), buf_.end(), 0.0f);
    pos_ = 0;
}

// ------------------------------------------------------------------ ModFx
void ModFx::prepare(double fs) {
    fs_ = fs;
    dl_[0].prepare(int(0.05 * fs));
    dl_[1].prepare(int(0.05 * fs));
    depthS_.setRampLength(int(0.02 * fs));
    speedS_.setRampLength(int(0.02 * fs));
    reset();
}

void ModFx::reset() noexcept {
    dl_[0].reset();
    dl_[1].reset();
    lfoPhase_ = lfo2Phase_ = 0.0;
    fb_[0] = fb_[1] = 0.0f;
    for (auto& ch : apState_) ch.fill(0.0f);
    phFb_[0] = phFb_[1] = 0.0f;
}

namespace {
inline float triLfo(double p) noexcept { // 0..1 phase -> -1..1 triangle
    const double x = p - std::floor(p);
    return float(x < 0.5 ? 4.0 * x - 1.0 : 3.0 - 4.0 * x);
}
} // namespace

void ModFx::process(float* l, float* r, int n, int type, float speed, float depth) noexcept {
    if (type != lastType_) {
        // switching algorithm: clear the shared state to avoid feedback bursts
        reset();
        lastType_ = type;
        depthS_.reset(depth);
        speedS_.reset(speed);
    }
    depthS_.setTarget(depth);
    speedS_.setTarget(speed);
    const float msToS = float(fs_ * 0.001);
    for (int i = 0; i < n; ++i) {
        const float d = clampv(depthS_.next() / 127.0f, 0.0f, 1.0f);
        const double hz = mapping::modFxLfoHz(speedS_.next());
        lfoPhase_ += hz / fs_;
        if (lfoPhase_ >= 1.0) lfoPhase_ -= 1.0;
        const float inL = l[i], inR = r[i];
        if (d <= 0.0f) {
            // bypass (depth 0 [DOC p.39]) but keep the lines warm
            dl_[0].push(inL);
            dl_[1].push(inR);
            continue;
        }
        if (type == 0) { // Flanger / Chorus: one modulated tap per side, depth raises feedback
            const float base = 4.5f * msToS;
            const float exc = (0.4f + 3.2f * d) * msToS;
            const float fb = 0.82f * d * d;
            const float wet = clampv(2.0f * d, 0.0f, 1.0f) * 0.7f;
            const float m0 = triLfo(lfoPhase_), m1 = triLfo(lfoPhase_ + 0.25);
            dl_[0].push(inL + fb * fb_[0]);
            dl_[1].push(inR + fb * fb_[1]);
            const float yl = dl_[0].read(base + exc * m0);
            const float yr = dl_[1].read(base + exc * m1);
            fb_[0] = clampv(yl, -4.0f, 4.0f);
            fb_[1] = clampv(yr, -4.0f, 4.0f);
            l[i] = inL + wet * yl;
            r[i] = inR + wet * yr;
        } else if (type == 1) { // Ensemble: three chorus taps per side (120 deg apart) + slow/fast mix
            lfo2Phase_ += hz * 6.3 / fs_;
            if (lfo2Phase_ >= 1.0) lfo2Phase_ -= 1.0;
            const float base = 8.0f * msToS;
            const float exc = (0.3f + 1.9f * d) * msToS;
            const float exc2 = 0.15f * msToS;
            const float wet = clampv(1.6f * d, 0.0f, 1.0f) * 0.55f;
            dl_[0].push(inL);
            dl_[1].push(inR);
            float yl = 0.0f, yr = 0.0f;
            for (int k = 0; k < 3; ++k) {
                const double ph = double(k) / 3.0;
                yl += dl_[0].read(base + exc * triLfo(lfoPhase_ + ph) + exc2 * triLfo(lfo2Phase_ + ph));
                yr += dl_[1].read(base + exc * triLfo(lfoPhase_ + ph + 1.0 / 6.0) + exc2 * triLfo(lfo2Phase_ + ph + 0.5));
            }
            l[i] = inL + wet * yl * (1.0f / 1.5f);
            r[i] = inR + wet * yr * (1.0f / 1.5f);
        } else { // Phaser: 6 first-order all-pass stages swept by the LFO, feedback from depth
            const float fbAmt = 0.72f * d;
            const float mix = clampv(2.0f * d, 0.0f, 1.0f);
            const float in[2] = { inL, inR };
            float out[2];
            for (int ch = 0; ch < 2; ++ch) {
                const float m = triLfo(lfoPhase_ + (ch ? 0.25 : 0.0)) * 0.5f + 0.5f;  // 0..1
                const double fc = 180.0 * std::pow(3200.0 / 180.0, double(m));
                const float tn = float(std::tan(kPi * std::min(fc, fs_ * 0.45) / fs_));
                const float a = (tn - 1.0f) / (tn + 1.0f);
                float x = in[ch] + fbAmt * phFb_[ch];
                for (int s = 0; s < kStages; ++s) {
                    // first-order all-pass (TDF-II): y = a x + z ; z = x - a y
                    float& z = apState_[size_t(ch)][size_t(s)];
                    const float y = a * x + z;
                    z = x - a * y;
                    x = y;
                }
                phFb_[ch] = clampv(x, -4.0f, 4.0f);
                out[ch] = in[ch] * (1.0f - 0.5f * mix) + x * (0.5f * mix);
            }
            l[i] = out[0];
            r[i] = out[1];
        }
    }
    fb_[0] = sanitize(fb_[0]);
    fb_[1] = sanitize(fb_[1]);
    for (auto& ch : apState_) for (auto& z : ch) z = sanitize(z);
    phFb_[0] = sanitize(phFb_[0]);
    phFb_[1] = sanitize(phFb_[1]);
}

// ------------------------------------------------------------------ DelayFx
void DelayFx::prepare(double fs) {
    fs_ = fs;
    dl_[0].prepare(int(kMaxSeconds * fs) + 8);
    dl_[1].prepare(int(kMaxSeconds * fs) + 8);
    depthS_.setRampLength(int(0.02 * fs));
    reset();
}

void DelayFx::reset() noexcept {
    dl_[0].reset();
    dl_[1].reset();
    first_ = true;
}

void DelayFx::process(float* l, float* r, int n, int type, double timeSeconds, float depth) noexcept {
    const float target = float(clampv(timeSeconds, 0.0005, kMaxSeconds) * fs_);
    if (first_) { curDelay_ = target; first_ = false; depthS_.reset(depth); }
    depthS_.setTarget(depth);
    // delay-time changes glide (tape-style) with a ~60 ms time constant [ENG]
    const float coef = onePoleCoef(0.06, fs_);
    for (int i = 0; i < n; ++i) {
        curDelay_ += (target - curDelay_) * coef;
        const float d = clampv(depthS_.next() / 127.0f, 0.0f, 1.0f);
        const float wet = d;
        const float fb = 0.85f * d;
        const float inL = l[i], inR = r[i];
        const float yl = dl_[0].read(curDelay_ - 1.0f);
        const float yr = dl_[1].read(curDelay_ - 1.0f);
        // feedback is bounded (stability safety; not a model of hardware saturation)
        const float fl = clampv(yl * fb, -4.0f, 4.0f);
        const float fr = clampv(yr * fb, -4.0f, 4.0f);
        switch (type) {
            default:
            case 0: // Stereo
                dl_[0].push(inL + fl);
                dl_[1].push(inR + fr);
                break;
            case 1: // Cross: feedback of L and R interchanged
                dl_[0].push(inL + fr);
                dl_[1].push(inR + fl);
                break;
            case 2: { // L/R: mono input to L, L output feeds R, R feeds back to L (alternating)
                const float mono = 0.5f * (inL + inR);
                dl_[0].push(mono + fr);
                dl_[1].push(yl);
                break;
            }
        }
        l[i] = inL + wet * yl;
        r[i] = inR + wet * yr;
    }
}

// ------------------------------------------------------------------ Eq2
void Eq2::reset() noexcept {
    for (int ch = 0; ch < 2; ++ch) { lo_.z1[ch] = lo_.z2[ch] = hi_.z1[ch] = hi_.z2[ch] = 0.0f; }
}

void Eq2::shelf(Biquad& q, double fs, double hz, double db, bool high) noexcept {
    // RBJ audio-EQ cookbook shelving filter, S = 1
    const double A = std::pow(10.0, db / 40.0);
    const double w0 = 2.0 * kPi * std::min(hz, fs * 0.45) / fs;
    const double cw = std::cos(w0), sw = std::sin(w0);
    const double alpha = sw / 2.0 * std::sqrt(2.0);
    const double sA = 2.0 * std::sqrt(A) * alpha;
    double b0, b1, b2, a0, a1, a2;
    if (!high) {
        b0 = A * ((A + 1) - (A - 1) * cw + sA);
        b1 = 2 * A * ((A - 1) - (A + 1) * cw);
        b2 = A * ((A + 1) - (A - 1) * cw - sA);
        a0 = (A + 1) + (A - 1) * cw + sA;
        a1 = -2 * ((A - 1) + (A + 1) * cw);
        a2 = (A + 1) + (A - 1) * cw - sA;
    } else {
        b0 = A * ((A + 1) + (A - 1) * cw + sA);
        b1 = -2 * A * ((A - 1) + (A + 1) * cw);
        b2 = A * ((A + 1) + (A - 1) * cw - sA);
        a0 = (A + 1) - (A - 1) * cw + sA;
        a1 = 2 * ((A - 1) - (A + 1) * cw);
        a2 = (A + 1) - (A - 1) * cw - sA;
    }
    q.b0 = float(b0 / a0); q.b1 = float(b1 / a0); q.b2 = float(b2 / a0);
    q.a1 = float(a1 / a0); q.a2 = float(a2 / a0);
}

void Eq2::setParams(double lowHz, double lowDb, double hiHz, double hiDb) noexcept {
    if (lowHz != cLoHz_ || lowDb != cLoDb_) { shelf(lo_, fs_, lowHz, lowDb, false); cLoHz_ = lowHz; cLoDb_ = lowDb; }
    if (hiHz != cHiHz_ || hiDb != cHiDb_) { shelf(hi_, fs_, hiHz, hiDb, true); cHiHz_ = hiHz; cHiDb_ = hiDb; }
    active_ = std::fabs(lowDb) > 1e-3 || std::fabs(hiDb) > 1e-3;
}

void Eq2::process(float* l, float* r, int n) noexcept {
    if (!active_) { reset(); return; } // gain 0 = flat [DOC p.39 "set EQ gain to zero"]
    for (int i = 0; i < n; ++i) {
        l[i] = hi_.tick(lo_.tick(l[i], 0), 0);
        r[i] = hi_.tick(lo_.tick(r[i], 1), 1);
    }
    for (int ch = 0; ch < 2; ++ch) {
        lo_.z1[ch] = sanitize(lo_.z1[ch]); lo_.z2[ch] = sanitize(lo_.z2[ch]);
        hi_.z1[ch] = sanitize(hi_.z1[ch]); hi_.z2[ch] = sanitize(hi_.z2[ch]);
    }
}

} // namespace kestrel
