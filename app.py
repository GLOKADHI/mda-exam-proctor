"""
app.py – Standalone Desktop Application for ProctorIQ
Runs a native desktop window (via pywebview + Edge WebView2)
Embedded with local proxy, in-built Python & SQLite compilers, fullscreen controls,
static asset server, and anti-AI process scanner.
"""

import sys
import os

# Safe UTF-8 logging that never crashes on Windows cp1252 windowed mode
try:
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
    if sys.stderr is not None:
        sys.stderr.reconfigure(encoding='utf-8', errors='ignore')
except Exception:
    pass

def log(msg):
    try:
        sys.stdout.write(str(msg) + '\n')
        sys.stdout.flush()
    except Exception:
        pass

import json
import socket
import threading
import subprocess
import shutil
import sqlite3
import ast
import tempfile
import time
import re
import hashlib
import urllib.request
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import requests
import psutil
# Enable full Edge WebView2 media capture (camera & microphone) without permission prompts
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    "--use-fake-ui-for-media-stream "
    "--autoplay-policy=no-user-gesture-required "
    "--unsafely-treat-insecure-origin-as-secure=http://localhost:3000,http://127.0.0.1:3000 "
    "--enable-features=MediaStream,ShapeDetection "
    "--enable-usermedia-screen-capturing "
    "--allow-file-access-from-files"
)
import webview
try:
    import webview.platforms.winforms as winforms_platform
    import Microsoft.Web.WebView2.Core as mwc
    if hasattr(winforms_platform, 'Chromium') and hasattr(winforms_platform.Chromium, 'EdgeChrome'):
        _orig_on_webview_ready = winforms_platform.Chromium.EdgeChrome.on_webview_ready
        def _patched_on_webview_ready(self, sender, args):
            _orig_on_webview_ready(self, sender, args)
            try:
                def _on_permission_requested(s, a):
                    try:
                        a.State = mwc.CoreWebView2PermissionState.Allow
                    except Exception:
                        pass
                sender.CoreWebView2.PermissionRequested += _on_permission_requested
                log("[MdaExamBrowser] Auto-granting media permissions hooked into CoreWebView2.")
            except Exception as ex:
                log(f"[MdaExamBrowser] Hooking PermissionRequested notice: {ex}")
        winforms_platform.Chromium.EdgeChrome.on_webview_ready = _patched_on_webview_ready
except Exception as e:
    winforms_platform = None
    log(f"[MdaExamBrowser] WinForms/WebView2 init notice: {e}")

# Global window holder accessible from HTTP handlers
ACTIVE_WINDOW_HOLDER = {'window': None, 'is_fullscreen': False}

def compare_output(actual_str, exp_str):
    actual = str(actual_str).strip().replace('\r\n', '\n')
    exp = str(exp_str).strip().replace('\r\n', '\n')
    if actual == exp:
        return True
    if actual.lower() == exp.lower():
        return True
    if actual.replace(' ', '') == exp.replace(' ', ''):
        return True
    try:
        if abs(float(actual) - float(exp)) < 1e-6:
            return True
    except Exception:
        pass
    try:
        if ast.literal_eval(actual) == ast.literal_eval(exp):
            return True
    except Exception:
        pass
    return False

def get_python_exe():
    if not getattr(sys, 'frozen', False):
        return sys.executable
    py = shutil.which('python') or shutil.which('python3')
    if py and os.path.exists(py) and 'ProctorIQ' not in py:
        return py
    for candidate in [
        r'C:\Program Files\Python314\python.exe',
        r'C:\Program Files\Python313\python.exe',
        r'C:\Program Files\Python312\python.exe',
        r'C:\Program Files\Python311\python.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python314\python.exe'),
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python313\python.exe'),
    ]:
        if os.path.exists(candidate):
            return candidate
    return 'python'

# ── Sandboxed Process Execution & Security Validation ────────────────────────
FORBIDDEN_PATTERNS = {
    'python': [
        (r'\bos\.system\s*\(', 'os.system() is prohibited in sandbox'),
        (r'\bos\.popen\s*\(', 'os.popen() is prohibited in sandbox'),
        (r'\bos\.fork\s*\(', 'os.fork() is prohibited in sandbox'),
        (r'\bos\.spawn', 'os.spawn* is prohibited in sandbox'),
        (r'\bsubprocess\b', 'subprocess module is prohibited in sandbox'),
        (r'\bshutil\.rmtree\b', 'Filesystem deletion is prohibited in sandbox'),
        (r'\bsocket\b', 'Network socket access is prohibited in sandbox'),
        (r'\burllib\.request\b', 'Network requests are prohibited in sandbox'),
        (r'\bhttp\.client\b', 'Network access is prohibited in sandbox'),
        (r'\bctypes\b', 'ctypes native memory access is prohibited in sandbox'),
    ],
    'cpp': [
        (r'\bsystem\s*\(', 'system() command execution is prohibited in sandbox'),
        (r'\bpopen\s*\(', 'popen() is prohibited in sandbox'),
        (r'\bfork\s*\(', 'fork() is prohibited in sandbox'),
        (r'\bCreateProcess', 'Process creation is prohibited in sandbox'),
        (r'<windows\.h>', 'windows.h system API is prohibited in sandbox'),
        (r'<sys/socket\.h>', 'Network sockets are prohibited in sandbox'),
    ],
    'c': [
        (r'\bsystem\s*\(', 'system() command execution is prohibited in sandbox'),
        (r'\bpopen\s*\(', 'popen() is prohibited in sandbox'),
        (r'\bfork\s*\(', 'fork() is prohibited in sandbox'),
        (r'\bCreateProcess', 'Process creation is prohibited in sandbox'),
        (r'<windows\.h>', 'windows.h system API is prohibited in sandbox'),
    ],
    'java': [
        (r'Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec', 'Runtime.exec() is prohibited in sandbox'),
        (r'\bProcessBuilder\b', 'ProcessBuilder is prohibited in sandbox'),
        (r'\bSystem\s*\.\s*exit\b', 'System.exit() is prohibited in sandbox'),
        (r'java\.net\.', 'Network access (java.net) is prohibited in sandbox'),
    ]
}

def validate_candidate_code(code_str, lang):
    if not code_str or not str(code_str).strip():
        return False, "Code editor is empty. Please write a solution before running."
    if len(code_str) > 100000:
        return False, "Code size exceeds maximum allowed limit (100 KB)."
    rules = FORBIDDEN_PATTERNS.get(lang, [])
    for pat, msg in rules:
        if re.search(pat, code_str):
            return False, f"Security Sandbox Violation: {msg}"
    return True, None

def _kill_process_tree(pid):
    """Forcefully terminate a process and all its child processes."""
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        for child in children:
            try:
                child.kill()
            except Exception:
                pass
        parent.kill()
        return
    except Exception:
        pass
    try:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)], capture_output=True, timeout=2)
        else:
            os.kill(pid, 9)
    except Exception:
        pass

def _run_sandboxed_process(cmd, input_data="", timeout=5.0, max_memory_mb=256, cwd=None):
    """
    Runs an external command in an isolated process with CPU wall-clock timeout,
    memory monitoring, and full child-process tree cleanup.
    Returns dict: { returncode, stdout, stderr, timed_out, memory_exceeded, elapsed_ms }
    """
    t0 = time.perf_counter()
    creationflags = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW on Windows
    env = os.environ.copy()
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    env['PYTHONIOENCODING'] = 'utf-8'

    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            cwd=cwd,
            env=env,
            creationflags=creationflags
        )
        mem_exceeded = [False]
        stop_monitor = threading.Event()

        def _memory_watchdog():
            try:
                p = psutil.Process(proc.pid)
                limit_bytes = max_memory_mb * 1024 * 1024
                while not stop_monitor.is_set():
                    if proc.poll() is not None:
                        break
                    try:
                        rss = p.memory_info().rss
                        for c in p.children(recursive=True):
                            try:
                                rss += c.memory_info().rss
                            except Exception:
                                pass
                        if rss > limit_bytes:
                            mem_exceeded[0] = True
                            _kill_process_tree(proc.pid)
                            break
                    except Exception:
                        break
                    stop_monitor.wait(0.05)
            except Exception:
                pass

        watchdog = threading.Thread(target=_memory_watchdog, daemon=True)
        watchdog.start()

        try:
            stdout_str, stderr_str = proc.communicate(input=input_data, timeout=timeout)
            stop_monitor.set()
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
            if mem_exceeded[0]:
                return {
                    'returncode': -1,
                    'stdout': stdout_str or '',
                    'stderr': f'Memory Limit Exceeded (>{max_memory_mb} MB)',
                    'timed_out': False,
                    'memory_exceeded': True,
                    'elapsed_ms': elapsed_ms
                }
            return {
                'returncode': proc.returncode,
                'stdout': stdout_str or '',
                'stderr': stderr_str or '',
                'timed_out': False,
                'memory_exceeded': False,
                'elapsed_ms': elapsed_ms
            }
        except subprocess.TimeoutExpired:
            stop_monitor.set()
            _kill_process_tree(proc.pid)
            try:
                proc.communicate(timeout=0.5)
            except Exception:
                pass
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
            return {
                'returncode': -1,
                'stdout': '',
                'stderr': f'Time Limit Exceeded (>{timeout}s)',
                'timed_out': True,
                'memory_exceeded': False,
                'elapsed_ms': elapsed_ms
            }
    except Exception as e:
        if proc and proc.pid:
            _kill_process_tree(proc.pid)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            'returncode': -1,
            'stdout': '',
            'stderr': str(e),
            'timed_out': False,
            'memory_exceeded': False,
            'elapsed_ms': elapsed_ms
        }

def _normalize_tc_input(inp):
    """Normalize literal escaped \\n into actual newline characters for stdin."""
    if inp is None:
        return ""
    s = str(inp).replace('\r\n', '\n')
    if '\\n' in s:
        s = s.replace('\\n', '\n')
    return s.strip()

# ── In-built Code Compilers & Runners (Python, Java, C++, C, SQL) ────────────
def run_python(code_str, testcases, timeout=5):
    """
    Executes Python code against testcases in an isolated sandboxed subprocess.
    Supports:
    - class Solution methods
    - top-level functions (def ...)
    - standalone stdin/stdout scripts (input() / sys.stdin.read() + print())
    - syntax validation, runtime error capture, CPU timeout, memory limit.
    """
    valid, err_reason = validate_candidate_code(code_str, 'python')
    if not valid:
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": err_reason,
            "compile_time_ms": 0,
            "execution_time_ms": 0,
            "results": []
        }

    # Fast syntax check before spawning process
    t_comp0 = time.perf_counter()
    try:
        compile(code_str, '<solution.py>', 'exec')
    except SyntaxError as se:
        comp_ms = round((time.perf_counter() - t_comp0) * 1000, 2)
        tb_str = f"Line {se.lineno}: {se.msg}\n  {se.text or ''}"
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": f"SyntaxError: {se.msg} (line {se.lineno})",
            "stderr": tb_str,
            "traceback": tb_str,
            "compile_time_ms": comp_ms,
            "execution_time_ms": 0,
            "results": []
        }
    comp_ms = round((time.perf_counter() - t_comp0) * 1000, 2)

    harness_script = r'''import sys, json, io, traceback, ast, inspect, copy, time

START_SENTINEL = "__PROCTORIQ_JSON_START__"
END_SENTINEL   = "__PROCTORIQ_JSON_END__"

try:
    raw_payload = sys.stdin.read()
    payload = json.loads(raw_payload)
except Exception as e:
    sys.__stdout__.write(f"{START_SENTINEL}\n" + json.dumps({"success": False, "status": "RUNTIME_ERROR", "error": f"Payload parse error: {e}", "results": []}) + f"\n{END_SENTINEL}\n")
    sys.exit(0)

user_code = payload.get("code", "")
testcases = payload.get("testcases", [])

def make_base_ns():
    ns = {'List': list, 'Dict': dict, 'Set': set, 'Tuple': tuple, 'Optional': None}
    try:
        from typing import List, Dict, Set, Tuple, Optional, Any, Union, Callable, Iterable
        ns.update({
            'List': List, 'Dict': Dict, 'Set': Set, 'Tuple': Tuple,
            'Optional': Optional, 'Any': Any, 'Union': Union,
            'Callable': Callable, 'Iterable': Iterable
        })
    except Exception:
        pass
    return ns

ns = make_base_ns()
stdout_capture = io.StringIO()
old_stdout = sys.stdout
old_stdin = sys.stdin
sys.stdout = stdout_capture
first_tc_inp = str(testcases[0].get("input", "")).replace("\\n", "\n") if testcases else ""
sys.stdin = io.StringIO(first_tc_inp + "\n")

top_level_eof_or_script = False
try:
    exec(user_code, ns)
except EOFError:
    top_level_eof_or_script = True
except Exception as e:
    sys.stdout = old_stdout
    sys.stdin = old_stdin
    err_msg = f"Runtime Error: {e}"
    res_obj = {
        "success": False,
        "status": "RUNTIME_ERROR",
        "error": err_msg,
        "stderr": traceback.format_exc(),
        "traceback": traceback.format_exc(),
        "results": []
    }
    sys.__stdout__.write(f"{START_SENTINEL}\n" + json.dumps(res_obj) + f"\n{END_SENTINEL}\n")
    sys.exit(0)

# Locate candidate solution entry function (class Solution method or free function)
entry_func = None
if not top_level_eof_or_script and 'Solution' in ns and isinstance(ns['Solution'], type):
    try:
        inst = ns['Solution']()
        methods = [getattr(inst, m) for m in dir(inst) if not m.startswith('_') and callable(getattr(inst, m))]
        if methods:
            entry_func = methods[0]
    except Exception:
        pass

if not entry_func and not top_level_eof_or_script:
    for k, v in ns.items():
        if k.startswith('_') or k in ('List', 'Dict', 'Set', 'Tuple', 'Optional', 'Any', 'Union', 'Callable', 'Iterable'):
            continue
        if isinstance(v, type) and getattr(v, '__module__', '') in ('__main__', 'builtins', ''):
            try:
                inst = v()
                methods = [getattr(inst, m) for m in dir(inst) if not m.startswith('_') and callable(getattr(inst, m))]
                if methods:
                    entry_func = methods[0]
                    break
            except Exception:
                pass

if not entry_func and not top_level_eof_or_script:
    for k, v in ns.items():
        if k.startswith('_') or k in ('List', 'Dict', 'Set', 'Tuple', 'Optional', 'Any', 'Union', 'Callable', 'Iterable'):
            continue
        if inspect.isfunction(v) and getattr(v, '__module__', '') in ('__main__', None, ''):
            entry_func = v
            break

def compare_output(actual_str, exp_str):
    actual = str(actual_str).strip().replace('\r\n', '\n')
    exp = str(exp_str).strip().replace('\r\n', '\n')
    if actual == exp or actual.lower() == exp.lower():
        return True
    if actual.replace(' ', '') == exp.replace(' ', ''):
        return True
    try:
        if abs(float(actual) - float(exp)) < 1e-6:
            return True
    except Exception:
        pass
    try:
        if ast.literal_eval(actual) == ast.literal_eval(exp):
            return True
    except Exception:
        pass
    return False

def parse_input_to_args(inp, entry_func=None):
    raw_str = str(inp).replace('\r\n', '\n').replace('\\n', '\n').strip()
    if not raw_str:
        return []

    param_names = []
    if entry_func and callable(entry_func):
        try:
            sig = inspect.signature(entry_func)
            param_names = [p.name for p in sig.parameters.values() if p.name not in ('self', 'cls')]
        except Exception:
            pass

    norm = raw_str.replace('true', 'True').replace('false', 'False').replace('null', 'None')

    for attempt in [norm, norm.replace('\n', ', '), ', '.join([line for line in norm.splitlines() if line.strip()])]:
        try:
            parsed = ast.parse(f'_f({attempt})', mode='eval')
            if isinstance(parsed.body, ast.Call):
                args = [ast.literal_eval(a) for a in parsed.body.args]
                kwargs = {kw.arg: ast.literal_eval(kw.value) for kw in parsed.body.keywords}
                if kwargs:
                    if param_names:
                        ordered = [kwargs[name] for name in param_names if name in kwargs]
                        if len(ordered) == len(kwargs):
                            return args + ordered
                    return args + list(kwargs.values())
                if args:
                    return args
        except Exception:
            pass

    lines = [l.strip() for l in raw_str.splitlines() if l.strip()]
    if lines:
        if len(lines) >= 2 and lines[0].lstrip('-').isdigit():
            toks = []
            for t in lines[1].split():
                try: toks.append(ast.literal_eval(t))
                except Exception: toks.append(t)
            if len(param_names) == 1:
                return [toks]
            if len(param_names) == 2 and len(lines) >= 3:
                try: second = ast.literal_eval(lines[2])
                except Exception: second = lines[2]
                return [toks, second]

        eval_lines = []
        for l in lines:
            try: eval_lines.append(ast.literal_eval(l))
            except Exception: eval_lines.append(l)
        if len(eval_lines) == len(param_names) or not param_names:
            return eval_lines

    return [raw_str]

results = []
passed = 0
any_runtime_error = False
last_stderr = ""

for i, tc in enumerate(testcases):
    tc_id = tc.get("id", i + 1)
    inp = str(tc.get("input", "")).replace("\\n", "\n")
    exp = str(tc.get("expected", "")).strip()
    hidden = tc.get("hidden", False)
    tc_t0 = time.perf_counter()

    try:
        if entry_func:
            tc_stdout = io.StringIO()
            sys.stdout = tc_stdout
            sys.stdin = io.StringIO(inp + "\n")
            args = parse_input_to_args(inp, entry_func)
            orig_args = copy.deepcopy(args)
            res = entry_func(*args)
            printed = tc_stdout.getvalue().strip()
            stdout_capture.write(tc_stdout.getvalue())
            if res is None and orig_args and args != orig_args:
                res_str = str(args[0]).strip()
            elif res is None and printed:
                res_str = printed
            else:
                res_str = str(res).strip()
        else:
            # Standalone stdin/stdout script mode
            script_ns = make_base_ns()
            script_ns['__name__'] = '__main__'
            tc_stdout = io.StringIO()
            sys.stdout = tc_stdout
            sys.stdin = io.StringIO(inp + "\n")
            exec(user_code, script_ns)
            res_str = tc_stdout.getvalue().strip()
            stdout_capture.write(tc_stdout.getvalue())

        tc_ms = round((time.perf_counter() - tc_t0) * 1000, 2)
        match = compare_output(res_str, exp) if exp != "" else True
        if match:
            passed += 1
        results.append({
            "id": tc_id,
            "passed": match,
            "input": inp,
            "expected": exp,
            "actual": res_str,
            "execution_time_ms": tc_ms,
            "hidden": hidden
        })
    except Exception as err:
        any_runtime_error = True
        last_stderr = traceback.format_exc()
        tc_ms = round((time.perf_counter() - tc_t0) * 1000, 2)
        results.append({
            "id": tc_id,
            "passed": False,
            "input": inp,
            "expected": exp,
            "actual": f"Runtime Error: {err}",
            "error": str(err),
            "execution_time_ms": tc_ms,
            "hidden": hidden
        })

sys.stdout = old_stdout
sys.stdin = old_stdin
user_stdout = stdout_capture.getvalue()

all_passed = (passed == len(testcases)) and len(testcases) > 0
status = "ACCEPTED" if all_passed else ("RUNTIME_ERROR" if any_runtime_error and passed == 0 else "WRONG_ANSWER")

final_obj = {
    "success": True,
    "status": status,
    "passedCount": passed,
    "totalCount": len(testcases),
    "allPassed": all_passed,
    "stdout": user_stdout,
    "stderr": last_stderr,
    "results": results
}
sys.__stdout__.write(f"\n{START_SENTINEL}\n" + json.dumps(final_obj) + f"\n{END_SENTINEL}\n")
'''

    payload_json = json.dumps({"code": code_str, "testcases": testcases})
    run_res = _run_sandboxed_process(
        [get_python_exe(), '-I', '-c', harness_script],
        input_data=payload_json,
        timeout=timeout,
        max_memory_mb=256
    )

    if run_res['timed_out']:
        return {
            "success": False,
            "status": "TIME_LIMIT_EXCEEDED",
            "error": f"Time Limit Exceeded (>{timeout}s). Check for infinite loops.",
            "stdout": run_res['stdout'],
            "stderr": run_res['stderr'],
            "compile_time_ms": comp_ms,
            "execution_time_ms": run_res['elapsed_ms'],
            "results": []
        }
    if run_res['memory_exceeded']:
        return {
            "success": False,
            "status": "MEMORY_LIMIT_EXCEEDED",
            "error": run_res['stderr'],
            "stdout": run_res['stdout'],
            "stderr": run_res['stderr'],
            "compile_time_ms": comp_ms,
            "execution_time_ms": run_res['elapsed_ms'],
            "results": []
        }

    out = run_res['stdout'] or ""
    START_SENTINEL = "__PROCTORIQ_JSON_START__"
    END_SENTINEL = "__PROCTORIQ_JSON_END__"
    if START_SENTINEL in out and END_SENTINEL in out:
        json_text = out.split(START_SENTINEL)[1].split(END_SENTINEL)[0].strip()
        parsed = json.loads(json_text)
        parsed['compile_time_ms'] = comp_ms
        parsed['execution_time_ms'] = run_res['elapsed_ms']
        return parsed
    elif out.strip():
        try:
            parsed = json.loads(out.strip())
            parsed['compile_time_ms'] = comp_ms
            parsed['execution_time_ms'] = run_res['elapsed_ms']
            return parsed
        except Exception:
            pass
    return {
        "success": False,
        "status": "RUNTIME_ERROR",
        "error": run_res['stderr'] or run_res['stdout'] or "Execution failed",
        "stderr": run_res['stderr'],
        "compile_time_ms": comp_ms,
        "execution_time_ms": run_res['elapsed_ms'],
        "results": []
    }


def _get_native_host_exe():
    """
    Returns path to the cached native C/C++ DLL runner host executable.
    Using a cached runner .exe + per-submission .dll avoids Windows Defender's
    26-second cloud scan delay on newly generated .exe files while preserving
    full subprocess isolation, timeout, and memory limits.
    """
    build_dir = os.path.join(r'C:\Users\lokad\Music\quiz', '.sandbox_build')
    os.makedirs(build_dir, exist_ok=True)
    host_exe = os.path.join(build_dir, 'piq_native_host.exe')
    if os.path.exists(host_exe):
        return host_exe
    host_c_src = os.path.join(build_dir, 'host.c')
    host_c_code = r"""#include <windows.h>
#include <stdio.h>
typedef int (*main_fn)();
int main(int argc, char** argv) {
    if (argc < 2) return 1;
    HMODULE h = LoadLibraryA(argv[1]);
    if (!h) { fprintf(stderr, "Failed to load compiled module\n"); return 2; }
    main_fn fn = (main_fn)GetProcAddress(h, "candidate_main");
    if (!fn) fn = (main_fn)GetProcAddress(h, "main");
    if (!fn) { fprintf(stderr, "Entry point main() not found\n"); return 3; }
    int ret = fn();
    fflush(stdout);
    fflush(stderr);
    return ret;
}
"""
    try:
        with open(host_c_src, 'w', encoding='utf-8') as f:
            f.write(host_c_code)
        subprocess.run(['gcc', '-O2', host_c_src, '-o', host_exe], capture_output=True, timeout=10)
        if os.path.exists(host_exe):
            return host_exe
    except Exception:
        pass
    return None

def _prepare_dll_source(code_str, is_cpp=False):
    """Exports main as candidate_main so piq_native_host.exe can invoke it cleanly."""
    export_prefix = 'extern "C" __declspec(dllexport) int candidate_main(' if is_cpp else '__declspec(dllexport) int candidate_main('
    return re.sub(r'\bint\s+main\s*\(', export_prefix, code_str, count=1)

def run_cpp(code_str, testcases, timeout=5):
    """
    Compiles and executes C++ code with g++ in an isolated sandboxed directory.
    """
    valid, err_reason = validate_candidate_code(code_str, 'cpp')
    if not valid:
        return {"success": False, "status": "COMPILE_ERROR", "error": err_reason, "compile_time_ms": 0, "execution_time_ms": 0, "results": []}

    if not re.search(r'\bmain\s*\(', code_str):
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": "Missing main() function: In C++, please include int main() to read test input and print output.",
            "compile_time_ms": 0,
            "execution_time_ms": 0,
            "results": []
        }

    host_exe = _get_native_host_exe()
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'solution.cpp')
        if host_exe:
            bin_target = os.path.join(td, 'solution.dll')
            with open(src, 'w', encoding='utf-8') as f:
                f.write(_prepare_dll_source(code_str, is_cpp=True))
            comp_cmd = ['g++', '-shared', '-O0', '-std=c++14', src, '-o', bin_target]
        else:
            bin_target = os.path.join(td, 'solution.exe')
            with open(src, 'w', encoding='utf-8') as f:
                f.write(code_str)
            comp_cmd = ['g++', '-O0', '-std=c++14', src, '-o', bin_target]

        comp = _run_sandboxed_process(comp_cmd, timeout=10, max_memory_mb=512, cwd=td)
        comp_ms = comp['elapsed_ms']
        if comp['timed_out']:
            return {"success": False, "status": "COMPILE_ERROR", "error": "C++ Compilation Timed Out (>10s).", "compile_time_ms": comp_ms, "execution_time_ms": 0, "results": []}
        if comp['returncode'] != 0:
            return {
                "success": False,
                "status": "COMPILE_ERROR",
                "error": f"Compilation Error (g++):\n{comp['stderr']}",
                "stderr": comp['stderr'],
                "compile_time_ms": comp_ms,
                "execution_time_ms": 0,
                "results": []
            }

        abs_bin = os.path.abspath(bin_target)
        exec_cmd = [host_exe, abs_bin] if host_exe else [abs_bin]
        results = []
        passed = 0
        total_exec_ms = 0.0
        any_tle = False
        any_re = False
        combined_stdout = []
        combined_stderr = []

        for i, tc in enumerate(testcases):
            tc_id = tc.get("id", i + 1)
            inp = _normalize_tc_input(tc.get("input", ""))
            exp = str(tc.get("expected", "")).strip()
            hidden = tc.get("hidden", False)

            run = _run_sandboxed_process(exec_cmd, input_data=inp + '\n', timeout=timeout, max_memory_mb=256, cwd=td)
            total_exec_ms += run['elapsed_ms']

            if run['timed_out']:
                any_tle = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Time Limit Exceeded (>{timeout}s)",
                    "error": f"Time Limit Exceeded (>{timeout}s)",
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['memory_exceeded']:
                any_re = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": run['stderr'], "error": run['stderr'],
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['returncode'] != 0:
                any_re = True
                err_detail = (run['stderr'] or f"Process exited with code {run['returncode']}").strip()
                combined_stderr.append(err_detail)
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Runtime Error: {err_detail}", "error": err_detail,
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
            else:
                out = run['stdout'].strip()
                if out:
                    combined_stdout.append(out)
                match = compare_output(out, exp) if exp != "" else True
                if match:
                    passed += 1
                results.append({
                    "id": tc_id, "passed": match, "input": inp, "expected": exp,
                    "actual": out, "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })

        all_passed = (passed == len(testcases)) and len(testcases) > 0
        if any_tle:
            status = "TIME_LIMIT_EXCEEDED"
        elif any_re and passed == 0:
            status = "RUNTIME_ERROR"
        elif all_passed:
            status = "ACCEPTED"
        else:
            status = "WRONG_ANSWER"

        return {
            "success": not any_tle,
            "status": status,
            "error": f"Time Limit Exceeded (>{timeout}s)" if any_tle else ("\n".join(combined_stderr) if any_re and passed == 0 else None),
            "passedCount": passed,
            "totalCount": len(testcases),
            "allPassed": all_passed,
            "stdout": "\n".join(combined_stdout[:4]),
            "stderr": "\n".join(combined_stderr[:4]),
            "compile_time_ms": comp_ms,
            "execution_time_ms": round(total_exec_ms, 2),
            "results": results
        }


def run_c(code_str, testcases, timeout=5):
    """
    Compiles and executes C code with gcc in an isolated sandboxed directory.
    """
    valid, err_reason = validate_candidate_code(code_str, 'c')
    if not valid:
        return {"success": False, "status": "COMPILE_ERROR", "error": err_reason, "compile_time_ms": 0, "execution_time_ms": 0, "results": []}

    if not re.search(r'\bmain\s*\(', code_str):
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": "Missing main() function: In C, please include int main() to read test input and print output.",
            "compile_time_ms": 0,
            "execution_time_ms": 0,
            "results": []
        }

    host_exe = _get_native_host_exe()
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'solution.c')
        if host_exe:
            bin_target = os.path.join(td, 'solution.dll')
            with open(src, 'w', encoding='utf-8') as f:
                f.write(_prepare_dll_source(code_str, is_cpp=False))
            comp_cmd = ['gcc', '-shared', '-O0', src, '-o', bin_target]
        else:
            bin_target = os.path.join(td, 'solution.exe')
            with open(src, 'w', encoding='utf-8') as f:
                f.write(code_str)
            comp_cmd = ['gcc', '-O0', src, '-o', bin_target]

        comp = _run_sandboxed_process(comp_cmd, timeout=10, max_memory_mb=512, cwd=td)
        comp_ms = comp['elapsed_ms']
        if comp['timed_out']:
            return {"success": False, "status": "COMPILE_ERROR", "error": "C Compilation Timed Out (>10s).", "compile_time_ms": comp_ms, "execution_time_ms": 0, "results": []}
        if comp['returncode'] != 0:
            return {
                "success": False,
                "status": "COMPILE_ERROR",
                "error": f"Compilation Error (gcc):\n{comp['stderr']}",
                "stderr": comp['stderr'],
                "compile_time_ms": comp_ms,
                "execution_time_ms": 0,
                "results": []
            }

        abs_bin = os.path.abspath(bin_target)
        exec_cmd = [host_exe, abs_bin] if host_exe else [abs_bin]
        results = []
        passed = 0
        total_exec_ms = 0.0
        any_tle = False
        any_re = False
        combined_stdout = []
        combined_stderr = []

        for i, tc in enumerate(testcases):
            tc_id = tc.get("id", i + 1)
            inp = _normalize_tc_input(tc.get("input", ""))
            exp = str(tc.get("expected", "")).strip()
            hidden = tc.get("hidden", False)

            run = _run_sandboxed_process(exec_cmd, input_data=inp + '\n', timeout=timeout, max_memory_mb=256, cwd=td)
            total_exec_ms += run['elapsed_ms']

            if run['timed_out']:
                any_tle = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Time Limit Exceeded (>{timeout}s)",
                    "error": f"Time Limit Exceeded (>{timeout}s)",
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['memory_exceeded']:
                any_re = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": run['stderr'], "error": run['stderr'],
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['returncode'] != 0:
                any_re = True
                err_detail = (run['stderr'] or f"Process exited with code {run['returncode']}").strip()
                combined_stderr.append(err_detail)
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Runtime Error: {err_detail}", "error": err_detail,
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
            else:
                out = run['stdout'].strip()
                if out:
                    combined_stdout.append(out)
                match = compare_output(out, exp) if exp != "" else True
                if match:
                    passed += 1
                results.append({
                    "id": tc_id, "passed": match, "input": inp, "expected": exp,
                    "actual": out, "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })

        all_passed = (passed == len(testcases)) and len(testcases) > 0
        if any_tle:
            status = "TIME_LIMIT_EXCEEDED"
        elif any_re and passed == 0:
            status = "RUNTIME_ERROR"
        elif all_passed:
            status = "ACCEPTED"
        else:
            status = "WRONG_ANSWER"

        return {
            "success": not any_tle,
            "status": status,
            "error": f"Time Limit Exceeded (>{timeout}s)" if any_tle else ("\n".join(combined_stderr) if any_re and passed == 0 else None),
            "passedCount": passed,
            "totalCount": len(testcases),
            "allPassed": all_passed,
            "stdout": "\n".join(combined_stdout[:4]),
            "stderr": "\n".join(combined_stderr[:4]),
            "compile_time_ms": comp_ms,
            "execution_time_ms": round(total_exec_ms, 2),
            "results": results
        }


def run_java(code_str, testcases, timeout=5):
    """
    Compiles and executes Java code with javac and java in an isolated sandboxed directory.
    Safely handles arbitrary public/non-public class names and locates the entry-point main() class.
    """
    valid, err_reason = validate_candidate_code(code_str, 'java')
    if not valid:
        return {"success": False, "status": "COMPILE_ERROR", "error": err_reason, "compile_time_ms": 0, "execution_time_ms": 0, "results": []}

    # Strip comments only for class/main discovery so commented-out classes don't confuse parser
    code_no_comments = re.sub(r'//.*?$|/\*[\s\S]*?\*/', '', code_str, flags=re.MULTILINE)

    pub_match = re.search(r'\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)', code_no_comments)
    all_classes = re.findall(r'\bclass\s+([A-Za-z_][A-Za-z0-9_]*)', code_no_comments)

    if not all_classes:
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": "No Java class declaration found. Please define a class (e.g. public class Solution).",
            "compile_time_ms": 0,
            "execution_time_ms": 0,
            "results": []
        }

    file_class_name = pub_match.group(1) if pub_match else all_classes[0]

    # Determine which class contains `public static void main`
    main_class_name = None
    has_main = bool(re.search(r'\bstatic\s+void\s+main\s*\(\s*String', code_no_comments))
    if has_main:
        # Find the class declaration immediately preceding `static void main`
        main_pos = re.search(r'\bstatic\s+void\s+main\s*\(\s*String', code_no_comments).start()
        preceding_classes = list(re.finditer(r'\bclass\s+([A-Za-z_][A-Za-z0-9_]*)', code_no_comments[:main_pos]))
        if preceding_classes:
            main_class_name = preceding_classes[-1].group(1)
        else:
            main_class_name = file_class_name
    else:
        return {
            "success": False,
            "status": "COMPILE_ERROR",
            "error": f"Entry point not found: class '{file_class_name}' does not define 'public static void main(String[] args)'. Please include a main method to read input and print output.",
            "compile_time_ms": 0,
            "execution_time_ms": 0,
            "results": []
        }

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, f'{file_class_name}.java')
        with open(src, 'w', encoding='utf-8') as f:
            f.write(code_str)

        comp = _run_sandboxed_process(['javac', '-encoding', 'UTF-8', src], timeout=12, max_memory_mb=512, cwd=td)
        comp_ms = comp['elapsed_ms']
        if comp['timed_out']:
            return {"success": False, "status": "COMPILE_ERROR", "error": "Java Compilation Timed Out (>12s).", "compile_time_ms": comp_ms, "execution_time_ms": 0, "results": []}
        if comp['returncode'] != 0:
            return {
                "success": False,
                "status": "COMPILE_ERROR",
                "error": f"Compilation Error (javac):\n{comp['stderr']}",
                "stderr": comp['stderr'],
                "compile_time_ms": comp_ms,
                "execution_time_ms": 0,
                "results": []
            }

        results = []
        passed = 0
        total_exec_ms = 0.0
        any_tle = False
        any_re = False
        combined_stdout = []
        combined_stderr = []

        for i, tc in enumerate(testcases):
            tc_id = tc.get("id", i + 1)
            inp = _normalize_tc_input(tc.get("input", ""))
            exp = str(tc.get("expected", "")).strip()
            hidden = tc.get("hidden", False)

            run = _run_sandboxed_process(
                ['java', '-Xmx256m', '-Xss64m', '-cp', td, main_class_name],
                input_data=inp + '\n',
                timeout=timeout,
                max_memory_mb=384,
                cwd=td
            )
            total_exec_ms += run['elapsed_ms']

            if run['timed_out']:
                any_tle = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Time Limit Exceeded (>{timeout}s)",
                    "error": f"Time Limit Exceeded (>{timeout}s)",
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['memory_exceeded']:
                any_re = True
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": run['stderr'], "error": run['stderr'],
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
                break
            elif run['returncode'] != 0:
                any_re = True
                err_detail = (run['stderr'] or f"JVM exited with code {run['returncode']}").strip()
                combined_stderr.append(err_detail)
                results.append({
                    "id": tc_id, "passed": False, "input": inp, "expected": exp,
                    "actual": f"Runtime Error: {err_detail}", "error": err_detail,
                    "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })
            else:
                out = run['stdout'].strip()
                if out:
                    combined_stdout.append(out)
                match = compare_output(out, exp) if exp != "" else True
                if match:
                    passed += 1
                results.append({
                    "id": tc_id, "passed": match, "input": inp, "expected": exp,
                    "actual": out, "execution_time_ms": run['elapsed_ms'], "hidden": hidden
                })

        all_passed = (passed == len(testcases)) and len(testcases) > 0
        if any_tle:
            status = "TIME_LIMIT_EXCEEDED"
        elif any_re and passed == 0:
            status = "RUNTIME_ERROR"
        elif all_passed:
            status = "ACCEPTED"
        else:
            status = "WRONG_ANSWER"

        return {
            "success": not any_tle,
            "status": status,
            "error": f"Time Limit Exceeded (>{timeout}s)" if any_tle else ("\n".join(combined_stderr) if any_re and passed == 0 else None),
            "passedCount": passed,
            "totalCount": len(testcases),
            "allPassed": all_passed,
            "stdout": "\n".join(combined_stdout[:4]),
            "stderr": "\n".join(combined_stderr[:4]),
            "compile_time_ms": comp_ms,
            "execution_time_ms": round(total_exec_ms, 2),
            "results": results
        }


def get_mysql_config():
    """Load MySQL connection config from settings.json."""
    try:
        s = load_app_settings()
    except Exception:
        s = {}
    mysql_cfg = s.get('mysqlConfig', {})
    return {
        'host': mysql_cfg.get('host', 'localhost'),
        'user': mysql_cfg.get('user', 'root'),
        'password': mysql_cfg.get('password', 'Gg@2591281'),
        'port': int(mysql_cfg.get('port', 3306)),
        'autocommit': True
    }

def _match_sql_rows(clean_rows, exp):
    if not exp:
        return True
    if isinstance(exp, list):
        if len(exp) == 0:
            return True
        exp_norm = [[str(c).strip() for c in r] if isinstance(r, (list, tuple)) else [str(r).strip()] for r in exp]
        clean_norm = [[str(c).strip() for c in r] for r in clean_rows]
        return clean_norm == exp_norm
    if isinstance(exp, str):
        exp_str = exp.strip()
        if not exp_str:
            return True
        pipe_actual = "\n".join(" | ".join(str(c).strip() for c in r) for r in clean_rows).strip()
        space_actual = "\n".join(" ".join(str(c).strip() for c in r) for r in clean_rows).strip()
        csv_actual = "\n".join(",".join(str(c).strip() for c in r) for r in clean_rows).strip()
        return exp_str in (pipe_actual, space_actual, csv_actual) or compare_output(pipe_actual, exp_str)
    return True

def _run_sql_mysql_tc(query_str, schema_str, setup_sql, tc_id, exp, hidden):
    """Execute one testcase on real MySQL with an isolated per-test database."""
    try:
        import mysql.connector
        cfg = get_mysql_config()
        db_name = f"piq_tc_{tc_id}_{abs(hash(query_str)) % 99999}"

        conn = mysql.connector.connect(**cfg)
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
        cursor.execute(f"USE `{db_name}`")

        def exec_block(sql_block):
            if not sql_block or not sql_block.strip():
                return
            stmts = [s.strip() for s in sql_block.strip().split(';') if s.strip()]
            for stmt in stmts:
                try:
                    cursor.execute(stmt)
                    cursor.fetchall()
                except Exception as e:
                    log(f"[MySQL] stmt warn: {e}")

        exec_block(schema_str)
        exec_block(setup_sql)

        cursor.execute(query_str)
        cols = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        clean_rows = [[str(col) if col is not None else "NULL" for col in row] for row in rows]

        try:
            cursor.execute(f"DROP DATABASE IF EXISTS `{db_name}`")
        except Exception:
            pass
        cursor.close()
        conn.close()

        match = _match_sql_rows(clean_rows, exp)

        return {
            "id": tc_id, "passed": match, "columns": cols,
            "expected": exp, "actual": clean_rows, "hidden": hidden,
            "engine": "MySQL 8.0"
        }
    except Exception as err:
        log(f"[MySQL] error tc {tc_id}: {err}")
        return None

def _run_sql_sqlite_tc(query_str, schema_str, setup_sql, tc_id, exp, hidden):
    """Execute one testcase on in-memory SQLite."""
    try:
        conn = sqlite3.connect(':memory:')
        cursor = conn.cursor()
        if schema_str:
            cursor.executescript(schema_str)
        if setup_sql:
            cursor.executescript(setup_sql)
        cursor.execute(query_str)
        cols = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        clean_rows = [[str(col) if col is not None else "NULL" for col in row] for row in rows]

        match = _match_sql_rows(clean_rows, exp)

        conn.close()
        return {
            "id": tc_id, "passed": match, "columns": cols,
            "expected": exp, "actual": clean_rows, "hidden": hidden,
            "engine": "SQLite (sandbox)"
        }
    except Exception as err:
        return {
            "id": tc_id, "passed": False, "error": str(err),
            "expected": exp, "actual": f"SQL Error: {err}",
            "hidden": hidden, "engine": "SQLite (sandbox)"
        }

def run_sql(query_str, schema_str, testcases):
    """
    Executes SQL against MySQL 8.0 (primary, full real SQL support) or
    falls back to in-memory SQLite if MySQL is not reachable.
    Each testcase gets its own isolated database on MySQL.
    """
    results = []
    passed = 0
    if not testcases:
        testcases = [{"id": 1, "expected": [], "hidden": False}]

    mysql_available = False
    try:
        import mysql.connector
        cfg = get_mysql_config()
        tc = mysql.connector.connect(**cfg)
        tc.close()
        mysql_available = True
    except Exception as e:
        log(f"[MySQL] unavailable, using SQLite: {e}")

    for i, tc in enumerate(testcases):
        tc_id = tc.get("id", i + 1)
        hidden = tc.get("hidden", False)
        setup_sql = tc.get("setup", "")
        exp = tc.get("expected", [])

        result = None
        if mysql_available:
            result = _run_sql_mysql_tc(query_str, schema_str, setup_sql, tc_id, exp, hidden)
        if result is None:
            result = _run_sql_sqlite_tc(query_str, schema_str, setup_sql, tc_id, exp, hidden)

        if result.get("passed"):
            passed += 1
        results.append(result)

    all_passed = (passed == len(testcases)) and len(testcases) > 0
    engine_used = results[0].get("engine", "SQLite") if results else "SQLite"
    return {
        "success": True,
        "status": "ACCEPTED" if all_passed else "WRONG_ANSWER",
        "passedCount": passed,
        "totalCount": len(testcases),
        "allPassed": all_passed,
        "results": results,
        "engine": engine_used
    }

# ── OmniRoute Headless Launcher ──────────────────────────────────────────────
def start_omniroute_headless():
    try:
        import socket
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex(('127.0.0.1', 20128)) == 0:
                    log('[OmniRoute] Server already running on port 20128')
                    return
        except Exception:
            pass

        cmd = shutil.which('omniroute') or shutil.which('omniroute.cmd')
        if not cmd:
            npm_global = os.path.join(os.environ.get('APPDATA', ''), 'npm', 'omniroute.cmd')
            if os.path.exists(npm_global):
                cmd = npm_global

        if not cmd:
            log('[OmniRoute] omniroute not found in PATH, skipping auto-start')
            return

        log(f'[OmniRoute] Starting headless server via: {cmd}')

        flags = 0
        if sys.platform == 'win32':
            flags = (
                getattr(subprocess, 'DETACHED_PROCESS', 0x00000008) |
                getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0x00000200) |
                getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
            )

        safe_cwd = os.environ.get('USERPROFILE') or tempfile.gettempdir()
        subprocess.Popen(
            [cmd, 'serve', '--no-open', '--daemon'],
            cwd=safe_cwd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
        log('[OmniRoute] Server launched in background (port 20128)')
    except Exception as e:
        log(f'[OmniRoute] Failed to start: {e}')

# ── Base Directory Resolver ───────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    EXE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

COOKIE_FILE = os.path.join(EXE_DIR, 'cookie.txt')
if not os.path.exists(COOKIE_FILE):
    COOKIE_FILE = os.path.join(BUNDLE_DIR, 'cookie.txt')

SESSION_COOKIE = ''


# ── Prohibited Process Scanner ───────────────────────────────────────────────
BLACKLIST_PROCS = [
    ('comet.exe', 'Perplexity Comet Browser / AI'),
    ('chatgpt.exe', 'ChatGPT Desktop'),
    ('claude.exe', 'Claude AI Desktop'),
    ('perplexity.exe', 'Perplexity AI'),
    ('deepseek.exe', 'DeepSeek AI'),
    ('cursor.exe', 'Cursor AI Editor'),
]

def scan_prohibited_tools():
    detected = []
    try:
        for proc in psutil.process_iter(['name', 'exe']):
            try:
                pname = (proc.info.get('name') or '').lower()
                for b_name, b_label in BLACKLIST_PROCS:
                    if b_name.lower() in pname:
                        if not any(d['name'] == b_name for d in detected):
                            detected.append({'name': b_name, 'label': b_label})
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        log(f"Process scan error: {e}")
    return {'safe': len(detected) == 0, 'detected': detected}

# ── Admin Data Store & Seed Telemetry ──────────────────────────────────────────
ADMIN_USERNAME = "loki1234"
ADMIN_PASSWORD_HASH = "mdatraining@20267"  # Admin credential specified by user

DEFAULT_PROCTOR_POLICY = {
    "maxTabSwitches": 1,
    "maxSoundWarnings": 10,
    "maxAwaySec": 25,
    "lightingGuard": True,
    "antiAiScanner": True,
    "fullscreenLockdown": True,
    "dualAiVerification": True,
    "omniRouteKey": ""
}

def load_app_settings():
    path = os.path.join(EXE_DIR, 'settings.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_app_settings(data):
    path = os.path.join(EXE_DIR, 'settings.json')
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        log(f"Error saving settings: {e}")
        return False

def get_leetcode_account_info():
    s = load_app_settings()
    lc = s.get('leetcodeAccount', {})
    if not lc:
        return {
            'connected': False,
            'username': '',
            'ranking': 0,
            'totalSolved': 0,
            'easySolved': 0,
            'mediumSolved': 0,
            'hardSolved': 0,
            'avatar': '',
            'maskedSession': '',
            'lastVerified': ''
        }
    session = lc.get('sessionCookie', '')
    masked = (session[:8] + '...' + session[-6:]) if len(session) > 16 else ('Active' if session else '')
    return {
        'connected': lc.get('connected', False),
        'username': lc.get('username', ''),
        'ranking': lc.get('ranking', 0),
        'totalSolved': lc.get('totalSolved', 0),
        'easySolved': lc.get('easySolved', 0),
        'mediumSolved': lc.get('mediumSolved', 0),
        'hardSolved': lc.get('hardSolved', 0),
        'avatar': lc.get('avatar', ''),
        'maskedSession': masked,
        'lastVerified': lc.get('lastVerified', '')
    }

def verify_and_save_leetcode(username='', session_cookie='', csrf_token=''):
    username = (username or '').strip()
    session_cookie = (session_cookie or '').strip()
    csrf_token = (csrf_token or '').strip()

    verified_data = {
        'connected': True,
        'username': username or 'LeetCodeUser',
        'sessionCookie': session_cookie,
        'csrfToken': csrf_token,
        'ranking': 0,
        'totalSolved': 0,
        'easySolved': 0,
        'mediumSolved': 0,
        'hardSolved': 0,
        'avatar': '',
        'lastVerified': datetime.now().isoformat()
    }

    if session_cookie:
        try:
            req = urllib.request.Request(
                'https://leetcode.com/api/problems/all/',
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cookie': f'LEETCODE_SESSION={session_cookie}; csrftoken={csrf_token}',
                    'Referer': 'https://leetcode.com/'
                }
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    api_data = json.loads(resp.read().decode('utf-8'))
                    if api_data.get('user_name'):
                        verified_data['username'] = api_data['user_name']
                    if 'num_solved' in api_data:
                        verified_data['totalSolved'] = api_data.get('num_solved', 0)
        except Exception as e:
            log(f"LeetCode session verify note: {e}")

    target_user = verified_data['username']
    if target_user and target_user != 'LeetCodeUser':
        try:
            gql_query = {
                'query': 'query { matchedUser(username: "' + target_user + '") { username profile { ranking userAvatar reputation } submitStatsGlobal { acSubmissionNum { difficulty count } } } }'
            }
            req = urllib.request.Request(
                'https://leetcode.com/graphql',
                data=json.dumps(gql_query).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                gql_res = json.loads(resp.read().decode('utf-8'))
                user_obj = gql_res.get('data', {}).get('matchedUser')
                if user_obj:
                    prof = user_obj.get('profile', {}) or {}
                    verified_data['ranking'] = prof.get('ranking', 0)
                    verified_data['avatar'] = prof.get('userAvatar', '')
                    stats = user_obj.get('submitStatsGlobal', {}).get('acSubmissionNum', [])
                    for s in stats:
                        d = s.get('difficulty')
                        c = s.get('count', 0)
                        if d == 'All': verified_data['totalSolved'] = c
                        elif d == 'Easy': verified_data['easySolved'] = c
                        elif d == 'Medium': verified_data['mediumSolved'] = c
                        elif d == 'Hard': verified_data['hardSolved'] = c
        except Exception as e:
            log(f"LeetCode GraphQL user sync error: {e}")

    s = load_app_settings()
    s['leetcodeAccount'] = verified_data
    save_app_settings(s)
    return verified_data

# ── Dual Session Cookie Manager (Taufa.ai + LeetCode) ────────────────────────
def parse_cookie_text(text):
    """
    Parses cookie.txt content which may contain Taufa cookies, LeetCode cookies,
    or sections denoted by comments like '# Taufa.ai Session Cookies' / '# LeetCode Session Cookies'.
    Returns a dict with 'taufa', 'leetcode', 'leetcode_session', and 'leetcode_csrf'.
    """
    text = (text or '').strip()
    taufa_lines = []
    leetcode_lines = []
    
    current_section = None
    for line in text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue
        if line_s.startswith('#'):
            lower = line_s.lower()
            if 'leetcode' in lower:
                current_section = 'leetcode'
            elif 'taufa' in lower:
                current_section = 'taufa'
            continue
        
        if current_section == 'leetcode':
            leetcode_lines.append(line_s)
        elif current_section == 'taufa':
            taufa_lines.append(line_s)
        else:
            if 'LEETCODE_SESSION' in line_s or 'csrftoken' in line_s:
                leetcode_lines.append(line_s)
            elif 'authjs' in line_s or '_k_state' in line_s or 'taufa' in line_s.lower():
                taufa_lines.append(line_s)
            else:
                taufa_lines.append(line_s)

    taufa_cookie = '; '.join([l.rstrip(';') for l in taufa_lines if l])
    leetcode_cookie = '; '.join([l.rstrip(';') for l in leetcode_lines if l])

    lc_session = ''
    lc_csrf = ''
    m_sess = re.search(r'LEETCODE_SESSION=([^;\r\n\s]+)', text)
    if m_sess:
        lc_session = m_sess.group(1).strip()
    
    m_csrf = re.search(r'csrftoken=([^;\r\n\s]+)', text)
    if m_csrf:
        lc_csrf = m_csrf.group(1).strip()

    return {
        'taufa': taufa_cookie,
        'leetcode': leetcode_cookie,
        'leetcode_session': lc_session,
        'leetcode_csrf': lc_csrf
    }

def save_dual_cookie_file(cookie_str, cookie_type='taufa', username=''):
    """
    Updates cookie.txt with new cookies for either Taufa or LeetCode without erasing the other.
    Also synchronizes SESSION_COOKIE and the LeetCode account verification state.
    """
    global SESSION_COOKIE
    cookie_str = (cookie_str or '').strip()
    cookie_type = (cookie_type or 'taufa').strip().lower()

    # Read existing cookie.txt if available
    existing_content = ''
    target_path = os.path.join(EXE_DIR, 'cookie.txt')
    if os.path.exists(target_path):
        try:
            with open(target_path, 'r', encoding='utf-8') as f:
                existing_content = f.read()
        except Exception:
            pass
    elif os.path.exists(COOKIE_FILE):
        try:
            with open(COOKIE_FILE, 'r', encoding='utf-8') as f:
                existing_content = f.read()
        except Exception:
            pass

    existing_parsed = parse_cookie_text(existing_content)

    new_taufa = existing_parsed['taufa']
    new_leetcode = existing_parsed['leetcode']

    if cookie_type == 'leetcode':
        new_leetcode = cookie_str
    elif cookie_type == 'taufa':
        new_taufa = cookie_str
    else:
        if 'LEETCODE_SESSION' in cookie_str and 'authjs' not in cookie_str:
            new_leetcode = cookie_str
        elif ('authjs' in cookie_str or '_k_state' in cookie_str) and 'LEETCODE_SESSION' not in cookie_str:
            new_taufa = cookie_str
        else:
            parsed_in = parse_cookie_text(cookie_str)
            if parsed_in['taufa']:
                new_taufa = parsed_in['taufa']
            if parsed_in['leetcode']:
                new_leetcode = parsed_in['leetcode']

    out_lines = []
    if new_taufa:
        out_lines.append("# Taufa.ai Session Cookies")
        out_lines.append(new_taufa)
    if new_leetcode:
        if out_lines:
            out_lines.append("")
        out_lines.append("# LeetCode Session Cookies")
        out_lines.append(new_leetcode)

    combined_text = "\n".join(out_lines).strip() + "\n"

    try:
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(combined_text)
        if target_path != COOKIE_FILE and os.path.exists(COOKIE_FILE):
            try:
                with open(COOKIE_FILE, 'w', encoding='utf-8') as f:
                    f.write(combined_text)
            except Exception:
                pass
    except Exception as e:
        log(f"Error writing to cookie.txt: {e}")

    SESSION_COOKIE = new_taufa

    # If LeetCode credentials updated, verify and save
    verified_account = None
    parsed_after = parse_cookie_text(combined_text)
    if parsed_after['leetcode_session']:
        try:
            verified_account = verify_and_save_leetcode(
                username=username,
                session_cookie=parsed_after['leetcode_session'],
                csrf_token=parsed_after['leetcode_csrf']
            )
        except Exception as e:
            log(f"LeetCode verify after cookie save: {e}")

    return {
        'success': True,
        'taufaLength': len(new_taufa),
        'leetcodeSession': bool(parsed_after['leetcode_session']),
        'username': (verified_account or {}).get('username', username),
        'account': verified_account
    }

def load_cookie():
    global SESSION_COOKIE
    try:
        active_cookie_file = COOKIE_FILE
        if not os.path.exists(active_cookie_file):
            active_cookie_file = os.path.join(EXE_DIR, 'cookie.txt')
        if os.path.exists(active_cookie_file):
            with open(active_cookie_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                parsed = parse_cookie_text(content)
                if parsed['leetcode_session']:
                    s = load_app_settings()
                    lc = s.get('leetcodeAccount', {})
                    if not lc.get('connected') or lc.get('sessionCookie') != parsed['leetcode_session']:
                        threading.Thread(
                            target=verify_and_save_leetcode,
                            kwargs={
                                'session_cookie': parsed['leetcode_session'],
                                'csrf_token': parsed['leetcode_csrf']
                            },
                            daemon=True
                        ).start()
                if parsed['taufa']:
                    return parsed['taufa']
                return content if not parsed['leetcode'] else ''
    except Exception as e:
        log(f"load_cookie error: {e}")
    return ''

SESSION_COOKIE = load_cookie()


SEED_TEST_RECORDS = []

SEED_CUSTOM_TESTS = [
    {
        "id": "demo-test-candidate",
        "title": "DEMO PROCTORING TEST (8 MCQ + 1 Coding + 1 SQL)",
        "topic": "Demo Practice Assessment",
        "format": "coding+sql+mcq",
        "category": "Super Easy",
        "difficulty": "Super Easy",
        "numQuestions": 10,
        "codingCount": 1,
        "sqlCount": 1,
        "mcqCount": 8,
        "isDemo": True,
        "mcqTagline": "Python, Java, C, SQL, DSA & Computer Science Foundations",
        "timeLimitMin": 20,
        "allowedAttempts": 999,
        "maxAttempts": 999,
        "proctorPreset": "balanced",
        "proctorOptions": {
            "camera": True,
            "mic": True,
            "allowApps": True,
            "fullscreen": False,
            "maxMalpracticeAttempts": 20,
            "allowedAttempts": 999
        },
        "instructions": "Permanent Demo Proctoring Test: Complete 8 introductory MCQs, 1 simple LeetCode coding challenge (Problem #2235 — Add Two Integers), and 1 simple SQL query (SELECT * FROM Student;). Unlimited attempts allowed.",
        "problemId": "add-two-integers",
        "createdAt": "2026-10-02T14:30:00Z",
        "isAssigned": False
    },
    {
        "id": "test-dsa-101",
        "title": "DSA Placement Core: Two Sum & Hash Maps",
        "topic": "1. Two Sum",
        "format": "coding",
        "category": "Arrays & Hashing",
        "difficulty": "Easy",
        "numQuestions": 1,
        "timeLimitMin": 30,
        "proctorOptions": {
            "camera": True,
            "mic": True,
            "allowApps": False,
            "fullscreen": True,
            "maxMalpracticeAttempts": 10
        },
        "instructions": "Implement an optimal O(n) hash map solution. Ensure all 10-15 test cases pass.",
        "createdAt": "2026-09-30T09:00:00Z",
        "isAssigned": False
    },
    {
        "id": "test-sql-201",
        "title": "Relational Database & Window Queries Midterm",
        "topic": "Top Salaries by Department with Joins",
        "format": "sql",
        "category": "SQL",
        "difficulty": "Medium",
        "numQuestions": 1,
        "timeLimitMin": 30,
        "proctorPreset": "strict",
        "proctorOptions": {
            "camera": True,
            "mic": True,
            "allowApps": False,
            "fullscreen": True,
            "maxMalpracticeAttempts": 10
        },
        "instructions": "Execute SQL queries against in-memory SQLite schema. Test both sample and hidden test cases.",
        "createdAt": "2026-09-30T10:00:00Z",
        "isAssigned": False
    },
    {
        "id": "test-py-301",
        "title": "Python OOP & Standard Library Comprehensive",
        "topic": "Python Data Structures & OOP",
        "format": "mcq",
        "category": "General",
        "difficulty": "Medium",
        "numQuestions": 10,
        "timeLimitMin": 20,
        "proctorPreset": "strict",
        "proctorOptions": {
            "camera": True,
            "mic": True,
            "allowApps": False,
            "fullscreen": True,
            "maxMalpracticeAttempts": 10
        },
        "instructions": "Answer 10 multiple-choice questions. Dual AI verification cross-validates responses.",
        "createdAt": "2026-09-30T11:00:00Z",
        "isAssigned": False
    }
]

def load_test_records():
    path = os.path.join(EXE_DIR, 'test_records.json')
    if not os.path.exists(path):
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump([], f, indent=2)
            return []
        except Exception:
            return []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def save_test_records(records):
    target_paths = [os.path.join(EXE_DIR, 'test_records.json')]
    if BUNDLE_DIR and BUNDLE_DIR != EXE_DIR:
        target_paths.append(os.path.join(BUNDLE_DIR, 'test_records.json'))
    internal_dir = os.path.join(EXE_DIR, '_internal')
    if os.path.isdir(internal_dir):
        target_paths.append(os.path.join(internal_dir, 'test_records.json'))
    success = True
    for p in set(target_paths):
        try:
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(records, f, indent=2)
        except Exception as e:
            log(f"Error saving test records to {p}: {e}")
            success = False
    return success

def load_custom_tests():
    candidates = [
        os.path.join(EXE_DIR, 'custom_tests.json'),
        os.path.join(EXE_DIR, '_internal', 'custom_tests.json'),
        os.path.join(BUNDLE_DIR, 'custom_tests.json') if BUNDLE_DIR else ''
    ]
    path = None
    for cand in candidates:
        if cand and os.path.exists(cand):
            path = cand
            break
    if not path or not os.path.exists(path):
        target = os.path.join(EXE_DIR, 'custom_tests.json')
        try:
            with open(target, 'w', encoding='utf-8') as f:
                json.dump(SEED_CUSTOM_TESTS, f, indent=2)
            return list(SEED_CUSTOM_TESTS)
        except Exception:
            return list(SEED_CUSTOM_TESTS)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return list(SEED_CUSTOM_TESTS)

def save_custom_tests(tests):
    target_paths = [os.path.join(EXE_DIR, 'custom_tests.json')]
    if BUNDLE_DIR and BUNDLE_DIR != EXE_DIR:
        target_paths.append(os.path.join(BUNDLE_DIR, 'custom_tests.json'))
    internal_dir = os.path.join(EXE_DIR, '_internal')
    if os.path.isdir(internal_dir):
        target_paths.append(os.path.join(internal_dir, 'custom_tests.json'))
    success = True
    for p in set(target_paths):
        try:
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(tests, f, indent=2)
        except Exception as e:
            log(f"Error saving custom tests to {p}: {e}")
            success = False
    return success

def append_bug_report(report_data):
    """
    Appends a new bug/issue report entry to bug_reports.txt without overwriting previous reports.
    """
    now_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    rep_id = f"BUG-{int(time.time()*1000)}"
    
    reporter = report_data.get('reporterName', 'Anonymous').strip() or 'Anonymous'
    role = report_data.get('reporterRole', 'Candidate').strip() or 'Candidate'
    category = report_data.get('category', 'General').strip() or 'General'
    summary = report_data.get('summary', '').strip() or 'No Summary Provided'
    description = report_data.get('description', '').strip() or 'No Description'
    screen = report_data.get('screen', 'Unknown').strip() or 'Unknown'
    user_agent = report_data.get('userAgent', '').strip()
    
    entry_lines = [
        "=" * 80,
        f"REPORT ID:     {rep_id}",
        f"TIMESTAMP:     {now_str}",
        f"REPORTER:      {reporter} ({role})",
        f"CATEGORY:      {category}",
        f"SCREEN / VIEW: {screen}",
        f"SUMMARY:       {summary}",
        "-" * 80,
        "DESCRIPTION / REPRODUCTION STEPS:",
        description,
    ]
    if user_agent:
        entry_lines.append(f"SYSTEM CONTEXT: {user_agent}")
    entry_lines.append("=" * 80 + "\n\n")
    report_entry = "\n".join(entry_lines)
    
    target_paths = [os.path.join(EXE_DIR, 'bug_reports.txt')]
    if BUNDLE_DIR and BUNDLE_DIR != EXE_DIR:
        target_paths.append(os.path.join(BUNDLE_DIR, 'bug_reports.txt'))
        
    for p in set(target_paths):
        try:
            with open(p, 'a', encoding='utf-8') as f:
                f.write(report_entry)
        except Exception as e:
            log(f"Error appending bug report to {p}: {e}")
            
    return rep_id

def compute_admin_metrics(records):
    total = len(records)
    if total == 0:
        return {
            "totalAttended": 0,
            "completedCount": 0,
            "disqualifiedCount": 0,
            "overallPercentage": 0.0,
            "passCount": 0,
            "failCount": 0,
            "passRate": 0.0,
            "integrityRate": 100.0,
            "formatBreakdown": {}
        }

    completed = [r for r in records if not r.get('disqualified')]
    disqualified = [r for r in records if r.get('disqualified')]
    
    overall_pct = 0.0
    if completed:
        overall_pct = round(sum(float(r.get('score', 0)) for r in completed) / len(completed), 1)
        
    passed_tests = [r for r in completed if float(r.get('score', 0)) >= 70.0]
    pass_rate = round((len(passed_tests) / len(completed) * 100), 1) if completed else 0.0
    
    clean_tests = [r for r in records if r.get('tabSwitches', 0) == 0 and r.get('soundWarnings', 0) == 0 and not r.get('disqualified')]
    integrity_rate = round((len(clean_tests) / total * 100), 1)
    
    format_counts = {}
    for r in records:
        fmt = r.get('format', 'mcq')
        format_counts[fmt] = format_counts.get(fmt, 0) + 1
        
    return {
        "totalAttended": total,
        "completedCount": len(completed),
        "disqualifiedCount": len(disqualified),
        "overallPercentage": overall_pct,
        "passCount": len(passed_tests),
        "failCount": len(completed) - len(passed_tests),
        "passRate": pass_rate,
        "integrityRate": integrity_rate,
        "formatBreakdown": format_counts
    }

# ── Local Embedded HTTP Server ───────────────────────────────────────────────
class ProctorHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        serve_dir = EXE_DIR if os.path.exists(os.path.join(EXE_DIR, 'index.html')) else BUNDLE_DIR
        super().__init__(*args, directory=serve_dir, **kwargs)

    def translate_path(self, path):
        clean_path = path.split('?')[0].split('#')[0].lstrip('/')
        if not clean_path:
            clean_path = 'index.html'
        proj_dir = r'C:\Users\lokad\Music\quiz'
        proj_path = os.path.join(proj_dir, clean_path)
        if os.path.exists(proj_path):
            return proj_path
        exe_path = os.path.join(EXE_DIR, clean_path)
        if os.path.exists(exe_path):
            return exe_path
        bundle_path = os.path.join(BUNDLE_DIR, clean_path)
        if os.path.exists(bundle_path):
            return bundle_path
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Connection', 'close')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        global SESSION_COOKIE
        path = self.path.split('?')[0]

        # Fullscreen status endpoint
        if path == '/api/fullscreen/status':
            is_fs = False
            w = ACTIVE_WINDOW_HOLDER.get('window')
            if w:
                try:
                    from webview.platforms.winforms import BrowserView
                    inst = BrowserView.instances.get(w.uid)
                    if inst is not None:
                        is_fs = bool(getattr(inst, 'is_fullscreen', False))
                    else:
                        is_fs = bool(ACTIVE_WINDOW_HOLDER.get('is_fullscreen', False))
                except Exception:
                    is_fs = bool(ACTIVE_WINDOW_HOLDER.get('is_fullscreen', False))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'fullscreen': is_fs}).encode('utf-8'))
            return

        # Process scanner endpoint
        if path == '/api/proctor-scan':
            data = scan_prohibited_tools()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        # Cookie status endpoint
        if path == '/api/cookie-status':
            has_cookie = bool(SESSION_COOKIE and SESSION_COOKIE != 'PASTE_YOUR_COOKIE_HERE')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'hasCookie': has_cookie, 'length': len(SESSION_COOKIE)}).encode('utf-8'))
            return

        # Settings endpoint (GET)
        if path == '/api/settings':
            settings_path = os.path.join(EXE_DIR, 'settings.json')
            settings = {}
            try:
                with open(settings_path, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
            except Exception:
                pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(settings).encode('utf-8'))
            return

        # Admin: Get test attendance records and computed KPI metrics
        if path == '/api/admin/records':
            records = load_test_records()
            metrics = compute_admin_metrics(records)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'records': records, 'metrics': metrics}).encode('utf-8'))
            return

        # Admin: Get custom tests list
        if path == '/api/admin/custom-tests':
            tests = load_custom_tests()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'tests': tests}).encode('utf-8'))
            return

        # Admin: Get proctoring configuration / policy
        if path == '/api/admin/proctor-config':
            settings_path = os.path.join(EXE_DIR, 'settings.json')
            policy = dict(DEFAULT_PROCTOR_POLICY)
            try:
                if os.path.exists(settings_path):
                    with open(settings_path, 'r', encoding='utf-8') as f:
                        saved = json.load(f)
                        policy.update(saved.get('proctorPolicy', {}))
            except Exception:
                pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'config': policy}).encode('utf-8'))
            return

        # Admin & Client: Get active assigned assessment for main app
        if path == '/api/admin/active-assignment':
            tests = load_custom_tests()
            assigned = next(
                (t for t in tests if bool(t.get('isAssigned')) and t.get('id') != 'demo-test-candidate'),
                None
            )
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'assignedTest': assigned}).encode('utf-8'))
            return

        # Admin: Get LeetCode account connection status & sync stats
        if path == '/api/admin/leetcode-account':
            acc = get_leetcode_account_info()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'account': acc}).encode('utf-8'))
            return

        # Admin: Get system configuration (Taufa cookie/session, OmniRoute API, custom prompts)
        if path == '/api/admin/system-config':
            settings_path = os.path.join(EXE_DIR, 'settings.json')
            settings = {}
            try:
                if os.path.exists(settings_path):
                    with open(settings_path, 'r', encoding='utf-8') as f:
                        settings = json.load(f)
            except Exception:
                pass
            has_cookie = bool(SESSION_COOKIE and SESSION_COOKIE != 'PASTE_YOUR_COOKIE_HERE')
            masked_cookie = (SESSION_COOKIE[:12] + '...' + SESSION_COOKIE[-8:]) if has_cookie and len(SESSION_COOKIE) > 24 else ('Active' if has_cookie else 'Not configured')
            
            data = {
                'success': True,
                'taufa': {
                    'hasCookie': has_cookie,
                    'cookieLength': len(SESSION_COOKIE or ''),
                    'maskedCookie': masked_cookie,
                    'conversationId': settings.get('conversationId', '000e9900-de38-46e9-aa31-c5f36d696dc3')
                },
                'omniRoute': settings.get('omniRouteConfig', {
                    'url': 'http://localhost:20128/v1/chat/completions',
                    'apiKey': settings.get('omniRouteKey', ''),
                    'model': 'gpt-4o-mini'
                }),
                'taufaPrompts': settings.get('taufaPrompts', {
                    'mcq': 'create a mcq quiz on {topic} of {numQ} questions with answers. Format each question ending with "?", choices as A) B) C) D), and clearly mark the correct answer. Include a mix of single and multiple correct answer questions where appropriate. Return in JSON format: {"quiz": [{"question": "...", "choices": ["A) ...", "B) ...", "C) ...", "D) ..."], "answer": 0, "multi": false}]}',
                    'coding': 'Create an authentic LeetCode coding problem on: "{topic}" (Category: {category}, Difficulty: {difficulty}).\nGenerate exactly 12-15 testcases (first 4 visible with clear input/expected, remaining 8-11 hidden edge cases).\nProvide starter templates for Python, Java, C++, and C.\nReturn ONLY valid JSON in this exact structure:\n{\n  "coding": {\n    "title": "LeetCode Title (e.g. 1. Two Sum)",\n    "category": "{category}",\n    "difficulty": "{difficulty}",\n    "description": "Full problem description in markdown with algorithmic requirements, Examples, and Constraints.",\n    "starterCodes": {\n      "python": "class Solution:\\n    def solution(self, *args):\\n        pass",\n      "java": "import java.util.*;\\npublic class Solution {\\n    public static void main(String[] args) {}\\n}",\n      "cpp": "#include <iostream>\\nusing namespace std;\\nclass Solution {};\\nint main() { return 0; }",\n      "c": "#include <stdio.h>\\nint main() { return 0; }"\n    },\n    "testcases": [\n      { "id": 1, "input": "...", "expected": "...", "hidden": false }\n    ]\n  }\n}',
                    'sql': 'Create a comprehensive SQL database query challenge on: "{topic}".\nGenerate exactly 12 testcases.\nReturn ONLY valid JSON in this exact structure:\n{\n  "coding": {\n    "title": "SQL Problem Title",\n    "language": "sql",\n    "difficulty": "Medium",\n    "description": "Clear problem statement describing the business requirement, tables, schema, and expected result columns and order.",\n    "schema": "CREATE TABLE employees (id INT, name TEXT, salary INT, department TEXT); INSERT INTO employees VALUES (1, \'Alice\', 70000, \'Engineering\');",\n    "starterCode": "-- Write your SQL solution below\\nSELECT ",\n    "testcases": [\n      { "id": 1, "description": "Base case", "expected": [], "hidden": false }\n    ]\n  }\n}'
                })
            }
            # Add MySQL config and live connection status
            mysql_cfg_stored = settings.get('mysqlConfig', {
                'host': 'localhost', 'user': 'root', 'password': 'Gg@2591281', 'port': 3306
            })
            mysql_connected = False
            try:
                import mysql.connector
                _tc = mysql.connector.connect(
                    host=mysql_cfg_stored.get('host', 'localhost'),
                    user=mysql_cfg_stored.get('user', 'root'),
                    password=mysql_cfg_stored.get('password', 'Gg@2591281'),
                    port=int(mysql_cfg_stored.get('port', 3306)),
                    autocommit=True
                )
                _tc.close()
                mysql_connected = True
            except Exception:
                pass
            data['mysqlConfig'] = mysql_cfg_stored
            data['mysqlStatus'] = {'connected': mysql_connected, 'version': 'MySQL 8.0' if mysql_connected else 'Not connected'}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        # Admin: Check OmniRoute headless process port status
        if path == '/api/admin/omniroute-status':
            is_running = False
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    is_running = (s.connect_ex(('127.0.0.1', 20128)) == 0)
            except Exception:
                is_running = False
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'running': is_running}).encode('utf-8'))
            return

        # View Bug Reports Log
        if path == '/api/bug-reports' or path == '/api/report-issue':
            target_path = os.path.join(EXE_DIR, 'bug_reports.txt')
            if not os.path.exists(target_path) and BUNDLE_DIR and os.path.exists(os.path.join(BUNDLE_DIR, 'bug_reports.txt')):
                target_path = os.path.join(BUNDLE_DIR, 'bug_reports.txt')
            content = ""
            if os.path.exists(target_path):
                try:
                    with open(target_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception as e:
                    content = f"Error reading bug reports: {e}"
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'content': content, 'path': target_path}).encode('utf-8'))
            return

        if path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'timestamp': int(time.time() * 1000)}).encode('utf-8'))
            return

        if path == '/api/proctor/events':
            events_path = os.path.join(EXE_DIR, 'proctor_events.json')
            events = []
            if os.path.exists(events_path):
                try:
                    with open(events_path, 'r', encoding='utf-8') as f:
                        events = json.load(f)
                except Exception:
                    events = []
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'events': events[-200:]}).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        global SESSION_COOKIE
        path = self.path.split('?')[0]

        # Record structured privacy-preserving proctoring event metadata (no raw audio/video)
        if path == '/api/proctor/events':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body) if body else {}
                events_path = os.path.join(EXE_DIR, 'proctor_events.json')
                events = []
                if os.path.exists(events_path):
                    try:
                        with open(events_path, 'r', encoding='utf-8') as f:
                            events = json.load(f)
                            if not isinstance(events, list):
                                events = []
                    except Exception:
                        events = []
                # Privacy filter: strip any accidental raw frame or audio buffer fields
                sanitized = {
                    k: v for k, v in data.items()
                    if k not in ('raw_audio', 'raw_video', 'frame_bytes', 'audio_buffer')
                }
                sanitized['recorded_at'] = datetime.now().isoformat()
                events.append(sanitized)
                # Configurable retention: keep latest 500 events
                if len(events) > 500:
                    events = events[-500:]
                with open(events_path, 'w', encoding='utf-8') as f:
                    json.dump(events, f, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'stored': True}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        # Submit Bug / Issue Report (Appends to bug_reports.txt)
        if path == '/api/report-issue' or path == '/api/bug-report':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body) if body else {}
                rep_id = append_bug_report(data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'reportId': rep_id, 'message': 'Bug report recorded successfully'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        # Exit Application Endpoint
        if path == '/api/app/exit':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success": true}')
            def _shutdown_app():
                time.sleep(0.2)
                w = ACTIVE_WINDOW_HOLDER.get('window')
                if w:
                    try:
                        w.destroy()
                    except Exception:
                        pass
                os._exit(0)
            threading.Thread(target=_shutdown_app, daemon=True).start()
            return

        # Fullscreen Controls
        if path == '/api/fullscreen/enter':
            is_fs = force_window_fullscreen(ACTIVE_WINDOW_HOLDER)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'fullscreen': is_fs}).encode('utf-8'))
            return

        if path == '/api/fullscreen/exit':
            is_fs = not restore_window_fullscreen(ACTIVE_WINDOW_HOLDER)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'fullscreen': is_fs}).encode('utf-8'))
            return

        if path == '/api/fullscreen/toggle':
            currently_fs = bool(ACTIVE_WINDOW_HOLDER.get('is_fullscreen', False))
            if currently_fs:
                restore_window_fullscreen(ACTIVE_WINDOW_HOLDER)
                is_fs = False
            else:
                force_window_fullscreen(ACTIVE_WINDOW_HOLDER)
                is_fs = True
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'fullscreen': is_fs}).encode('utf-8'))
            return

        # In-built Code Compiler & Runner Endpoint
        if path == '/api/run-code':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                lang = data.get('language', 'python').lower()
                code = data.get('code', '')
                schema = data.get('schema', '')
                testcases = data.get('testcases', [])
                
                if lang == 'sql':
                    result = run_sql(code, schema, testcases)
                elif lang in ('cpp', 'c++'):
                    result = run_cpp(code, testcases)
                elif lang == 'c':
                    result = run_c(code, testcases)
                elif lang == 'java':
                    result = run_java(code, testcases)
                else:
                    result = run_python(code, testcases)
                    
                if lang == 'sql':
                    result['executor'] = result.get('engine', 'MySQL 8.0')
                else:
                    acc = get_leetcode_account_info()
                    if acc.get('connected'):
                        result['executor'] = 'leetcode-account'
                        result['leetcodeUser'] = acc.get('username')
                    else:
                        result['executor'] = 'builtin-sandbox'

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                return

        # LeetCode Account Connect & Sync Endpoint
        if path == '/api/admin/leetcode-account':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                u = data.get('username', '').strip()
                s = data.get('sessionCookie', '').strip()
                c = data.get('csrfToken', '').strip()
                verified = verify_and_save_leetcode(u, s, c)
                if s:
                    lc_cookie_line = f"LEETCODE_SESSION={s}"
                    if c:
                        lc_cookie_line += f"; csrftoken={c}"
                    save_dual_cookie_file(lc_cookie_line, cookie_type='leetcode', username=u)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'account': get_leetcode_account_info()}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                return

        # LeetCode Account Disconnect Endpoint
        if path == '/api/admin/leetcode-disconnect':
            s = load_app_settings()
            if 'leetcodeAccount' in s:
                del s['leetcodeAccount']
            save_app_settings(s)
            save_dual_cookie_file('', cookie_type='leetcode')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'account': get_leetcode_account_info()}).encode('utf-8'))
            return

        # LeetCode Live Test & Benchmark Endpoint
        if path == '/api/admin/leetcode-test':
            t0 = time.time()
            try:
                req = urllib.request.Request(
                    'https://leetcode.com/graphql',
                    data=json.dumps({'query': 'query { allQuestionsCount { difficulty count } }'}).encode('utf-8'),
                    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    resp_data = json.loads(resp.read().decode('utf-8'))
                    latency = round((time.time() - t0) * 1000, 1)
                    q_counts = resp_data.get('data', {}).get('allQuestionsCount', [])
                    total_lc = next((q['count'] for q in q_counts if q.get('difficulty') == 'All'), 3300)
                    acc = get_leetcode_account_info()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'latencyMs': latency,
                        'totalLeetCodeProblems': total_lc,
                        'account': acc
                    }).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': f"LeetCode live ping: {e}",
                    'account': get_leetcode_account_info()
                }).encode('utf-8'))
                return

        # Save cookie endpoint
        if path == '/api/save-cookie':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                cookie_str = data.get('cookie', '').strip()
                cookie_type = data.get('type', 'taufa').strip().lower()
                username = data.get('username', '').strip()
                if cookie_str:
                    res = save_dual_cookie_file(cookie_str, cookie_type=cookie_type, username=username)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'length': len(cookie_str),
                        'type': cookie_type,
                        'username': res.get('username', ''),
                        'account': res.get('account')
                    }).encode('utf-8'))
                    return
                else:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No cookie string provided'}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Save settings endpoint
        if path == '/api/settings':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                settings_path = os.path.join(EXE_DIR, 'settings.json')
                with open(settings_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Proxy /proxy/api/chat -> https://taufa.ai/api/chat
        if path.startswith('/proxy/'):
            target_path = path.replace('/proxy', '', 1)
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)

            headers = {
                'Content-Type': 'application/json',
                'Cookie': SESSION_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Origin': 'https://taufa.ai',
                'Referer': 'https://taufa.ai/',
            }

            try:
                taufa_url = 'https://taufa.ai' + target_path
                res = requests.post(taufa_url, data=post_body, headers=headers, stream=True, timeout=10)
                self.send_response(res.status_code)
                for k, v in res.headers.items():
                    if k.lower() in ['content-type', 'transfer-encoding', 'cache-control']:
                        self.send_header(k, v)
                self.end_headers()

                for chunk in res.iter_content(chunk_size=1024):
                    if chunk:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                return
            except Exception as e:
                log(f"Proxy streaming error: {e}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Authentication endpoint
        if path == '/api/admin/login':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                u = data.get('username', '').strip()
                p = data.get('password', '').strip()
                if u == ADMIN_USERNAME and p == ADMIN_PASSWORD_HASH:
                    token = hashlib.sha256(f"{ADMIN_USERNAME}:{ADMIN_PASSWORD_HASH}:proctoriq".encode('utf-8')).hexdigest()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True, 'token': token, 'username': ADMIN_USERNAME}).encode('utf-8'))
                    return
                else:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': 'Invalid administrator credentials. Access denied.'}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Add / manage candidate test records
        if path == '/api/admin/records':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                records = load_test_records()
                action = data.get('action')
                created_rec = None
                if action == 'delete':
                    rec_id = str(data.get('id') or '')
                    records = [r for r in records if str(r.get('id') or '') != rec_id]
                elif action == 'clear':
                    records = []
                else:
                    rec_id = data.get('id') or f"rec-{int(time.time()*1000)}"
                    test_id = str(data.get('testId') or '').strip()
                    cand_name = str(data.get('candidateName', 'Candidate Session') or 'Candidate Session').strip()
                    topic_name = str(data.get('topic', 'General Assessment') or 'General Assessment').strip()
                    is_demo = bool(data.get('isDemo', False) or test_id == 'demo-test-candidate' or 'demo' in topic_name.lower())
                    is_disqualified = bool(data.get('disqualified', False))
                    is_submitted = bool(data.get('submitted', False) or (not is_disqualified and data.get('status') == 'submitted'))

                    # Calculate sequential attempt number for this candidate & assessment/demo
                    prior_attempts = 0
                    for r in records:
                        r_cand = str(r.get('candidateName') or '').strip().lower()
                        if r_cand != cand_name.lower():
                            continue
                        r_is_demo = bool(r.get('isDemo', False) or r.get('testId') == 'demo-test-candidate' or 'demo' in str(r.get('topic') or '').lower())
                        if is_demo and r_is_demo:
                            prior_attempts += 1
                        elif not is_demo and ((test_id and r.get('testId') == test_id) or str(r.get('topic') or '').lower() == topic_name.lower()):
                            prior_attempts += 1

                    attempt_num = int(data.get('attemptNumber') or (prior_attempts + 1))
                    elapsed_sec = int(data.get('durationSec') or data.get('elapsedSec') or 0)
                    total_cnt = int(data.get('totalCount', 1))
                    correct_cnt = int(data.get('correctCount', 0))
                    skipped_cnt = int(data.get('skippedCount', 0))
                    incorrect_cnt = int(data.get('incorrectCount', max(0, total_cnt - correct_cnt - skipped_cnt)))

                    new_record = {
                        "id": rec_id,
                        "testId": test_id,
                        "testTitle": data.get('testTitle') or topic_name,
                        "isDemo": is_demo,
                        "attemptNumber": attempt_num,
                        "candidateName": cand_name,
                        "topic": topic_name,
                        "format": data.get('format', 'mcq'),
                        "score": round(float(data.get('score', 0)), 1),
                        "correctCount": correct_cnt,
                        "incorrectCount": incorrect_cnt,
                        "skippedCount": skipped_cnt,
                        "questionsAttempted": int(data.get('questionsAttempted', total_cnt - skipped_cnt)),
                        "totalCount": total_cnt,
                        "elapsedSec": elapsed_sec,
                        "durationSec": elapsed_sec,
                        "proctored": bool(data.get('proctored', True)),
                        "proctorOptions": data.get('proctorOptions', {}),
                        "disqualified": is_disqualified,
                        "violationReason": data.get('violationReason', ''),
                        "submitted": is_submitted,
                        "status": 'disqualified' if is_disqualified else ('submitted' if is_submitted else str(data.get('status') or 'unsubmitted')),
                        "tabSwitches": int(data.get('tabSwitches', 0)),
                        "soundWarnings": int(data.get('soundWarnings', 0)),
                        "fullscreenExits": int(data.get('fullscreenExits', 0)),
                        "windowBlurs": int(data.get('windowBlurs', 0)),
                        "proctorEvents": data.get('proctorEvents', [])[:150] if isinstance(data.get('proctorEvents'), list) else [],
                        "codingSummary": data.get('codingSummary', []) if isinstance(data.get('codingSummary'), list) else [],
                        "sqlSummary": data.get('sqlSummary', []) if isinstance(data.get('sqlSummary'), list) else [],
                        "questionDetails": data.get('questionDetails', []) if isinstance(data.get('questionDetails'), list) else [],
                        "timestamp": data.get('timestamp') or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    }
                    created_rec = new_record
                    records.insert(0, new_record)
                save_test_records(records)
                metrics = compute_admin_metrics(records)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'record': created_rec, 'records': records, 'metrics': metrics}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Create or delete custom tests
        if path == '/api/admin/custom-tests':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                tests = load_custom_tests()
                action = data.get('action')
                if action == 'delete':
                    test_id = data.get('id')
                    tests = [t for t in tests if t.get('id') != test_id]
                else:
                    test_item = data.get('test', data)
                    test_id = test_item.get('id') or f"test-{int(time.time()*1000)}"
                    is_assigned = bool(test_item.get('isAssigned', False))
                    proctor_opts = test_item.get('proctorOptions', {})
                    max_malpractice = int(test_item.get('maxMalpracticeAttempts') or (proctor_opts.get('maxMalpracticeAttempts') if isinstance(proctor_opts, dict) else 10) or 10)
                    allowed_attempts = int(test_item.get('allowedAttempts') or test_item.get('maxAttempts') or 1)
                    if not proctor_opts or not isinstance(proctor_opts, dict):
                        preset = test_item.get('proctorPreset', 'strict')
                        proctor_opts = {
                            "camera": preset != 'practice',
                            "mic": preset != 'practice',
                            "allowApps": preset == 'practice',
                            "fullscreen": preset == 'strict',
                            "maxMalpracticeAttempts": max_malpractice,
                            "allowedAttempts": allowed_attempts
                        }
                    else:
                        proctor_opts['maxMalpracticeAttempts'] = max_malpractice
                        proctor_opts['allowedAttempts'] = allowed_attempts

                    coding_cnt = int(test_item.get('codingCount', 1) or 1)
                    sql_cnt = int(test_item.get('sqlCount', 1) or 1)
                    mcq_cnt = int(test_item.get('mcqCount', 10) or 10)
                    mcq_tag = str(test_item.get('mcqTagline', '') or '').strip()

                    new_test = {
                        "id": test_id,
                        "title": test_item.get('title', 'Custom Assessment').strip(),
                        "topic": test_item.get('topic', 'General Programming').strip(),
                        "format": test_item.get('format', 'coding'),
                        "category": test_item.get('category', 'Algorithms'),
                        "difficulty": test_item.get('difficulty', 'Medium'),
                        "numQuestions": int(test_item.get('numQuestions', 1)),
                        "codingCount": coding_cnt,
                        "sqlCount": sql_cnt,
                        "mcqCount": mcq_cnt,
                        "mcqTagline": mcq_tag,
                        "timeLimitMin": int(test_item.get('timeLimitMin', 30)),
                        "allowedAttempts": allowed_attempts,
                        "maxAttempts": allowed_attempts,
                        "proctorPreset": test_item.get('proctorPreset', 'strict'),
                        "proctorOptions": proctor_opts,
                        "instructions": test_item.get('instructions', ''),
                        "scheduledStart": test_item.get('scheduledStart', ''),
                        "scheduledEnd": test_item.get('scheduledEnd', ''),
                        "isAssigned": is_assigned,
                        "status": test_item.get('status', 'active'),
                        "problemId": test_item.get('problemId', ''),
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    }
                    if is_assigned:
                        for ot in tests:
                            ot['isAssigned'] = False
                    tests.insert(0, new_test)
                save_custom_tests(tests)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                created_test = new_test if action != 'delete' else None
                self.wfile.write(json.dumps({'success': True, 'tests': tests, 'test': created_test}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Save proctoring system policy
        if path == '/api/admin/proctor-config':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                settings_path = os.path.join(EXE_DIR, 'settings.json')
                current_settings = {}
                if os.path.exists(settings_path):
                    try:
                        with open(settings_path, 'r', encoding='utf-8') as f:
                            current_settings = json.load(f)
                    except Exception:
                        pass
                policy = current_settings.get('proctorPolicy', dict(DEFAULT_PROCTOR_POLICY))
                policy.update(data)
                current_settings['proctorPolicy'] = policy
                with open(settings_path, 'w', encoding='utf-8') as f:
                    json.dump(current_settings, f, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'config': policy}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Reset Main Quiz Data (force unassign all tests & clear portal assignments)
        if path == '/api/admin/reset-mainquiz':
            try:
                tests = load_custom_tests()
                for t in tests:
                    t['isAssigned'] = False
                    t['scheduledStart'] = ''
                    t['scheduledEnd'] = ''
                save_custom_tests(tests)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'message': 'Main quiz portal reset successfully. All tests unassigned.', 'tests': tests}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Active assignment manager (Assign to Main App / Schedule)
        if path == '/api/admin/active-assignment':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                action = data.get('action', 'assign')
                test_id = data.get('testId')
                tests = load_custom_tests()
                assigned_test = None

                if action == 'assign':
                    for t in tests:
                        if t.get('id') == test_id:
                            t['isAssigned'] = True
                            if 'proctorOptions' in data and isinstance(data['proctorOptions'], dict):
                                t['proctorOptions'] = data['proctorOptions']
                            if 'allowedAttempts' in data or 'maxAttempts' in data:
                                t['allowedAttempts'] = int(data.get('allowedAttempts') or data.get('maxAttempts') or 1)
                                t['maxAttempts'] = t['allowedAttempts']
                            assigned_test = t
                        else:
                            t['isAssigned'] = False
                elif action in ('unassign', 'reset'):
                    for t in tests:
                        t['isAssigned'] = False
                        t['scheduledStart'] = ''
                        t['scheduledEnd'] = ''
                elif action == 'schedule' or 'isAssigned' in data or 'scheduledStart' in data:
                    for t in tests:
                        if t.get('id') == test_id:
                            if 'scheduledStart' in data: t['scheduledStart'] = data['scheduledStart']
                            if 'scheduledEnd' in data: t['scheduledEnd'] = data['scheduledEnd']
                            if 'status' in data: t['status'] = data['status']
                            if 'proctorOptions' in data and isinstance(data['proctorOptions'], dict):
                                t['proctorOptions'] = data['proctorOptions']
                            if 'allowedAttempts' in data or 'maxAttempts' in data:
                                t['allowedAttempts'] = int(data.get('allowedAttempts') or data.get('maxAttempts') or 1)
                                t['maxAttempts'] = t['allowedAttempts']
                            if 'isAssigned' in data:
                                t['isAssigned'] = bool(data['isAssigned'])
                                if t['isAssigned']:
                                    assigned_test = t
                    if assigned_test:
                        for t in tests:
                            if t.get('id') != assigned_test.get('id'):
                                t['isAssigned'] = False

                save_custom_tests(tests)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'assignedTest': assigned_test, 'tests': tests}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Save system configuration (Taufa cookie/session, OmniRoute API, custom prompts)
        if path == '/api/admin/system-config':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                data = json.loads(post_body)
                settings_path = os.path.join(EXE_DIR, 'settings.json')
                current_settings = {}
                if os.path.exists(settings_path):
                    try:
                        with open(settings_path, 'r', encoding='utf-8') as f:
                            current_settings = json.load(f)
                    except Exception:
                        pass

                # 1. Update Taufa Cookie if passed
                new_cookie = data.get('taufaCookie', '').strip()
                if new_cookie:
                    save_dual_cookie_file(new_cookie, cookie_type='taufa')

                # 2. Update Conversation ID if passed
                if 'conversationId' in data:
                    current_settings['conversationId'] = data['conversationId'].strip()

                # 3. Update OmniRoute Configuration
                if 'omniRoute' in data:
                    current_settings['omniRouteConfig'] = data['omniRoute']
                    if 'apiKey' in data['omniRoute']:
                        current_settings['omniRouteKey'] = data['omniRoute']['apiKey']

                # 4. Update Taufa Prompt Command Templates
                if 'taufaPrompts' in data:
                    current_settings['taufaPrompts'] = data['taufaPrompts']

                # 5. Update MySQL Config
                if 'mysqlConfig' in data:
                    current_settings['mysqlConfig'] = data['mysqlConfig']

                with open(settings_path, 'w', encoding='utf-8') as f:
                    json.dump(current_settings, f, indent=2)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
                return

        # Admin: Start or restart OmniRoute headless process
        if path == '/api/admin/start-omniroute':
            start_omniroute_headless()
            time.sleep(0.5)
            is_running = False
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    is_running = (s.connect_ex(('127.0.0.1', 20128)) == 0)
            except Exception:
                is_running = False
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'running': is_running}).encode('utf-8'))
            return

        # Admin: Test OmniRoute live connection
        if path == '/api/admin/test-omniroute':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                req_data = json.loads(post_body) if post_body else {}
                url = req_data.get('url') or 'http://localhost:20128/v1/chat/completions'
                key = req_data.get('apiKey', '')
                model = req_data.get('model', 'gpt-4o-mini')

                start_t = time.time()
                headers = {'Content-Type': 'application/json'}
                if key: headers['Authorization'] = f'Bearer {key}'

                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": "Ping test: reply with 'OmniRoute Online'"}],
                    "max_tokens": 20
                }
                res = requests.post(url, json=payload, headers=headers, timeout=6)
                latency = int((time.time() - start_t) * 1000)

                if res.status_code == 200:
                    res_json = res.json()
                    choices = res_json.get('choices', [])
                    reply = choices[0]['message']['content'] if choices else 'Connection OK'
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True, 'latencyMs': latency, 'reply': reply, 'model': model}).encode('utf-8'))
                    return
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'statusCode': res.status_code, 'error': f"HTTP {res.status_code}: {res.text[:200]}"}).encode('utf-8'))
                    return
            except Exception as e:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                return

        # Admin: Test Taufa streaming prompt live
        if path == '/api/admin/test-taufa':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len).decode('utf-8', errors='ignore')
            try:
                req_data = json.loads(post_body) if post_body else {}
                prompt = req_data.get('prompt') or 'Respond with: "Taufa AI Connection Live"'
                
                conv_id = req_data.get('conversationId') or '000e9900-de38-46e9-aa31-c5f36d696dc3'
                body = {
                    "conversationId": conv_id,
                    "toolMode": "auto",
                    "id": conv_id,
                    "messages": [{
                        "id": f"test-{int(time.time()*1000)}",
                        "role": "user",
                        "parts": [{"type": "text", "text": prompt}]
                    }]
                }

                start_t = time.time()
                headers = {
                    'Content-Type': 'application/json',
                    'Cookie': SESSION_COOKIE,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Origin': 'https://taufa.ai',
                    'Referer': 'https://taufa.ai/'
                }

                res = requests.post('https://taufa.ai/api/chat', json=body, headers=headers, stream=True, timeout=12)
                first_chunk = ''
                for chunk in res.iter_content(chunk_size=1024):
                    if chunk:
                        first_chunk += chunk.decode('utf-8', errors='ignore')
                        if len(first_chunk) > 200:
                            break
                latency = int((time.time() - start_t) * 1000)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': (res.status_code == 200),
                    'statusCode': res.status_code,
                    'latencyMs': latency,
                    'preview': first_chunk[:300]
                }).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                return

        self.send_error(404, "Not Found")

# ── Dynamic Free Port Finder ──────────────────────────────────────────────────
def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

# ── Low-Level Kiosk Keyboard Hook (Blocks Alt+Tab, Win, Alt+Esc, etc.) ─────────
_keyboard_hook = None
_hook_proc_ref = None

def install_kiosk_keyboard_hook():
    global _keyboard_hook, _hook_proc_ref
    if _keyboard_hook:
        return
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        WH_KEYBOARD_LL = 13
        VK_TAB = 0x09
        VK_ESCAPE = 0x1B
        VK_SPACE = 0x20
        VK_LWIN = 0x5B
        VK_RWIN = 0x5C
        VK_F4 = 0x73
        VK_F11 = 0x7A

        class KBDLLHOOKSTRUCT(ctypes.Structure):
            _fields_ = [
                ('vkCode', wintypes.DWORD),
                ('scanCode', wintypes.DWORD),
                ('flags', wintypes.DWORD),
                ('time', wintypes.DWORD),
                ('dwExtraInfo', ctypes.c_ulonglong)
            ]

        LRESULT = ctypes.c_longlong
        HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, ctypes.POINTER(KBDLLHOOKSTRUCT))

        user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
        user32.SetWindowsHookExW.restype = wintypes.HHOOK

        user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, ctypes.POINTER(KBDLLHOOKSTRUCT)]
        user32.CallNextHookEx.restype = LRESULT

        user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
        user32.UnhookWindowsHookEx.restype = wintypes.BOOL

        def _hook_callback(nCode, wParam, lParam):
            if nCode >= 0 and lParam:
                try:
                    kb = lParam.contents
                    vk = kb.vkCode
                    flags = kb.flags
                    is_alt = bool(flags & 0x20)
                    is_ctrl = bool(user32.GetKeyState(0x11) & 0x8000)

                    # 1. Alt + Tab (Switch application / tabs)
                    if vk == VK_TAB and is_alt:
                        return 1
                    # 2. Alt + Esc (Cycle windows)
                    if vk == VK_ESCAPE and is_alt:
                        return 1
                    # 3. Alt + Space (Window control menu)
                    if vk == VK_SPACE and is_alt:
                        return 1
                    # 4. Alt + F4 (Close window)
                    if vk == VK_F4 and is_alt:
                        return 1
                    # 5. Windows key (Start menu, Win+Tab, Win shortcuts)
                    if vk in (VK_LWIN, VK_RWIN):
                        return 1
                    # 6. Ctrl + Esc (Start menu)
                    if vk == VK_ESCAPE and is_ctrl:
                        return 1
                    # 7. Ctrl + Tab / Ctrl + Shift + Tab (Switch tabs in browser)
                    if vk == VK_TAB and is_ctrl:
                        return 1
                    # 8. Ctrl + T, Ctrl + N, Ctrl + W (New tab, new window, close tab)
                    if is_ctrl and vk in (0x54, 0x4E, 0x57):  # T, N, W
                        return 1
                    # 9. F11 (Fullscreen toggle exit)
                    if vk == VK_F11:
                        return 1
                except Exception:
                    pass

            return user32.CallNextHookEx(None, nCode, wParam, lParam)

        _hook_proc_ref = HOOKPROC(_hook_callback)
        _keyboard_hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, _hook_proc_ref, None, 0)
        log(f"[KioskLockdown] Low-level keyboard hook active: {bool(_keyboard_hook)}")
    except Exception as e:
        log(f"[KioskLockdown] Hook installation error: {e}")

def uninstall_kiosk_keyboard_hook():
    global _keyboard_hook
    if _keyboard_hook:
        try:
            import ctypes
            ctypes.windll.user32.UnhookWindowsHookEx(_keyboard_hook)
            log("[KioskLockdown] Keyboard hook uninstalled")
        except Exception:
            pass
        _keyboard_hook = None

try:
    import atexit
    atexit.register(uninstall_kiosk_keyboard_hook)
except Exception:
    pass

# ── Force Fullscreen Kiosk Mode (Hides Taskbar & Removes Titlebar) ─────────────
def force_window_fullscreen(window_holder):
    w = window_holder.get('window')
    if not w:
        return False
    try:
        from webview.platforms.winforms import BrowserView
        import clr
        clr.AddReference('System.Windows.Forms')
        import System.Windows.Forms as WinForms
        from System import Action
        import ctypes

        inst = BrowserView.instances.get(w.uid)
        if inst:
            def _apply():
                try:
                    screen = WinForms.Screen.FromControl(inst)
                    inst.FormBorderStyle = getattr(WinForms.FormBorderStyle, 'None')
                    inst.WindowState = WinForms.FormWindowState.Normal
                    inst.Bounds = screen.Bounds
                    inst.TopMost = True
                    inst.WindowState = WinForms.FormWindowState.Maximized

                    hwnd = int(inst.Handle.ToInt64())
                    # HWND_TOPMOST (-1) ensures window overlays the Windows Taskbar completely
                    # SWP_SHOWWINDOW (0x0040) | SWP_FRAMECHANGED (0x0020)
                    ctypes.windll.user32.SetWindowPos(
                        hwnd,
                        -1,
                        int(screen.Bounds.X),
                        int(screen.Bounds.Y),
                        int(screen.Bounds.Width),
                        int(screen.Bounds.Height),
                        0x0040 | 0x0020
                    )
                    ctypes.windll.user32.BringWindowToTop(hwnd)
                    ctypes.windll.user32.SetForegroundWindow(hwnd)

                    inst.is_fullscreen = True
                    window_holder['is_fullscreen'] = True

                    # Refocus-lock: automatically reactivate if window loses focus
                    def _on_deactivate(sender, args):
                        try:
                            if window_holder.get('is_fullscreen', True):
                                inst.Activate()
                                inst.BringToFront()
                                inst.Focus()
                                ctypes.windll.user32.SetForegroundWindow(hwnd)
                        except Exception:
                            pass
                    try:
                        inst.Deactivate -= WinForms.EventHandler(_on_deactivate)
                    except Exception:
                        pass
                    inst.Deactivate += WinForms.EventHandler(_on_deactivate)

                except Exception as ex:
                    log(f"WinForms inner fullscreen error: {ex}")

            if inst.InvokeRequired:
                inst.Invoke(Action(_apply))
            else:
                _apply()
            return True
    except Exception as e:
        log(f"WinForms force fullscreen error: {e}")

    try:
        if w:
            w.toggle_fullscreen()
            window_holder['is_fullscreen'] = True
            return True
    except Exception as e:
        log(f"w.toggle_fullscreen error: {e}")
    return False

def restore_window_fullscreen(window_holder):
    w = window_holder.get('window')
    if not w:
        return False
    try:
        from webview.platforms.winforms import BrowserView
        import clr
        clr.AddReference('System.Windows.Forms')
        import System.Windows.Forms as WinForms
        from System import Action
        import ctypes

        inst = BrowserView.instances.get(w.uid)
        if inst:
            def _restore():
                try:
                    inst.TopMost = False
                    inst.FormBorderStyle = getattr(WinForms.FormBorderStyle, 'Sizable')
                    inst.WindowState = WinForms.FormWindowState.Normal
                    hwnd = int(inst.Handle.ToInt64())
                    ctypes.windll.user32.SetWindowPos(
                        hwnd,
                        -2,  # HWND_NOTOPMOST
                        0, 0, 0, 0,
                        0x0001 | 0x0002 | 0x0020  # SWP_NOSIZE | SWP_NOMOVE | SWP_FRAMECHANGED
                    )
                    inst.is_fullscreen = False
                    window_holder['is_fullscreen'] = False
                except Exception as ex:
                    log(f"WinForms inner restore error: {ex}")

            if inst.InvokeRequired:
                inst.Invoke(Action(_restore))
            else:
                _restore()
            return True
    except Exception as e:
        log(f"WinForms restore error: {e}")

    try:
        if w:
            w.toggle_fullscreen()
            window_holder['is_fullscreen'] = False
            return True
    except Exception as e:
        log(f"w.toggle_fullscreen exit error: {e}")
    return False

# ── Desktop Window API Bridge ─────────────────────────────────────────────────
class DesktopAPI:
    def __init__(self, window_holder):
        self.window_holder = window_holder

    def enter_fullscreen(self):
        return force_window_fullscreen(self.window_holder)

    def exit_fullscreen(self):
        return restore_window_fullscreen(self.window_holder)

    def is_fullscreen(self):
        return bool(self.window_holder.get('is_fullscreen', False))

    def scan_prohibited_tools(self):
        return scan_prohibited_tools()

    def close_app(self):
        uninstall_kiosk_keyboard_hook()
        w = self.window_holder.get('window')
        if w:
            try:
                w.destroy()
            except Exception:
                pass
        os._exit(0)

class HighBacklogThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = 128
    allow_reuse_address = True
    daemon_threads = True

    def shutdown_request(self, request):
        try:
            request.shutdown(socket.SHUT_WR)
            request.settimeout(0.5)
            while request.recv(4096):
                pass
        except Exception:
            pass
        self.close_request(request)

# ── Main Entrypoint ────────────────────────────────────────────────────────────
def main():
    start_omniroute_headless()

    port = 3000
    try:
        server = HighBacklogThreadingHTTPServer(('127.0.0.1', port), ProctorHTTPHandler)
    except OSError:
        port = get_free_port()
        server = HighBacklogThreadingHTTPServer(('127.0.0.1', port), ProctorHTTPHandler)

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    log(f"[MdaExamBrowser] Background server running on http://127.0.0.1:{port}")

    if '--server-only' in sys.argv:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        return

    desktop_api = DesktopAPI(ACTIVE_WINDOW_HOLDER)

    # Immediately create window in full screen & topmost mode
    window = webview.create_window(
        title='MdaExamBrowser • Secure Proctored Examination Suite',
        url=f'http://127.0.0.1:{port}/index.html',
        width=1280,
        height=840,
        min_size=(960, 600),
        background_color='#08090f',
        js_api=desktop_api,
        text_select=True,
        zoomable=False,
        fullscreen=True,
        on_top=True
    )
    ACTIVE_WINDOW_HOLDER['window'] = window
    ACTIVE_WINDOW_HOLDER['is_fullscreen'] = True

    def on_shown():
        force_window_fullscreen(ACTIVE_WINDOW_HOLDER)
        install_kiosk_keyboard_hook()

    window.events.shown += on_shown

    # Proactive background daemon to guarantee kiosk fullscreen and keyboard hook immediately
    def _enforce_startup_kiosk():
        time.sleep(0.3)
        force_window_fullscreen(ACTIVE_WINDOW_HOLDER)
        install_kiosk_keyboard_hook()
        time.sleep(1.0)
        force_window_fullscreen(ACTIVE_WINDOW_HOLDER)
        install_kiosk_keyboard_hook()

    threading.Thread(target=_enforce_startup_kiosk, daemon=True).start()

    webview.start(gui='edgechromium', debug=False)

    uninstall_kiosk_keyboard_hook()

    try:
        server.shutdown()
        server.server_close()
    except Exception:
        pass

if __name__ == '__main__':
    main()
