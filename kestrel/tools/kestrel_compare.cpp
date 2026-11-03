// kestrel_compare — compares a hardware reference recording with a Kestrel render.
//
//   kestrel_compare reference.wav kestrel.wav [--report out.md] [--csv out.csv] [--f0]
//
// 1. Converts both to mono, checks the sample rates match.
// 2. Aligns them: coarse lag from the cross-correlation of 5 ms log-energy envelopes,
//    then fine lag from the waveform cross-correlation around it.
// 3. Calibrates level (RMS ratio over the region where both are above -50 dB).
// 4. Reports, on the aligned / calibrated signals:
//      - envelope difference (10 ms RMS, dB) and per-note attack / release times,
//      - long-term 1/3-octave spectrum difference,
//      - time-varying spectral distance (1/3-octave bands per STFT frame),
//      - optional F0 trace difference (cents) for monophonic tests,
//      - null residual (reported for completeness only — not a perceptual measure).
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdio>
#include <fstream>
#include <numeric>
#include <string>
#include <vector>

#include "common/WavIO.h"
#include "core/Fft.h"

using namespace kestrel;
using namespace kestrel::tools;

namespace {
constexpr double kPi = 3.14159265358979323846;

std::vector<float> mono(const Audio& a) {
    std::vector<float> m(a.frames(), 0.0f);
    for (const auto& c : a.ch)
        for (size_t i = 0; i < m.size(); ++i) m[i] += c[i] / float(a.ch.size());
    return m;
}

std::vector<double> envelopeDb(const std::vector<float>& x, size_t hop) {
    std::vector<double> e;
    for (size_t i = 0; i + hop <= x.size(); i += hop) {
        double s = 0.0;
        for (size_t k = 0; k < hop; ++k) s += double(x[i + k]) * x[i + k];
        e.push_back(10.0 * std::log10(s / double(hop) + 1e-12));
    }
    return e;
}

long bestLag(const std::vector<double>& a, const std::vector<double>& b, long maxLag) {
    // normalised (Pearson) correlation of floor-clipped dB envelopes over the overlap;
    // overlaps shorter than half of the shorter signal are not considered
    double best = -2.0;
    long bl = 0;
    const long minOv = long(std::min(a.size(), b.size())) / 2;
    for (long lag = -maxLag; lag <= maxLag; ++lag) {
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        long n = 0;
        for (long i = 0; i < long(a.size()); ++i) {
            const long j = i + lag;
            if (j < 0 || j >= long(b.size())) continue;
            const double x = std::max(a[size_t(i)], -80.0), y = std::max(b[size_t(j)], -80.0);
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
            ++n;
        }
        if (n < minOv || n < 2) continue;
        const double cov = sab - sa * sb / double(n);
        const double va = saa - sa * sa / double(n), vb = sbb - sb * sb / double(n);
        if (va <= 0.0 || vb <= 0.0) continue;
        const double r = cov / std::sqrt(va * vb);
        if (r > best) { best = r; bl = lag; }
    }
    return bl;
}

// third-octave band energies of one frame (power spectrum)
std::vector<double> thirdOctaveBands(const std::vector<double>& pow, double fs, size_t n, std::vector<double>* centres = nullptr) {
    std::vector<double> bands;
    for (double fc = 31.5; fc < std::min(16000.0, fs * 0.45); fc *= std::pow(2.0, 1.0 / 3.0)) {
        const double lo = fc / std::pow(2.0, 1.0 / 6.0), hi = fc * std::pow(2.0, 1.0 / 6.0);
        const size_t k0 = size_t(lo * double(n) / fs), k1 = std::min(pow.size() - 1, size_t(hi * double(n) / fs));
        double e = 0.0;
        for (size_t k = k0; k <= k1; ++k) e += pow[k];
        bands.push_back(e);
        if (centres) centres->push_back(fc);
    }
    return bands;
}

std::vector<double> framePower(const float* x, size_t n) {
    std::vector<std::complex<double>> b(n);
    for (size_t i = 0; i < n; ++i) b[i] = { double(x[i]) * (0.5 - 0.5 * std::cos(2.0 * kPi * double(i) / double(n - 1))), 0.0 };
    fftInPlace(b, false);
    std::vector<double> p(n / 2);
    for (size_t k = 0; k < n / 2; ++k) p[k] = std::norm(b[k]);
    return p;
}

double yinF0(const float* x, size_t n, double fs, double fmin = 40.0, double fmax = 2000.0) {
    const size_t tmax = std::min(n / 2, size_t(fs / fmin)), tmin = size_t(fs / fmax);
    std::vector<double> d(tmax + 1, 0.0);
    for (size_t t = 1; t <= tmax; ++t)
        for (size_t i = 0; i + t < n; ++i) { const double v = double(x[i]) - x[i + t]; d[t] += v * v; }
    double run = 0.0;
    for (size_t t = 1; t <= tmax; ++t) {
        run += d[t];
        const double cm = run > 0 ? d[t] * double(t) / run : 1.0;
        if (t >= tmin && cm < 0.15) {
            while (t + 1 <= tmax && d[t + 1] < d[t]) ++t; // local minimum
            return fs / double(t);
        }
    }
    return 0.0;
}
} // namespace

int main(int argc, char** argv) {
    if (argc < 3) {
        std::printf("usage: kestrel_compare reference.wav kestrel.wav [--report out.md] [--csv out.csv] [--f0]\n");
        return 2;
    }
    std::string reportPath, csvPath;
    bool doF0 = false;
    for (int i = 3; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--report" && i + 1 < argc) reportPath = argv[++i];
        else if (a == "--csv" && i + 1 < argc) csvPath = argv[++i];
        else if (a == "--f0") doF0 = true;
    }
    Audio ra, ta;
    std::string err;
    if (!readWav(argv[1], ra, err)) { std::fprintf(stderr, "reference: %s\n", err.c_str()); return 1; }
    if (!readWav(argv[2], ta, err)) { std::fprintf(stderr, "kestrel: %s\n", err.c_str()); return 1; }
    if (std::fabs(ra.sampleRate - ta.sampleRate) > 0.5) {
        std::fprintf(stderr, "sample rates differ (%.0f vs %.0f): render Kestrel at the reference rate (kestrel_capture --rate)\n", ra.sampleRate, ta.sampleRate);
        return 1;
    }
    const double fs = ra.sampleRate;
    std::vector<float> ref = mono(ra), tst = mono(ta);

    // ---- alignment
    const size_t hop = size_t(0.005 * fs);
    const auto er = envelopeDb(ref, hop), et = envelopeDb(tst, hop);
    const long coarse = bestLag(er, et, long(2.0 * fs / double(hop))) * long(hop);
    // fine: waveform cross-correlation +- one hop around the coarse lag, on the loudest second
    size_t loud = 0;
    double loudE = -1e9;
    for (size_t i = 0; i < er.size(); ++i) if (er[i] > loudE) { loudE = er[i]; loud = i * hop; }
    const size_t seg0 = loud > size_t(0.5 * fs) ? loud - size_t(0.5 * fs) : 0, segN = size_t(fs);
    long fine = coarse;
    double bestC = -1e300;
    for (long lag = coarse - long(hop); lag <= coarse + long(hop); ++lag) {
        double c = 0.0;
        for (size_t i = seg0; i < std::min(ref.size(), seg0 + segN); ++i) {
            const long j = long(i) + lag;
            if (j >= 0 && j < long(tst.size())) c += double(ref[i]) * tst[size_t(j)];
        }
        if (c > bestC) { bestC = c; fine = lag; }
    }
    // build aligned copies (test shifted by -lag)
    std::vector<float> A, B;
    for (size_t i = 0; i < ref.size(); ++i) {
        const long j = long(i) + fine;
        if (j < 0 || j >= long(tst.size())) continue;
        A.push_back(ref[i]);
        B.push_back(tst[size_t(j)]);
    }
    if (A.size() < size_t(0.2 * fs)) { std::fprintf(stderr, "overlap after alignment is too short\n"); return 1; }

    // ---- level calibration
    const auto ea = envelopeDb(A, hop), eb = envelopeDb(B, hop);
    double sa = 0.0, sb = 0.0;
    for (size_t i = 0; i < ea.size(); ++i)
        if (ea[i] > -50.0 && eb[i] > -50.0) {
            for (size_t k = 0; k < hop; ++k) { sa += double(A[i * hop + k]) * A[i * hop + k]; sb += double(B[i * hop + k]) * B[i * hop + k]; }
        }
    const double gain = sb > 0.0 ? std::sqrt(sa / sb) : 1.0;
    for (auto& v : B) v = float(v * gain);

    // ---- envelopes (10 ms) + note attack/release
    const size_t eh = size_t(0.010 * fs);
    const auto envA = envelopeDb(A, eh), envB = envelopeDb(B, eh);
    double envDiff = 0.0;
    int envN = 0;
    for (size_t i = 0; i < envA.size(); ++i)
        if (std::max(envA[i], envB[i]) > -60.0) { envDiff += std::fabs(envA[i] - envB[i]); ++envN; }
    auto attackRelease = [&](const std::vector<double>& e, std::vector<double>& att, std::vector<double>& rel) {
        double peak = -200.0;
        for (double v : e) peak = std::max(peak, v);
        const double on = peak - 40.0;
        bool active = false;
        size_t start = 0;
        for (size_t i = 0; i < e.size(); ++i) {
            if (!active && e[i] > on) { active = true; start = i; }
            if (active && e[i] < on - 3.0) {
                // note segment [start, i): attack = time from -40 dB re note peak to within 1 dB of it
                double np = -200.0; size_t pi = start;
                for (size_t k = start; k < i; ++k) if (e[k] > np) { np = e[k]; pi = k; }
                size_t a10 = start;
                while (a10 < pi && e[a10] < np - 20.0) ++a10;
                size_t a90 = a10;
                while (a90 < pi && e[a90] < np - 1.0) ++a90;
                att.push_back(double(a90 - a10) * 0.010);
                size_t r0 = pi;
                while (r0 < i && e[r0] > np - 6.0) ++r0;
                size_t r1 = r0;
                while (r1 < i && e[r1] > np - 36.0) ++r1;
                rel.push_back(double(r1 - r0) * 0.010);
                active = false;
            }
        }
    };
    std::vector<double> attA, relA, attB, relB;
    attackRelease(envA, attA, relA);
    attackRelease(envB, attB, relB);

    // ---- spectra
    const size_t N = 4096, H = 1024;
    std::vector<double> ltA, ltB, centres;
    std::vector<double> sdFrames;
    for (size_t i = 0; i + N <= A.size(); i += H) {
        const auto pa = framePower(A.data() + i, N), pb = framePower(B.data() + i, N);
        std::vector<double> c;
        const auto ba = thirdOctaveBands(pa, fs, N, centres.empty() ? &c : nullptr), bb = thirdOctaveBands(pb, fs, N);
        if (centres.empty()) centres = c;
        if (ltA.empty()) { ltA.assign(ba.size(), 0.0); ltB.assign(bb.size(), 0.0); }
        double totA = 0.0;
        for (size_t k = 0; k < ba.size(); ++k) { ltA[k] += ba[k]; ltB[k] += bb[k]; totA += ba[k]; }
        if (10.0 * std::log10(totA / double(N) + 1e-20) < -70.0) continue;
        double d = 0.0;
        int nb = 0;
        for (size_t k = 0; k < ba.size(); ++k) {
            const double la = 10.0 * std::log10(ba[k] + 1e-20), lb = 10.0 * std::log10(bb[k] + 1e-20);
            if (std::max(la, lb) < 10.0 * std::log10(totA + 1e-20) - 60.0) continue; // ignore bands far below the frame
            d += std::fabs(la - lb);
            ++nb;
        }
        if (nb) sdFrames.push_back(d / nb);
    }
    std::vector<double> sdSorted = sdFrames;
    std::sort(sdSorted.begin(), sdSorted.end());
    auto pct = [&](double p) { return sdSorted.empty() ? 0.0 : sdSorted[std::min(sdSorted.size() - 1, size_t(p * double(sdSorted.size())))]; };

    // ---- F0
    std::vector<double> centsDiff;
    if (doF0) {
        const size_t fN = size_t(0.04 * fs);
        for (size_t i = 0; i + fN <= A.size(); i += fN / 2) {
            double ea2 = 0.0;
            for (size_t k = 0; k < fN; ++k) ea2 += double(A[i + k]) * A[i + k];
            if (10.0 * std::log10(ea2 / double(fN) + 1e-20) < -45.0) continue;
            const double fa = yinF0(A.data() + i, fN, fs), fb = yinF0(B.data() + i, fN, fs);
            if (fa > 0 && fb > 0) centsDiff.push_back(1200.0 * std::log2(fb / fa));
        }
    }
    std::vector<double> cAbs;
    for (double c : centsDiff) cAbs.push_back(std::fabs(c));
    std::sort(cAbs.begin(), cAbs.end());

    // ---- null residual (informative only)
    double ea3 = 0.0, er3 = 0.0;
    for (size_t i = 0; i < A.size(); ++i) { ea3 += double(A[i]) * A[i]; const double d = double(A[i]) - B[i]; er3 += d * d; }

    // ---- report
    std::string rep;
    char buf[512];
    auto add = [&](const char* fmt, auto... a) { std::snprintf(buf, sizeof buf, fmt, a...); rep += buf; };
    add("# Kestrel comparison report\n\nreference: `%s`  \nkestrel: `%s`  \nsample rate: %.0f Hz\n\n", argv[1], argv[2], fs);
    rep += "| measure | value |\n|---|---|\n";
    add("| alignment (kestrel lag) | %ld samples (%.2f ms) |\n", fine, 1000.0 * double(fine) / fs);
    add("| level calibration applied to kestrel | %+.2f dB |\n", 20.0 * std::log10(gain));
    add("| mean envelope difference (10 ms RMS, frames > -60 dB) | %.2f dB |\n", envN ? envDiff / envN : 0.0);
    add("| spectral distance per frame (1/3 oct, mean / median / 90th pct) | %.2f / %.2f / %.2f dB |\n",
        sdFrames.empty() ? 0.0 : std::accumulate(sdFrames.begin(), sdFrames.end(), 0.0) / double(sdFrames.size()), pct(0.5), pct(0.9));
    if (doF0) add("| F0 difference (median / 90th pct of |cents|, %zu frames) | %.1f / %.1f cents |\n", cAbs.size(),
                  cAbs.empty() ? 0.0 : cAbs[cAbs.size() / 2], cAbs.empty() ? 0.0 : cAbs[std::min(cAbs.size() - 1, size_t(0.9 * double(cAbs.size())))]);
    add("| null residual (informative only, phase-sensitive) | %.1f dB |\n\n", 10.0 * std::log10(er3 / (ea3 + 1e-20) + 1e-20));
    rep += "## Notes detected\n\n| # | attack ref (s) | attack kestrel (s) | release ref (s) | release kestrel (s) |\n|---|---|---|---|---|\n";
    for (size_t k = 0; k < std::max(attA.size(), attB.size()); ++k)
        add("| %zu | %s | %s | %s | %s |\n", k + 1, k < attA.size() ? std::to_string(attA[k]).substr(0, 5).c_str() : "-",
            k < attB.size() ? std::to_string(attB[k]).substr(0, 5).c_str() : "-", k < relA.size() ? std::to_string(relA[k]).substr(0, 5).c_str() : "-",
            k < relB.size() ? std::to_string(relB[k]).substr(0, 5).c_str() : "-");
    rep += "\n## Long-term spectrum (1/3 octave, kestrel minus reference)\n\n| band (Hz) | difference (dB) |\n|---|---|\n";
    double totLt = 0.0;
    for (double v : ltA) totLt += v;
    for (size_t k = 0; k < centres.size(); ++k) {
        if (10.0 * std::log10(ltA[k] + 1e-20) < 10.0 * std::log10(totLt + 1e-20) - 70.0) continue;
        add("| %.0f | %+.1f |\n", centres[k], 10.0 * std::log10((ltB[k] + 1e-20) / (ltA[k] + 1e-20)));
    }
    rep += "\nA low null residual is neither necessary nor sufficient for perceptual similarity: free-running oscillator and LFO "
           "phases, noise and sub-sample timing make it large even for identical sounds. Judge envelopes, spectra, pitch and "
           "listening tests together.\n";
    if (!reportPath.empty()) std::ofstream(reportPath) << rep;
    std::fputs(rep.c_str(), stdout);
    if (!csvPath.empty()) {
        std::ofstream c(csvPath);
        c << "time_s,env_ref_db,env_kestrel_db\n";
        for (size_t i = 0; i < std::min(envA.size(), envB.size()); ++i) c << double(i) * 0.010 << "," << envA[i] << "," << envB[i] << "\n";
    }
    return 0;
}
