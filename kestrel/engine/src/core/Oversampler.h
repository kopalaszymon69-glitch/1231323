#pragma once

#include <array>
#include <vector>

namespace kestrel {

// Linear-phase halfband FIR (Kaiser-windowed sinc). Length N = 4m+1 so that the
// group delay (N-1)/2 at the high rate is an even number of samples, i.e. an
// integer number of samples at the low rate (exact latency reporting).
struct HalfbandDesign {
    std::vector<float> taps;   // full impulse response, length N
    int latencyHigh = 0;       // (N-1)/2 samples at the high rate
};
HalfbandDesign designHalfband(int numTaps, double kaiserBeta);

// 2:1 decimator, one channel. Allocation happens in prepare() only.
class Decimator2 {
public:
    void prepare(const HalfbandDesign& d);
    void reset();
    // in: 2*n samples at the high rate; out: n samples.
    void process(const float* in, float* out, int n) noexcept;
    int latencyLow() const noexcept { return latencyHigh_ / 2; }

private:
    std::vector<float> coefs_;      // nonzero taps except centre
    std::vector<int> offsets_;      // their delays
    float centre_ = 0.5f;
    int centreDelay_ = 0;
    std::vector<float> hist_;       // double-length circular history
    int len_ = 0, pos_ = 0, latencyHigh_ = 0;
};

// 1:2 interpolator, one channel.
class Interpolator2 {
public:
    void prepare(const HalfbandDesign& d);
    void reset();
    void process(const float* in, float* out, int n) noexcept; // out has 2n samples
    int latencyLow() const noexcept { return latencyHigh_ / 2; }

private:
    std::vector<float> even_, odd_; // polyphase branches (gain 2 applied)
    std::vector<float> hist_;
    int len_ = 0, pos_ = 0, latencyHigh_ = 0;
};

// Stereo 1x/2x/4x down/up-sampling chain with fixed, reported latency.
class OversamplingChain {
public:
    static constexpr int kMaxFactor = 4;
    void prepare(int maxBlockLow);
    void setFactor(int factor) noexcept; // 1, 2 or 4; resets state
    int factor() const noexcept { return factor_; }
    // Latency in low-rate samples introduced by ONE decimation pass.
    int decimationLatency() const noexcept;
    static int decimationLatencyFor(int factor) noexcept;
    void reset() noexcept;

    // high-rate stereo -> low-rate stereo (in-place safe on separate buffers)
    void downsample(const float* inL, const float* inR, float* outL, float* outR, int nLow) noexcept;
    // low-rate stereo -> high-rate stereo (for external audio feeding the voices)
    void upsample(const float* inL, const float* inR, float* outL, float* outR, int nLow) noexcept;

private:
    int factor_ = 1;
    std::array<Decimator2, 2> dec2x_;   // final stage (2x -> 1x), per channel
    std::array<Decimator2, 2> dec4x_;   // first stage (4x -> 2x), per channel
    std::array<Interpolator2, 2> int2x_;
    std::array<Interpolator2, 2> int4x_;
    std::vector<float> tmpL_, tmpR_;
};

} // namespace kestrel
