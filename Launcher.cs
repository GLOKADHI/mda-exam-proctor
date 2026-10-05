using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class Program {
    [STAThread]
    static void Main() {
        try {
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --unsafely-treat-insecure-origin-as-secure=http://localhost:3000,http://127.0.0.1:3000 --enable-features=MediaStream,ShapeDetection --enable-usermedia-screen-capturing --allow-file-access-from-files");

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            
            // 1. Look for app.py and a python runtime
            string appPy = Path.Combine(baseDir, "app.py");
            if (!File.Exists(appPy)) {
                appPy = @"C:\Users\lokad\Music\quiz\app.py";
            }

            string pythonExe = null;
            string[] pythonCandidates = new string[] {
                @"C:\Program Files\Python314\pythonw.exe",
                @"C:\Program Files\Python314\python.exe"
            };

            if (File.Exists(appPy)) {
                foreach (string py in pythonCandidates) {
                    if (File.Exists(py)) {
                        pythonExe = py;
                        break;
                    }
                }
                if (pythonExe == null) {
                    try {
                        ProcessStartInfo checkPsi = new ProcessStartInfo("python", "--version");
                        checkPsi.UseShellExecute = false;
                        checkPsi.CreateNoWindow = true;
                        Process p = Process.Start(checkPsi);
                        if (p != null) {
                            p.WaitForExit(1000);
                            if (p.ExitCode == 0) pythonExe = "python";
                        }
                    } catch {}
                }
            }

            // 2. If Python + app.py is available, launch directly for fastest, freshest execution
            if (File.Exists(appPy) && pythonExe != null) {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = pythonExe;
                psi.Arguments = "\"" + appPy + "\"";
                psi.WorkingDirectory = Path.GetDirectoryName(appPy);
                psi.UseShellExecute = true;
                Process.Start(psi);
                return;
            }

            // 3. Fallback to compiled dist\ProctorIQ\ProctorIQ.exe
            string[] possiblePaths = new string[] {
                Path.Combine(baseDir, "dist", "ProctorIQ", "ProctorIQ.exe"),
                Path.Combine(baseDir, "ProctorIQ", "ProctorIQ.exe"),
                Path.Combine(baseDir, "ProctorIQ.exe"),
                @"C:\Users\lokad\Music\quiz\dist\ProctorIQ\ProctorIQ.exe"
            };

            string target = null;
            foreach (string p in possiblePaths) {
                if (File.Exists(p)) {
                    target = Path.GetFullPath(p);
                    break;
                }
            }

            if (target == null) {
                MessageBox.Show(
                    "Could not find MdaExamBrowser application engine in:\n" + baseDir + "\n\nPlease ensure dist\\ProctorIQ\\ProctorIQ.exe is present.",
                    "MdaExamBrowserr Launcher",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            ProcessStartInfo psiExe = new ProcessStartInfo();
            psiExe.FileName = target;
            psiExe.WorkingDirectory = Path.GetDirectoryName(target);
            psiExe.UseShellExecute = true;
            Process.Start(psiExe);
        } catch (Exception ex) {
            MessageBox.Show("Error starting MdaExamBrowserr:\n" + ex.Message, "MdaExamBrowserr Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
