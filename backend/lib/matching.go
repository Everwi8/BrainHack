// Perrin — skill-based volunteer↔task matching. Scores a crisis's open task
// cards against a volunteer's saved skills (skill overlap dominates, task
// priority breaks ties) and asks Brainy to phrase why the top pick fits. The
// scoring is deterministic so a match always works even if the LLM rationale
// call fails.
package lib

import (
	"fmt"
	"sort"
	"strings"
)

// VolunteerSkillOption is one entry in the canonical skill catalogue. Slugs are
// stable (used by both volunteer profiles and task skills_needed); labels are
// for the UI. Exposed via GET /api/volunteers/skills so the form and the task
// generator share one vocabulary.
type VolunteerSkillOption struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

var VolunteerSkillCatalog = []VolunteerSkillOption{
	{"medical", "Medical (nurse / doctor)"},
	{"first_aid", "First aid"},
	{"driving", "Has a car / can drive"},
	{"heavy_lifting", "Heavy lifting"},
	{"languages", "Multilingual"},
	{"elderly_care", "Elderly care"},
	{"childcare", "Childcare"},
	{"cooking", "Cooking / food prep"},
	{"logistics", "Logistics / coordination"},
	{"tech", "Tech / comms"},
}

// SkillCatalogSlugs returns the catalogue slugs, for steering the task
// generator's skills_needed onto the same vocabulary the profile form uses.
func SkillCatalogSlugs() []string {
	out := make([]string, len(VolunteerSkillCatalog))
	for i, s := range VolunteerSkillCatalog {
		out[i] = s.Slug
	}
	return out
}

// NormaliseSkills lowercases, underscores, trims, and de-dups skill tokens so
// volunteer profiles and task skills_needed share one vocabulary for overlap
// matching.
func NormaliseSkills(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		s = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(s)), " ", "_")
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// TaskMatch is one scored task for a volunteer.
type TaskMatch struct {
	TaskID        string   `json:"task_id"`
	Title         string   `json:"title"`
	Score         int      `json:"score"`
	MatchedSkills []string `json:"matched_skills"`
}

// MatchReport ranks a crisis's open tasks for one volunteer and recommends the
// best fit with a short Brainy rationale.
type MatchReport struct {
	RecommendedTaskID string      `json:"recommended_task_id"`
	Rationale         string      `json:"rationale"`
	Ranked            []TaskMatch `json:"ranked"`
}

func priorityWeight(p string) int {
	switch strings.ToLower(p) {
	case "high":
		return 3
	case "low":
		return 1
	default:
		return 2
	}
}

// MatchTasksForUser scores the crisis's open (non-full) tasks against the
// volunteer's skills and returns them ranked best-first, with a Brainy rationale
// for the top pick. Tasks all share the crisis location, so proximity isn't a
// differentiator here — skill overlap leads, task priority breaks ties.
func MatchTasksForUser(crisisID, userID, userName string) (MatchReport, error) {
	tasks, err := DB.GetTasks(crisisID)
	if err != nil {
		return MatchReport{}, err
	}
	vol, err := DB.GetVolunteerByUser(userID)
	if err != nil {
		return MatchReport{}, err
	}
	var skills []string
	if vol != nil {
		skills = vol.Skills
	}
	skillSet := map[string]bool{}
	for _, s := range skills {
		skillSet[strings.ToLower(s)] = true
	}

	byID := map[string]Task{}
	ranked := []TaskMatch{}
	for _, t := range tasks {
		byID[t.ID] = t
		if t.VolunteersNeeded < 1 {
			continue // full — not joinable, so not a candidate
		}
		matched := []string{}
		for _, need := range t.SkillsNeeded {
			if skillSet[strings.ToLower(strings.TrimSpace(need))] {
				matched = append(matched, need)
			}
		}
		ranked = append(ranked, TaskMatch{
			TaskID:        t.ID,
			Title:         t.Title,
			Score:         len(matched)*10 + priorityWeight(t.Priority),
			MatchedSkills: matched,
		})
	}
	sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].Score > ranked[j].Score })

	report := MatchReport{Ranked: ranked}
	if len(ranked) > 0 {
		report.RecommendedTaskID = ranked[0].TaskID
		report.Rationale = brainyMatchRationale(userName, skills, ranked[0], byID[ranked[0].TaskID])
	}
	return report, nil
}

// brainyMatchRationale asks Brainy for one warm sentence on why the top task
// suits this volunteer, falling back to a deterministic line if the LLM fails.
func brainyMatchRationale(name string, skills []string, top TaskMatch, task Task) string {
	fallback := "This is the most useful place for you to help right now."
	if len(top.MatchedSkills) > 0 {
		fallback = fmt.Sprintf("Your %s background is a strong fit for this one.",
			strings.ReplaceAll(strings.Join(top.MatchedSkills, ", "), "_", " "))
	}

	sys := `You are Brainy, Singapore's warm crisis-response co-pilot. In ONE short sentence (max 25 words), tell this volunteer why the recommended task suits them. Address them directly and warmly. Use only the facts given — do not invent skills or details. Return only the sentence, no quotes.`
	var b strings.Builder
	if name != "" {
		fmt.Fprintf(&b, "Volunteer: %s\n", name)
	}
	fmt.Fprintf(&b, "Their skills: %s\n", strings.Join(skills, ", "))
	fmt.Fprintf(&b, "Recommended task: %s — %s\n", task.Title, task.Description)
	if len(top.MatchedSkills) > 0 {
		fmt.Fprintf(&b, "Skills that matched: %s\n", strings.Join(top.MatchedSkills, ", "))
	}

	out, err := ChatText(sys, b.String())
	if err != nil || strings.TrimSpace(out) == "" {
		return fallback
	}
	return strings.TrimSpace(out)
}
