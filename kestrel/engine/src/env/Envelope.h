#pragma once

#include "core/DspMath.h"

namespace kestrel {

// ADSR envelope generator (owner's manual p.26 / p.28).
// [DOC] stage semantics, EG RESET behaviour (start from 0 vs. current level).
// [ENG] segment shapes: attack = exponential approach toward an overshoot target
//       (reaches 1.0 at the attack time); decay/release = exponential, times are
//       time-to-(-60 dB) of the segment span. Times from mapping::egTimeSeconds().
class Envelope {
public:
    enum class Stage : uint8_t { Idle, Attack, Decay, Sustain, Release };

    void setSampleRate(double fs) noexcept { fs_ = fs; }
    // Times in seconds, sustain 0..1. Cheap enough to call every control tick.
    void setParams(double attackS, double decayS, double sustain, double releaseS) noexcept;

    void noteOn(bool resetToZero) noexcept {
        if (resetToZero) level_ = 0.0f;
        stage_ = Stage::Attack;
    }
    void noteOff() noexcept {
        if (stage_ != Stage::Idle) stage_ = Stage::Release;
    }
    void kill() noexcept { stage_ = Stage::Idle; level_ = 0.0f; }

    inline float process() noexcept {
        switch (stage_) {
            case Stage::Idle: return 0.0f;
            case Stage::Attack:
                level_ += (kAttackTarget - level_) * attackCoef_;
                if (level_ >= 1.0f) { level_ = 1.0f; stage_ = Stage::Decay; }
                break;
            case Stage::Decay:
                level_ += (sustain_ - level_) * decayCoef_;
                if (std::fabs(level_ - sustain_) < 1e-5f) { level_ = sustain_; stage_ = Stage::Sustain; }
                break;
            case Stage::Sustain:
                level_ += (sustain_ - level_) * decayCoef_; // follows sustain changes smoothly
                break;
            case Stage::Release:
                level_ += (0.0f - level_) * releaseCoef_;
                if (level_ < 1e-5f) { level_ = 0.0f; stage_ = Stage::Idle; }
                break;
        }
        return level_;
    }

    float level() const noexcept { return level_; }
    Stage stage() const noexcept { return stage_; }
    bool isActive() const noexcept { return stage_ != Stage::Idle; }

private:
    static constexpr float kAttackTarget = 1.3f;
    double fs_ = 48000.0;
    float level_ = 0.0f, sustain_ = 1.0f;
    float attackCoef_ = 1.0f, decayCoef_ = 1.0f, releaseCoef_ = 1.0f;
    Stage stage_ = Stage::Idle;
};

} // namespace kestrel
