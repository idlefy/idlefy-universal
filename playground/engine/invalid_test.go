package engine

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

var expectedRe = regexp.MustCompile(`(?m)^#\s*expected_error\s*:\s*(.+?)\s*$`)

func TestInvalidFixturesFail(t *testing.T) {
	files := loadChartFiles(t)
	paths, _ := filepath.Glob(filepath.Join(repoRoot, "schema", "fixtures", "invalid", "*.yaml"))
	if len(paths) == 0 {
		t.Fatal("no invalid fixtures found")
	}
	for _, p := range paths {
		t.Run(filepath.Base(p), func(t *testing.T) {
			src, _ := os.ReadFile(p)
			m := expectedRe.FindStringSubmatch(string(src))
			if m == nil {
				t.Fatalf("fixture lacks '# expected_error:' comment")
			}
			expected := m[1]
			_, err := Render(files, string(src), Options{ReleaseName: "demo", Namespace: "default"})
			if err == nil {
				t.Fatalf("expected failure (%s), got success", expected)
			}
			var re *RenderError
			if !errors.As(err, &re) {
				t.Fatalf("expected *RenderError, got %T: %v", err, err)
			}
			switch re.Kind {
			case ErrSchema:
				// jsonschema/v6's "propertyNames" keyword (used for the chart's DNS-1123
				// name checks) reports its instance location as root/empty rather than
				// pointing at the offending map — verified against real Helm 3.19.2,
				// which prints "- at ''" for the same two fixtures (deployment name too
				// long / uppercase), not "- at '/deployments'". Pin that quirk exactly
				// (root required, not merely permitted) so an upstream jsonschema/v6 fix
				// that starts reporting a real path is caught here, prompting a parity
				// re-check against helm rather than silently drifting.
				if strings.Contains(re.Message, "invalid propertyName") {
					if re.Path != "" {
						t.Errorf("propertyNames schema error expected root path per known jsonschema/v6+helm 3.19 quirk, got %q", re.Path)
					}
				} else if len(re.Path) < 2 || !strings.HasPrefix(re.Path, "/") {
					t.Errorf("schema error must carry a non-root JSON Pointer path, got %q", re.Path)
				}
				// expected_error is python-jsonschema wording; the quoted token inside it
				// (a field name) must still appear in the v6 message.
				if tok := regexp.MustCompile(`'([^']+)'`).FindStringSubmatch(expected); tok != nil && !strings.Contains(re.Message, tok[1]) {
					t.Errorf("schema error %q does not mention %q", re.Message, tok[1])
				}
			case ErrTemplate:
				if !strings.Contains(re.Message, expected) {
					t.Errorf("template error %q does not contain expected %q", re.Message, expected)
				}
			default:
				t.Errorf("unexpected error kind %q: %s", re.Kind, re.Message)
			}
		})
	}
}

// atLineRe matches a "- at '<pointer>': ..." line at any indentation depth
// (helm/jsonschema-v6 indents nested "causes" by two spaces per level), so
// the full ordered error tree can be compared, not just its top line.
var atLineRe = regexp.MustCompile(`(?m)^( *- at '.*)$`)

// atLines extracts every "- at '...'" line from s, indentation included, in
// the order they appear, so tree shape (parent + nested children) and
// ordering are part of the comparison, not just line presence.
func atLines(s string) []string {
	var out []string
	for _, m := range atLineRe.FindAllStringSubmatch(s, -1) {
		out = append(out, m[1])
	}
	return out
}

// The message lines must equal what the reference helm binary prints, so a
// jsonschema/v6 wording change is caught here rather than hardcoded. Two
// cases are checked: a flat single-line error, and a nested "allOf" error
// (parent line + indented child line) to prove tree shape and ordering
// carry over too, not just a single top-level line.
func TestSchemaErrorPathMatchesHelmFormat(t *testing.T) {
	helm := requireHelm(t)
	files := loadChartFiles(t)

	cases := []struct {
		name     string
		valsPath string // if set, read vals from this fixture instead of vals
		vals     string
		wantPath string
	}{
		{
			name:     "flat/unknown-field",
			vals:     "deployments:\n  app:\n    replcias: 2\n    containers:\n      main: {image: nginx, imageTag: \"1\"}\n",
			wantPath: "/deployments/app",
		},
		{
			// allOf failure: helm prints a parent "'allOf' failed" line plus an
			// indented "missing property" child line for the same pointer.
			name:     "nested/allOf",
			valsPath: filepath.Join(repoRoot, "schema", "fixtures", "invalid", "deployment-cert-without-ingress.yaml"),
			wantPath: "/deployments/cert-bug",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			vals := tc.vals
			if tc.valsPath != "" {
				b, err := os.ReadFile(tc.valsPath)
				if err != nil {
					t.Fatal(err)
				}
				vals = string(b)
			}

			_, err := Render(files, vals, Options{ReleaseName: "demo", Namespace: "default"})
			var re *RenderError
			if !errors.As(err, &re) || re.Kind != ErrSchema {
				t.Fatalf("want schema error, got %v", err)
			}
			if re.Path != tc.wantPath {
				t.Errorf("path = %q, want %q", re.Path, tc.wantPath)
			}

			tmp := filepath.Join(t.TempDir(), "values.yaml")
			if err := os.WriteFile(tmp, []byte(vals), 0o644); err != nil {
				t.Fatal(err)
			}
			// Pinned to the same --namespace/--kube-version as the package's
			// helmTemplate helper (engine_test.go) so the reference run matches
			// the engine's own hard-coded Capabilities.KubeVersion. helmTemplate
			// itself can't be reused here: it Fatalfs on a non-zero exit, but a
			// non-zero exit (the schema validation failure) is exactly what this
			// test expects.
			cmd := exec.Command(helm, "template", "demo", chartDir, "-f", tmp,
				"--namespace", "default", "--kube-version", KubeVersion)
			out, err := cmd.CombinedOutput()
			if err == nil {
				t.Fatalf("expected helm template to fail, got success:\n%s", out)
			}

			helmLines := atLines(string(out))
			if len(helmLines) == 0 {
				t.Fatalf("helm produced no '- at' lines:\n%s", out)
			}
			engineLines := atLines(re.Message)
			if !reflect.DeepEqual(helmLines, engineLines) {
				t.Errorf("at-line mismatch (order/content/count must match exactly)\nhelm:\n%s\nengine:\n%s",
					strings.Join(helmLines, "\n"), strings.Join(engineLines, "\n"))
			}
		})
	}
}

func TestKubeVersionGate(t *testing.T) {
	files := loadChartFiles(t)
	files["Chart.yaml"] = strings.Replace(files["Chart.yaml"], "kubeVersion: \">=1.31.0\"", "kubeVersion: \">=9.0.0\"", 1)
	_, err := Render(files, "deployments: {}\n", Options{ReleaseName: "demo", Namespace: "default"})
	var re *RenderError
	if !errors.As(err, &re) || re.Kind != ErrKubeVersion {
		t.Fatalf("want kubeVersion error, got %v", err)
	}
	// Pin the exact incompatibility wording (engine.go's constraint-check
	// branch) so a constraint-parse failure ("invalid kubeVersion constraint: ...")
	// can't slip through and satisfy this test under the wrong branch.
	if !strings.Contains(re.Message, "incompatible with Kubernetes") {
		t.Errorf("message %q does not mention incompatibility with Kubernetes", re.Message)
	}
}
