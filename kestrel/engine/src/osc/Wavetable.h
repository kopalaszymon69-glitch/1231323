#pragma once

#include <array>
#include <memory>
#include <string>
#include <vector>

namespace kestrel {

// A set of single-cycle frames, each stored at several band-limited "mip" levels.
// Level L keeps harmonics 1 .. (kMaxHarmonics >> L). Built off the audio thread;
// immutable afterwards (shared read-only by voices).
class WaveBank {
public:
    static constexpr int kTableSize = 2048;
    static constexpr int kMaxHarmonics = 1023;
    static constexpr int kNumLevels = 11; // ~1024, 512, ..., 1 harmonics

    struct Spectrum {
        std::vector<float> amp;   // index = harmonic number (0 unused)
        std::vector<float> phase; // radians, sine phase
        int pitchDivisor = 1;     // table period spans this many note periods (e.g. 2 for "5th" waves)
    };

    // Builds all frames; each frame is peak-normalised to 1.0 at its fullest level.
    void build(const std::vector<Spectrum>& frames);
    int numFrames() const noexcept { return numFrames_; }
    int pitchDivisor(int frame) const noexcept { return divisors_[size_t(frame)]; }

    // Table lookup: frame f, level L, phase in [0,1). Linear interpolation.
    float lookup(int frame, int level, double phase) const noexcept {
        const float* t = data_.data() + (size_t(frame) * kNumLevels + size_t(level)) * (kTableSize + 1);
        const double pos = phase * double(kTableSize);
        int i = int(pos);
        if (i >= kTableSize) i = kTableSize - 1;
        if (i < 0) i = 0;
        const float fr = float(pos - double(i));
        return t[i] + (t[i + 1] - t[i]) * fr;
    }

private:
    int numFrames_ = 0;
    std::vector<float> data_;
    std::vector<int> divisors_;
};

// Picks the brightest mip level whose harmonics cannot alias into the audible band
// at the given oversampling factor. With factor >= 2 the level switch only changes
// content above the base-rate Nyquist frequency (removed by the decimator), so no
// crossfade is required. At 1x the level is strictly alias-free (may be duller).
int selectMipLevel(double tableHz, double fsOs, int osFactor) noexcept;

// ---------------------------------------------------------------- DWGS
// The 64 slot NAMES are documented (owner's manual table 3-1). The waveform data of
// the original instrument is NOT available; Kestrel's tables are original additive
// approximations designed to fit each documented category. They are labelled as
// such in the UI and can be replaced per slot by user-supplied data.
namespace dwgs {
constexpr int kNumWaves = 64;
const char* name(int index0);                 // documented name, index0 = 0..63
WaveBank::Spectrum approximation(int index0); // Kestrel's original approximation
constexpr int kEndlessIndex0 = 34;            // "Endless": rendered additively (Shepard tone)

// User import. Accepted text format (one entry per line, '#' starts a comment):
//   <harmonic> <amplitude> [phase_radians]
// or a plain list of amplitudes, one per line (harmonic 1, 2, 3 ...).
bool parseHarmonicText(const std::string& text, WaveBank::Spectrum& out, std::string& error);
// Single-cycle sample data (any length >= 16) -> spectrum (via FFT).
bool spectrumFromCycle(const std::vector<float>& cycle, WaveBank::Spectrum& out, std::string& error);
// Serialise a spectrum as harmonic text (used for plug-in state of imported slots).
std::string toHarmonicText(const WaveBank::Spectrum& s);
} // namespace dwgs

// ---------------------------------------------------------------- VOX
namespace vox {
constexpr int kNumFrames = 17; // CONTROL 1 = 0, 8, ..., 127 (frames are interpolated)
WaveBank::Spectrum frame(int frameIndex);
} // namespace vox

// Shared, immutable tables used by every voice.
struct WaveTables {
    WaveBank dwgs;
    WaveBank vox;
    std::array<bool, dwgs::kNumWaves> dwgsUserSupplied {};
};
using DwgsOverrides = std::array<WaveBank::Spectrum, dwgs::kNumWaves>;
// Builds tables (expensive: call off the audio thread). Non-empty overrides[i].amp replaces slot i.
std::shared_ptr<const WaveTables> buildWaveTables(const DwgsOverrides* overrides);

} // namespace kestrel
