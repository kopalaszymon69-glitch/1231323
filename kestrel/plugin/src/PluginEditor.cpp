#include "PluginEditor.h"

namespace kestrel::plugin {

using namespace kestrel::ui;

namespace {
constexpr int kCheek = 24, kHeader = 96, kTabs = 32, kKeys = 74;
const char* const kTabNames[6] = { "TIMBRE 1", "TIMBRE 2", "MODULATION", "FX / ARPEG", "VOCODER", "GLOBAL" };

void paintWood(juce::Graphics& g, juce::Rectangle<float> r) {
    g.drawImageAt(textures::wood(int(r.getWidth()), int(r.getHeight())), int(r.getX()), int(r.getY()));
    // varnish sheen
    juce::ColourGradient sheen(juce::Colours::white.withAlpha(0.10f), r.getX(), r.getY(), juce::Colours::white.withAlpha(0.0f), r.getX(), r.getY() + r.getHeight() * 0.4f, false);
    g.setGradientFill(sheen);
    g.fillRect(r);
    g.setColour(juce::Colours::black.withAlpha(0.5f));
    g.drawRect(r, 1.0f);
}
} // namespace

// ================================================================== canvas
EditorCanvas::EditorCanvas(KestrelProcessor& p)
    : proc_(p), keyboard_(p.keyboardState(), juce::MidiKeyboardComponent::horizontalKeyboard) {
    auto touch = [this](int idx) { touched(idx); };
    addAndMakeVisible(lcd_);
    addAndMakeVisible(program_);
    addAndMakeVisible(prev_);
    addAndMakeVisible(next_);
    rebuildProgramList();
    program_.onChange = [this] {
        const int i = program_.getSelectedId() - 1;
        if (i >= 0 && i != proc_.getCurrentProgram()) proc_.setCurrentProgram(i);
        else if (i >= 0) proc_.setCurrentProgram(i);
    };
    prev_.onClick = [this] { proc_.setCurrentProgram(juce::jmax(0, proc_.getCurrentProgram() - 1)); program_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification); };
    next_.onClick = [this] { proc_.setCurrentProgram(juce::jmin(proc_.getNumPrograms() - 1, proc_.getCurrentProgram() + 1)); program_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification); };
    mode_ = std::make_unique<Choice>(proc_, pG(VoiceMode), touch, "Voice Mode", 110);
    addAndMakeVisible(*mode_);
    arp_ = std::make_unique<Choice>(proc_, pG(ArpOn), touch, "Arpeggiator", 80);
    addAndMakeVisible(*arp_);
    views_[0] = std::make_unique<TimbreView>(proc_, touch, 0);
    views_[1] = std::make_unique<TimbreView>(proc_, touch, 1);
    views_[2] = std::make_unique<ModView>(proc_, touch);
    views_[3] = std::make_unique<FxArpView>(proc_, touch);
    views_[4] = std::make_unique<VocoderView>(proc_, touch);
    views_[5] = std::make_unique<GlobalView>(proc_, touch);
    for (int i = 0; i < 6; ++i) {
        tabs_[size_t(i)].setButtonText(kTabNames[i]);
        tabs_[size_t(i)].setClickingTogglesState(false);
        tabs_[size_t(i)].getProperties().set("led", true);
        if (i == 1) tabs_[size_t(i)].getProperties().set("ledColour", int(colours::accent2.getARGB()));
        if (i == 4) tabs_[size_t(i)].getProperties().set("ledColour", int(colours::vocoder.getARGB()));
        tabs_[size_t(i)].onClick = [this, i] { showView(i); };
        addAndMakeVisible(tabs_[size_t(i)]);
        addChildComponent(*views_[size_t(i)]);
    }
    keyboard_.setAvailableRange(24, 96); // C1..C7
    keyboard_.setScrollButtonsVisible(false);
    keyboard_.setOctaveForMiddleC(4); // owner's manual: C4 = note 60
    keyboard_.setColour(juce::MidiKeyboardComponent::whiteNoteColourId, juce::Colour(0xfff1ebdd));
    keyboard_.setColour(juce::MidiKeyboardComponent::blackNoteColourId, juce::Colour(0xff1b1a18));
    keyboard_.setColour(juce::MidiKeyboardComponent::keySeparatorLineColourId, juce::Colour(0xff6b665d));
    keyboard_.setColour(juce::MidiKeyboardComponent::keyDownOverlayColourId, colours::accent.withAlpha(0.75f));
    keyboard_.setColour(juce::MidiKeyboardComponent::mouseOverKeyOverlayColourId, colours::accent.withAlpha(0.25f));
    keyboard_.setColour(juce::MidiKeyboardComponent::shadowColourId, juce::Colours::black.withAlpha(0.45f));
    keyboard_.setWantsKeyboardFocus(false);
    addAndMakeVisible(keyboard_);
    showView(0);
}

EditorCanvas::~EditorCanvas() = default;

void EditorCanvas::rebuildProgramList() {
    program_.clear(juce::dontSendNotification);
    for (int i = 0; i < proc_.getNumPrograms(); ++i) program_.addItem(juce::String(i + 1).paddedLeft('0', 2) + "  " + proc_.getProgramName(i), i + 1);
    program_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification);
}

void EditorCanvas::showView(int i) {
    current_ = i;
    for (int k = 0; k < 6; ++k) {
        views_[size_t(k)]->setVisible(k == i);
        tabs_[size_t(k)].setToggleState(k == i, juce::dontSendNotification);
    }
    views_[size_t(i)]->refresh();
}

void EditorCanvas::touched(int idx) {
    lastTouched_ = idx;
    lastTouchTime_ = juce::Time::getMillisecondCounter();
}

void EditorCanvas::refresh() {
    if (program_.getNumItems() != proc_.getNumPrograms()) rebuildProgramList();
    if (program_.getSelectedId() != proc_.getCurrentProgram() + 1) program_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification);
    juce::String top = proc_.programName().toUpperCase();
    juce::String bottom;
    const bool recent = lastTouched_ >= 0 && juce::Time::getMillisecondCounter() - lastTouchTime_ < 4000;
    if (recent) {
        auto* prm = proc_.param(lastTouched_);
        bottom = juce::String(paramInfo(lastTouched_).name).toUpperCase() + "  " + prm->getCurrentValueAsText();
    } else {
        auto& e = proc_.engine();
        const auto mode = ProgMode(int(proc_.param(pG(VoiceMode))->convertFrom0to1(proc_.param(pG(VoiceMode))->getValue())));
        const int budget = e.voiceBudget(0) + (mode == ProgMode::Layer ? e.voiceBudget(1) : 0);
        bottom = "VOICES " + juce::String(e.activeVoices()) + "/" + juce::String(budget) + "   BPM " + juce::String(e.currentTempo(), 1);
    }
    lcd_.setLines(top, bottom);
    views_[size_t(current_)]->refresh();
}

void EditorCanvas::paint(juce::Graphics& g) {
    // brushed metal panel
    g.drawImageAt(textures::brushedPanel(kW, kH, colours::panel), 0, 0);
    // header strip (darker anodised band)
    const auto header = juce::Rectangle<float>(float(kCheek), 0.0f, float(kW - 2 * kCheek), float(kHeader));
    g.saveState();
    g.reduceClipRegion(header.toNearestInt());
    g.drawImageAt(textures::brushedPanel(kW, kHeader, colours::panelDark), 0, 0);
    g.restoreState();
    juce::ColourGradient hg(juce::Colours::white.withAlpha(0.08f), 0.0f, 0.0f, juce::Colours::black.withAlpha(0.18f), 0.0f, float(kHeader), false);
    g.setGradientFill(hg);
    g.fillRect(header);
    g.setColour(juce::Colours::black.withAlpha(0.45f));
    g.drawHorizontalLine(kHeader - 1, header.getX(), header.getRight());
    g.setColour(juce::Colours::white.withAlpha(0.25f));
    g.drawHorizontalLine(kHeader, header.getX(), header.getRight());
    // body shading (light from the top)
    juce::ColourGradient body(juce::Colours::white.withAlpha(0.05f), 0.0f, float(kHeader), juce::Colours::black.withAlpha(0.10f), 0.0f, float(kH), false);
    g.setGradientFill(body);
    g.fillRect(juce::Rectangle<float>(float(kCheek), float(kHeader), float(kW - 2 * kCheek), float(kH - kHeader)));
    // logo (original wordmark), embossed
    const auto logoR = juce::Rectangle<float>(header.getX() + 22.0f, 10.0f, 330.0f, 46.0f);
    g.setFont(fonts::logo(40.0f).withExtraKerningFactor(0.12f));
    g.setColour(juce::Colours::black.withAlpha(0.45f));
    g.drawText("KESTREL", logoR.translated(0.0f, 1.5f), juce::Justification::centredLeft);
    g.setColour(juce::Colour(0xfff3eee3));
    g.drawText("KESTREL", logoR, juce::Justification::centredLeft);
    const float wordW = juce::GlyphArrangement::getStringWidth(fonts::logo(40.0f).withExtraKerningFactor(0.12f), "KESTREL");
    g.setColour(colours::accent);
    g.drawText("VA", logoR.withTrimmedLeft(wordW + 10.0f), juce::Justification::centredLeft);
    g.setFont(fonts::print(14.0f).withExtraKerningFactor(0.18f));
    g.setColour(juce::Colour(0xffded7c9));
    g.drawText("VIRTUAL ANALOG SYNTHESIZER  /  VOCODER", juce::Rectangle<float>(header.getX() + 24.0f, 56.0f, 320.0f, 16.0f), juce::Justification::centredLeft);
    g.setFont(fonts::text(10.5f));
    g.setColour(juce::Colour(0xffbdb5a6));
    g.drawText("Unofficial instrument modelled on documented 2002 microKORG behaviour", juce::Rectangle<float>(header.getX() + 24.0f, 73.0f, 330.0f, 14.0f), juce::Justification::centredLeft, true);
    // keyboard well
    const auto well = juce::Rectangle<float>(float(kCheek + 6), float(kH - kKeys - 12), float(kW - 2 * kCheek - 12), float(kKeys + 8));
    g.setColour(juce::Colour(0xff1b1a18));
    g.fillRoundedRectangle(well, 5.0f);
    draw::inset(g, well, 5.0f, 1.5f);
    g.setFont(fonts::print(13.0f));
    g.setColour(juce::Colour(0xffcfc7b8));
    g.drawFittedText("KEYS", juce::Rectangle<int>(kCheek + 10, kH - kKeys - 6, 44, kKeys), juce::Justification::centred, 1);
    // wood cheeks + screws
    paintWood(g, { 0.0f, 0.0f, float(kCheek), float(kH) });
    paintWood(g, { float(kW - kCheek), 0.0f, float(kCheek), float(kH) });
    for (float sx : { float(kCheek) + 10.0f, float(kW - kCheek) - 10.0f })
        for (float sy : { 10.0f, float(kH) - 10.0f })
            draw::screw(g, { sx, sy }, 4.2f, 0.35f + sx * 0.01f + sy * 0.003f);
    // shadow of the cheeks onto the panel
    for (int i = 0; i < 6; ++i) {
        g.setColour(juce::Colours::black.withAlpha(0.06f * float(6 - i) / 6.0f));
        g.drawVerticalLine(kCheek + i, 0.0f, float(kH));
        g.drawVerticalLine(kW - kCheek - 1 - i, 0.0f, float(kH));
    }
}

void EditorCanvas::resized() {
    const int x0 = kCheek + 8;
    lcd_.setBounds(372, 12, 340, 70);
    prev_.setBounds(724, 18, 26, 26);
    program_.setBounds(752, 18, 236, 26);
    next_.setBounds(990, 18, 26, 26);
    mode_->setBounds(724, 46, 110, 44);
    arp_->setBounds(842, 46, 80, 44);
    int tx = x0;
    for (auto& t : tabs_) { t.setBounds(tx, kHeader + 3, 140, kTabs - 4); tx += 144; }
    const auto body = juce::Rectangle<int>(x0, kHeader + kTabs + 2, kW - 2 * kCheek - 16, kH - kHeader - kTabs - kKeys - 14);
    for (auto& v : views_) v->setBounds(body);
    keyboard_.setBounds(x0 + 54, kH - kKeys - 6, kW - 2 * kCheek - 16 - 54, kKeys);
    int whites = 0;
    for (int n = keyboard_.getRangeStart(); n <= keyboard_.getRangeEnd(); ++n) whites += juce::MidiMessage::isMidiNoteBlack(n) ? 0 : 1;
    keyboard_.setKeyWidth(float(keyboard_.getWidth() - 2) / float(std::max(1, whites)));
}

// ================================================================== editor
KestrelEditor::KestrelEditor(KestrelProcessor& p) : AudioProcessorEditor(p), proc_(p), canvas_(p) {
    setLookAndFeel(&lnf_);
    canvas_.setLookAndFeel(&lnf_);
    addAndMakeVisible(canvas_);
    canvas_.setBounds(0, 0, EditorCanvas::kW, EditorCanvas::kH);
    setResizable(true, true);
    setResizeLimits(EditorCanvas::kW / 2, EditorCanvas::kH / 2, EditorCanvas::kW * 2, EditorCanvas::kH * 2);
    if (auto* c = getConstrainer()) c->setFixedAspectRatio(double(EditorCanvas::kW) / double(EditorCanvas::kH));
    setSize(int(EditorCanvas::kW * 0.85), int(EditorCanvas::kH * 0.85));
    startTimerHz(15);
}

KestrelEditor::~KestrelEditor() {
    stopTimer();
    canvas_.setLookAndFeel(nullptr);
    setLookAndFeel(nullptr);
}

void KestrelEditor::paint(juce::Graphics& g) { g.fillAll(colours::panelDark); }

void KestrelEditor::resized() {
    const float s = std::min(float(getWidth()) / float(EditorCanvas::kW), float(getHeight()) / float(EditorCanvas::kH));
    canvas_.setTransform(juce::AffineTransform::scale(s));
}

void KestrelEditor::timerCallback() { canvas_.refresh(); }

} // namespace kestrel::plugin
