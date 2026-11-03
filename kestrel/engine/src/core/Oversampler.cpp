#include "core/Oversampler.h"

#include <cmath>
#include <cstring>

#include "core/DspMath.h"

namespace kestrel {

namespace {
double besselI0(double x) {
    double sum = 1.0, term = 1.0;
    for (int k = 1; k < 60; ++k) {
        term *= (x / (2.0 * k)) * (x / (2.0 * k));
        sum += term;
        if (term < 1e-12 * sum) break;
    }
    return sum;
}

// Designs used by the chain. The 2x stage determines the audio passband
// (~0.436 fs flat, >=100 dB stopband from ~0.564 fs); the 4x pre-stage only has to
// protect the band that folds into the audio range.
const HalfbandDesign& stage2xDesign() {
    static const HalfbandDesign d = designHalfband(101, 10.06);
    return d;
}
const HalfbandDesign& stage4xDesign() {
    static const HalfbandDesign d = designHalfband(25, 10.4);
    return d;
}
} // namespace

HalfbandDesign designHalfband(int numTaps, double beta) {
    HalfbandDesign d;
    const int n = numTaps;
    d.taps.assign(size_t(n), 0.0f);
    const double c = 0.5 * double(n - 1);
    const double i0b = besselI0(beta);
    double sum = 0.0;
    std::vector<double> h(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) {
        const double t = double(i) - c;
        double s;
        if (std::fabs(t) < 1e-12) s = 0.5;
        else {
            const int ti = int(std::lround(t));
            if (std::fabs(t - ti) < 1e-12 && (ti % 2) == 0) s = 0.0; // exact halfband zeros
            else s = std::sin(0.5 * kPi * t) / (kPi * t);
        }
        const double r = t / c;
        const double w = besselI0(beta * std::sqrt(std::max(0.0, 1.0 - r * r))) / i0b;
        h[size_t(i)] = s * w;
        sum += h[size_t(i)];
    }
    for (int i = 0; i < n; ++i) d.taps[size_t(i)] = float(h[size_t(i)] / sum);
    d.latencyHigh = (n - 1) / 2;
    return d;
}

// ---------------------------------------------------------------- Decimator2
void Decimator2::prepare(const HalfbandDesign& d) {
    coefs_.clear();
    offsets_.clear();
    const int n = int(d.taps.size());
    latencyHigh_ = d.latencyHigh;
    centreDelay_ = d.latencyHigh;
    centre_ = d.taps[size_t(centreDelay_)];
    for (int i = 0; i < n; ++i) {
        if (i == centreDelay_) continue;
        if (std::fabs(d.taps[size_t(i)]) < 1e-12f) continue;
        coefs_.push_back(d.taps[size_t(i)]);
        offsets_.push_back(i);
    }
    len_ = n;
    hist_.assign(size_t(2 * len_), 0.0f);
    pos_ = 0;
}

void Decimator2::reset() {
    std::fill(hist_.begin(), hist_.end(), 0.0f);
    pos_ = 0;
}

void Decimator2::process(const float* in, float* out, int n) noexcept {
    float* h = hist_.data();
    const int L = len_;
    const size_t nc = coefs_.size();
    const float* cf = coefs_.data();
    const int* of = offsets_.data();
    for (int i = 0; i < n; ++i) {
        // push two input samples; history is mirrored so reads never wrap
        for (int k = 0; k < 2; ++k) {
            pos_ = (pos_ == 0) ? L - 1 : pos_ - 1;
            const float x = in[2 * i + k];
            h[pos_] = x;
            h[pos_ + L] = x;
        }
        const float* x = h + pos_; // x[d] = sample delayed by d
        float acc = centre_ * x[centreDelay_];
        for (size_t c = 0; c < nc; ++c) acc += cf[c] * x[of[c]];
        out[i] = acc;
    }
}

// ------------------------------------------------------------- Interpolator2
void Interpolator2::prepare(const HalfbandDesign& d) {
    const int n = int(d.taps.size());
    latencyHigh_ = d.latencyHigh;
    even_.clear();
    odd_.clear();
    for (int i = 0; i < n; ++i) {
        if ((i & 1) == 0) even_.push_back(2.0f * d.taps[size_t(i)]);
        else odd_.push_back(2.0f * d.taps[size_t(i)]);
    }
    len_ = int(std::max(even_.size(), odd_.size()));
    hist_.assign(size_t(2 * len_), 0.0f);
    pos_ = 0;
}

void Interpolator2::reset() {
    std::fill(hist_.begin(), hist_.end(), 0.0f);
    pos_ = 0;
}

void Interpolator2::process(const float* in, float* out, int n) noexcept {
    float* h = hist_.data();
    const int L = len_;
    const size_t ne = even_.size(), no = odd_.size();
    for (int i = 0; i < n; ++i) {
        pos_ = (pos_ == 0) ? L - 1 : pos_ - 1;
        h[pos_] = in[i];
        h[pos_ + L] = in[i];
        const float* x = h + pos_;
        float a = 0.0f, b = 0.0f;
        for (size_t k = 0; k < ne; ++k) a += even_[k] * x[k];
        for (size_t k = 0; k < no; ++k) b += odd_[k] * x[k];
        out[2 * i] = a;
        out[2 * i + 1] = b;
    }
}

// --------------------------------------------------------- OversamplingChain
void OversamplingChain::prepare(int maxBlockLow) {
    for (auto& d : dec2x_) d.prepare(stage2xDesign());
    for (auto& d : dec4x_) d.prepare(stage4xDesign());
    for (auto& d : int2x_) d.prepare(stage2xDesign());
    for (auto& d : int4x_) d.prepare(stage4xDesign());
    tmpL_.assign(size_t(2 * maxBlockLow + 8), 0.0f);
    tmpR_.assign(size_t(2 * maxBlockLow + 8), 0.0f);
}

void OversamplingChain::setFactor(int f) noexcept {
    f = (f >= 4) ? 4 : (f >= 2 ? 2 : 1);
    if (f != factor_) {
        factor_ = f;
        reset();
    }
}

int OversamplingChain::decimationLatencyFor(int f) noexcept {
    if (f == 1) return 0;
    const int l2 = stage2xDesign().latencyHigh / 2;
    if (f == 2) return l2;
    return l2 + stage4xDesign().latencyHigh / 4;
}

int OversamplingChain::decimationLatency() const noexcept { return decimationLatencyFor(factor_); }

void OversamplingChain::reset() noexcept {
    for (auto& d : dec2x_) d.reset();
    for (auto& d : dec4x_) d.reset();
    for (auto& d : int2x_) d.reset();
    for (auto& d : int4x_) d.reset();
}

void OversamplingChain::downsample(const float* inL, const float* inR, float* outL, float* outR, int n) noexcept {
    if (factor_ == 1) {
        if (outL != inL) std::memcpy(outL, inL, sizeof(float) * size_t(n));
        if (outR != inR) std::memcpy(outR, inR, sizeof(float) * size_t(n));
        return;
    }
    if (factor_ == 2) {
        dec2x_[0].process(inL, outL, n);
        dec2x_[1].process(inR, outR, n);
        return;
    }
    dec4x_[0].process(inL, tmpL_.data(), 2 * n);
    dec4x_[1].process(inR, tmpR_.data(), 2 * n);
    dec2x_[0].process(tmpL_.data(), outL, n);
    dec2x_[1].process(tmpR_.data(), outR, n);
}

void OversamplingChain::upsample(const float* inL, const float* inR, float* outL, float* outR, int n) noexcept {
    if (factor_ == 1) {
        std::memcpy(outL, inL, sizeof(float) * size_t(n));
        std::memcpy(outR, inR, sizeof(float) * size_t(n));
        return;
    }
    if (factor_ == 2) {
        int2x_[0].process(inL, outL, n);
        int2x_[1].process(inR, outR, n);
        return;
    }
    int2x_[0].process(inL, tmpL_.data(), n);
    int2x_[1].process(inR, tmpR_.data(), n);
    int4x_[0].process(tmpL_.data(), outL, 2 * n);
    int4x_[1].process(tmpR_.data(), outR, 2 * n);
}

} // namespace kestrel
