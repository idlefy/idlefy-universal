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
	out, err := exec.Command(path, "version", "--short").Output()
	if err != nil {
		t.Fatalf("helm version --short failed: %v", err)
	}
	if !strings.HasPrefix(string(out), "v3.19.") {
		t.Fatalf("golden test requires helm v3.19.x, got %q", strings.TrimSpace(string(out)))
	}
	return path
}

type yamlDoc = map[string]any

// parseDocs splits a multi-doc YAML stream and drops empty documents (a
// template file with no matching resources renders as a whitespace-only
// document, which both helm and the engine produce, and which must not
// count as a real document). Unlike normalize, it does not fail on a
// zero-document result: callers that need to permit "both sides rendered
// nothing" use this directly instead of normalize.
func parseDocs(t *testing.T, stream string) []yamlDoc {
	t.Helper()
	var docs []yamlDoc
	for _, part := range strings.Split(stream, "\n---") {
		part = strings.TrimSpace(part)
		if part == "" || part == "---" {
			continue
		}
		part = strings.TrimPrefix(part, "---\n")
		var d yamlDoc
		if err := yaml.Unmarshal([]byte(part), &d); err != nil {
			t.Fatalf("parseDocs: %v\n%s", err, part)
		}
		if len(d) == 0 {
			continue
		}
		docs = append(docs, d)
	}
	return docs
}

// normalize parses a multi-doc YAML stream, sorts its documents by
// kind/name, and returns canonical JSON so ordering and formatting
// differences vanish. It requires at least one document: a zero-document
// stream would make the golden comparison trivially true on both sides, so
// callers that expect resources to be rendered must use normalize, while
// callers that must also tolerate "helm rendered nothing" use parseDocs
// directly (see TestGoldenCorpus).
func normalize(t *testing.T, stream string) string {
	t.Helper()
	docs := parseDocs(t, stream)
	if len(docs) == 0 {
		t.Fatalf("normalize: stream contained no documents:\n%s", stream)
	}
	// Sort key includes the marshalled body so two documents with the same
	// kind/name (the collision case) still sort deterministically.
	key := func(d yamlDoc) string {
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
	// --kube-version pins the reference helm to the same constant the engine
	// hard-codes; helm 3.19 would otherwise default to its own built-in version.
	cmd := exec.Command(helm, "template", release, chartDir, "-f", valuesPath,
		"--namespace", "default", "--kube-version", KubeVersion)
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

func corpus(t *testing.T) []string {
	t.Helper()
	var paths []string
	for _, glob := range []string{
		filepath.Join(chartDir, "ci", "*.yaml"),
		filepath.Join(repoRoot, "schema", "fixtures", "valid", "*.yaml"),
		filepath.Join(repoRoot, "playground", "engine", "testdata", "coalesce-*.yaml"),
	} {
		m, _ := filepath.Glob(glob)
		paths = append(paths, m...)
	}
	if len(paths) < 10 {
		t.Fatalf("corpus too small: %d", len(paths))
	}
	return paths
}

func TestGoldenCorpus(t *testing.T) {
	helm := requireHelm(t)
	files := loadChartFiles(t)
	// "release-name" (not the uppercase "RELEASE-NAME" helm-unittest placeholder
	// used elsewhere in this repo's chart tests) is real helm's own default
	// release name for `helm template <chart>` with no NAME argument
	// (cmd/helm/template.go: client.ReleaseName = "release-name"). Helm CLI
	// rejects uppercase release names outright (chartutil.validName regex,
	// enforced unconditionally by Install.Run -> availableName, even in
	// --dry-run), so "RELEASE-NAME" cannot be passed as a literal NAME
	// argument to `helm template` and still produce comparable output.
	for _, values := range corpus(t) {
		for _, release := range []string{"demo", "release-name"} {
			name := filepath.Base(values) + "/" + release
			t.Run(name, func(t *testing.T) {
				helmStream := helmTemplate(t, helm, release, values)
				engineStream := renderJoined(t, files, values, release)
				// A fixture that sets only globals (e.g. globals-minimal.yaml)
				// legitimately renders zero resources on both sides. Assert
				// that directly instead of routing it through normalize,
				// which refuses a zero-document stream to avoid a trivial
				// empty-vs-empty pass on any other fixture.
				helmDocs := parseDocs(t, helmStream)
				if len(helmDocs) == 0 {
					engineDocs := parseDocs(t, engineStream)
					if len(engineDocs) != 0 {
						t.Fatalf("mismatch for %s: helm rendered 0 documents, engine rendered %d\n--- engine ---\n%s", name, len(engineDocs), engineStream)
					}
					return
				}
				want := normalize(t, helmStream)
				got := normalize(t, engineStream)
				if want != got {
					t.Fatalf("mismatch for %s\n--- helm ---\n%s\n--- engine ---\n%s", name, want, got)
				}
			})
		}
	}
}

// The graph builder disambiguates standalone vs auto-created resources by
// document order inside these files. Guard that invariant here.
func TestStandaloneBlocksPrecedeAutoCreated(t *testing.T) {
	files := loadChartFiles(t)
	// Text-position canary: it would not notice the auto block moving into a `define`,
	// but the golden corpus would then diverge, so the two tests cover each other.
	// The auto-created needle must be the literal `range ... .Values.deployments }}`
	// statement, not just ".Values.deployments" as a substring: in job.yaml that
	// substring also matches inside ".Values.deploymentsGeneral" at line 3, which
	// sits earlier, inside the standalone jobs range, and would make the assertion
	// pass without actually checking the real auto-created block's position.
	cases := map[string][2]string{
		"templates/service.yaml":   {".Values.services", ".Values.deployments }}"},
		"templates/ingress.yaml":   {".Values.ingresses", ".Values.deployments }}"},
		"templates/httproute.yaml": {".Values.httpRoutes", ".Values.deployments }}"},
		"templates/job.yaml":       {".Values.jobs", ".Values.deployments }}"},
	}
	for file, pair := range cases {
		src := files[file]
		i, j := strings.Index(src, pair[0]), strings.Index(src, pair[1])
		if i < 0 || j < 0 || i > j {
			t.Errorf("%s: expected %q (at %d) before %q (at %d)", file, pair[0], i, pair[1], j)
		}
	}
}
