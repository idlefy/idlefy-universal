package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
	"text/template"

	"github.com/Masterminds/semver/v3"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"sigs.k8s.io/yaml"
)

const KubeVersion = "v1.35.0"

type ErrorKind string

const (
	ErrYAML        ErrorKind = "yaml"
	ErrSchema      ErrorKind = "schema"
	ErrTemplate    ErrorKind = "template"
	ErrKubeVersion ErrorKind = "kubeVersion"
)

type RenderError struct {
	Kind    ErrorKind
	Message string
	Path    string // JSON Pointer for schema errors, else ""
}

func (e *RenderError) Error() string { return e.Message }

type Options struct {
	ReleaseName string
	Namespace   string
}

// Render executes the chart templates against valuesYAML and returns rendered
// text keyed by "<chartName>/templates/<file>". NOTES.txt and partials are skipped.
func Render(files map[string]string, valuesYAML string, opts Options) (map[string]string, error) {
	meta := map[string]any{}
	if err := yaml.Unmarshal([]byte(files["Chart.yaml"]), &meta); err != nil {
		return nil, &RenderError{Kind: ErrYAML, Message: "Chart.yaml: " + err.Error()}
	}
	chartName, _ := meta["name"].(string)

	if kv, ok := meta["kubeVersion"].(string); ok && kv != "" {
		c, err := semver.NewConstraint(kv)
		if err != nil {
			return nil, &RenderError{Kind: ErrKubeVersion, Message: "invalid kubeVersion constraint: " + err.Error()}
		}
		if !c.Check(semver.MustParse(KubeVersion)) {
			return nil, &RenderError{Kind: ErrKubeVersion,
				Message: fmt.Sprintf("chart requires kubeVersion: %s which is incompatible with Kubernetes %s", kv, KubeVersion)}
		}
	}

	defaults := map[string]any{}
	if v, ok := files["values.yaml"]; ok {
		if err := yaml.Unmarshal([]byte(v), &defaults); err != nil {
			return nil, &RenderError{Kind: ErrYAML, Message: "values.yaml: " + err.Error()}
		}
	}
	user := map[string]any{}
	if err := yaml.Unmarshal([]byte(valuesYAML), &user); err != nil {
		return nil, &RenderError{Kind: ErrYAML, Message: "parse values: " + err.Error()}
	}
	vals := Coalesce(defaults, user)

	if schemaSrc, ok := files["values.schema.json"]; ok {
		if err := validateSchema(chartName, schemaSrc, vals); err != nil {
			return nil, err
		}
	}

	chartObj := map[string]any{}
	for k, v := range meta {
		// Helm decodes Chart.yaml into a struct and drops unknown keys; an empty key
		// ("": x, which sigs.k8s.io/yaml accepts) is unknown too and must not reach the slice below.
		if name := chartFieldName(k); name != "" {
			chartObj[name] = v
		}
	}
	root := map[string]any{
		"Values": vals,
		"Chart":  chartObj,
		"Release": map[string]any{
			"Name": opts.ReleaseName, "Namespace": opts.Namespace, "Service": "Helm",
			"IsInstall": true, "IsUpgrade": false, "Revision": 1,
		},
		"Capabilities": map[string]any{
			"KubeVersion": map[string]any{"Version": KubeVersion, "Major": "1", "Minor": "35", "GitVersion": KubeVersion},
			"HelmVersion": map[string]any{"Version": "v3.19.2"},
			"APIVersions": []string{"v1", "apps/v1", "batch/v1", "networking.k8s.io/v1", "policy/v1", "autoscaling/v2"},
		},
	}

	rc := &RenderCtx{}
	// Helm sets missingkey=zero: a missing map key renders as the typed zero, never "<no value>".
	t := template.New("gotpl").Funcs(FuncMap(rc)).Option("missingkey=zero")
	rc.Tmpl = t

	names := make([]string, 0, len(files))
	for n := range files {
		if strings.HasPrefix(n, "templates/") && path.Base(n) != "NOTES.txt" {
			names = append(names, n)
		}
	}
	sort.Slice(names, func(i, j int) bool {
		pi, pj := strings.HasPrefix(path.Base(names[i]), "_"), strings.HasPrefix(path.Base(names[j]), "_")
		if pi != pj {
			return pi
		}
		return names[i] < names[j]
	})
	for _, n := range names {
		if _, err := t.New(chartName + "/" + n).Parse(files[n]); err != nil {
			return nil, &RenderError{Kind: ErrTemplate, Message: fmt.Sprintf("parse error at (%s/%s): %v", chartName, n, err)}
		}
	}

	out := map[string]string{}
	for _, n := range names {
		if strings.HasPrefix(path.Base(n), "_") {
			continue
		}
		full := chartName + "/" + n
		root["Template"] = map[string]any{"Name": full, "BasePath": chartName + "/templates"}
		var buf strings.Builder
		if err := t.ExecuteTemplate(&buf, full, root); err != nil {
			return nil, &RenderError{Kind: ErrTemplate, Message: fmt.Sprintf("template: %s: %v", full, unwrapExec(err))}
		}
		// Helm (pkg/engine) strips text/template's "<no value>" from every rendered file and from tpl output.
		out[full] = strings.ReplaceAll(buf.String(), "<no value>", "")
	}
	return out, nil
}

func unwrapExec(err error) error {
	var ee template.ExecError
	if errors.As(err, &ee) {
		return ee.Err
	}
	return err
}

func validateSchema(chartName, schemaSrc string, vals map[string]any) error {
	var schemaDoc any
	if err := json.Unmarshal([]byte(schemaSrc), &schemaDoc); err != nil {
		return &RenderError{Kind: ErrSchema, Message: "values.schema.json: " + err.Error()}
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource("values.schema.json", schemaDoc); err != nil {
		return &RenderError{Kind: ErrSchema, Message: err.Error()}
	}
	sch, err := c.Compile("values.schema.json")
	if err != nil {
		return &RenderError{Kind: ErrSchema, Message: "compile schema: " + err.Error()}
	}
	b, _ := json.Marshal(vals)
	var inst any
	_ = json.Unmarshal(b, &inst)
	if err := sch.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		msg := "values don't meet the specifications of the schema(s) in the following chart(s):\n" + chartName + ":\n"
		firstPath := ""
		if errors.As(err, &ve) {
			// Helm 3.19 prints v6's own error tree minus its first line; reproduce that byte for byte.
			msg += strings.TrimPrefix(ve.Error(), "jsonschema validation failed with '"+ve.SchemaURL+"'\n")
			if leaves := leafErrors(ve); len(leaves) > 0 {
				firstPath = jsonPointer(leaves[0].InstanceLocation)
			}
		} else {
			msg += err.Error()
		}
		return &RenderError{Kind: ErrSchema, Message: strings.TrimRight(msg, "\n"), Path: firstPath}
	}
	return nil
}

// jsonPointer escapes segments per RFC 6901 ("~" → "~0", "/" → "~1").
func jsonPointer(segments []string) string {
	var b strings.Builder
	for _, s := range segments {
		b.WriteString("/")
		b.WriteString(strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1"))
	}
	return b.String()
}

func leafErrors(ve *jsonschema.ValidationError) []*jsonschema.ValidationError {
	if len(ve.Causes) == 0 {
		return []*jsonschema.ValidationError{ve}
	}
	var out []*jsonschema.ValidationError
	for _, c := range ve.Causes {
		out = append(out, leafErrors(c)...)
	}
	return out
}

// chartFieldName maps a Chart.yaml key to the field name Helm exposes under .Chart.
// Helm's chart.Metadata uses Go initialisms (APIVersion, not ApiVersion); with
// missingkey=zero a wrong casing would silently render as an empty value.
// An empty key yields "" so callers can skip it.
func chartFieldName(key string) string {
	switch key {
	case "":
		return ""
	case "apiVersion":
		return "APIVersion"
	}
	return strings.ToUpper(key[:1]) + key[1:]
}
