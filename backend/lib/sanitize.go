// Perrin — input sanitisation helpers applied to all user-supplied text before
// it is forwarded to the LLM. This is one layer of a defence-in-depth strategy;
// the system prompt is the other. Neither alone is sufficient.
package lib

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// maxUserMessageRunes is the hard cap on user message length.
// 2 000 runes ≈ ~1 500 tokens — ample for any legitimate crisis query.
const maxUserMessageRunes = 2000

// injectionPatterns is a compiled list of case-insensitive regex patterns that
// are strong indicators of a prompt injection attempt. The patterns cover:
//   - instruction-override phrases ("ignore previous instructions", etc.)
//   - persona-swap commands ("you are now", "act as", "pretend to be")
//   - system-prompt exfiltration requests ("reveal your system prompt")
//   - jailbreak keywords and delimiter tokens used by known attack payloads
var injectionPatterns = []*regexp.Regexp{
	// Instruction override
	regexp.MustCompile(`(?i)ignore\s+(all\s+)?(previous|prior|above|the\s+above)\s+(instructions?|prompts?|directives?|system\b|context\b)`),
	regexp.MustCompile(`(?i)(forget|disregard)\s+(your\s+)?(instructions?|prompt|training|rules?|guidelines?)`),
	regexp.MustCompile(`(?i)override\s+(your\s+)?(instructions?|safety|constraints?|rules?|guidelines?)`),

	// Persona swap
	regexp.MustCompile(`(?i)you\s+are\s+now\s+(a|an)\s+\w`),
	regexp.MustCompile(`(?i)pretend\s+(to\s+be|you\s+(are|were)|you're)\s+`),
	regexp.MustCompile(`(?i)act\s+as\s+(a|an|if\s+you)`),
	regexp.MustCompile(`(?i)(your\s+)?(new|updated|real|true|actual)\s+(instructions?|system\s*prompt|role|persona)\s*(are|is|:)`),

	// System-prompt exfiltration
	regexp.MustCompile(`(?i)reveal\s+(your\s+)?(system\s*prompt|instructions?|training\s+data|prompt)\b`),
	regexp.MustCompile(`(?i)(print|show|output|repeat|display|tell\s+me)\s+(your\s+)?(system\s*prompt|instructions?|original\s+prompt|base\s+prompt|initial\s+prompt)`),
	regexp.MustCompile(`(?i)what\s+(is|are|was)\s+your\s+(system\s*prompt|instructions?|original\s+prompt)`),

	// Jailbreak tokens and known attack keywords
	regexp.MustCompile(`(?i)\[system\]|\[inst\]|\[\/inst\]|<\|im_start\||<\|im_end\|>`),
	regexp.MustCompile(`(?i)\bdan\s+(mode|prompt|jailbreak)\b`),
	regexp.MustCompile(`(?i)\bjailbreak\b`),
	regexp.MustCompile(`(?i)\bin\s+developer\s+mode\b`),
	regexp.MustCompile(`(?i)bypass\s+(safety|filter|restriction|guideline|rule)`),
}

// CheckInjection reports whether s matches any known prompt-injection pattern.
// Returns the matched substring (for logging), or "" when the input is clean.
func CheckInjection(s string) string {
	for _, p := range injectionPatterns {
		if loc := p.FindStringIndex(s); loc != nil {
			return s[loc[0]:loc[1]]
		}
	}
	return ""
}

// ValidateUserInput trims s, enforces maxUserMessageRunes, strips control
// characters, and rejects known injection patterns. Returns the cleaned string
// and a non-nil error when the input must be rejected.
func ValidateUserInput(s string) (string, error) {
	s = strings.TrimSpace(s)

	// Strip null bytes and C0 control characters (keep \n, \r, \t for readability).
	s = strings.Map(func(r rune) rune {
		if r == 0 || (r < 0x20 && r != '\n' && r != '\r' && r != '\t') {
			return -1
		}
		return r
	}, s)

	if utf8.RuneCountInString(s) > maxUserMessageRunes {
		return "", fmt.Errorf("message too long (max %d characters)", maxUserMessageRunes)
	}

	if match := CheckInjection(s); match != "" {
		// Log the matched fragment server-side but return a generic error to the
		// caller so the pattern list isn't leaked to an attacker.
		_ = match // caller may log via the returned error text
		return "", errors.New("your message contains content that cannot be processed")
	}

	return s, nil
}
