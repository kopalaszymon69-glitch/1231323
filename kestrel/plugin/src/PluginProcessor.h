#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <atomic>
#include <vector>

#include "Engine.h"
#include "PresetBank.h"
#include "io/ProgramIO.h"

namespace kestrel::plugin {

class KestrelProcessor final : public juce::AudioProcessor, private juce::Timer {
public:
    KestrelProcessor();
    ~KestrelProcessor() override;

    // AudioProcessor
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 12.0; }

    int getNumPrograms() override { return bank_.size(); }
    int getCurrentProgram() override { return currentProgram_; }
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // ---- Kestrel API (message thread)
    juce::AudioProcessorValueTreeState& state() noexcept { return apvts_; }
    Engine& engine() noexcept { return engine_; }
    PresetBank& bank() noexcept { return bank_; }
    juce::RangedAudioParameter* param(int index) const noexcept { return params_[size_t(index)]; }

    Program captureProgram() const;                   // current parameter values as a program
    void loadProgram(const Program& p);               // applies with host notification
    juce::String programName() const { return programName_; }
    void setProgramName(const juce::String& n) { programName_ = n; }

    bool importDwgs(int slot0, const juce::File& file, juce::String& error);
    void clearDwgs(int slot0);
    bool dwgsIsUser(int slot0) const;

    // Formant-hold levels as last published by the audio thread
    std::array<float, 16> holdLevels() const;

    // On-screen keyboard (message thread): notes are passed to the audio thread through a
    // lock-free single-producer/single-consumer FIFO.
    juce::MidiKeyboardState& keyboardState() noexcept { return keyboardState_; }

    static constexpr int kMaxMidiEventsPerBlock = 4096;

private:
    void timerCallback() override;
    void rebuildWaveTables();
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    static BusesProperties makeBuses();

    juce::AudioProcessorValueTreeState apvts_;
    std::array<juce::RangedAudioParameter*, kNumParams> params_ {};
    std::array<std::atomic<float>*, kNumParams> raw_ {};
    std::array<float, kNumParams> lastSent_ {};

    Engine engine_;
    PresetBank bank_;
    int currentProgram_ = 0;
    juce::String programName_ { "Init Program" };

    std::vector<MidiEvent> midi_;
    juce::AudioBuffer<float> inCopy_;
    int maxBlock_ = 512;
    double sampleRate_ = 48000.0;

    std::atomic<bool> snapParams_ { true };
    std::atomic<bool> pendingHold_ { false };
    std::array<float, 16> pendingHoldLevels_ {};
    std::array<std::atomic<float>, 16> publishedHold_ {};
    std::atomic<bool> publishedHoldValid_ { false };

    DwgsOverrides dwgsOverrides_;
    juce::CriticalSection dwgsLock_; // message-thread side only

    struct UiKeyListener final : juce::MidiKeyboardState::Listener {
        explicit UiKeyListener(KestrelProcessor& p) : owner(p) {}
        void handleNoteOn(juce::MidiKeyboardState*, int ch, int note, float vel) override { owner.pushUiNote(0x90 | ((ch - 1) & 15), note, juce::jlimit(1, 127, int(vel * 127.0f))); }
        void handleNoteOff(juce::MidiKeyboardState*, int ch, int note, float) override { owner.pushUiNote(0x80 | ((ch - 1) & 15), note, 0); }
        KestrelProcessor& owner;
    };
    void pushUiNote(int status, int note, int vel);
    juce::MidiKeyboardState keyboardState_;
    UiKeyListener uiKeyListener_ { *this };
    juce::AbstractFifo uiFifo_ { 256 };
    std::array<uint32_t, 256> uiNotes_ {};
};

} // namespace kestrel::plugin
