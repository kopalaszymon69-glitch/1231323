#pragma once

// Signal analysis helpers for tests and the analysis tool.
#include <algorithm>
#include <cmath>
#include <complex>
#include <vector>

#include "core/Fft.h"

namespace ka {

constexpr double kPi = 3.14159265358979323846;

// Blackman-Harris windowed magnitude spectrum (linear amplitude, normalised so a
// full-scale sine reads ~1.0 at its bin). n is rounded down to a power of two.
inline std::vector<double> spectrum(const float* x, size_t n, size_t& fftSize) {
    size_t N = 1;
    while (N * 2 <= n) N *= 2;
    fftSize = N;
    std::vector<std::complex<double>> b(N);
    double wsum = 0.0;
    for (size_t i = 0; i < N; ++i) {
        const double t = 2.0 * kPi * double(i) / double(N - 1);
        const double w = 0.35875 - 0.48829 * std::cos(t) + 0.14128 * std::cos(2 * t) - 0.01168 * std::cos(3 * t);
        wsum += w;
        b[i] = { double(x[i]) * w, 0.0 };
    }
    kestrel::fftInPlace(b, false);
    std::vector<double> mag(N / 2);
    for (size_t k = 0; k < N / 2; ++k) mag[k] = 2.0 * std::abs(b[k]) / wsum;
    return mag;
}

inline double db(double v) { return 20.0 * std::log10(std::max(v, 1e-15)); }

// Amplitude of the component at exactly `hz` (Blackman-Harris windowed DFT evaluated at
// the exact frequency: no scalloping loss, sidelobes < -92 dB).
inline double toneAmplitude(const float* x, size_t n, double hz, double fs) {
    double re = 0.0, im = 0.0, wsum = 0.0;
    const double w0 = 2.0 * kPi * hz / fs;
    for (size_t i = 0; i < n; ++i) {
        const double t = 2.0 * kPi * double(i) / double(n - 1);
        const double w = 0.35875 - 0.48829 * std::cos(t) + 0.14128 * std::cos(2 * t) - 0.01168 * std::cos(3 * t);
        wsum += w;
        re += double(x[i]) * w * std::cos(w0 * double(i));
        im -= double(x[i]) * w * std::sin(w0 * double(i));
    }
    return 2.0 * std::sqrt(re * re + im * im) / wsum;
}

// Peak amplitude around a frequency (searches +-w bins).
inline double peakAt(const std::vector<double>& mag, double hz, double fs, size_t N, int w = 4) {
    const int k = int(std::lround(hz * double(N) / fs));
    double m = 0.0;
    for (int i = std::max(1, k - w); i <= std::min(int(mag.size()) - 1, k + w); ++i) m = std::max(m, mag[size_t(i)]);
    return m;
}

// Ratio of energy NOT within +-w bins of harmonics of f0 (below fmax) to the total energy.
inline double inharmonicRatio(const std::vector<double>& mag, double f0, double fs, size_t N, double fmax, int w = 6) {
    std::vector<bool> harm(mag.size(), false);
    for (int h = 1; h * f0 < fmax; ++h) {
        const int k = int(std::lround(h * f0 * double(N) / fs));
        for (int i = k - w; i <= k + w; ++i)
            if (i >= 0 && i < int(mag.size())) harm[size_t(i)] = true;
    }
    double tot = 0.0, bad = 0.0;
    const size_t kmax = std::min(mag.size(), size_t(fmax * double(N) / fs));
    for (size_t i = 2; i < kmax; ++i) {
        const double e = mag[i] * mag[i];
        tot += e;
        if (!harm[i]) bad += e;
    }
    return tot > 0.0 ? bad / tot : 0.0;
}

// Largest non-harmonic component relative to the strongest component (dB).
inline double worstSpurDb(const std::vector<double>& mag, double f0, double fs, size_t N, double fmax, int w = 6) {
    std::vector<bool> harm(mag.size(), false);
    for (int h = 1; h * f0 < fs * 0.5; ++h) {
        const int k = int(std::lround(h * f0 * double(N) / fs));
        for (int i = k - w; i <= k + w; ++i)
            if (i >= 0 && i < int(mag.size())) harm[size_t(i)] = true;
    }
    double peak = 0.0, spur = 0.0;
    const size_t kmax = std::min(mag.size(), size_t(fmax * double(N) / fs));
    for (size_t i = 3; i < kmax; ++i) {
        peak = std::max(peak, mag[i]);
        if (!harm[i]) spur = std::max(spur, mag[i]);
    }
    return db(spur) - db(peak);
}

inline double rms(const float* x, size_t n) {
    double s = 0.0;
    for (size_t i = 0; i < n; ++i) s += double(x[i]) * x[i];
    return n ? std::sqrt(s / double(n)) : 0.0;
}

inline float peakAbs(const std::vector<float>& x, size_t a = 0, size_t b = size_t(-1)) {
    float p = 0.0f;
    b = std::min(b, x.size());
    for (size_t i = a; i < b; ++i) p = std::max(p, std::fabs(x[i]));
    return p;
}

// First index whose |x| exceeds thr.
inline long firstAbove(const std::vector<float>& x, float thr, size_t from = 0) {
    for (size_t i = from; i < x.size(); ++i)
        if (std::fabs(x[i]) > thr) return long(i);
    return -1;
}

// Fundamental frequency estimate by FFT peak + parabolic interpolation.
inline double estimateF0(const float* x, size_t n, double fs, double fmin = 20.0) {
    size_t N;
    const auto mag = spectrum(x, n, N);
    size_t kmin = size_t(fmin * double(N) / fs);
    size_t best = std::max<size_t>(kmin, 1);
    for (size_t k = best; k + 1 < mag.size(); ++k)
        if (mag[k] > mag[best]) best = k;
    if (best < 1 || best + 1 >= mag.size()) return double(best) * fs / double(N);
    const double a = std::log(mag[best - 1] + 1e-20), b = std::log(mag[best] + 1e-20), c = std::log(mag[best + 1] + 1e-20);
    const double p = 0.5 * (a - c) / (a - 2 * b + c);
    return (double(best) + p) * fs / double(N);
}

// Frequency of a (nearly) sinusoidal signal by zero crossings with interpolation.
inline double zeroCrossingFreq(const float* x, size_t n, double fs) {
    double first = -1, last = -1;
    int count = 0;
    for (size_t i = 1; i < n; ++i) {
        if (x[i - 1] < 0.0f && x[i] >= 0.0f) {
            const double t = double(i - 1) + double(-x[i - 1]) / double(x[i] - x[i - 1]);
            if (first < 0) first = t;
            last = t;
            ++count;
        }
    }
    if (count < 2) return 0.0;
    return fs * double(count - 1) / (last - first);
}

} // namespace ka
