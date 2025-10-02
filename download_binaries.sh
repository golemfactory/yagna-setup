set -x
mkdir -p golem/downloaded
cd golem/downloaded
YAGNA_TAG=pre-rel-v0.17.1-hoodi
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

