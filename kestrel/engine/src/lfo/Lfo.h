#pragma once

#include "core/DspMath.h"

namespace kestrel {

// LFO (owner's manual p.29, fig 10-1; MIDI imp. TABLE 2 +38..+43).
//   LFO1 waves: Saw, Square1, Triangle, S&H      (all bipolar)
//   LFO2 waves: Saw, Square2(+), Sine, S&H       (Square2 is unipolar, MIDI imp. "Squ(+)")
// [FIG] shapes/start phase: saw falls from +1, squares start high, triangle starts
//       at its minimum, sine starts at 0 rising. [ENG] S&H draws a new value each cycle.
class Lfo {
public:
    enum class Shape : uint8_t { Saw, Square, SquarePlus, Triangle, Sine, SampleHold };

    static Shape shapeFor(int lfoIndex, int waveChoice) noexcept {
        if (lfoIndex == 0) {
            switch (waveChoice) { case 0: return Shape::Saw; case 1: return Shape::Square; case 2: return Shape::Triangle; default: return Shape::SampleHold; }
        }
        switch (waveChoice) { case 0: return Shape::Saw; case 1: return Shape::SquarePlus; case 2: return Shape::Sine; default: return Shape::SampleHold; }
    }

    void setSampleRate(double fs) noexcept { fs_ = fs; }
    void seed(uint32_t s) noexcept { rng_.seed(s); sh_ = rng_.bipolar(); }
    void resetPhase() noexcept { phase_ = 0.0; sh_ = rng_.bipolar(); }
    void setFrequency(double hz) noexcept { inc_ = clampv(hz, 0.0, fs_ * 0.25) / fs_; }

    // Advances by one sample and returns the value before the advance.
    inline float process(Shape shape) noexcept {
        const float v = valueAt(shape, phase_);
        phase_ += inc_;
        if (phase_ >= 1.0) {
            phase_ -= std::floor(phase_);
            sh_ = rng_.bipolar();
        }
        return v;
    }

    float valueAt(Shape shape, double p) const noexcept {
        switch (shape) {
            case Shape::Saw: return float(1.0 - 2.0 * p);
            case Shape::Square: return p < 0.5 ? 1.0f : -1.0f;
            case Shape::SquarePlus: return p < 0.5 ? 1.0f : 0.0f;
            case Shape::Triangle: return p < 0.5 ? float(-1.0 + 4.0 * p) : float(3.0 - 4.0 * p);
            case Shape::Sine: return sineLut()(p);
            case Shape::SampleHold: return sh_;
        }
        return 0.0f;
    }
    double phase() const noexcept { return phase_; }
    void setPhase(double p) noexcept { phase_ = p - std::floor(p); }

private:
    double fs_ = 48000.0, phase_ = 0.0, inc_ = 0.0;
    float sh_ = 0.0f;
    Rng rng_ { 0x51ED5EEDu };
};

} // namespace kestrel
