// Perrin — maps a vision-model PhotoObservation to a TriageFinding for inline
// rendering in chat. This is the wire between Phase 2 (photo) and Phase 3
// (triage): the VL model extracts structured facts; this function decides
// whether they represent an actionable crisis worth showing a card for.
package lib

import "strings"

// ObservationToFinding converts a PhotoObservation from the vision model into a
// TriageFinding. Returns (finding, true) only when the photo shows a
// recognisable crisis at warning or higher severity. Low-severity shots,
// ambiguous types ("none", "other"), and empty observations return (_, false).
// Location and CrisisID are always empty — photos carry no geolocation.
func ObservationToFinding(obs PhotoObservation, caption string) (TriageFinding, bool) {
	if obs.CrisisType == "" || obs.CrisisType == "none" || obs.CrisisType == "other" {
		return TriageFinding{}, false
	}
	sev := photoSeverity(obs.Severity)
	if sev == "" {
		return TriageFinding{}, false
	}

	detail := obs.Description
	if detail == "" && len(obs.Observations) > 0 {
		detail = obs.Observations[0]
	}
	if detail == "" {
		detail = "Citizen photo report."
	}
	if len(obs.Hazards) > 0 {
		detail += " Hazards visible: " + strings.Join(obs.Hazards, "; ") + "."
	}

	return TriageFinding{
		Type:     obs.CrisisType,
		Severity: sev,
		Title:    photoTitle(obs.CrisisType),
		Detail:   detail,
		Sources:  []string{"citizen-report"},
	}, true
}

func photoSeverity(s string) string {
	switch s {
	case "high":
		return SeverityCritical
	case "warning":
		return SeverityWarning
	default:
		return ""
	}
}

func photoTitle(crisisType string) string {
	switch crisisType {
	case "flood":
		return "Flood — citizen report"
	case "fire":
		return "Fire — citizen report"
	case "haze":
		return "Haze — citizen report"
	case "fallen_tree":
		return "Fallen tree — citizen report"
	case "road_accident":
		return "Road accident — citizen report"
	case "building_damage":
		return "Building damage — citizen report"
	case "medical":
		return "Medical emergency — citizen report"
	case "crowd":
		return "Crowd situation — citizen report"
	default:
		return "Incident — citizen report"
	}
}
