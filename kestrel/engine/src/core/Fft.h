#pragma once

#include <complex>
#include <vector>

namespace kestrel {

// Minimal iterative radix-2 complex FFT. Used off the audio thread only
// (wavetable generation, import, analysis tools). n must be a power of two.
void fftInPlace(std::vector<std::complex<double>>& data, bool inverse);

// Real single-cycle waveform -> harmonic amplitudes/phases (harmonic 1..n/2-1).
// amplitude is the peak amplitude of each sine component.
void analyseSingleCycle(const std::vector<float>& cycle, std::vector<float>& amps, std::vector<float>& phases);

} // namespace kestrel
