FROM --platform=linux/amd64 golang:1.26-bookworm
ARG NODE_MAJOR=24
# binaryen release tag (https://github.com/WebAssembly/binaryen/releases); keep in sync with docs.yaml "Install binaryen".
ARG BINARYEN_VERSION=version_132
# sha256 of binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz. The GitHub release ships no checksum
# file, so it is pinned here: recompute with `sha256sum` when bumping BINARYEN_VERSION and update
# docs.yaml BINARYEN_SHA256 too. Helm publishes .sha256sum next to the tarball, so that one is fetched.
ARG BINARYEN_SHA256=195ddc94f9bc89f45abdabb0b9eea86023d727ba90eac8b35b80f2544fc30572
ARG HELM_VERSION=v3.19.2
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils gzip \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL -o /tmp/binaryen.tar.gz "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
    && echo "${BINARYEN_SHA256}  /tmp/binaryen.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/binaryen.tar.gz -C /opt \
    && ln -s /opt/binaryen-${BINARYEN_VERSION}/bin/wasm-opt /usr/local/bin/wasm-opt \
    && curl -fsSL -o /tmp/helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" \
    && curl -fsSL -o /tmp/helm.sha256 "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz.sha256sum" \
    && echo "$(cut -d' ' -f1 /tmp/helm.sha256)  /tmp/helm.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/helm.tar.gz -C /tmp \
    && mv /tmp/linux-amd64/helm /usr/local/bin/helm \
    && rm -rf /var/lib/apt/lists/* /tmp/linux-amd64 /tmp/binaryen.tar.gz /tmp/helm.tar.gz /tmp/helm.sha256
# Debian's /etc/profile overwrites PATH, so a login shell (`bash -lc`, used by the
# playground-* make targets) loses the golang image's /usr/local/go/bin and $GOPATH/bin.
RUN printf 'export PATH="$PATH:/usr/local/go/bin:${GOPATH:-/go}/bin"\n' > /etc/profile.d/golang.sh
WORKDIR /work
