mkdir golem
cd golem

# clone ya-runtime-vm
git clone https://github.com/golemfactory/ya-runtime-vm.git
cd ya-runtime-vm
git submodule update --init --recursive
cd ..

# clone yajsapi
git clone https://github.com/golemfactory/yajsapi.git

# clone yapapi
git clone https://github.com/golemfactory/yapapi.git

# clone yaclient
git clone https://github.com/golemfactory/ya-service-bus.git

# clone yaservicebus
git clone https://github.com/golemfactory/ya-service-bus.git

# clone ya-relay
git clone https://github.com/golemfactory/ya-relay.git

# clone yagna
git clone https://github.com/golemfactory/yagna.git
