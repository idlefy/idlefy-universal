package engine

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"text/template"

	"github.com/Masterminds/sprig/v3"
	"sigs.k8s.io/yaml"
)

// RenderCtx carries the template set so include/tpl can reach it.
type RenderCtx struct {
	Tmpl *template.Template
}

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
		var buf strings.Builder
		err := rc.Tmpl.ExecuteTemplate(&buf, name, data)
		return buf.String(), err
	}
	f["tpl"] = func(s string, data any) (string, error) {
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
