package engine

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
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
				// long / uppercase), not "- at '/deployments'". So a root path is only
				// acceptable here, not for any other schema-error keyword.
				if !strings.Contains(re.Message, "invalid propertyName") && (len(re.Path) < 2 || !strings.HasPrefix(re.Path, "/")) {
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

// The message lines must equal what the reference helm binary prints, so a
// jsonschema/v6 wording change is caught here rather than hardcoded.
func TestSchemaErrorPathMatchesHelmFormat(t *testing.T) {
	helm := requireHelm(t)
	files := loadChartFiles(t)
	vals := "deployments:\n  app:\n    replcias: 2\n    containers:\n      main: {image: nginx, imageTag: \"1\"}\n"
	_, err := Render(files, vals, Options{ReleaseName: "demo", Namespace: "default"})
	var re *RenderError
	if !errors.As(err, &re) || re.Kind != ErrSchema {
		t.Fatalf("want schema error, got %v", err)
	}
	if re.Path != "/deployments/app" {
		t.Errorf("path = %q, want /deployments/app", re.Path)
	}
	tmp := filepath.Join(t.TempDir(), "values.yaml")
	if err := os.WriteFile(tmp, []byte(vals), 0o644); err != nil {
		t.Fatal(err)
	}
	out, _ := exec.Command(helm, "template", "demo", chartDir, "-f", tmp).CombinedOutput()
	var helmLines []string
	for _, l := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(l, "- at '") {
			helmLines = append(helmLines, l)
		}
	}
	if len(helmLines) == 0 {
		t.Fatalf("helm produced no '- at' lines:\n%s", out)
	}
	for _, l := range helmLines {
		if !strings.Contains(re.Message, l) {
			t.Errorf("engine message lacks helm line %q\nengine: %s", l, re.Message)
		}
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
}
