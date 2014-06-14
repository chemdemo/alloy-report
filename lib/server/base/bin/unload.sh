#!/bin/bash

# sh unload.sh /report_proxy/index
curl "http://127.0.0.1:[port]/?unload=$1"

echo "unload done"
