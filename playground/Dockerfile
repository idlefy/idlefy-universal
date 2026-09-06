FROM --platform=linux/amd64 golang:1.26-bookworm
# Node is installed from the official nodejs.org tarball (not the NodeSource
# `curl | bash` script) so the download is verified against a digest pinned here.
# Bump: pick a release from https://nodejs.org/dist/ and copy its line from SHASUMS256.txt.
ARG NODE_VERSION=v24.20.0
ARG NODE_SHA256=2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2
# binaryen release tag (https://github.com/WebAssembly/binaryen/releases); keep in sync with docs.yaml "Install binaryen".
ARG BINARYEN_VERSION=version_132
# sha256 of binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz. The GitHub release ships no checksum
# file, so it is pinned here: recompute with `sha256sum` when bumping BINARYEN_VERSION and update
# docs.yaml BINARYEN_SHA256 too.
ARG BINARYEN_SHA256=195ddc94f9bc89f45abdabb0b9eea86023d727ba90eac8b35b80f2544fc30572
ARG HELM_VERSION=v3.19.2
# sha256 of helm-${HELM_VERSION}-linux-amd64.tar.gz, pinned rather than fetched from get.helm.sh
# at build time (a checksum served next to the archive proves nothing). Copy from
# https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz.sha256sum when bumping HELM_VERSION.
ARG HELM_SHA256=2114c9dea2844dce6d0ee2d792a9aae846be8cf53d5b19dc2988b5a0e8fec26e
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils gzip \
    && curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
    && curl -fsSL -o /tmp/binaryen.tar.gz "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
    && echo "${BINARYEN_SHA256}  /tmp/binaryen.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/binaryen.tar.gz -C /opt \
    && ln -s /opt/binaryen-${BINARYEN_VERSION}/bin/wasm-opt /usr/local/bin/wasm-opt \
    && curl -fsSL -o /tmp/helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" \
    && echo "${HELM_SHA256}  /tmp/helm.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/helm.tar.gz -C /tmp \
    && mv /tmp/linux-amd64/helm /usr/local/bin/helm \
    && rm -rf /var/lib/apt/lists/* /tmp/linux-amd64 /tmp/binaryen.tar.gz /tmp/helm.tar.gz /tmp/node.tar.xz
# Debian's /etc/profile overwrites PATH, so a login shell (`bash -lc`, used by the
# playground-* make targets) loses the golang image's /usr/local/go/bin and $GOPATH/bin.
RUN printf 'export PATH="$PATH:/usr/local/go/bin:${GOPATH:-/go}/bin"\n' > /etc/profile.d/golang.sh
WORKDIR /work
