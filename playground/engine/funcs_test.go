package engine

import (
	"errors"
	"regexp"
	"strings"
	"testing"
	"text/template/parse"
)

// Every identifier used in a template action must resolve to a FuncMap entry,
// a builtin, or a pipeline variable. New Helm builtins in the chart fail here
// until the engine supports them.
func TestFuncMapCoversChart(t *testing.T) {
	files := loadChartFiles(t)
	funcs := FuncMap(&RenderCtx{})
	builtins := map[string]bool{"and": true, "or": true, "not": true, "eq": true, "ne": true, "lt": true, "le": true,
		"gt": true, "ge": true, "len": true, "index": true, "print": true, "printf": true, "println": true,
		"slice": true, "call": true, "html": true, "js": true, "urlquery": true}
	missing := map[string]bool{}
	notDefined := regexp.MustCompile(`function "([^"]+)" not defined`)
	for name, src := range files {
		if !strings.HasPrefix(name, "templates/") {
			continue
		}
		// parse.Parse stops at the first unknown identifier; add a stub for it and
		// re-parse until the file parses, so every missing function is reported.
		extra := map[string]any{}
		for {
			_, err := parse.Parse(name, src, "{{", "}}", funcs, builtinsAsFuncs(builtins), extra)
			if err == nil {
				break
			}
			m := notDefined.FindStringSubmatch(err.Error())
			if m == nil {
				t.Fatalf("%s: %v", name, err)
			}
			missing[m[1]] = true
			extra[m[1]] = func() {}
		}
	}
	if len(missing) > 0 {
		t.Fatalf("template functions missing from engine FuncMap: %v", keys(missing))
	}
}

func builtinsAsFuncs(b map[string]bool) map[string]any {
	m := map[string]any{}
	for k := range b {
		m[k] = func() {}
	}
	return m
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// A self-referencing tpl/include must surface as a template RenderError, not take
// the runtime down with a stack overflow (in wasm that kills the engine for good).
func TestRecursionGuard(t *testing.T) {
	for _, tc := range []struct {
		name    string
		files   map[string]string
		values  string
		refName string
	}{
		{
			name: "tpl on a self-referencing value",
			files: map[string]string{
				"Chart.yaml":        "name: guard\nversion: 0.1.0\n",
				"templates/cm.yaml": "data: {{ tpl .Values.loop . }}\n",
			},
			values:  "loop: '{{ tpl .Values.loop . }}'\n",
			refName: "tpl",
		},
		{
			name: "include of a partial that includes itself",
			files: map[string]string{
				"Chart.yaml":        "name: guard\nversion: 0.1.0\n",
				"templates/_p.tpl":  `{{- define "loop" -}}{{ include "loop" . }}{{- end -}}`,
				"templates/cm.yaml": `data: {{ include "loop" . }}`,
			},
			values:  "{}\n",
			refName: "loop",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Render(tc.files, tc.values, Options{ReleaseName: "demo", Namespace: "default"})
			if err == nil {
				t.Fatal("expected a render error, got success")
			}
			var re *RenderError
			if !errors.As(err, &re) {
				t.Fatalf("expected *RenderError, got %T: %v", err, err)
			}
			if re.Kind != ErrTemplate {
				t.Errorf("kind = %q, want %q", re.Kind, ErrTemplate)
			}
			want := "rendering template has a nested reference name: " + tc.refName
			if !strings.Contains(re.Message, want) {
				t.Errorf("message %q does not contain %q", re.Message, want)
			}
		})
	}
}
