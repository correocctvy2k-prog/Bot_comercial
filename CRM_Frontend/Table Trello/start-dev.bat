@echo off
echo ===================================================
echo   INICIANDO SKYLAB TAREAS - ENTORNO DESARROLLO
echo ===================================================

:: Validar backend/.env
if not exist backend\.env (
    echo [ERROR] No existe el archivo backend\.env.
    echo Por favor, copia backend\.env.example a backend\.env y agrega tus credenciales de Trello.
    pause
    exit /b
)

echo [1/3] Instalando dependencias del Backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la instalacion de dependencias del backend.
    pause
    exit /b
)
cd ..

echo [2/3] Instalando dependencias del Frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la instalacion de dependencias del frontend.
    pause
    exit /b
)
cd ..

echo [3/3] Iniciando servicios en paralelo...

:: Iniciar Backend en una nueva ventana
start "Skylab Tareas - Backend" cmd /k "cd backend && npm run dev"

:: Iniciar Frontend en una nueva ventana
start "Skylab Tareas - Frontend" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   Servicios iniciados.
echo   - Backend: http://localhost:3003
echo   - Frontend: http://localhost:5173
echo ===================================================
pause
