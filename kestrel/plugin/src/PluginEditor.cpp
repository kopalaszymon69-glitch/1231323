#include "PluginEditor.h"

namespace kestrel::plugin {

KestrelEditor::KestrelEditor(KestrelProcessor& p) : AudioProcessorEditor(p), proc_(p), generic_(p) {
    addAndMakeVisible(generic_);
    setResizable(true, true);
    setSize(760, 640);
}

void KestrelEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colour(0xff8f8b84));
    g.setColour(juce::Colours::black);
    g.setFont(juce::FontOptions(18.0f, juce::Font::bold));
    g.drawText("Kestrel VA", getLocalBounds().removeFromTop(32).reduced(10, 0), juce::Justification::centredLeft);
}

void KestrelEditor::resized() { generic_.setBounds(getLocalBounds().withTrimmedTop(32)); }

} // namespace kestrel::plugin
