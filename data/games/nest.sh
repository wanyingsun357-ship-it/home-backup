#!/bin/bash
export PATH=/opt/node22/bin:$PATH
cd /root/ayan/games/little-nest-tour
exec npx vinext dev --port 3100
