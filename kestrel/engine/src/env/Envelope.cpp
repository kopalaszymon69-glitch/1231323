#include "env/Envelope.h"

#include <cmath>

namespace kestrel {

void Envelope::setParams(double attackS, double decayS, double sustain, double releaseS) noexcept {
    // Attack: level(t) = T (1 - exp(-t/tau)) reaches 1.0 at t = attackS.
    const double ln = std::log(double(kAttackTarget) / (double(kAttackTarget) - 1.0));
    const double tauA = std::max(attackS, 1e-4) / ln;
    attackCoef_ = float(1.0 - std::exp(-1.0 / (tauA * fs_)));
    // Decay / release: -60 dB of the span after the given time (tau = t / ln(1000)).
    const double tauD = std::max(decayS, 1e-4) / 6.907755;
    const double tauR = std::max(releaseS, 1e-4) / 6.907755;
    decayCoef_ = float(1.0 - std::exp(-1.0 / (tauD * fs_)));
    releaseCoef_ = float(1.0 - std::exp(-1.0 / (tauR * fs_)));
    sustain_ = float(clampv(sustain, 0.0, 1.0));
}

} // namespace kestrel
