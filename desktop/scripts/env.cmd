@echo off
rem Rust y Node de Windows para las compilaciones lanzadas desde WSL (cmd.exe no recibe %USERPROFILE%).
set "WINHOME=C:\Users\%USERNAME%"
set "RUSTUP_HOME=%WINHOME%\.rustup"
set "CARGO_HOME=%WINHOME%\.cargo"
set "PATH=%WINHOME%\.cargo\bin;C:\Program Files\nodejs;%WINHOME%\AppData\Roaming\npm;%PATH%"
