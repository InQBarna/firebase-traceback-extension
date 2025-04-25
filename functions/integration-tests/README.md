# Integration-test

This is a sample project to test integration of traceback into an existing firebase project

Since it is meant for local debugging and testint, associated domain hosting is created manually,
instead of using the initialization setup script.

## debug the extension locally
firebase emulators:start --inspect-functions

## install and deploy the extension locally
firebase ext:install  ../../ 
firebase deploy --only extensions

## uninstall and deploy the extension remotely
firebase ext:uninstall  traceback
firebase deploy --only extensions

