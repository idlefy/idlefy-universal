//go:build js && wasm

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"syscall/js"

	engine "github.com/idlefy/idlefy-universal/playground/engine"
)

// Named return so the deferred recover can still hand a JSON result to JS.
func jsRender(this js.Value, args []js.Value) (out any) {
	result := map[string]any{"ok": false}
	defer func() {
		if r := recover(); r != nil {
			result["error"] = map[string]any{"kind": "template", "message": fmt.Sprintf("panic: %v", r)}
			out = marshal(result)
		}
	}()
	if len(args) < 4 {
		result["error"] = map[string]any{"kind": "template", "message": "helmRender expects 4 arguments"}
		return marshal(result)
	}
	var files map[string]string
	if err := json.Unmarshal([]byte(args[0].String()), &files); err != nil {
		result["error"] = map[string]any{"kind": "yaml", "message": "bad files json: " + err.Error()}
		return marshal(result)
	}
	out, err := engine.Render(files, args[1].String(), engine.Options{ReleaseName: args[2].String(), Namespace: args[3].String()})
	if err != nil {
		var re *engine.RenderError
		if errors.As(err, &re) {
			result["error"] = map[string]any{"kind": string(re.Kind), "message": re.Message, "path": re.Path}
		} else {
			result["error"] = map[string]any{"kind": "template", "message": err.Error()}
		}
		return marshal(result)
	}
	result["ok"] = true
	result["manifests"] = out
	return marshal(result)
}

func marshal(v any) js.Value {
	b, _ := json.Marshal(v)
	return js.ValueOf(string(b))
}

func main() {
	js.Global().Set("helmRender", js.FuncOf(jsRender))
	select {}
}
