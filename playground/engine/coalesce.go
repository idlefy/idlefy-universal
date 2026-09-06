package engine

// Coalesce reproduces Helm's chartutil.CoalesceValues for a single chart:
// chart defaults are laid under user values; a user null for a key that has a
// chart default deletes the key; on map/scalar conflict the user value wins.
func Coalesce(defaults, user map[string]any) map[string]any {
	out := make(map[string]any, len(user))
	for k, v := range user {
		out[k] = v
	}
	for key, defVal := range defaults {
		userVal, present := out[key]
		if !present {
			out[key] = defVal
			continue
		}
		if userVal == nil {
			delete(out, key)
			continue
		}
		userMap, userIsMap := userVal.(map[string]any)
		defMap, defIsMap := defVal.(map[string]any)
		if userIsMap && defIsMap {
			out[key] = coalesceTables(userMap, defMap)
		}
		// scalar/list on either side: user value already in out wins
	}
	return out
}

func coalesceTables(dst, src map[string]any) map[string]any {
	out := make(map[string]any, len(dst))
	for k, v := range dst {
		out[k] = v
	}
	for key, srcVal := range src {
		dstVal, present := out[key]
		if !present {
			out[key] = srcVal
			continue
		}
		if dstVal == nil {
			delete(out, key)
			continue
		}
		dstMap, dstIsMap := dstVal.(map[string]any)
		srcMap, srcIsMap := srcVal.(map[string]any)
		if dstIsMap && srcIsMap {
			out[key] = coalesceTables(dstMap, srcMap)
		}
	}
	return out
}
