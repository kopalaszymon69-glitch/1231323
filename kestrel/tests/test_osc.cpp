// Oscillator spectra, CONTROL 1 behaviour, band-limiting, sync / ring modulation.
#include "TestHelpers.h"
#include "osc/Wavetable.h"
#include "params/Mapping.h"

using namespace kh;

namespace {
struct Spec {
    std::vector<double> mag;
    size_t N = 0;
    double fs = 48000.0;
    std::vector<float> seg; // time-domain segment the spectrum was taken from
};
Spec steadySpectrum(const Program& p, int note, double fs = 48000.0) {
    const auto out = renderNote(p, note, 1.0, fs);
    Spec s;
    s.fs = fs;
    const size_t start = size_t(0.25 * fs);
    s.mag = ka::spectrum(out.l.data() + start, out.l.size() - start, s.N);
    s.seg.assign(out.l.begin() + long(start), out.l.begin() + long(start + s.N));
    return s;
}
double harm(const Spec& s, double f0, int h) { return ka::toneAmplitude(s.seg.data(), s.seg.size(), f0 * h, s.fs); }
Program osc1(const char* wave, float ctrl1 = 0) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", wave);
    set(p, "t1.osc1.ctrl1", ctrl1);
    return p;
}
} // namespace

TEST(saw_spectrum_and_aliasing_across_pitch) {
    for (int note : { 45, 69, 81, 93, 100 }) {
        const double f0 = mapping::noteToHz(note, 440.0);
        const auto s = steadySpectrum(osc1("Saw"), note);
        const double h1 = harm(s, f0, 1), h2 = harm(s, f0, 2), h3 = harm(s, f0, 3);
        // ideal sawtooth: harmonic n at 1/n
        CHECK_MSG(std::fabs(ka::db(h2 / h1) + 6.02) < 0.3, kt::fmt("note %g: h2 %g dB", note, ka::db(h2 / h1)));
        if (f0 * 3 < 20000) CHECK_MSG(std::fabs(ka::db(h3 / h1) + 9.54) < 0.5, kt::fmt("note %g: h3 %g dB", note, ka::db(h3 / h1)));
        const double spur = ka::worstSpurDb(s.mag, f0, s.fs, s.N, 20000.0);
        std::printf("    saw note %d (%.0f Hz): worst alias component %.1f dB re strongest\n", note, f0, spur);
        CHECK_MSG(spur < -60.0, kt::fmt("note %g: alias %g dB", note, spur));
    }
}

TEST(saw_ctrl1_phase_offset_gives_octave_at_127) {
    const double f0 = 220.0;
    const auto s0 = steadySpectrum(osc1("Saw", 0), 57);
    const auto s127 = steadySpectrum(osc1("Saw", 127), 57);
    CHECK(harm(s0, f0, 1) > 0.1);
    // 127: second saw shifted by half a cycle -> odd harmonics cancel (octave-up saw) [FIG 3-1]
    CHECK(ka::db(harm(s127, f0, 1) / harm(s127, f0, 2)) < -50.0);
    CHECK(ka::db(harm(s127, f0, 3) / harm(s127, f0, 2)) < -50.0);
    // 63: partial cancellation (fundamental reduced but present)
    const auto s63 = steadySpectrum(osc1("Saw", 63.5f), 57);
    const double rel = ka::db(harm(s63, f0, 1) / harm(s0, f0, 1));
    CHECK(rel < -2.0 && rel > -6.0);
}

TEST(pulse_width_control) {
    const double f0 = 220.0;
    const auto sq = steadySpectrum(osc1("Square", 0), 57);
    CHECK(ka::db(harm(sq, f0, 2) / harm(sq, f0, 1)) < -60.0); // 50 %: no even harmonics
    CHECK(std::fabs(ka::db(harm(sq, f0, 3) / harm(sq, f0, 1)) + 9.54) < 0.6);
    const auto p25 = steadySpectrum(osc1("Square", 63.5f), 57); // 25 %: every 4th harmonic missing
    CHECK(ka::db(harm(p25, f0, 4) / harm(p25, f0, 1)) < -40.0);
    CHECK(ka::db(harm(p25, f0, 2) / harm(p25, f0, 1)) > -6.0);
    const auto p0 = renderNote(osc1("Square", 127), 57, 0.5); // 0 %: silent [DOC p.18]
    CHECK(ka::peakAbs(p0.l, 4800) < 1e-3f);
}

TEST(triangle_fold_reaches_octave_and_fifth) {
    const double f0 = 220.0;
    const auto t0 = steadySpectrum(osc1("Triangle", 0), 57);
    CHECK(ka::db(harm(t0, f0, 3) / harm(t0, f0, 1)) < -18.0); // triangle: h3 = 1/9
    CHECK(ka::db(harm(t0, f0, 2) / harm(t0, f0, 1)) < -60.0);
    const auto t127 = steadySpectrum(osc1("Triangle", 127), 57);
    // [DOC p.19] 127 = pitch one octave and a fifth higher -> 3rd harmonic dominates
    CHECK(harm(t127, f0, 3) > 10.0 * harm(t127, f0, 1));
    const double spur = ka::worstSpurDb(t127.mag, f0, t127.fs, t127.N, 20000.0);
    CHECK_MSG(spur < -60.0, kt::fmt("fold alias %g dB", spur));
}

TEST(sine_cross_modulation) {
    const double f0 = 220.0;
    const auto s0 = steadySpectrum(osc1("Sine", 0), 57);
    CHECK(ka::db(harm(s0, f0, 2) / harm(s0, f0, 1)) < -80.0);
    Program x = osc1("Sine", 80);
    set(x, "t1.osc2.semitone", 7);
    const auto sx = steadySpectrum(x, 57);
    // OSC2 a fifth up modulates the sine: sidebands at f1 +- f2 appear
    const double f2 = f0 * std::exp2(7.0 / 12.0);
    CHECK(ka::peakAt(sx.mag, f2 - f0, sx.fs, sx.N, 3) > 0.01 * harm(sx, f0, 1));
    CHECK(ka::peakAt(sx.mag, f2 + f0, sx.fs, sx.N, 3) > 0.01 * harm(sx, f0, 1));
}

TEST(osc2_sync_is_periodic_at_osc1_pitch) {
    Program p = basicProgram();
    set(p, "t1.mixer.osc1", 0);
    set(p, "t1.mixer.osc2", 127);
    setChoice(p, "t1.osc2.mod", "Sync");
    set(p, "t1.osc2.semitone", 7);
    set(p, "t1.osc2.tune", 13);
    for (int note : { 45, 69, 84 }) {
        const double f0 = mapping::noteToHz(note, 440.0);
        const auto s = steadySpectrum(p, note);
        // energy only at harmonics of OSC1 [DOC p.22: fundamental does not change]
        const double inh = ka::inharmonicRatio(s.mag, f0, s.fs, s.N, 20000.0);
        std::printf("    sync note %d: inharmonic energy %.1f dB\n", note, 10.0 * std::log10(inh + 1e-20));
        CHECK_MSG(10.0 * std::log10(inh + 1e-20) < -50.0, kt::fmt("note %g: inharmonic %g dB", note, 10 * std::log10(inh + 1e-20)));
    }
}

TEST(osc2_ring_produces_sum_and_difference) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    setChoice(p, "t2.osc1.wave", "Sine");
    set(p, "t1.mixer.osc1", 0);
    set(p, "t1.mixer.osc2", 127);
    setChoice(p, "t1.osc2.mod", "Ring");
    setChoice(p, "t1.osc2.wave", "Triangle");
    set(p, "t1.osc2.semitone", 19); // ratio ~2.997
    const double f1 = 220.0, f2 = 220.0 * std::exp2(19.0 / 12.0);
    const auto s = steadySpectrum(p, 57);
    const double sum = ka::peakAt(s.mag, f2 + f1, s.fs, s.N, 3), diff = ka::peakAt(s.mag, f2 - f1, s.fs, s.N, 3);
    const double carrier = ka::peakAt(s.mag, f2, s.fs, s.N, 3);
    CHECK(sum > 10.0 * carrier && diff > 10.0 * carrier); // OSC2 itself is suppressed
}

TEST(noise_osc_lowpass_tracks_control1) {
    Program dark = osc1("Noise", 10), bright = osc1("Noise", 120);
    const auto a = steadySpectrum(dark, 60), b = steadySpectrum(bright, 60);
    auto band = [](const Spec& s, double lo, double hi) {
        double e = 0;
        for (size_t k = size_t(lo * s.N / s.fs); k < size_t(hi * s.N / s.fs); ++k) e += s.mag[k] * s.mag[k];
        return e;
    };
    CHECK(band(b, 5000, 15000) > 100.0 * band(a, 5000, 15000));
}

TEST(dwgs_tables_are_periodic_and_labelled) {
    CHECK(std::string(dwgs::name(0)) == "SynSine1");
    CHECK(std::string(dwgs::name(34)) == "Endless");
    CHECK(std::string(dwgs::name(63)) == "Voice4");
    // (5thWave 24-26 and Bell 57-60 span several note periods by design and are checked separately)
    for (int idx : { 1, 8, 15, 27, 36, 41, 52, 61 }) {
        Program p = osc1("DWGS");
        set(p, "t1.osc1.dwgs", float(idx));
        const auto s = steadySpectrum(p, 57);
        const double inh = ka::inharmonicRatio(s.mag, 220.0, s.fs, s.N, 20000.0);
        CHECK_MSG(10.0 * std::log10(inh + 1e-20) < -60.0, kt::fmt("DWGS %g inharmonic %g dB", idx, 10 * std::log10(inh + 1e-20)));
    }
    // 5thWave: root + fifth (table spans two periods; root remains the played note)
    Program f = osc1("DWGS");
    set(f, "t1.osc1.dwgs", 24);
    const auto s = steadySpectrum(f, 57);
    CHECK(harm(s, 220.0, 1) > 0.1 && harm(s, 330.0, 1) > 0.05);
    CHECK(ka::peakAt(s.mag, 110.0, s.fs, s.N, 2) < 1e-3);
}

TEST(dwgs_endless_octaves_are_identical) {
    Program p = osc1("DWGS");
    set(p, "t1.osc1.dwgs", 35);
    const auto a = steadySpectrum(p, 60), b = steadySpectrum(p, 72);
    // same partial frequencies with the same weights (Shepard tone)
    double maxd = 0.0;
    for (double hz : { 130.81, 261.63, 523.25, 1046.5, 2093.0 })
        maxd = std::max(maxd, std::fabs(ka::db(ka::peakAt(a.mag, hz, a.fs, a.N, 3)) - ka::db(ka::peakAt(b.mag, hz, b.fs, b.N, 3))));
    CHECK_MSG(maxd < 1.0, kt::fmt("max partial difference %g dB", maxd));
}

TEST(dwgs_import_text_and_cycle) {
    WaveBank::Spectrum s;
    std::string err;
    CHECK(dwgs::parseHarmonicText("# test\n1 1.0\n3 0.5 0.0\n", s, err));
    CHECK_NEAR(s.amp[3], 0.5, 1e-9);
    CHECK(!dwgs::parseHarmonicText("0 1\n", s, err));
    std::vector<float> cyc(600);
    for (size_t i = 0; i < cyc.size(); ++i) cyc[i] = float(std::sin(2 * ka::kPi * i / 600.0) + 0.25 * std::sin(2 * ka::kPi * 5 * i / 600.0));
    CHECK(dwgs::spectrumFromCycle(cyc, s, err));
    CHECK_NEAR(s.amp[5] / s.amp[1], 0.25, 0.01);
    // round trip through the state text
    WaveBank::Spectrum t;
    CHECK(dwgs::parseHarmonicText(dwgs::toHarmonicText(s), t, err));
    CHECK_NEAR(t.amp[5], s.amp[5], 1e-6);
}

TEST(vox_wave_changes_with_control1) {
    const auto a = steadySpectrum(osc1("Vox Wave", 0), 57), b = steadySpectrum(osc1("Vox Wave", 127), 57);
    auto hiEnergy = [](const Spec& s) { double e = 0; for (int h = 8; h < 40; ++h) e += std::pow(ka::peakAt(s.mag, 220.0 * h, s.fs, s.N, 2), 2); return e; };
    CHECK(hiEnergy(b) > 10.0 * hiEnergy(a)); // narrower pulse + ripple = brighter
}

TEST(audio_in_balance) {
    Program p = osc1("Audio In", 127);
    std::vector<float> in1(48000 * 1), in2(48000 * 1);
    for (size_t i = 0; i < in1.size(); ++i) { in1[i] = float(0.5 * std::sin(2 * ka::kPi * 300 * i / 48000.0)); in2[i] = float(0.5 * std::sin(2 * ka::kPi * 700 * i / 48000.0)); }
    for (float c : { 127.0f, 0.0f }) {
        set(p, "t1.osc1.ctrl1", c);
        Rig r(p);
        r.rs.in1 = &in1;
        r.rs.in2 = &in2;
        const auto out = r.run({ noteOn(0.0, 60, 100) }, 0.9);
        size_t N;
        const auto m = ka::spectrum(out.l.data() + 9600, 32768, N);
        const double a = ka::peakAt(m, 300, 48000, N), b = ka::peakAt(m, 700, 48000, N);
        if (c > 100) CHECK(a > 100 * b);   // 127 = only AUDIO IN 1 [DOC p.21]
        else CHECK(b > 100 * a);           // 0 = only AUDIO IN 2
    }
}
