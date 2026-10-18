@echo off
rem Inside a Solti terminal CANVAS_NODE points to the app's own runtime, so users need no Node.js install.
if not defined CANVAS_NODE goto plain
set "ELECTRON_RUN_AS_NODE=1"
"%CANVAS_NODE%" "%~dp0canvas.cjs" %*
exit /b %errorlevel%
:plain
node "%~dp0canvas.cjs" %*
