#include "PluginEditor.h"

namespace kestrel::plugin {

using namespace kestrel::ui;

namespace {
constexpr int kCheek = 22, kHeader = 96, kTabs = 30;
const char* const kTabNames[6] = { "TIMBRE 1", "TIMBRE 2", "MODULATION", "FX / ARPEG", "VOCODER", "GLOBAL" };

void paintWood(juce::Graphics& g, juce::Rectangle<float> r) {
    juce::ColourGradient grad(colours::woodB, r.getX(), r.getY(), colours::woodA, r.getRight(), r.getY(), false);
    g.setGradientFill(grad);
    g.fillRect(r);
    // procedural grain (deterministic)
    juce::Random rnd(1234);
    for (int i = 0; i < 14; ++i) {
        const float x = r.getX() + rnd.nextFloat() * r.getWidth();
        juce::Path p;
        p.startNewSubPath(x, r.getY());
        for (float y = r.getY(); y < r.getBottom(); y += 40.0f) p.lineTo(x + std::sin(y * 0.013f + float(i)) * 2.5f, y + 40.0f);
        g.setColour(juce::Colours::black.withAlpha(0.10f + 0.08f * rnd.nextFloat()));
        g.strokePath(p, juce::PathStrokeType(0.8f + rnd.nextFloat()));
    }
    g.setColour(juce::Colours::black.withAlpha(0.35f));
    g.drawRect(r, 1.0f);
}
} // namespace

// ================================================================== canvas
EditorCanvas::EditorCanvas(KestrelProcessor& p) : proc_(p) {
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
        tabs_[size_t(i)].onClick = [this, i] { showView(i); };
        addAndMakeVisible(tabs_[size_t(i)]);
        addChildComponent(*views_[size_t(i)]);
    }
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
    g.fillAll(colours::panel);
    // brushed panel texture
    g.setColour(juce::Colours::white.withAlpha(0.035f));
    for (int y = 0; y < kH; y += 3) g.drawHorizontalLine(y, 0.0f, float(kW));
    paintWood(g, { 0.0f, 0.0f, float(kCheek), float(kH) });
    paintWood(g, { float(kW - kCheek), 0.0f, float(kCheek), float(kH) });
    // header strip
    auto header = juce::Rectangle<float>(float(kCheek), 0.0f, float(kW - 2 * kCheek), float(kHeader));
    g.setColour(colours::panelDark);
    g.fillRect(header);
    g.setColour(colours::sectionEdge);
    g.drawHorizontalLine(kHeader - 1, header.getX(), header.getRight());
    // original logo (text only)
    g.setColour(juce::Colour(0xfff2ede2));
    g.setFont(juce::Font(juce::FontOptions(34.0f, juce::Font::bold)).withExtraKerningFactor(0.08f));
    g.drawText("KESTREL", juce::Rectangle<float>(header.getX() + 18.0f, 14.0f, 200.0f, 40.0f), juce::Justification::centredLeft);
    g.setColour(colours::accent);
    g.setFont(juce::Font(juce::FontOptions(34.0f, juce::Font::bold)));
    g.drawText("VA", juce::Rectangle<float>(header.getX() + 196.0f, 14.0f, 60.0f, 40.0f), juce::Justification::centredLeft);
    g.setColour(juce::Colour(0xffd9d2c4));
    g.setFont(KestrelLookAndFeel::labelFont(11.0f, false));
    g.drawText("VIRTUAL ANALOG SYNTHESIZER / VOCODER", juce::Rectangle<float>(header.getX() + 20.0f, 56.0f, 260.0f, 16.0f), juce::Justification::centredLeft);
    g.drawText("unofficial - modelled on documented 2002 microKORG behaviour", juce::Rectangle<float>(header.getX() + 20.0f, 72.0f, 330.0f, 14.0f), juce::Justification::centredLeft);
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
    for (auto& t : tabs_) { t.setBounds(tx, kHeader + 4, 132, kTabs - 6); tx += 136; }
    const auto body = juce::Rectangle<int>(x0, kHeader + kTabs + 2, kW - 2 * kCheek - 16, kH - kHeader - kTabs - 10);
    for (auto& v : views_) v->setBounds(body);
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
