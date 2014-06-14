#!/bin/bash

CUR_DIR=$(cd $(dirname $0); pwd)

echo "begin exec start"
PIDS=$(ps -ef | grep node | grep nodejs_base/master | gawk '$0 !~/grep/ {print $2}' | tr -s '\n' ' ')

if [ "$PIDS" ]
then
	echo "pids:$PIDS"
	exit 0
else
	echo "do nothing, there is no pids"
fi


if [ -f "${CUR_DIR}/node-v0.10.28/node" ]
then
	${CUR_DIR}/node-v0.10.28/node ${CUR_DIR}/index.js "production" "nohub_start" &
else
	node ${CUR_DIR}/index.js "production" "nohub_start" &
fi

PIDS=$(ps -ef | grep node | grep nodejs_base | gawk '$0 !~/grep/ {print $2}' | tr -s '\n' ' ')
echo "pids:$PIDS"

echo start ok
