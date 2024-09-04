set -x
mkdir -p golem/downloaded
cd golem/downloaded
YAGNA_TAG=pre-rel-v0.16.0-payable
wget -qO- https://github.com/golemfactory/yagna/releases/download/${YAGNA_TAG}/golem-provider-linux-${YAGNA_TAG}.tar.gz | tar -xvz
wget -qO- https://github.com/golemfactory/yagna/releases/download/${YAGNA_TAG}/golem-requestor-linux-${YAGNA_TAG}.tar.gz | tar -xvz

mv golem-provider-linux-${YAGNA_TAG}/* .
mv golem-requestor-linux-${YAGNA_TAG}/* .
rm golem-provider-linux-${YAGNA_TAG} -r
rm golem-requestor-linux-${YAGNA_TAG} -r

wget -qO- https://github.com/golemfactory/ya-runtime-vm/releases/download/v0.3.0/ya-runtime-vm-linux-v0.3.0.tar.gz | tar -xvz
mv ya-runtime-vm-linux-v0.3.0/* plugins/
rm ya-runtime-vm-linux-v0.3.0 -r

wget -qO- https://github.com/golemfactory/ya-service-bus/releases/download/v0.7.2/ya-sb-router-linux-v0.7.2.tar.gz | tar -xvz
mv ya-sb-router-linux-v0.7.2/* .
rm ya-sb-router-linux-v0.7.2 -r

