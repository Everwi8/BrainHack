package lib

import "testing"

func TestLanguageInstructionWhitelist(t *testing.T) {
	cases := map[string]bool{ // code -> expect a non-empty directive
		"":         false,
		"en":       false,
		"english":  false,
		"banana":   false, // unknown → default English (no directive)
		"zh":       true,
		"ZH-SG":    true, // case/region tolerant
		"mandarin": true,
		"ms":       true,
		"malay":    true,
		"ta":       true,
		"tamil":    true,
		"en-SG":    true,
		"singlish": true,
	}
	for code, wantNonEmpty := range cases {
		got := languageInstruction(code)
		if (got != "") != wantNonEmpty {
			t.Errorf("languageInstruction(%q) = %q; wantNonEmpty=%v", code, got, wantNonEmpty)
		}
	}
}

func TestIsSupportedLanguage(t *testing.T) {
	supported := []string{"en-SG", "zh", "ms", "ta"}
	for _, c := range supported {
		if !IsSupportedLanguage(c) {
			t.Errorf("expected %q to be supported", c)
		}
	}
	// English is intentionally not offered anymore.
	for _, c := range []string{"en", "", "english", "fr"} {
		if IsSupportedLanguage(c) {
			t.Errorf("expected %q to be unsupported", c)
		}
	}
}

func TestUserContextSystemMessageLanguageOnly(t *testing.T) {
	// A language preference alone (no name/area) must still produce a directive.
	uc := UserContext{Lang: "zh"}
	if msg := uc.systemMessage(); msg == "" {
		t.Fatal("expected a system message for a language-only UserContext, got empty")
	}
	// English/zero adds nothing.
	if msg := (UserContext{Lang: "en"}).systemMessage(); msg != "" {
		t.Errorf("expected empty system message for English, got %q", msg)
	}
}
