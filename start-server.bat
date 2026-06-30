@echo off

REM 启动Python文献服务器
 echo 正在启动Python文献服务器...
echo 服务器将在 http://localhost:5000 上运行

echo 正在检查Python环境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python环境，请先安装Python
    pause
    exit /b 1
)

echo 正在检查依赖包...
pip list | findstr "arxiv" >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装arxiv包...
    pip install arxiv
)

pip list | findstr "Flask" >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装Flask包...
    pip install Flask
)

pip list | findstr "pytz" >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装pytz包...
    pip install pytz
)

echo 启动服务器...
python python/literature_server.py

pause
