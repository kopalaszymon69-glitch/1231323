#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <memory>

#include "PluginProcessor.h"
#include "ui/KestrelLookAndFeel.h"
#include "ui/Views.h"

namespace kestrel::plugin {

// Fixed logical canvas (1200 x 720) scaled uniformly to the window size.
class EditorCanvas final : public juce::Component {
public:
    explicit EditorCanvas(KestrelProcessor& p);
    ~EditorCanvas() override;
    void paint(juce::Graphics&) override;
    void resized() override;
    void refresh();
    void showView(int i);
    static constexpr int kW = 1200, kH = 720;

private:
    void touched(int paramIndex);
    void rebuildProgramList();

    KestrelProcessor& proc_;
    ui::Lcd lcd_;
    juce::ComboBox program_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    std::unique_ptr<ui::Choice> mode_, arp_;
    std::array<juce::TextButton, 6> tabs_;
    std::array<std::unique_ptr<ui::View>, 6> views_;
    int current_ = 0;
    int lastTouched_ = -1;
    juce::uint32 lastTouchTime_ = 0;
    juce::TooltipWindow tooltip_ { this, 600 };
};

class KestrelEditor final : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit KestrelEditor(KestrelProcessor& p);
    ~KestrelEditor() override;
    void paint(juce::Graphics&) override;
    void resized() override;
    void showView(int i) { canvas_.showView(i); canvas_.refresh(); } // used by tools/snapshot

private:
    void timerCallback() override;
    KestrelProcessor& proc_;
    ui::KestrelLookAndFeel lnf_;
    EditorCanvas canvas_;
};

} // namespace kestrel::plugin
