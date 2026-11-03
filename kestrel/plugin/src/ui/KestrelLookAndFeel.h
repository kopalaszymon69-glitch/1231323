#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace kestrel::ui {

// Palette: warm grey panel, charcoal print, amber accents, restrained wood cheeks.
namespace colours {
inline const juce::Colour panel { 0xff9d978c };
inline const juce::Colour panelLight { 0xffb3ada2 };
inline const juce::Colour panelDark { 0xff7d776d };
inline const juce::Colour section { 0xff8e887d };
inline const juce::Colour sectionEdge { 0xff5f5a52 };
inline const juce::Colour print { 0xff26231f };
inline const juce::Colour printSoft { 0xff4a4640 };
inline const juce::Colour accent { 0xffd9822b };   // timbre 1 / general
inline const juce::Colour accent2 { 0xff3f8fb8 };  // timbre 2
inline const juce::Colour vocoder { 0xff6f9e4f };
inline const juce::Colour lcdBg { 0xff1d2a1f };
inline const juce::Colour lcdText { 0xff9fe58c };
inline const juce::Colour lcdDim { 0xff3d5a3a };
inline const juce::Colour knobBody { 0xff2d2b28 };
inline const juce::Colour knobCap { 0xff4d4a45 };
inline const juce::Colour woodA { 0xff6b4026 };
inline const juce::Colour woodB { 0xff8a5634 };
} // namespace colours

class KestrelLookAndFeel final : public juce::LookAndFeel_V4 {
public:
    KestrelLookAndFeel();

    void drawRotarySlider(juce::Graphics&, int x, int y, int w, int h, float pos, float start, float end, juce::Slider&) override;
    void drawLinearSlider(juce::Graphics&, int x, int y, int w, int h, float pos, float minPos, float maxPos,
                          juce::Slider::SliderStyle, juce::Slider&) override;
    void drawComboBox(juce::Graphics&, int w, int h, bool down, int bx, int by, int bw, int bh, juce::ComboBox&) override;
    juce::Font getComboBoxFont(juce::ComboBox&) override;
    void positionComboBoxText(juce::ComboBox&, juce::Label&) override;
    void drawButtonBackground(juce::Graphics&, juce::Button&, const juce::Colour&, bool over, bool down) override;
    juce::Font getTextButtonFont(juce::TextButton&, int buttonHeight) override;
    juce::Label* createSliderTextBox(juce::Slider&) override;

    static juce::Font labelFont(float h, bool bold = true);
};

} // namespace kestrel::ui
