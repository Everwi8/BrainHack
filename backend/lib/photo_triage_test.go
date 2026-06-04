package lib

import (
	"strings"
	"testing"
)

func TestObservationToFinding(t *testing.T) {
	tests := []struct {
		name     string
		obs      PhotoObservation
		caption  string
		wantOK   bool
		wantSev  string
		wantType string
	}{
		{
			name:     "flood high → critical",
			obs:      PhotoObservation{CrisisType: "flood", Severity: "high", Description: "Street is submerged."},
			wantOK:   true,
			wantSev:  SeverityCritical,
			wantType: "flood",
		},
		{
			name:     "haze warning → warning",
			obs:      PhotoObservation{CrisisType: "haze", Severity: "warning", Description: "Thick haze visible."},
			wantOK:   true,
			wantSev:  SeverityWarning,
			wantType: "haze",
		},
		{
			name:   "crisis_type none → skip",
			obs:    PhotoObservation{CrisisType: "none", Severity: "high"},
			wantOK: false,
		},
		{
			name:   "crisis_type other → skip",
			obs:    PhotoObservation{CrisisType: "other", Severity: "high"},
			wantOK: false,
		},
		{
			name:   "empty crisis_type → skip",
			obs:    PhotoObservation{CrisisType: "", Severity: "high"},
			wantOK: false,
		},
		{
			name:   "severity low → skip",
			obs:    PhotoObservation{CrisisType: "fire", Severity: "low"},
			wantOK: false,
		},
		{
			name:   "severity none → skip",
			obs:    PhotoObservation{CrisisType: "fire", Severity: "none"},
			wantOK: false,
		},
		{
			name:     "fire high → critical citizen-report source",
			obs:      PhotoObservation{CrisisType: "fire", Severity: "high", Description: "Flames visible on upper floor."},
			wantOK:   true,
			wantSev:  SeverityCritical,
			wantType: "fire",
		},
		{
			name: "hazards appended to detail",
			obs:  PhotoObservation{CrisisType: "flood", Severity: "high", Description: "Water rising.", Hazards: []string{"submerged car", "live wire"}},
			wantOK:  true,
			wantSev: SeverityCritical,
		},
		{
			name: "observations used when description empty",
			obs:  PhotoObservation{CrisisType: "road_accident", Severity: "warning", Observations: []string{"two vehicles collided"}},
			wantOK:  true,
			wantSev: SeverityWarning,
		},
		{
			name:   "people_present alone not enough — low severity still skipped",
			obs:    PhotoObservation{CrisisType: "crowd", Severity: "low", PeoplePresent: true},
			wantOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f, ok := ObservationToFinding(tc.obs, tc.caption)
			if ok != tc.wantOK {
				t.Fatalf("ok=%v want %v", ok, tc.wantOK)
			}
			if !ok {
				return
			}
			if f.Severity != tc.wantSev {
				t.Errorf("severity=%q want %q", f.Severity, tc.wantSev)
			}
			if tc.wantType != "" && f.Type != tc.wantType {
				t.Errorf("type=%q want %q", f.Type, tc.wantType)
			}
			if len(f.Sources) == 0 || f.Sources[0] != "citizen-report" {
				t.Errorf("sources=%v want [citizen-report]", f.Sources)
			}
			if f.Location != "" {
				t.Errorf("location=%q want empty (no geolocation from photo)", f.Location)
			}
			if f.CrisisID != "" {
				t.Errorf("crisis_id=%q want empty", f.CrisisID)
			}
			if tc.obs.Description != "" && !strings.Contains(f.Detail, tc.obs.Description) {
				t.Errorf("detail=%q should contain description %q", f.Detail, tc.obs.Description)
			}
			for _, h := range tc.obs.Hazards {
				if !strings.Contains(f.Detail, h) {
					t.Errorf("detail=%q should contain hazard %q", f.Detail, h)
				}
			}
			if len(tc.obs.Observations) > 0 && tc.obs.Description == "" {
				if !strings.Contains(f.Detail, tc.obs.Observations[0]) {
					t.Errorf("detail=%q should contain first observation %q", f.Detail, tc.obs.Observations[0])
				}
			}
		})
	}
}

func TestStripJSONFences(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"plain", "plain"},
		{"```\n{\"a\":1}\n```", `{"a":1}`},
		{"```json\n{\"a\":1}\n```", `{"a":1}`},
		{"  ```json\n{}\n```  ", "{}"},
		{"{\"already\":\"clean\"}", `{"already":"clean"}`},
	}
	for _, tc := range tests {
		got := stripJSONFences(tc.in)
		if got != tc.want {
			t.Errorf("stripJSONFences(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestExtractJSON(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"plain object", `{"a":1}`, `{"a":1}`},
		{"plain array", `[1,2,3]`, `[1,2,3]`},
		{"fenced json block", "```json\n{\"a\":1}\n```", `{"a":1}`},
		{"prose before and after object", `Here is the result: {"a":1} done.`, `{"a":1}`},
		{"array embedded in prose", `Output: [1,2,3] end`, `[1,2,3]`},
		{"nested object", `{"a":{"b":2}}`, `{"a":{"b":2}}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractJSON(tc.in)
			if got != tc.want {
				t.Errorf("extractJSON(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
