FROM golang:1.26-bookworm
ARG NODE_MAJOR=24
# binaryen release tag (https://github.com/WebAssembly/binaryen/releases); keep in sync with docs.yaml "Install binaryen".
ARG BINARYEN_VERSION=version_132
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils gzip \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
       | tar -xz -C /opt \
    && ln -s /opt/binaryen-${BINARYEN_VERSION}/bin/wasm-opt /usr/local/bin/wasm-opt \
    && curl -fsSL https://get.helm.sh/helm-v3.19.2-linux-amd64.tar.gz | tar -xz -C /tmp \
    && mv /tmp/linux-amd64/helm /usr/local/bin/helm \
    && rm -rf /var/lib/apt/lists/* /tmp/linux-amd64
WORKDIR /work
