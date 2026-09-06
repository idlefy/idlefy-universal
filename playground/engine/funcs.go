package engine

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"text/template"

	"github.com/Masterminds/sprig/v3"
	"sigs.k8s.io/yaml"
)

// recursionMaxNums bounds how deep a single template name may re-enter itself
// through include/tpl. Same limit and wording as Helm's pkg/engine.
const recursionMaxNums = 1000

// RenderCtx carries the template set so include/tpl can reach it, plus the
// per-name nesting counters that stop infinite include/tpl recursion (which
// would otherwise take the whole Go runtime down with a stack overflow).
type RenderCtx struct {
	Tmpl *template.Template

	included map[string]int
}

// enter records one nesting level for name and fails once it exceeds the limit.
func (rc *RenderCtx) enter(name string) error {
	if rc.included == nil {
		rc.included = map[string]int{}
	}
	if rc.included[name] > recursionMaxNums {
		return fmt.Errorf("rendering template has a nested reference name: %s", name)
	}
	rc.included[name]++
	return nil
}

func (rc *RenderCtx) leave(name string) { rc.included[name]-- }

// FuncMap returns Helm's template function set as implemented by this engine.
func FuncMap(rc *RenderCtx) template.FuncMap {
	f := sprig.TxtFuncMap()
	delete(f, "env")
	delete(f, "expandenv")

	f["toYaml"] = func(v any) string {
		b, err := yaml.Marshal(v)
		if err != nil {
			return ""
		}
		return strings.TrimSuffix(string(b), "\n")
	}
	f["fromYaml"] = func(s string) map[string]any {
		m := map[string]any{}
		if err := yaml.Unmarshal([]byte(s), &m); err != nil {
			m["Error"] = err.Error()
		}
		return m
	}
	f["fromYamlArray"] = func(s string) []any {
		a := []any{}
		if err := yaml.Unmarshal([]byte(s), &a); err != nil {
			a = []any{err.Error()}
		}
		return a
	}
	f["toJson"] = func(v any) string {
		b, _ := json.Marshal(v)
		return string(b)
	}
	f["fromJson"] = func(s string) map[string]any {
		m := map[string]any{}
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			m["Error"] = err.Error()
		}
		return m
	}
	f["required"] = func(warn string, val any) (any, error) {
		if val == nil {
			return val, errors.New(warn)
		}
		if s, ok := val.(string); ok && s == "" {
			return val, errors.New(warn)
		}
		return val, nil
	}
	f["fail"] = func(msg string) (string, error) { return "", errors.New(msg) }
	f["lookup"] = func(string, string, string, string) (map[string]any, error) {
		return map[string]any{}, nil
	}
	f["include"] = func(name string, data any) (string, error) {
		if err := rc.enter(name); err != nil {
			return "", err
		}
		defer rc.leave(name)
		var buf strings.Builder
		err := rc.Tmpl.ExecuteTemplate(&buf, name, data)
		return buf.String(), err
	}
	f["tpl"] = func(s string, data any) (string, error) {
		if err := rc.enter("tpl"); err != nil {
			return "", err
		}
		defer rc.leave("tpl")
		t, err := rc.Tmpl.Clone()
		if err != nil {
			return "", err
		}
		t, err = t.New("tpl").Parse(s)
		if err != nil {
			return "", err
		}
		var buf bytes.Buffer
		err = t.ExecuteTemplate(&buf, "tpl", data)
		return strings.ReplaceAll(buf.String(), "<no value>", ""), err
	}
	return f
}
