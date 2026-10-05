# MdaExamBrowser • AI-Proctored Examination & Coding Assessment Platform

**Live Static Web App (GitHub Pages):** [https://glokadhi.github.io/mda-exam-proctor/](https://glokadhi.github.io/mda-exam-proctor/)

MdaExamBrowser (ProctorIQ) is a real-time AI-proctored online examination platform supporting Multiple-Choice Questions (MCQs), LeetCode Coding Challenges (`Python`, `Java`, `C`, `C++`), and Relational SQL Challenges with live multi-signal proctoring.

---

## Key Features

### 1. Multi-Signal Real-Time AI Proctoring (`proctor.js`)
- **Persistent Animated AI Proctor Bot (`#aiProctorBot`)**: Dual eye-tracking assistant that mirrors candidate gaze direction, blinks naturally, displays live proctoring state (`IDLE`, `WATCHING`, `ANALYZING`, `WARNING`, `VOICE_DETECTED`, `LOOKING_AWAY`, `MULTIPLE_FACE`, `CAMERA_ERROR`, `MIC_ERROR`), and provides cooldown-controlled contextual guidance.
- **3-Signal Speaking Fusion Engine**: Combines:
  1. **WebAudio Voice Activity Detection (VAD)** (band-pass `85–3500 Hz`, adaptive noise floor, speech duration filtering)
  2. **Lip / Mouth Aperture & Temporal Variance Tracking** (`MOUTH_CLOSED`, `MOUTH_SLIGHTLY_OPEN`, `MOUTH_MOVING`, `POSSIBLE_SPEAKING`)
  3. **Eye-Gaze & Head-Pose Estimation** (`Yaw`, `Pitch`, `Roll`, off-monitor persistence)
- **Focus & Integrity Protection**:
  - Controlled keyboard shortcuts inside the protected exam workspace: allows `Ctrl+Z` (Undo), `Ctrl+Y` / `Ctrl+Shift+Z` (Redo), `Ctrl+Enter` (Run Code), and `Tab` indentation while blocking and logging `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`, and `Shift+Insert`.
  - Tracks `TAB_SWITCH`, `WINDOW_FOCUS_LOST`, and `FULLSCREEN_EXIT` with away-duration telemetry.

### 2. Permanent 10-Question Demo Proctoring Test
- Always available on the Student Dashboard without requiring administrator assignment.
- Includes **8 introductory MCQs**, **1 LeetCode Coding Challenge** (`Problem #2235 — Add Two Integers`), and **1 SQL Challenge** (`SELECT * FROM Student;`).
- Supports **unlimited sequential attempts** (`Demo Attempt #1`, `Demo Attempt #2`, etc.) with full per-attempt telemetry reports.

### 3. Decoupled LeetCode Adapter & Multi-Language Workspace (`leetcode.js`, `quiz.js`)
- `QuestionProvider` → `QuestionNormalizer` → `Exam Question Model` → `Code Runner` architecture with metadata caching and offline dataset resilience.
- Displays authentic LeetCode problem numbers (`Problem #XXXX — Title`), difficulty badges, examples, constraints, and test case execution results.

### 4. Self-Contained Static HTML Mode (`static_backend.js`)
- Runs 100% client-side as a static HTML application on GitHub Pages (`index.html`) using `localStorage` persistence and an in-browser code & SQL execution engine.
- Also supports running locally with the full Python desktop/compiler server (`python app.py`).
