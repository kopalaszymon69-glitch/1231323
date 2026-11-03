#include "osc/Wavetable.h"

#include <cmath>
#include <complex>
#include <cstdio>
#include <sstream>

#include "core/DspMath.h"
#include "core/Fft.h"

namespace kestrel {

// ------------------------------------------------------------------ WaveBank
void WaveBank::build(const std::vector<Spectrum>& frames) {
    numFrames_ = int(frames.size());
    data_.assign(size_t(numFrames_) * kNumLevels * (kTableSize + 1), 0.0f);
    divisors_.assign(size_t(numFrames_), 1);
    std::vector<std::complex<double>> buf(kTableSize);
    for (int f = 0; f < numFrames_; ++f) {
        const Spectrum& s = frames[size_t(f)];
        divisors_[size_t(f)] = std::max(1, s.pitchDivisor);
        float norm = 1.0f;
        for (int L = 0; L < kNumLevels; ++L) {
            const int maxH = (L == 0) ? kMaxHarmonics : std::min(kMaxHarmonics, 1024 >> L);
            std::fill(buf.begin(), buf.end(), std::complex<double>(0.0, 0.0));
            const int nh = std::min(int(s.amp.size()) - 1, maxH);
            for (int h = 1; h <= nh; ++h) {
                const double a = s.amp[size_t(h)];
                if (a == 0.0) continue;
                const double ph = (size_t(h) < s.phase.size()) ? double(s.phase[size_t(h)]) : 0.0;
                // x(t) = a sin(2 pi h t + ph): bins h and N-h
                const std::complex<double> c = std::polar(a * 0.5 * kTableSize, ph - kPi * 0.5);
                buf[size_t(h)] += c;
                buf[size_t(kTableSize - h)] += std::conj(c);
            }
            fftInPlace(buf, true);
            float* t = data_.data() + (size_t(f) * kNumLevels + size_t(L)) * (kTableSize + 1);
            for (int i = 0; i < kTableSize; ++i) t[i] = float(buf[size_t(i)].real());
            t[kTableSize] = t[0];
            if (L == 0) {
                float peak = 0.0f;
                for (int i = 0; i < kTableSize; ++i) peak = std::max(peak, std::fabs(t[i]));
                norm = peak > 1e-9f ? 1.0f / peak : 1.0f;
            }
            for (int i = 0; i <= kTableSize; ++i) t[i] *= norm;
        }
    }
}

int selectMipLevel(double tableHz, double fsOs, int osFactor) noexcept {
    // Highest harmonic frequency that may be present without audible aliasing:
    //   1x: fsOs/2 (strict); 2x: 0.75 fsOs; 4x: 0.875 fsOs (folded images stay above base Nyquist)
    const double limitRatio = osFactor >= 4 ? 0.875 : (osFactor >= 2 ? 0.75 : 0.5);
    const double hzc = std::max(tableHz, 1e-3);
    const double allowed = limitRatio * fsOs / hzc; // number of harmonics allowed
    // level L has (1024 >> L) harmonics; choose the smallest L with 1024>>L <= allowed
    int L = 0;
    while (L < WaveBank::kNumLevels - 1 && double(1024 >> L) > allowed) ++L;
    return L;
}

// ------------------------------------------------------------------ DWGS
namespace dwgs {

namespace {
const char* const kNames[kNumWaves] = {
    "SynSine1", "SynSine2", "SynSine3", "SynSine4", "SynSine5", "SynSine6", "SynSine7",
    "SynBass1", "SynBass2", "SynBass3", "SynBass4", "SynBass5", "SynBass6", "SynBass7",
    "SynWave1", "SynWave2", "SynWave3", "SynWave4", "SynWave5", "SynWave6", "SynWave7", "SynWave8", "SynWave9",
    "5thWave1", "5thWave2", "5thWave3",
    "Digi1", "Digi2", "Digi3", "Digi4", "Digi5", "Digi6", "Digi7", "Digi8",
    "Endless",
    "E.Piano1", "E.Piano2", "E.Piano3", "E.Piano4",
    "Organ1", "Organ2", "Organ3", "Organ4", "Organ5", "Organ6", "Organ7",
    "Clav1", "Clav2",
    "Guitar1", "Guitar2", "Guitar3",
    "Bass1", "Bass2", "Bass3", "Bass4", "Bass5",
    "Bell1", "Bell2", "Bell3", "Bell4",
    "Voice1", "Voice2", "Voice3", "Voice4" };

using S = WaveBank::Spectrum;

S blank(int maxH = WaveBank::kMaxHarmonics) {
    S s;
    s.amp.assign(size_t(maxH + 1), 0.0f);
    s.phase.assign(size_t(maxH + 1), 0.0f);
    return s;
}
int top(const S& s) { return int(s.amp.size()) - 1; }
void p(S& s, int h, float a) { if (h >= 1 && h <= top(s)) s.amp[size_t(h)] += a; }
void saw(S& s, int maxH, float g = 1.0f) { for (int h = 1; h <= std::min(maxH, top(s)); ++h) p(s, h, g / float(h)); }
void square(S& s, int maxH, float g = 1.0f) { for (int h = 1; h <= std::min(maxH, top(s)); h += 2) p(s, h, g / float(h)); }
void pulse(S& s, double w, int maxH, float g = 1.0f) {
    for (int h = 1; h <= std::min(maxH, top(s)); ++h) p(s, h, g * float(std::fabs(std::sin(kPi * h * w)) / double(h)));
}
void powerLaw(S& s, double expo, int maxH, float g = 1.0f) {
    for (int h = 1; h <= std::min(maxH, top(s)); ++h) p(s, h, g * float(1.0 / std::pow(double(h), expo)));
}
// Multiplies harmonics by (1 + gain * gaussian(h; centre, width)).
void formant(S& s, double centre, double width, double gain) {
    for (int h = 1; h <= top(s); ++h) {
        const double x = (double(h) - centre) / width;
        s.amp[size_t(h)] *= float(1.0 + gain * std::exp(-0.5 * x * x));
    }
}
// Additive formant peaks on a 1/sqrt(h) source (vowel-like)
S vowel(double f1, double f2, double f3, double refHz) {
    S s = blank(64);
    for (int h = 1; h <= 64; ++h) {
        const double hz = refHz * h;
        auto pk = [&](double fc, double bw, double g) { const double x = (hz - fc) / bw; return g * std::exp(-0.5 * x * x); };
        const double env = pk(f1, 90, 1.0) + pk(f2, 120, 0.6) + pk(f3, 180, 0.3) + 0.03;
        p(s, h, float(env / std::sqrt(double(h))));
    }
    return s;
}
} // namespace

const char* name(int index0) { return kNames[std::clamp(index0, 0, kNumWaves - 1)]; }

WaveBank::Spectrum approximation(int i) {
    S s = blank();
    switch (std::clamp(i, 0, kNumWaves - 1)) {
        // SynSine1-7: sine-based tones
        case 0: p(s, 1, 1); break;
        case 1: p(s, 1, 1); p(s, 2, 0.5f); break;
        case 2: p(s, 1, 1); p(s, 3, 0.35f); break;
        case 3: p(s, 1, 1); p(s, 2, 0.5f); p(s, 3, 0.33f); p(s, 4, 0.25f); break;
        case 4: p(s, 1, 1); p(s, 4, 0.4f); p(s, 8, 0.2f); break;
        case 5: s = blank(48); saw(s, 48, 0.8f); formant(s, 5.0, 1.6, 4.0); break;
        case 6: for (int h = 1; h <= 15; h += 2) p(s, h, 1.0f / float(h * h)); break;
        // SynBass1-7
        case 7: s = blank(64); saw(s, 64); formant(s, 3.0, 1.0, 1.8); break;
        case 8: s = blank(63); square(s, 63); p(s, 1, 0.6f); break;
        case 9: s = blank(12); saw(s, 12); break;
        case 10: s = blank(64); pulse(s, 0.25, 64); break;
        case 11: s = blank(64); saw(s, 64); formant(s, 6.0, 1.2, 3.0); break;
        case 12: p(s, 1, 1); p(s, 2, 0.8f); p(s, 3, 0.6f); p(s, 4, 0.4f); p(s, 5, 0.3f); break;
        case 13: s = blank(40); saw(s, 40); for (int h = 2; h <= 40; h += 2) s.amp[size_t(h)] *= 0.5f; break;
        // SynWave1-9
        case 14: saw(s, 1023); break;
        case 15: square(s, 1023); break;
        case 16: pulse(s, 0.125, 1023); break;
        case 17: s = blank(256); saw(s, 256); formant(s, 12.0, 3.0, 2.5); break;
        case 18: s = blank(256); square(s, 256); for (int h = 2; h <= 256; h += 2) p(s, h, 0.3f / float(h)); break;
        case 19: s = blank(512); powerLaw(s, 0.7, 512); break;
        case 20: s = blank(128); saw(s, 128); formant(s, 4.0, 1.0, 2.0); formant(s, 10.0, 2.0, 2.0); break;
        case 21: s = blank(128); saw(s, 128); formant(s, 9.0, 3.0, 3.0); break;
        case 22: s = blank(256); for (int h = 1; h <= 256; ++h) p(s, h, float((1.0 + std::cos(kTwoPi * h / 6.0)) * 0.5 / h)); break;
        // 5thWave1-3: root + fifth. Table spans two note periods (root = harmonic 2, fifth = harmonic 3).
        case 23: s = blank(64); p(s, 2, 1); p(s, 3, 0.8f); s.pitchDivisor = 2; break;
        case 24: s = blank(512); for (int k = 1; 2 * k <= 512; ++k) p(s, 2 * k, 1.0f / k); for (int k = 1; 3 * k <= 512; ++k) p(s, 3 * k, 0.7f / k); s.pitchDivisor = 2; break;
        case 25: s = blank(512); for (int k = 1; 2 * k <= 512; k += 2) p(s, 2 * k, 1.0f / k); for (int k = 1; 3 * k <= 512; k += 2) p(s, 3 * k, 0.8f / k); s.pitchDivisor = 2; break;
        // Digi1-8: sparse / bright digital spectra
        case 26: p(s, 1, 1); p(s, 7, 0.7f); p(s, 11, 0.5f); p(s, 13, 0.4f); break;
        case 27: p(s, 1, 1); for (int h = 15; h <= 31; ++h) p(s, h, 1.0f / float(h) * 4.0f); break;
        case 28: { const int pr[] = { 1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31 }; for (int h : pr) p(s, h, 1.0f / std::sqrt(float(h))); } break;
        case 29: p(s, 1, 1); for (int h = 20; h <= 24; ++h) p(s, h, 0.3f); break;
        case 30: pulse(s, 0.06, 1023); break;
        case 31: p(s, 1, 1); p(s, 3, 0.4f); p(s, 9, 0.6f); p(s, 27, 0.4f); break;
        case 32: { Rng r(0xD161u); for (int h = 1; h <= 32; ++h) p(s, h, r.unipolar() / std::sqrt(float(h))); p(s, 1, 0.5f); } break;
        case 33: s = blank(64); saw(s, 64, 0.6f); formant(s, 16.0, 4.0, 6.0); p(s, 1, 0.4f); break;
        // Endless (Shepard): spectrum for display only; the oscillator renders it additively.
        case 34: p(s, 1, 1); p(s, 2, 1); p(s, 4, 1); p(s, 8, 1); p(s, 16, 1); break;
        // E.Piano1-4
        case 35: p(s, 1, 1); p(s, 2, 0.35f); p(s, 3, 0.08f); p(s, 7, 0.12f); break;
        case 36: p(s, 1, 1); p(s, 2, 0.5f); p(s, 4, 0.15f); p(s, 8, 0.08f); break;
        case 37: p(s, 1, 1); p(s, 3, 0.2f); p(s, 5, 0.1f); p(s, 14, 0.06f); break;
        case 38: p(s, 1, 1); p(s, 2, 0.25f); p(s, 3, 0.15f); p(s, 4, 0.1f); p(s, 5, 0.06f); p(s, 9, 0.1f); break;
        // Organ1-7: drawbar-style mixtures (8'=h1, 4'=h2, 2 2/3'=h3, 2'=h4, 1 3/5'=h5, 1 1/3'=h6, 1'=h8)
        case 39: p(s, 1, 1); p(s, 2, 0.8f); p(s, 4, 0.6f); break;
        case 40: p(s, 1, 1); p(s, 3, 0.7f); p(s, 4, 0.6f); p(s, 6, 0.5f); p(s, 8, 0.5f); break;
        case 41: p(s, 1, 1); p(s, 2, 0.7f); break;
        case 42: p(s, 1, 1); p(s, 3, 0.8f); break;
        case 43: for (int h : { 1, 2, 3, 4, 5, 6, 8 }) p(s, h, 0.6f); break;
        case 44: p(s, 1, 1); p(s, 4, 0.5f); p(s, 8, 0.3f); break;
        case 45: p(s, 1, 0.3f); p(s, 2, 1); p(s, 3, 0.8f); p(s, 4, 0.7f); break;
        // Clav1-2
        case 46: s = blank(256); pulse(s, 0.10, 256); formant(s, 8.0, 3.0, 1.5); break;
        case 47: s = blank(256); pulse(s, 0.20, 256); break;
        // Guitar1-3: plucked-string comb spectra
        case 48: s = blank(128); for (int h = 1; h <= 128; ++h) p(s, h, float(std::fabs(std::sin(kPi * h * 0.15)) / std::pow(double(h), 1.1))); break;
        case 49: s = blank(128); for (int h = 1; h <= 128; ++h) p(s, h, float(std::fabs(std::sin(kPi * h * 0.25)) / std::pow(double(h), 1.2))); break;
        case 50: s = blank(128); for (int h = 1; h <= 128; ++h) p(s, h, float(std::fabs(std::sin(kPi * h * 0.10)) / double(h))); break;
        // Bass1-5
        case 51: p(s, 1, 1); p(s, 2, 0.5f); p(s, 3, 0.2f); break;
        case 52: p(s, 1, 1); p(s, 2, 0.3f); p(s, 3, 0.3f); p(s, 4, 0.15f); p(s, 5, 0.1f); break;
        case 53: for (int h = 1; h <= 10; ++h) p(s, h, 1.0f / float(h * h)); break;
        case 54: p(s, 1, 1); p(s, 2, 0.7f); p(s, 4, 0.3f); break;
        case 55: square(s, 15); break;
        // Bell1-4: periodic approximations of bell partials; table spans 4 note periods (root = h4)
        case 56: s = blank(64); p(s, 2, 0.5f); p(s, 4, 1); p(s, 5, 0.5f); p(s, 6, 0.4f); p(s, 8, 0.7f); p(s, 10, 0.3f); p(s, 12, 0.25f); s.pitchDivisor = 4; break;
        case 57: s = blank(64); p(s, 4, 1); p(s, 9, 0.6f); p(s, 11, 0.5f); p(s, 15, 0.4f); p(s, 19, 0.3f); s.pitchDivisor = 4; break;
        case 58: s = blank(64); p(s, 4, 1); p(s, 8, 0.5f); p(s, 11, 0.6f); p(s, 13, 0.5f); p(s, 22, 0.3f); s.pitchDivisor = 4; break;
        case 59: s = blank(64); p(s, 4, 0.8f); p(s, 5, 0.6f); p(s, 6, 0.6f); p(s, 7, 0.5f); p(s, 17, 0.3f); p(s, 23, 0.2f); s.pitchDivisor = 4; break;
        // Voice1-4: vowel-like formant spectra (designed at a 200 Hz reference)
        case 60: s = vowel(800, 1150, 2900, 200); break;  // "a"
        case 61: s = vowel(400, 1600, 2700, 200); break;  // "e"
        case 62: s = vowel(270, 2300, 3000, 200); break;  // "i"
        case 63: s = vowel(450, 800, 2830, 200); break;   // "o"
        default: p(s, 1, 1); break;
    }
    return s;
}

bool parseHarmonicText(const std::string& text, WaveBank::Spectrum& out, std::string& error) {
    out = blank();
    std::istringstream in(text);
    std::string line;
    int implicitH = 1, count = 0, lineNo = 0;
    while (std::getline(in, line)) {
        ++lineNo;
        const auto hash = line.find('#');
        if (hash != std::string::npos) line.resize(hash);
        std::istringstream ls(line);
        std::vector<double> nums;
        double v;
        while (ls >> v) nums.push_back(v);
        if (nums.empty()) continue;
        int h;
        double a, ph = 0.0;
        if (nums.size() == 1) { h = implicitH++; a = nums[0]; }
        else { h = int(nums[0]); a = nums[1]; if (nums.size() > 2) ph = nums[2]; }
        if (h < 1 || h > WaveBank::kMaxHarmonics || !std::isfinite(a) || !std::isfinite(ph)) {
            error = "invalid entry on line " + std::to_string(lineNo);
            return false;
        }
        out.amp[size_t(h)] = float(a);
        out.phase[size_t(h)] = float(ph);
        ++count;
    }
    if (count == 0) { error = "no harmonics found"; return false; }
    float sum = 0.0f;
    for (float a : out.amp) sum += std::fabs(a);
    if (sum <= 1e-9f) { error = "all amplitudes are zero"; return false; }
    return true;
}

bool spectrumFromCycle(const std::vector<float>& cycle, WaveBank::Spectrum& out, std::string& error) {
    if (cycle.size() < 16) { error = "single cycle must have at least 16 samples"; return false; }
    std::vector<float> amps, phases;
    analyseSingleCycle(cycle, amps, phases);
    out = blank();
    float sum = 0.0f;
    for (size_t h = 1; h < amps.size() && h <= size_t(WaveBank::kMaxHarmonics); ++h) {
        out.amp[h] = amps[h];
        out.phase[h] = phases[h];
        sum += amps[h];
    }
    if (sum <= 1e-9f) { error = "cycle is silent"; return false; }
    return true;
}

std::string toHarmonicText(const WaveBank::Spectrum& s) {
    std::string r = "# Kestrel DWGS harmonic list: harmonic amplitude phase\n";
    char buf[96];
    for (size_t h = 1; h < s.amp.size(); ++h) {
        if (s.amp[h] == 0.0f) continue;
        std::snprintf(buf, sizeof(buf), "%zu %.9g %.9g\n", h, double(s.amp[h]), h < s.phase.size() ? double(s.phase[h]) : 0.0);
        r += buf;
    }
    return r;
}

} // namespace dwgs

// ------------------------------------------------------------------ VOX
namespace vox {
WaveBank::Spectrum frame(int fi) {
    // Original approximation of a vocal-cord (glottal) pulse family read from the
    // owner's manual figure 3-5: CONTROL 1 narrows the pulse; high values add a
    // decaying ripple after the pulse. No hardware data is used.
    const double c = std::clamp(double(fi) / double(kNumFrames - 1), 0.0, 1.0);
    const int n = 4096;
    std::vector<float> cyc(static_cast<size_t>(n));
    const double oq = 0.60 + (0.10 - 0.60) * c;  // open phase
    const double rise = 0.62 * oq;
    const double ring = 0.45 * c * c;
    const double ringCycles = 10.0 + 4.0 * c;   // ripple frequency (cycles per period)
    const double tau = 0.06;
    for (int i = 0; i < n; ++i) {
        const double t = double(i) / double(n);
        double v = 0.0;
        if (t < rise) v = 0.5 * (1.0 - std::cos(kPi * t / rise));
        else if (t < oq) v = std::cos(0.5 * kPi * (t - rise) / (oq - rise));
        if (t >= oq) {
            const double u = t - oq;
            v += -ring * std::exp(-u / tau) * std::sin(kTwoPi * ringCycles * u);
        }
        cyc[size_t(i)] = float(v);
    }
    WaveBank::Spectrum s;
    std::string err;
    dwgs::spectrumFromCycle(cyc, s, err); // DC is discarded (harmonic 0 unused)
    return s;
}
} // namespace vox

std::shared_ptr<const WaveTables> buildWaveTables(const DwgsOverrides* overrides) {
    auto t = std::make_shared<WaveTables>();
    std::vector<WaveBank::Spectrum> d;
    d.reserve(dwgs::kNumWaves);
    for (int i = 0; i < dwgs::kNumWaves; ++i) {
        if (overrides != nullptr && !(*overrides)[size_t(i)].amp.empty()) {
            d.push_back((*overrides)[size_t(i)]);
            t->dwgsUserSupplied[size_t(i)] = true;
        } else {
            d.push_back(dwgs::approximation(i));
        }
    }
    t->dwgs.build(d);
    std::vector<WaveBank::Spectrum> v;
    for (int i = 0; i < vox::kNumFrames; ++i) v.push_back(vox::frame(i));
    t->vox.build(v);
    return t;
}

} // namespace kestrel
