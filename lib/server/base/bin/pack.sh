#!/bin/bash

rm -rf ../pkg

mkdir -p ../pkg/bin && mkdir -p ../pkg/conf && mkdir -p ../pkg/lib && mkdir -p ../pkg/node_modules

# => root
cd ../

cp -r bin pkg/
cp -r conf pkg/
cp -r lib pkg/
cp -r node_modules pkg/
cp package.json pkg/

cd pkg

# remove .svn folders
find . -name ".svn" -type d | xargs -n1 rm -R
# remove sock files
rm lib/*.sock

chmod +x bin/*.js
chmod +x bin/*.sh
chmod +x bin/node-*/node

# tar -C ./bin/ -czvf bin.tar.gz ./
# tar -C ./conf/ -czvf conf.tar.gz ./
# tar -C ./lib/ -czvf lib.tar.gz ./
# tar -C ./lib/ -czvf lib.tar.gz ./
tar -C ./ -czvf nodejs_base.tar.gz ./

echo 'package done!'
