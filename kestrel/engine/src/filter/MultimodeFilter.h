#pragma once

#include "filter/Svf.h"
#include "params/Mapping.h"
#include "params/Params.h"

namespace kestrel {

// Kestrel's default multimode filter model ("TptSvfModel").
//
//   -12 dB LPF / BPF / HPF : one TPT SVF (shared core, so type switches are click-free)
//   -24 dB LPF             : fixed Butterworth SVF pre-stage (k = 1.848) followed by the
//                            same resonant SVF core (k from resonance). At resonance 0 the
//                            cascade is a 4th-order Butterworth low-pass.
//
// Behaviour established by documentation: four types and slopes, resonance up to
// self-oscillation, cutoff/EG/key-track semantics (owner's manual p.24-25). Topology,
// resonance curve and gain behaviour are engineering approximations [ENG]; the class
// is self-contained so it can be replaced once measurements exist.
class MultimodeFilter {
public:
    void reset() noexcept { pre_.reset(); core_.reset(); }

    // Call once per (base-rate) control update.
    void setCoefficients(FilterKind type, double cutoffHz, double resonance, double fsOs) noexcept {
        type_ = type;
        g_ = svfG(cutoffHz, fsOs);
        if (type == FilterKind::LP24) k_ = float(mapping::resonanceToDamping24(resonance));
        else k_ = float(mapping::resonanceToDamping12(resonance));
    }
    // Linear interpolation target for smooth per-sample updates at high rates.
    float g() const noexcept { return g_; }

    inline float process(float x) noexcept {
        float lp, bp, hp;
        switch (type_) {
            case FilterKind::LP24: {
                const float s1 = pre_.lowpassLinear(x, g_, float(mapping::kLp24Stage1Damping));
                core_.tick(s1, g_, k_, lp, bp, hp);
                return lp;
            }
            case FilterKind::LP12: core_.tick(x, g_, k_, lp, bp, hp); return lp;
            case FilterKind::BP12: core_.tick(x, g_, k_, lp, bp, hp); return bp * 1.41421356f;
            case FilterKind::HP12: core_.tick(x, g_, k_, lp, bp, hp); return hp;
        }
        return x;
    }

    // Injects an inaudible deterministic seed so a filter set to self-oscillate can
    // start even with silent input (digital filters do not self-start from zero).
    void seed() noexcept { core_.ic1 += 1e-4f; }

    bool sanitize() noexcept {
        const bool a = pre_.sanitizeState();
        const bool b = core_.sanitizeState();
        return a || b;
    }

private:
    Svf pre_, core_;
    FilterKind type_ = FilterKind::LP24;
    float g_ = 0.5f, k_ = 1.414f;
};

} // namespace kestrel
