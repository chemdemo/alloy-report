#!/bin/bash

CUR_DIR=$(cd $(dirname $0); pwd)

echo "begin exec start"
PIDS=$(ps -ef | grep node | grep im_nodejs_base/master | gawk '$0 !~/grep/ {print $2}' | tr -s '\n' ' ')

if [ "$PIDS" ]
then
	echo "pids:$PIDS"
	exit 0
else
	echo "do nothing, there is no pids"
fi


# if [ -f "/usr/lib64/libdcapi_cpp-64.so" ]
# then
# echo "libdcapi_cpp-64.so ok!";
# else
# echo "copy libdcapi_cpp-64.so ok!";
# cp  "${CUR_DIR}/../lib/node_modules/libdcapi/x86_64/libdcapi_cpp-64.so" /usr/lib64/libdcapi_cpp-64.so
# fi


# if [ -f "/usr/lib64/libqos_client_64.so" ]
# then
# echo "libqos_client_64.so ok!";
# else
# echo "copy libqos_client_64.so ok!";
# cp  "${CUR_DIR}/../lib/node_modules/L5/L5_sys64/libqos_client_64.so" /usr/lib64/libqos_client_64.so
# fi


if [ -f "${CUR_DIR}/node-v0.10.28/node" ]
then
	${CUR_DIR}/node-v0.10.28/node ${CUR_DIR}/index.js "production" "nohub_start" &
else
	node ${CUR_DIR}/index.js "production" "nohub_start" &
fi

PIDS=$(ps -ef | grep node | grep im_nodejs_base | gawk '$0 !~/grep/ {print $2}' | tr -s '\n' ' ')
echo "pids:$PIDS"

echo start ok
