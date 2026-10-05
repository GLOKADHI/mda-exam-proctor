# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[('index.html', '.'), ('style.css', '.'), ('highlight.css', '.'), ('marked.min.js', '.'), ('highlight.min.js', '.'), ('config.js', '.'), ('leetcode.js', '.'), ('sql_catalog.js', '.'), ('api.js', '.'), ('proctor.js', '.'), ('quiz.js', '.'), ('chat.js', '.'), ('app.js', '.'), ('cookie.txt', '.'), ('custom_tests.json', '.'), ('test_records.json', '.'), ('mda_exam_logo.ico', '.'), ('mda_exam_logo.png', '.'), ('cookie-extension', 'cookie-extension')],
    hiddenimports=['webview.platforms.winforms', 'webview.platforms.edgechromium', 'clr', 'mysql.connector', 'mysql'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ProctorIQ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='mda_exam_logo.ico',
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ProctorIQ',
)
