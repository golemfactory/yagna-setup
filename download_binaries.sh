#!/usr/bin/env bash
set -euo pipefail
mkdir -p golem/downloaded
cd golem/downloaded
YAGNA_TAG="${YAGNA_TAG:-pre-rel-v0.18.1-dev.1}"

for component in provider requestor; do
    bundle="golem-${component}-linux-${YAGNA_TAG}"
    wget -qO- "https://github.com/golemfactory/yagna/releases/download/$YAGNA_TAG/$bundle.tar.gz" | tar -xz
    cp -a "$bundle/." .
    rm -r "$bundle"
done

wget -qO- https://github.com/golemfactory/ya-runtime-vm/releases/download/v0.5.3/ya-runtime-vm-linux-v0.5.3.tar.gz | tar -xvz
mv ya-runtime-vm-linux-v0.5.3/* plugins/
rm ya-runtime-vm-linux-v0.5.3 -r

wget -qO- https://github.com/golemfactory/ya-service-bus/releases/download/v0.7.4/ya-sb-router-linux-v0.7.4.tar.gz | tar -xvz
mv ya-sb-router-linux-v0.7.4/* .
rm ya-sb-router-linux-v0.7.4 -r
