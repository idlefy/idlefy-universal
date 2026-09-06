//go:build !js || !wasm

package main

func main() { panic("this binary is built for GOOS=js GOARCH=wasm only") }
