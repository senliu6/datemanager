@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ===========================================
REM 数据管理平台 - 超简单一键上传工具 (Windows版)
REM 功能：自动检测服务器，一键上传当前目录文件
REM 使用：将此脚本放在要上传的文件夹中，双击运行
REM ===========================================

REM 固定配置
set UPLOAD_USER=upload
set UPLOAD_PASS=upload123
set WEB_PORT=3001

REM 获取脚本所在目录
set SCRIPT_DIR=%~dp0
set SCRIPT_NAME=%~nx0

REM 清屏并显示标题
cls
echo.
echo ================================================
echo         数据管理平台 - 一键上传工具
echo ================================================
echo.

REM 显示当前信息
echo 📁 当前目录: %SCRIPT_DIR%
echo 👤 当前用户: %USERNAME%
echo 💻 主机名: %COMPUTERNAME%
echo.

REM 服务器IP配置选项
echo 🔧 服务器配置选项：
echo   1. 自动检测服务器IP（推荐）
echo   2. 手动输入服务器IP
echo.
set /p CONFIG_CHOICE=请选择配置方式 (1/2，默认1): 

if "%CONFIG_CHOICE%"=="2" (
    echo.
    echo 📝 手动配置服务器IP
    echo.
    
    REM 循环输入直到连接成功或用户选择退出
    :manual_input_loop
    set /p MANUAL_SERVER_IP=请输入服务器IP地址 (输入 'q' 退出): 
    
    if /i "!MANUAL_SERVER_IP!"=="q" (
        echo 用户取消操作，退出
        pause
        exit /b 0
    )
    
    if "!MANUAL_SERVER_IP!"=="" (
        echo ⚠️  IP地址不能为空，请重新输入
        echo.
        goto :manual_input_loop
    )
    
    REM 简单的IP格式验证
    echo !MANUAL_SERVER_IP! | findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
    if !errorlevel! neq 0 (
        if /i not "!MANUAL_SERVER_IP!"=="localhost" (
            echo ⚠️  IP地址格式不正确，请输入正确的IP地址（如：192.168.1.100）
            echo.
            goto :manual_input_loop
        )
    )
    
    echo|set /p="测试 !MANUAL_SERVER_IP!:%WEB_PORT% ... "
    
    REM 测试连接并显示详细错误信息
    curl -s --connect-timeout 10 "http://!MANUAL_SERVER_IP!:%WEB_PORT%/api/health" 2>nul | findstr "healthy" >nul
    set CURL_EXIT_CODE=!errorlevel!
    
    if !CURL_EXIT_CODE! equ 0 (
        echo ✅ 服务器连接成功
        set SERVER_IP=!MANUAL_SERVER_IP!
        goto :server_configured
    ) else (
        echo ❌ 连接失败
        echo.
        echo 错误详情：
        echo   - 无法连接到服务器，请检查：
        echo     1. IP地址是否正确
        echo     2. 服务器是否已启动
        echo     3. 网络连接是否正常
        echo     4. 防火墙是否阻止连接
        echo.
        echo 建议：
        echo   1. 确认服务器IP地址正确
        echo   2. 确认数据管理平台服务已启动
        echo   3. 尝试在浏览器中访问 http://!MANUAL_SERVER_IP!:%WEB_PORT%
        echo   4. 检查防火墙设置
        echo.
        goto :manual_input_loop
    )
) else (
    echo.
    echo 🔍 正在自动检测数据管理平台服务器...
)

:server_configured
REM 如果已经手动配置了服务器IP，跳过自动检测
if not "%SERVER_IP%"=="" goto :skip_auto_detect

REM 获取本机IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LOCAL_IP=%%a
    set LOCAL_IP=!LOCAL_IP: =!
    goto :got_ip
)
:got_ip

if "%LOCAL_IP%"=="" set LOCAL_IP=192.168.1.100

REM 提取网段前缀
for /f "tokens=1,2,3 delims=." %%a in ("%LOCAL_IP%") do (
    set NETWORK_PREFIX=%%a.%%b.%%c
)

echo 本机IP: %LOCAL_IP%
echo 扫描网段: %NETWORK_PREFIX%.x

REM 扫描常见的服务器IP
set SERVER_IP=
set SCAN_LIST=%LOCAL_IP% %NETWORK_PREFIX%.1 %NETWORK_PREFIX%.94 %NETWORK_PREFIX%.10 %NETWORK_PREFIX%.100 %NETWORK_PREFIX%.200 127.0.0.1

for %%i in (%SCAN_LIST%) do (
    echo|set /p="测试 %%i:%WEB_PORT% ... "
    
    REM 使用curl测试Web服务
    curl -s --connect-timeout 3 "http://%%i:%WEB_PORT%/api/health" 2>nul | findstr "healthy" >nul
    if !errorlevel! equ 0 (
        echo ✅ 发现数据管理平台
        set SERVER_IP=%%i
        goto :found_server
    ) else (
        echo ❌
    )
)

:found_server
if "%SERVER_IP%"=="" (
    echo.
    echo ⚠️  自动检测失败，请手动输入服务器IP地址
    echo.
    set /p SERVER_IP=请输入服务器IP: 
    
    if "!SERVER_IP!"=="" (
        echo ❌ 未输入服务器IP，退出
        pause
        exit /b 1
    )
)

:skip_auto_detect
echo.
echo 🌐 目标服务器: http://%SERVER_IP%:%WEB_PORT%
echo.

REM 扫描本地文件
echo 📂 扫描本地文件...

set FILE_COUNT=0
set TOTAL_SIZE=0

REM 创建临时文件列表（递归扫描所有文件夹）
set TEMP_LIST=%TEMP%\upload_files_%RANDOM%.txt
if exist "%TEMP_LIST%" del "%TEMP_LIST%"

REM 使用forfiles递归查找所有文件
forfiles /p "%SCRIPT_DIR%" /s /m *.* /c "cmd /c echo @path" 2>nul | findstr /v /i "%SCRIPT_NAME%" | findstr /v /i "upload.log" > "%TEMP_LIST%"

REM 计算文件数量和总大小
for /f "usebackq delims=" %%f in ("%TEMP_LIST%") do (
    set /a FILE_COUNT+=1
    for %%a in ("%%~f") do set /a TOTAL_SIZE+=%%~za
)

REM 格式化大小显示
set SIZE_STR=%TOTAL_SIZE%B
if %TOTAL_SIZE% gtr 1073741824 (
    set /a SIZE_GB=%TOTAL_SIZE%/1073741824
    set SIZE_STR=!SIZE_GB!GB
) else if %TOTAL_SIZE% gtr 1048576 (
    set /a SIZE_MB=%TOTAL_SIZE%/1048576
    set SIZE_STR=!SIZE_MB!MB
) else if %TOTAL_SIZE% gtr 1024 (
    set /a SIZE_KB=%TOTAL_SIZE%/1024
    set SIZE_STR=!SIZE_KB!KB
)

echo 📄 找到文件: %FILE_COUNT% 个
echo 📊 总大小: %SIZE_STR%

if %FILE_COUNT% equ 0 (
    echo ⚠️  当前目录没有可上传的文件
    pause
    exit /b 1
)

echo.

REM 显示文件列表（前5个）
echo 文件列表：
set SHOW_COUNT=0
for /f "usebackq delims=" %%f in ("%TEMP_LIST%") do (
    if !SHOW_COUNT! lss 5 (
        echo   📄 %%~nxf
        set /a SHOW_COUNT+=1
    )
)

if %FILE_COUNT% gtr 5 (
    set /a REMAINING=%FILE_COUNT%-5
    echo   ... 还有 !REMAINING! 个文件
)

echo.

REM 确认上传
echo ⚠️  准备上传当前目录的所有文件到数据管理平台
echo.
echo 确认信息：
echo   📁 本地目录: %SCRIPT_DIR%
echo   🌐 服务器: http://%SERVER_IP%:%WEB_PORT%
echo   📄 文件数量: %FILE_COUNT%
echo   📊 总大小: %SIZE_STR%
echo.

:confirm_loop
set /p CONFIRM=确认开始上传？(y/n): 
if /i "%CONFIRM%"=="y" goto :start_upload
if /i "%CONFIRM%"=="n" (
    echo 上传已取消
    if exist "%TEMP_LIST%" del "%TEMP_LIST%"
    exit /b 0
)
echo 请输入 y 或 n
goto :confirm_loop

:start_upload
echo.

REM 测试服务器连接
echo 🔗 测试服务器连接...

curl -s --connect-timeout 5 "http://%SERVER_IP%:%WEB_PORT%/api/health" 2>nul | findstr "healthy" >nul
if !errorlevel! equ 0 (
    echo ✅ 服务器连接正常
) else (
    echo ❌ 无法连接到服务器
    echo.
    echo 可能的原因：
    echo 1. 服务器IP地址错误
    echo 2. 网络连接问题
    echo 3. 服务器未启动
    echo.
    pause
    if exist "%TEMP_LIST%" del "%TEMP_LIST%"
    exit /b 1
)

echo.

REM 开始上传文件
echo 🚀 开始上传文件...
echo.

REM 记录开始时间
set START_TIME=%TIME%

REM 生成认证头
set AUTH_STRING=%UPLOAD_USER%:%UPLOAD_PASS%
for /f "delims=" %%i in ('powershell -command "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('%AUTH_STRING%'))"') do set AUTH_HEADER=%%i

set SUCCESS_COUNT=0
set FAILED_COUNT=0
set FAILED_FILES=

REM 不再生成时间戳文件夹，直接上传到根目录

REM 逐个上传文件
for /f "usebackq delims=" %%f in ("%TEMP_LIST%") do (
    REM 计算相对路径作为文件夹路径
    set "FULL_PATH=%%f"
    set "FULL_PATH=!FULL_PATH:"=!"
    call set "REL_PATH=%%FULL_PATH:%SCRIPT_DIR%=%%"
    for %%d in ("!REL_PATH!") do set "FOLDER_PATH=%%~dpd"
    if "!FOLDER_PATH!"=="\" (
        set "FOLDER_PATH=根目录"
    ) else (
        set "FOLDER_PATH=!FOLDER_PATH:~0,-1!"
        set "FOLDER_PATH=!FOLDER_PATH:\=/!"
    )
    
    REM 获取文件大小
    for %%a in ("%%f") do set "FILE_SIZE=%%~za"
    
    echo|set /p="📤 检查 %%~nxf (!FOLDER_PATH!) ... "
    
    REM 先检查文件是否已存在
    set "CHECK_JSON={\"fileName\":\"%%~nxf\",\"fileSize\":!FILE_SIZE!,\"folderPath\":\"!FOLDER_PATH!\"}"
    curl -s -X POST ^
        -H "X-Simple-Auth: %AUTH_HEADER%" ^
        -H "Content-Type: application/json" ^
        -d "!CHECK_JSON!" ^
        "http://%SERVER_IP%:%WEB_PORT%/api/check-file" 2>nul | findstr "exists.*true" >nul
    
    if !errorlevel! equ 0 (
        echo ⏭️ 已存在，跳过
        set /a SUCCESS_COUNT+=1
    ) else (
        echo|set /p="上传中 ... "
        
        REM 使用curl上传文件，保持文件夹结构
        curl -s -X POST ^
            -H "X-Simple-Auth: %AUTH_HEADER%" ^
            -F "file=@%%f" ^
            -F "folderPath=!FOLDER_PATH!" ^
            "http://%SERVER_IP%:%WEB_PORT%/api/upload" 2>nul | findstr "success.*true" >nul
        
        if !errorlevel! equ 0 (
            echo ✅
            set /a SUCCESS_COUNT+=1
        ) else (
            echo ❌
            set /a FAILED_COUNT+=1
            if "!FAILED_FILES!"=="" (
                set FAILED_FILES=%%~nxf
            ) else (
                set FAILED_FILES=!FAILED_FILES!, %%~nxf
            )
        )
    )
)

REM 记录结束时间
set END_TIME=%TIME%

echo.
echo ================================================

if %FAILED_COUNT% equ 0 (
    echo 🎉 所有文件上传成功！
) else (
    echo ⚠️  部分文件上传失败
)

echo.
echo 📊 上传统计：
echo   ✅ 成功: %SUCCESS_COUNT% 个文件
echo   ❌ 失败: %FAILED_COUNT% 个文件
echo   📁 本地目录: %SCRIPT_DIR%
echo   🌐 服务器: http://%SERVER_IP%:%WEB_PORT%

if %FAILED_COUNT% gtr 0 (
    echo.
    echo 失败的文件: %FAILED_FILES%
)

echo.
echo 💡 提示：
echo   - 可以在浏览器中访问 http://%SERVER_IP%:%WEB_PORT% 查看上传的文件
echo   - 如需重新上传失败的文件，请再次运行此脚本

REM 记录上传信息到日志文件
echo ======================================== >> "%SCRIPT_DIR%upload.log"
echo 上传记录 - %DATE% %TIME% >> "%SCRIPT_DIR%upload.log"
echo ======================================== >> "%SCRIPT_DIR%upload.log"
echo 本地目录: %SCRIPT_DIR% >> "%SCRIPT_DIR%upload.log"
echo 服务器: http://%SERVER_IP%:%WEB_PORT% >> "%SCRIPT_DIR%upload.log"
echo 成功文件: %SUCCESS_COUNT% >> "%SCRIPT_DIR%upload.log"
echo 失败文件: %FAILED_COUNT% >> "%SCRIPT_DIR%upload.log"
if %FAILED_COUNT% gtr 0 echo 失败列表: %FAILED_FILES% >> "%SCRIPT_DIR%upload.log"
echo. >> "%SCRIPT_DIR%upload.log"

echo ================================================
echo.

REM 清理临时文件
if exist "%TEMP_LIST%" del "%TEMP_LIST%"

pause

if %FAILED_COUNT% equ 0 (
    exit /b 0
) else (
    exit /b 1
)