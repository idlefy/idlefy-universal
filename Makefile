IMAGE := ks-schema-builder
HELM_UNITTEST_IMAGE := helmunittest/helm-unittest:3.19.0-1.0.3
DOCKER_RUN := docker run --rm -v $(CURDIR):/work -w /work $(IMAGE)
DOCKER_RUN_IT := docker run --rm -it -v $(CURDIR):/work -w /work $(IMAGE)
# helm-unittest image runs as non-root "helmuser" by default; in rootless docker
# this is a subordinate uid that cannot write to host-mounted snapshot files.
# Force container root (uid 0 inside) which rootless docker maps back to the
# host user, restoring write permission.
HELM_UNITTEST_RUN := docker run --rm --user 0:0 -v $(CURDIR):/apps $(HELM_UNITTEST_IMAGE)

.PHONY: schema-image schema-test schema-build schema-lint schema-validate schema-render-docs schema-agent-index schema-shell helm-test helm-test-update test

schema-image:
	docker build -f schema/Dockerfile -t $(IMAGE) .

schema-test: schema-image
	$(DOCKER_RUN) python -m pytest schema/tests/ -v

schema-build: schema-image
	$(DOCKER_RUN) python schema/build.py build

schema-lint: schema-image
	$(DOCKER_RUN) python schema/build.py lint

schema-validate: schema-image
	$(DOCKER_RUN) python schema/build.py validate-fixtures

schema-render-docs: schema-image
	$(DOCKER_RUN) python schema/build.py render-docs

schema-agent-index: schema-image
	$(DOCKER_RUN) python schema/build.py agent-index

schema-shell: schema-image
	$(DOCKER_RUN_IT) bash

helm-test:
	$(HELM_UNITTEST_RUN) charts/idlefy-universal

helm-test-update:
	$(HELM_UNITTEST_RUN) -u charts/idlefy-universal

test: schema-test schema-validate helm-test
