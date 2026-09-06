package engine

import (
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
