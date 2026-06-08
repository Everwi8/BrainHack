// Perrin — AI-written situation assessments. The triage rule engine produces a
// terse, factual Detail per finding (see triage.go); this layer expands that
// into a richer, resident-facing paragraph via the LLM for the crisis-detail
// view. Results are cached by finding identity so repeated views don't re-hit
// the model, and any failure falls back to the original template Detail so the
// assessment always renders.
package lib

import (
	"fmt"
	"strings"

	"backend/cache"
)

const triageProseSystem = `You are Brainy, Singapore's calm, warm crisis-response co-pilot.
Expand the given crisis finding into a short situation assessment for residents reading it in the BrainySG app.
- 2 to 4 sentences, plain English, reassuring but never alarmist.
- Lead with what is happening and how serious it is, then the most important safety actions, then a brief line that live updates appear here in the app.
- For life-threatening situations, direct people to 995 (SCDF) or 999 (Police).
- Use ONLY the facts provided. Do NOT invent addresses, dates, names, or numbers beyond what is given.
- Do NOT tell people to monitor or check NEA/PUB/LTA/MOH websites, apps, or hotlines — they already get updates here.
Return ONLY the assessment text — no markdown, no preamble, no JSON.`

// enrichFindingDetail rewrites a finding's terse template Detail into a richer,
// resident-facing assessment via the LLM, caching the result so repeated crisis
// views don't re-hit the model. On any failure it returns the original Detail
// unchanged, so the assessment always renders.
func enrichFindingDetail(f TriageFinding) string {
	// Key on the finding's identity + facts: a changed case count / water level
	// (carried in Detail) regenerates the prose, while identical findings reuse
	// the cached text.
	key := fmt.Sprintf("triageprose:%s:%s:%s:%s", f.Type, f.Severity, f.Location, f.Detail)

	v, err := cache.GlobalCache.GetOrFetch(key, func() (any, error) {
		userPrompt := fmt.Sprintf(
			"Crisis finding:\n- Type: %s\n- Severity: %s\n- Headline: %s\n- Location: %s\n- Known facts: %s",
			f.Type, f.Severity, f.Title, f.Location, f.Detail)
		prose, err := ChatText(triageProseSystem, userPrompt)
		if err != nil {
			return nil, err
		}
		prose = strings.TrimSpace(prose)
		if prose == "" {
			return nil, fmt.Errorf("empty triage prose")
		}
		return prose, nil
	})
	if err != nil {
		return f.Detail
	}
	if prose, ok := v.(string); ok {
		return prose
	}
	return f.Detail
}

// EnrichFindingsProse expands every finding's Detail into a richer AI-written
// assessment for display. It mutates the slice in place and returns it for
// convenience. Callers should pass only the findings actually being shown (e.g.
// one crisis's scoped findings) so it makes at most a handful of LLM calls.
func EnrichFindingsProse(findings []TriageFinding) []TriageFinding {
	for i := range findings {
		findings[i].Detail = enrichFindingDetail(findings[i])
	}
	return findings
}
