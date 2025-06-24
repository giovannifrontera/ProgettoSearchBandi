@echo off
echo ============================================
echo   INSTALLAZIONE DIPENDENZE PROGETTO
echo ============================================
echo.

echo Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRORE: Node.js non trovato!
    echo Scarica e installa Node.js da: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js trovato: 
node --version

echo.
echo Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERRORE: npm non trovato!
    pause
    exit /b 1
)

echo npm trovato:
npm --version

echo.
echo Installando dipendenze...
npm install

if errorlevel 1 (
    echo.
    echo ERRORE durante l'installazione!
    echo Prova a eseguire manualmente:
    echo   npm install
    pause
    exit /b 1
)

echo.
echo ============================================
echo   INSTALLAZIONE COMPLETATA!
echo ============================================
echo.
echo Ora puoi avviare il server con:
echo   npm start
echo.
pause
