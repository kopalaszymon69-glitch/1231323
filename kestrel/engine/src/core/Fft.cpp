#include "core/Fft.h"

#include <cmath>

#include "core/DspMath.h"

namespace kestrel {

void fftInPlace(std::vector<std::complex<double>>& a, bool inverse) {
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; ++i) {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1) {
        const double ang = (inverse ? 2.0 : -2.0) * kPi / double(len);
        const std::complex<double> wl(std::cos(ang), std::sin(ang));
        for (size_t i = 0; i < n; i += len) {
            std::complex<double> w(1.0, 0.0);
            for (size_t k = 0; k < len / 2; ++k) {
                const auto u = a[i + k];
                const auto v = a[i + k + len / 2] * w;
                a[i + k] = u + v;
                a[i + k + len / 2] = u - v;
                w *= wl;
            }
        }
    }
    if (inverse)
        for (auto& x : a) x /= double(n);
}

void analyseSingleCycle(const std::vector<float>& cycle, std::vector<float>& amps, std::vector<float>& phases) {
    // Resample the cycle to a power-of-two length by linear interpolation.
    size_t n = 1;
    while (n < cycle.size()) n <<= 1;
    if (n < 64) n = 64;
    std::vector<std::complex<double>> buf(n);
    const double step = double(cycle.size()) / double(n);
    for (size_t i = 0; i < n; ++i) {
        const double pos = double(i) * step;
        const size_t i0 = size_t(pos) % cycle.size();
        const size_t i1 = (i0 + 1) % cycle.size();
        const double f = pos - std::floor(pos);
        buf[i] = { double(cycle[i0]) * (1.0 - f) + double(cycle[i1]) * f, 0.0 };
    }
    fftInPlace(buf, false);
    const size_t nh = n / 2;
    amps.assign(nh, 0.0f);
    phases.assign(nh, 0.0f);
    for (size_t h = 1; h < nh; ++h) {
        const auto c = buf[h] * (2.0 / double(n));
        amps[h] = float(std::abs(c));
        // x(t) = A sin(2 pi h t + phi)  <=>  c = A * exp(i(phi - pi/2))
        phases[h] = float(std::arg(c) + kPi * 0.5);
    }
}

} // namespace kestrel
