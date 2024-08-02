# Use debian based system (preferably ubuntu)

* Won't work on apple systems
* On Windows it can work with WSL2, but it is a lot of pain and this tutorial won't cover it
* Payments are disabled, so no payment testing for now

# Install build dependencies (especially for ya-runtime-vm)

Install docker - make sure to have user access to docker (add user to docker group)

For example here:
https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-20-04


Install rust
```bash
curl https://sh.rustup.rs -sSf | sh
# add target x86_64-unknown-linux-musl 
rustup target add x86_64-unknown-linux-musl
```

```bash
sudo apt-get update
sudo apt-get install cmake
sudo apt-get install git-lfs 
sudo apt-get install libssl-dev
sudo apt-get install build-essential
sudo apt-get install musl-tools
sudo apt-get install autoconf
sudo apt-get install libtool
sudo apt-get install gperf
```

add your user to kvm group, otherwise you won't be able to run ya-runtime-vm without root privileges
```bash
sudo adduser $USER kvm
```
note!: you need to reboot to apply the changes (probably logout and login is enough, but didn't test it)

## Clone the repositories

```bash
mkdir golem
cd golem

# clone ya-runtime-vm
# binaries:
# ya-runtime-vm - runtime plugin for executing tasks in virtual machine (qemu)
# vmrt - not builded (qemu binary)
git lfs install
git clone https://github.com/golemfactory/ya-runtime-vm.git
(cd ya-runtime-vm && git submodule update --init --recursive)

# clone self test image
# self test image for ya-runtime-vm
git clone https://github.com/golemfactory/ya-self-test-img.git

# clone yapapi
# python sdk for golem
git clone https://github.com/golemfactory/yapapi.git

# clone ya-service-bus
# binaries:
# ya-sb-router - central-net router
git clone https://github.com/golemfactory/ya-service-bus.git

# clone ya-relay
# todo
git clone https://github.com/golemfactory/ya-relay.git

# clone gvmkit-build-rs
# binaries: 
# gvmkit-build - used for building images for ya-runtime-vm
git clone https://github.com/golemfactory/gvmkit-build-rs.git

# clone yagna
# binaries:
# yagna - main service
# exe-unit - execution unit (between ya-provider and ya-runtime-vm)
# ya-provider - provider service
# gftp - file transfer utility
# golemsp - golem service starter (not needed)
git clone https://github.com/golemfactory/yagna.git
```

# First step run router locally, this will let you run services locally

Run it in screen or separate terminal
```bash
cd golem/ya-service-bus
cargo build --release -p ya-sb-router --features "bin"
./target/release/ya-sb-router -l tcp://0.0.0.0:5555
```

# Build ya-runtime-vm

```bash
cd golem/ya-runtime-vm
cargo build
cp target/debug/ya-runtime-vm ../binaries/
```

# Build yagna binaries

```bash
cd golem/yagna
cargo build
cp target/debug/yagna ../binaries/
cp target/debug/exe-unit ../binaries/
cp target/debug/ya-provider ../binaries/
cp target/debug/gftp ../binaries/
```


