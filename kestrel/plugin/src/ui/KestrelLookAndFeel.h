#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace kestrel::ui {

// Palette: warm grey panel, charcoal print, amber accents, restrained wood cheeks.
namespace colours {
inline const juce::Colour panel { 0xffa69d8d };
inline const juce::Colour panelLight { 0xffb8b2a6 };
inline const juce::Colour panelDark { 0xff6f6a61 };
inline const juce::Colour section { 0xff978f80 };
inline const juce::Colour sectionEdge { 0xff57534b };
inline const juce::Colour print { 0xff1f1c19 };
inline const juce::Colour printSoft { 0xff47433d };
inline const juce::Colour accent { 0xffe0862c };   // timbre 1 / general
inline const juce::Colour accent2 { 0xff4796c2 };  // timbre 2
inline const juce::Colour vocoder { 0xff79a957 };
inline const juce::Colour lcdBg { 0xff16231a };
inline const juce::Colour lcdText { 0xffa8f093 };
inline const juce::Colour lcdDim { 0xff2c4430 };
inline const juce::Colour knobBody { 0xff262422 };
inline const juce::Colour knobCap { 0xff45423d };
inline const juce::Colour woodA { 0xff5a3420 };
inline const juce::Colour woodB { 0xff8c5935 };
} // namespace colours

// Embedded typefaces (SIL OFL 1.1, see plugin/resources/fonts)
namespace fonts {
juce::Font print(float height);              // panel silkscreen print (Big Shoulders Bold)
juce::Font printLight(float height);         // Big Shoulders Regular
juce::Font text(float height, bool bold = false); // body text / values (Work Sans)
juce::Font logo(float height);               // product logo (Tektur)
juce::Font lcd(float height);                // dot-matrix display (Silkscreen)
} // namespace fonts

// Procedural textures (deterministic, cached)
namespace textures {
const juce::Image& brushedPanel(int w, int h, juce::Colour base);
const juce::Image& wood(int w, int h);
} // namespace textures

namespace draw {
// Embossed print: faint highlight below, dark ink on top.
void embossedText(juce::Graphics& g, const juce::String& s, juce::Rectangle<float> r, juce::Justification j,
                  juce::Colour ink = colours::print, float highlight = 0.28f);
void screw(juce::Graphics& g, juce::Point<float> c, float r, float angle);
void inset(juce::Graphics& g, juce::Rectangle<float> r, float corner, float depth = 1.0f);
void led(juce::Graphics& g, juce::Point<float> c, float r, juce::Colour col, bool on);
} // namespace draw

class KestrelLookAndFeel final : public juce::LookAndFeel_V4 {
public:
    KestrelLookAndFeel();

    juce::Typeface::Ptr getTypefaceForFont(const juce::Font&) override;
    void drawRotarySlider(juce::Graphics&, int x, int y, int w, int h, float pos, float start, float end, juce::Slider&) override;
    void drawLinearSlider(juce::Graphics&, int x, int y, int w, int h, float pos, float minPos, float maxPos,
                          juce::Slider::SliderStyle, juce::Slider&) override;
    void drawComboBox(juce::Graphics&, int w, int h, bool down, int bx, int by, int bw, int bh, juce::ComboBox&) override;
    juce::Font getComboBoxFont(juce::ComboBox&) override;
    void positionComboBoxText(juce::ComboBox&, juce::Label&) override;
    juce::Font getPopupMenuFont() override;
    void drawButtonBackground(juce::Graphics&, juce::Button&, const juce::Colour&, bool over, bool down) override;
    void drawButtonText(juce::Graphics&, juce::TextButton&, bool over, bool down) override;
    juce::Font getTextButtonFont(juce::TextButton&, int buttonHeight) override;
    juce::Label* createSliderTextBox(juce::Slider&) override;
    void drawTooltip(juce::Graphics&, const juce::String& text, int w, int h) override;

    static juce::Font labelFont(float h, bool bold = true) { return bold ? fonts::print(h + 1.5f) : fonts::text(h); }
};

} // namespace kestrel::ui
