#!/bin/bash

CUR_DIR=$(cd $(dirname $0); pwd)

echo "begin exec restart"

${CUR_DIR}/stop.sh

sleep 1

${CUR_DIR}/start.sh
