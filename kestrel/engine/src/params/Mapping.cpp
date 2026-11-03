#include "params/Mapping.h"

#include <algorithm>
#include <cmath>

namespace kestrel::mapping {

namespace {
constexpr double kPi = 3.14159265358979323846;
inline double clampd(double v, double lo, double hi) { return std::min(hi, std::max(lo, v)); }
} // namespace

double noteToHz(double midiNote, double a4Hz) noexcept {
    return a4Hz * std::exp2((midiNote - 69.0) / 12.0);
}

double osc2TuneCents(double v) noexcept {
    v = clampd(v, -63.0, 63.0);
    const double a = std::fabs(v);
    double c;
    if (a <= 48.0) {
        const double x = a / 48.0;
        c = 1200.0 * x * x;            // fine resolution near zero
    } else {
        c = 1200.0 + (a - 48.0) / 15.0 * 1200.0;   // 48 -> 1 oct, 63 -> 2 oct
    }
    return v < 0.0 ? -c : c;
}

double pitchModCents(double intensity) noexcept {
    // Intensity may be the product (MOD INT x source) and therefore fractional.
    return osc2TuneCents(intensity);
}

double portamentoTau(double v) noexcept {
    if (v <= 0.0) return 0.0;
    // 1 -> ~3 ms, 64 -> ~0.12 s, 127 -> ~2.5 s time constant.
    return 0.003 * std::exp(v * (std::log(2.5 / 0.003) / 127.0));
}

double unisonOffsetCents(int voiceIndex, int numVoices, double detuneCents) noexcept {
    if (numVoices <= 1) return 0.0;
    const double pos = double(voiceIndex) / double(numVoices - 1); // 0..1
    return detuneCents * (pos - 0.5);
}

double ctrl2Depth(double ctrl2) noexcept { return clampd(ctrl2, 0.0, 127.0); }

double sawPhaseOffset(double ctrl1) noexcept { return 0.5 * clampd(ctrl1, 0.0, 127.0) / 127.0; }

double pulseWidth(double ctrl1) noexcept { return 0.5 * (1.0 - clampd(ctrl1, 0.0, 127.0) / 127.0); }

double triangleFoldGain(double ctrl1) noexcept { return 1.0 + 2.0 * clampd(ctrl1, 0.0, 127.0) / 127.0; }

double crossModDepthCycles(double ctrl1) noexcept {
    const double x = clampd(ctrl1, 0.0, 127.0) / 127.0;
    return 1.0 * x * x; // up to one cycle of peak phase deviation
}

double noiseCutoffHz(double ctrl1, double keyHz) noexcept {
    return keyHz * std::exp2((clampd(ctrl1, 0.0, 127.0) - 24.0) / 12.0);
}

double audioInBalanceIn1(double ctrl1) noexcept { return clampd(ctrl1, 0.0, 127.0) / 127.0; }

double levelToGain(double v) noexcept { return clampd(v, 0.0, 127.0) / 127.0; }

void panGains(double pan, float& gl, float& gr) noexcept {
    const double p = (clampd(pan, -63.0, 63.0) + 63.0) / 126.0; // 0..1
    gl = float(std::cos(p * 0.5 * kPi) * std::sqrt(2.0));
    gr = float(std::sin(p * 0.5 * kPi) * std::sqrt(2.0));
    // Centre = unity per side (equal-power law normalised to centre).
    gl = std::min(gl, 1.41421356f);
    gr = std::min(gr, 1.41421356f);
    if (std::fabs(pan) < 1e-6) { gl = 1.0f; gr = 1.0f; }
}

double ampKeyTrackGain(double noteDeltaFromC4, double kt) noexcept {
    const double dbPerOct = 4.5 * clampd(kt, -63.0, 63.0) / 63.0;
    const double db = clampd(dbPerOct * noteDeltaFromC4 / 12.0, -60.0, 18.0);
    return std::pow(10.0, db / 20.0);
}

double ampVelSenseGain(double velocity01, double sense) noexcept {
    // sense +63: gain = velocity^1.5 ; sense 0: unity ; negative: inverted response.
    const double s = clampd(sense, -63.0, 63.0) / 63.0;
    if (s == 0.0) return 1.0;
    const double v = clampd(velocity01, 0.0, 1.0);
    const double shaped = std::pow(s > 0.0 ? v : 1.0 - v, 1.5);
    return 1.0 - std::fabs(s) + std::fabs(s) * shaped;
}

double filterVelSenseSteps(double velocity01, double sense) noexcept {
    return clampd(sense, -63.0, 63.0) * (clampd(velocity01, 0.0, 1.0) - 0.5);
}

double cutoffStepsToHz(double steps) noexcept { return 440.0 * std::exp2((steps + 8.0 - 69.0) / 12.0); }

double filterKeyTrackSteps(double noteDeltaFromC4, double kt) noexcept {
    return noteDeltaFromC4 * clampd(kt, -63.0, 63.0) / 48.0;
}

double filterEgSteps(double eg, double egInt) noexcept { return eg * clampd(egInt, -63.0, 63.0) * 2.0; }

double resonanceToDamping12(double res) noexcept {
    const double r = clampd(res, 0.0, 127.0) / 127.0;
    const double r8 = std::pow(r, 8.0);
    return 1.4142135623730951 * (1.0 - r) * (1.0 - r) - 0.03 * r8;
}

double resonanceToDamping24(double res) noexcept {
    const double r = clampd(res, 0.0, 127.0) / 127.0;
    const double r8 = std::pow(r, 8.0);
    return 0.7653668647301796 * (1.0 - r) * (1.0 - r) - 0.03 * r8;
}

double egTimeSeconds(double v) noexcept {
    v = clampd(v, 0.0, 127.0);
    // ~1 ms at 0, ~0.4 s at 64, ~11.4 s at 127.
    return 0.001 + 0.0143 * (std::exp(0.0526 * v) - 1.0);
}

double egSustainLevel(double v) noexcept { return clampd(v, 0.0, 127.0) / 127.0; }

double lfoFreqHz(double v) noexcept {
    v = clampd(v, 0.0, 127.0);
    return 0.05 * std::exp2(v / 127.0 * 10.0); // 0.05 Hz .. 51.2 Hz
}

double lfoSyncNoteBeats(int index) noexcept {
    static const double beats[15] = { 4.0, 3.0, 8.0 / 3.0, 2.0, 1.5, 4.0 / 3.0, 1.0, 0.75, 2.0 / 3.0, 0.5,
                                      0.375, 1.0 / 3.0, 0.25, 1.0 / 6.0, 0.125 };
    return beats[std::clamp(index, 0, 14)];
}

double delaySyncNoteBeats(int index) noexcept {
    static const double beats[15] = { 0.125, 1.0 / 6.0, 0.25, 1.0 / 3.0, 0.375, 0.5, 2.0 / 3.0, 0.75, 1.0,
                                      4.0 / 3.0, 1.5, 2.0, 8.0 / 3.0, 3.0, 4.0 };
    return beats[std::clamp(index, 0, 14)];
}

double modFxLfoHz(double speed) noexcept {
    return 0.02 * std::exp2(clampd(speed, 0.0, 127.0) / 127.0 * 9.5); // 0.02 .. ~14.5 Hz
}

double delayTimeSeconds(double v) noexcept {
    const double x = clampd(v, 0.0, 127.0) / 127.0;
    return 0.001 + 1.4 * x * x; // up to ~1.4 s
}

double eqLowFreqHz(int index) noexcept {
    static const double hz[30] = { 40, 50, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
                                   320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 600, 700, 800, 900, 1000 };
    return hz[std::clamp(index, 0, 29)];
}

double eqHighFreqHz(int index) noexcept {
    static const double khz[30] = { 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00, 4.25, 4.50,
                                    4.75, 5.00, 5.25, 5.50, 5.75, 6.00, 7.00, 8.00, 9.00, 10.0, 11.0, 12.0, 14.0, 16.0, 18.0 };
    return 1000.0 * khz[std::clamp(index, 0, 29)];
}

double arpResolutionBeats(int index) noexcept {
    static const double beats[6] = { 1.0 / 6.0, 0.25, 1.0 / 3.0, 0.5, 2.0 / 3.0, 1.0 };
    return beats[std::clamp(index, 0, 5)];
}

double vocGridHz(int index) noexcept {
    static const double hz[kVocGridSize] = { 39, 50, 65, 80, 125, 185, 270, 350, 430, 530, 630, 780,
                                             950, 1150, 1380, 1680, 2070, 2780, 3800, 5000, 6400, 8100, 10510, 12600 };
    return hz[std::clamp(index, 0, kVocGridSize - 1)];
}

double vocGridHzInterp(double position) noexcept {
    if (position <= 0.0) {
        const double r = std::log(vocGridHz(1) / vocGridHz(0));
        return vocGridHz(0) * std::exp(r * position);
    }
    if (position >= double(kVocGridSize - 1)) {
        const double r = std::log(vocGridHz(kVocGridSize - 1) / vocGridHz(kVocGridSize - 2));
        return vocGridHz(kVocGridSize - 1) * std::exp(r * (position - double(kVocGridSize - 1)));
    }
    const int i = int(std::floor(position));
    const double f = position - double(i);
    return vocGridHz(i) * std::exp(f * std::log(vocGridHz(i + 1) / vocGridHz(i)));
}

int formantShiftSteps(int choiceIndex) noexcept {
    static const int steps[5] = { 0, 1, 2, -1, -2 };
    return steps[std::clamp(choiceIndex, 0, 4)];
}

double vocCutoffSteps(double cutoff) noexcept { return 2.0 * clampd(cutoff, -63.0, 63.0) / 63.0; }

double vocFcModSteps(double src, double intensity) noexcept { return 2.0 * src * clampd(intensity, -63.0, 63.0) / 63.0; }

double vocFollowerAttack(double sense) noexcept {
    const double x = clampd(sense, 0.0, 126.0) / 126.0;
    return 0.001 * std::exp(x * std::log(80.0)); // 1 ms .. 80 ms
}

double vocFollowerRelease(double sense) noexcept {
    const double x = clampd(sense, 0.0, 126.0) / 126.0;
    return 0.010 * std::exp(x * std::log(300.0)); // 10 ms .. 3 s
}

double vocGateThreshold(double v) noexcept {
    if (v <= 0.0) return 0.0;
    const double db = -80.0 + 60.0 * clampd(v, 0.0, 127.0) / 127.0; // -80 .. -20 dBFS
    return std::pow(10.0, db / 20.0);
}

double vocGateRelease(double v) noexcept {
    const double x = clampd(v, 0.0, 127.0) / 127.0;
    return 0.005 * std::exp(x * std::log(200.0)); // 5 ms .. 1 s
}

} // namespace kestrel::mapping
