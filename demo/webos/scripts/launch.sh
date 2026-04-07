#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# webOS ares CLI only supports Node.js version 18 and lower
nvm exec 18 ares-package . --no-minify -o dist
nvm exec 18 ares-install --device ktv -r com.embrace.demo.webos
nvm exec 18 ares-install --device ktv dist/com.embrace.demo.webos_1.0.0_all.ipk
ares-launch -d ktv com.embrace.demo.webos
