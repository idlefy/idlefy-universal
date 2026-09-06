package engine

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"sigs.k8s.io/yaml"
)

var repoRoot = func() string {
	wd, _ := os.Getwd()
	return filepath.Clean(filepath.Join(wd, "..", ".."))
}()

var chartDir = filepath.Join(repoRoot, "charts", "idlefy-universal")

func loadChartFiles(t *testing.T) map[string]string {
	t.Helper()
	files := map[string]string{}
	err := filepath.Walk(chartDir, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(chartDir, p)
		if info.IsDir() {
			if rel == "tests" || rel == "ci" {
				return filepath.SkipDir
			}
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(rel)] = string(b)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func requireHelm(t *testing.T) string {
	t.Helper()
	path, err := exec.LookPath("helm")
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatal("helm not found and CI is set")
		}
		t.Skip("helm binary not found")
	}
	out, _ := exec.Command(path, "version", "--short").Output()
	if !strings.HasPrefix(string(out), "v3.19.") {
		t.Fatalf("golden test requires helm v3.19.x, got %q", strings.TrimSpace(string(out)))
	}
	return path
}

// normalize parses a multi-doc YAML stream, drops empty docs, sorts by kind/name,
// and returns canonical JSON so ordering and formatting differences vanish.
func normalize(t *testing.T, stream string) string {
	t.Helper()
	type doc = map[string]any
	var docs []doc
	for _, part := range strings.Split(stream, "\n---") {
		part = strings.TrimSpace(part)
		if part == "" || part == "---" {
			continue
		}
		part = strings.TrimPrefix(part, "---\n")
		var d doc
		if err := yaml.Unmarshal([]byte(part), &d); err != nil {
			t.Fatalf("normalize: %v\n%s", err, part)
		}
		if len(d) == 0 {
			continue
		}
		docs = append(docs, d)
	}
	// Sort key includes the marshalled body so two documents with the same
	// kind/name (the collision case) still sort deterministically.
	key := func(d doc) string {
		md, _ := d["metadata"].(map[string]any)
		name, _ := md["name"].(string)
		kind, _ := d["kind"].(string)
		b, _ := json.Marshal(d)
		return kind + "/" + name + "/" + string(b)
	}
	sort.SliceStable(docs, func(i, j int) bool { return key(docs[i]) < key(docs[j]) })
	b, _ := json.MarshalIndent(docs, "", " ")
	return string(b)
}

func helmTemplate(t *testing.T, helm, release, valuesPath string) string {
	t.Helper()
	cmd := exec.Command(helm, "template", release, chartDir, "-f", valuesPath, "--namespace", "default")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("helm template failed: %v\n%s", err, stderr.String())
	}
	return stdout.String()
}

func renderJoined(t *testing.T, files map[string]string, valuesPath, release string) string {
	t.Helper()
	vals, err := os.ReadFile(valuesPath)
	if err != nil {
		t.Fatal(err)
	}
	out, err := Render(files, string(vals), Options{ReleaseName: release, Namespace: "default"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	parts := make([]string, 0, len(out))
	for _, v := range out {
		parts = append(parts, v)
	}
	return strings.Join(parts, "\n---\n")
}

func TestGoldenHelloWorld(t *testing.T) {
	helm := requireHelm(t)
	files := loadChartFiles(t)
	values := filepath.Join(repoRoot, "examples", "01-hello-world", "values.yaml")
	want := normalize(t, helmTemplate(t, helm, "demo", values))
	got := normalize(t, renderJoined(t, files, values, "demo"))
	if want != got {
		t.Fatalf("mismatch\n--- helm ---\n%s\n--- engine ---\n%s", want, got)
	}
}
