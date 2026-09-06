package engine

import (
	"reflect"
	"testing"
)

func TestCoalesceNullDeletesDefault(t *testing.T) {
	defaults := map[string]any{"generic": map[string]any{"labels": map[string]any{}}, "configs": map[string]any{}}
	user := map[string]any{"generic": nil}
	got := Coalesce(defaults, user)
	if _, ok := got["generic"]; ok {
		t.Fatalf("generic should be deleted, got %v", got)
	}
	if _, ok := got["configs"]; !ok {
		t.Fatalf("configs default should be present")
	}
}

func TestCoalesceMergesTables(t *testing.T) {
	defaults := map[string]any{"generic": map[string]any{"labels": map[string]any{}, "annotations": map[string]any{}}}
	user := map[string]any{"generic": map[string]any{"labels": map[string]any{"team": "x"}}}
	got := Coalesce(defaults, user)
	want := map[string]any{"generic": map[string]any{"labels": map[string]any{"team": "x"}, "annotations": map[string]any{}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestCoalesceUserScalarWinsOverTable(t *testing.T) {
	defaults := map[string]any{"generic": map[string]any{"labels": map[string]any{}}}
	user := map[string]any{"generic": "oops"}
	got := Coalesce(defaults, user)
	if got["generic"] != "oops" {
		t.Fatalf("user scalar should win, got %v", got["generic"])
	}
}
