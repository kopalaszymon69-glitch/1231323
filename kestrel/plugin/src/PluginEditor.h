#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

namespace kestrel::plugin {

// Stage-1 editor: header + generic parameter list (replaced by the full panel UI).
class KestrelEditor final : public juce::AudioProcessorEditor {
public:
    explicit KestrelEditor(KestrelProcessor& p);
    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    KestrelProcessor& proc_;
    juce::GenericAudioProcessorEditor generic_;
};

} // namespace kestrel::plugin
