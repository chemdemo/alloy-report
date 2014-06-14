#!/bin/bash

CUR_DIR=$(cd $(dirname $0); pwd)
echo $CUR_DIR

PIDS=$(ps -ef | grep node | grep im_nodejs_base/master | gawk '$0 !~/grep/ {print $2}' | tr -s '\n' ' ')
if [ "$PIDS" ]
then
	echo "pids:$PIDS"
	kill -9 $PIDS
else
	echo "do nothing, there is no im_nodejs_base pids"
fi
