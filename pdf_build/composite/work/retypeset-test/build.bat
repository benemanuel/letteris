@echo off
node create-page-config.js  %1 %2
node build-body.mjs %1 %2
