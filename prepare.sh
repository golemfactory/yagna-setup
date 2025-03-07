mkdir golem
cd golem

# clone ya-runtime-vm
git lfs install
git clone https://github.com/golemfactory/ya-runtime-vm.git
(cd ya-runtime-vm && git submodule update --init --recursive)

# clone self test image
git clone https://github.com/golemfactory/ya-self-test-img.git

# clone yapapi
git clone https://github.com/golemfactory/yapapi.git

# clone ya-service-bus
git clone https://github.com/golemfactory/ya-service-bus.git

# clone ya-relay
git clone https://github.com/golemfactory/ya-relay.git

# clone ya-runtime-rs
git clone https://github.com/golemfactory/gvmkit-build-rs.git

# clone yagna
git clone https://github.com/golemfactory/yagna.git

# clone golem-js
git clone https://github.com/golemfactory/golem-js.git
