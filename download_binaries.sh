set -x
mkdir -p golem/downloaded
cd golem/downloaded
# Which yagna release to install. Defaults to the last stable release (unpatched,
# used by the read/write path-traversal PoCs). Override via the environment to
# test another build, e.g. a patched preview tag to confirm the fix:
#   YAGNA_TAG=pre-rel-v0.17.6-preview.transfer.0 ./download_binaries.sh
# The provider/requestor tarballs follow the same `golem-*-linux-${TAG}` naming
# across stable and preview releases, so no other change is needed.
YAGNA_TAG="${YAGNA_TAG:-v0.17.6}"
wget -qO- https://github.com/golemfactory/yagna/releases/download/${YAGNA_TAG}/golem-provider-linux-${YAGNA_TAG}.tar.gz | tar -xvz
wget -qO- https://github.com/golemfactory/yagna/releases/download/${YAGNA_TAG}/golem-requestor-linux-${YAGNA_TAG}.tar.gz | tar -xvz

mv golem-provider-linux-${YAGNA_TAG}/* .
mv golem-requestor-linux-${YAGNA_TAG}/* .
rm golem-provider-linux-${YAGNA_TAG} -r
rm golem-requestor-linux-${YAGNA_TAG} -r

wget -qO- https://github.com/golemfactory/ya-runtime-vm/releases/download/v0.5.3/ya-runtime-vm-linux-v0.5.3.tar.gz | tar -xvz
mv ya-runtime-vm-linux-v0.5.3/* plugins/
rm ya-runtime-vm-linux-v0.5.3 -r

wget -qO- https://github.com/golemfactory/ya-service-bus/releases/download/v0.7.4/ya-sb-router-linux-v0.7.4.tar.gz | tar -xvz
mv ya-sb-router-linux-v0.7.4/* .
rm ya-sb-router-linux-v0.7.4 -r

