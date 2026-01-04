@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat"

cd /d %~dp0

echo Building C++ with MSVC...

if not exist obj mkdir obj

cl.exe /O2 /EHsc /std:c++17 /openmp /I src /Fe:khmer.exe src\main.cpp src\segmenter.cpp src\dictionary.cpp /link /OUT:khmer.exe

if %ERRORLEVEL% EQU 0 (
    echo Build successful!
    dir khmer.exe
) else (
    echo Build failed with error %ERRORLEVEL%
)
