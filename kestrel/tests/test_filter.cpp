// Filter model: responses, slopes, resonance, self-oscillation, sample rates.
#include "TestHelpers.h"
#include "filter/MultimodeFilter.h"
#include "params/Mapping.h"

using namespace kh;

namespace {
// steady-state gain of the filter for a sine at hz (small signal unless amp given)
double gainAt(FilterKind type, double fc, double res, double fs, double hz, double amp = 0.1) {
    MultimodeFilter f;
    f.reset();
    f.setCoefficients(type, fc, res, fs);
    const int n = int(fs * 0.25);
    double peak = 0.0;
    for (int i = 0; i < n; ++i) {
        const float y = f.process(float(amp * std::sin(2 * ka::kPi * hz * i / fs)));
        if (i > n / 2) peak = std::max(peak, double(std::fabs(y)));
    }
    return peak / amp;
}
} // namespace

TEST(filter_responses_at_resonance_zero) {
    const double fs = 96000.0, fc = 1000.0;
    // 4th-order Butterworth: -3 dB at fc, ~-24 dB/oct
    CHECK_NEAR(ka::db(gainAt(FilterKind::LP24, fc, 0, fs, fc)), -3.01, 0.3);
    const double s24 = ka::db(gainAt(FilterKind::LP24, fc, 0, fs, 4000)) - ka::db(gainAt(FilterKind::LP24, fc, 0, fs, 8000));
    CHECK_MSG(std::fabs(s24 - 24.0) < 2.0, kt::fmt("LP24 slope %g dB/oct", s24));
    CHECK_NEAR(ka::db(gainAt(FilterKind::LP12, fc, 0, fs, fc)), -3.01, 0.3);
    const double s12 = ka::db(gainAt(FilterKind::LP12, fc, 0, fs, 4000)) - ka::db(gainAt(FilterKind::LP12, fc, 0, fs, 8000));
    CHECK_MSG(std::fabs(s12 - 12.0) < 1.5, kt::fmt("LP12 slope %g dB/oct", s12));
    CHECK_NEAR(ka::db(gainAt(FilterKind::HP12, fc, 0, fs, fc)), -3.01, 0.3);
    const double sh = ka::db(gainAt(FilterKind::HP12, fc, 0, fs, 250)) - ka::db(gainAt(FilterKind::HP12, fc, 0, fs, 125));
    CHECK_MSG(std::fabs(sh - 12.0) < 1.5, kt::fmt("HP12 slope %g dB/oct", sh));
    CHECK_NEAR(ka::db(gainAt(FilterKind::BP12, fc, 0, fs, fc)), 0.0, 0.3);
    CHECK(gainAt(FilterKind::BP12, fc, 0, fs, 100) < 0.2 && gainAt(FilterKind::BP12, fc, 0, fs, 10000) < 0.2);
    // passbands stay at unity
    CHECK_NEAR(ka::db(gainAt(FilterKind::LP24, fc, 0, fs, 50)), 0.0, 0.1);
    CHECK_NEAR(ka::db(gainAt(FilterKind::HP12, fc, 0, fs, 20000)), 0.0, 0.2);
}

TEST(filter_resonance_peak_grows_monotonically) {
    for (FilterKind t : { FilterKind::LP24, FilterKind::LP12 }) {
        double prev = -100.0;
        for (double r : { 0.0, 40.0, 80.0, 100.0, 110.0 }) {
            // small-signal response (the near-self-oscillation limiter stays inactive)
            const double g = ka::db(gainAt(t, 1000.0, r, 96000.0, 1000.0, 0.002));
            CHECK_MSG(g > prev, kt::fmt("res %g: %g dB", r, g));
            prev = g;
        }
        CHECK(prev > 12.0);
        // large signals near self-oscillation are bounded by the limiter [ENG]
        CHECK(gainAt(t, 1000.0, 120.0, 96000.0, 1000.0, 0.5) * 0.5 < 4.0);
    }
}

TEST(filter_self_oscillation_pitch_and_bound) {
    for (double fs : { 88200.0, 96000.0, 192000.0 }) {
        for (FilterKind t : { FilterKind::LP24, FilterKind::LP12, FilterKind::BP12 }) {
            for (double fc : { 220.0, 1000.0, 4000.0 }) {
                MultimodeFilter f;
                f.reset();
                f.seed();
                f.setCoefficients(t, fc, 127.0, fs);
                std::vector<float> y(size_t(fs * 1.5));
                for (auto& v : y) v = f.process(0.0f);
                const size_t tail = size_t(fs * 0.5);
                const float pk = ka::peakAbs(y, y.size() - tail);
                const double hz = ka::zeroCrossingFreq(y.data() + y.size() - tail, tail, fs);
                CHECK_MSG(pk > 0.1f && pk < 3.0f, kt::fmt("fs %g fc %g: amplitude %g", fs, fc, pk));
                CHECK_MSG(std::fabs(1200.0 * std::log2(hz / fc)) < 35.0, kt::fmt("fs %g: osc %g Hz for fc %g", fs, hz, fc));
            }
        }
    }
}

TEST(filter_cutoff_accuracy_across_sample_rates) {
    for (double fs : { 44100.0, 48000.0, 88200.0, 96000.0, 192000.0 }) {
        for (double fc : { 100.0, 1000.0, 8000.0 }) {
            const double g = ka::db(gainAt(FilterKind::LP12, fc, 0, fs, fc));
            CHECK_MSG(std::fabs(g + 3.01) < 0.3, kt::fmt("fs %g fc %g: %g dB at fc", fs, fc, g));
        }
    }
}

TEST(filter_extreme_modulation_is_stable) {
    MultimodeFilter f;
    f.reset();
    Rng r(7);
    float peak = 0.0f;
    for (int i = 0; i < 200000; ++i) {
        const double fc = 20.0 * std::exp2(r.unipolar() * 10.5);
        f.setCoefficients(FilterKind(i / 50000), fc, 127.0 * r.unipolar(), 96000.0);
        const float y = f.process(r.bipolar() * 2.0f);
        CHECK(isFiniteF(y));
        peak = std::max(peak, std::fabs(y));
    }
    CHECK_MSG(peak < 50.0f, kt::fmt("peak %g", peak));
}

TEST(filter_key_track_and_eg_via_engine) {
    // Key track +48: cutoff follows the key 1:1 -> the 12 dB LPF output level of a sine at the key
    // pitch is constant across the keyboard.
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    setChoice(p, "t1.filter.type", "-12dB LPF");
    set(p, "t1.filter.keyTrack", 48);
    // cutoff steps = key - 8 at C4 (60): f = 440 * 2^((52+8-69)/12) = note pitch at C4
    set(p, "t1.filter.cutoff", 52);
    double prev = -1.0;
    for (int note : { 48, 60, 72, 84 }) {
        const auto out = renderNote(p, note, 0.5);
        const double lvl = ka::db(ka::rms(out.l.data() + 9600, 9600));
        if (prev > -1.0) CHECK_MSG(std::fabs(lvl - prev) < 0.5, kt::fmt("note %g: %g dB vs %g", note, lvl, prev));
        prev = lvl;
    }
}
