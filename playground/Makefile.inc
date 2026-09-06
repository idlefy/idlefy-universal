PLAYGROUND_IMAGE := idlefy-playground-toolchain
PLAYGROUND_RUN := docker run --rm -v $(CURDIR):/work -w /work -e CI=$(CI) $(PLAYGROUND_IMAGE)
PLAYGROUND_RUN_IT := docker run --rm -it -v $(CURDIR):/work -w /work -p 5173:5173 $(PLAYGROUND_IMAGE)

.PHONY: playground-image playground-engine playground-build playground-test playground-dev playground-smoke

playground-image:
	docker build -f playground/Dockerfile -t $(PLAYGROUND_IMAGE) playground

playground-engine: playground-image
	$(PLAYGROUND_RUN) bash playground/engine/build.sh

playground-build: playground-engine
	$(PLAYGROUND_RUN) bash -lc 'cd playground/web && npm ci && npm run build'

# Depends on playground-engine: the web tests exercise public/helm.wasm (engine-node.test.ts)
# and scripts/bundle-chart.mjs refuses to run without it.
playground-test: playground-engine
	$(PLAYGROUND_RUN) bash -lc 'cd playground/engine && go test ./...'
	$(PLAYGROUND_RUN) bash -lc 'cd playground/web && npm ci && npm test -- --run'

playground-dev: playground-engine
	$(PLAYGROUND_RUN_IT) bash -lc 'cd playground/web && npm install && npm run dev -- --host 0.0.0.0'

playground-smoke: playground-build
	$(PLAYGROUND_RUN) bash -lc 'cd playground/web && npx playwright install --with-deps chromium && npm run e2e'
