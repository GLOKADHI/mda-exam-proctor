/**
 * app.js – Screen routing, exam format selection, launchers, settings, and native fullscreen
 */

// ─── Init on Load ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  API.loadSettings().catch(() => {});
  checkActiveAssignment().catch(() => {});
  if (typeof refreshStudentDashboard === 'function') {
    refreshStudentDashboard().catch(() => {});
  }
  setTimeout(() => initAdminCreateTestForm(), 300);

  // Enforce fullscreen immediately when opening the application
  try {
    if (typeof API !== 'undefined' && API.enterFullscreen) {
      API.enterFullscreen().catch(() => {});
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.enter_fullscreen) {
      window.pywebview.api.enter_fullscreen().catch(() => {});
    }
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (_) {}
});

// Enforce browser fullscreen on first user interaction if opening in standard browser
const ensureBrowserFullscreenOnFirstInteraction = () => {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (typeof API !== 'undefined' && API.enterFullscreen) {
    API.enterFullscreen().catch(() => {});
  }
};
document.addEventListener('click', ensureBrowserFullscreenOnFirstInteraction, { once: true });
document.addEventListener('keydown', ensureBrowserFullscreenOnFirstInteraction, { once: true });

// ─── Screen Routing ────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  const navbar = document.querySelector('.app-navbar');
  if (navbar) {
    if (id === 'quizScreen') {
      navbar.style.display = 'none';
      document.body.classList.add('in-exam');
    } else {
      navbar.style.display = '';
      document.body.classList.remove('in-exam');
    }
  }

  if (id === 'landing') {
    if (typeof checkActiveAssignment === 'function') {
      checkActiveAssignment().catch(() => {});
    }
    if (typeof refreshStudentDashboard === 'function') {
      refreshStudentDashboard().catch(() => {});
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  if (typeof PROCTOR !== 'undefined') PROCTOR.stop();
  showScreen('landing');
  if (typeof checkActiveAssignment === 'function') {
    checkActiveAssignment().catch(() => {});
  }
  if (typeof refreshStudentDashboard === 'function') {
    refreshStudentDashboard().catch(() => {});
  }
  setTimeout(() => {
    const input = document.getElementById('quizTopic');
    if (input) input.focus();
  }, 100);
}

function openSettings() {
  const settings = API.getSettings();
  const keyInput = document.getElementById('omniRouteKeyInput');
  if (keyInput && settings.omniRouteKey) {
    keyInput.value = settings.omniRouteKey;
  }
  showScreen('settingsScreen');
}

// ─── Application Exit Handler ─────────────────────────────────────────────────
async function exitApp() {
  if (!confirm('Are you sure you want to close and exit ProctorIQ?')) return;
  try {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.close_app) {
      await window.pywebview.api.close_app();
      return;
    }
  } catch (_) {}
  try {
    await fetch('/api/app/exit', { method: 'POST' });
  } catch (_) {}
  window.close();
}

// ─── Candidate Attempt & Malpractice Status Evaluator ─────────────────────────
async function getCandidateTestStatus(testTitle, testTopic, testId) {
  const candidateName = (sessionStorage.getItem('proctoriq_candidate_name') || document.getElementById('candidateNameInput')?.value || 'Student').trim().toLowerCase();
  try {
    const data = await API.getAdminRecords();
    const records = (data && data.records) || [];
    const matching = records.filter(r => {
      const recUser = (r.candidateName || '').trim().toLowerCase();
      if (candidateName && candidateName !== 'student' && recUser !== candidateName) return false;
      const recTopic = (r.topic || '').trim().toLowerCase();
      const tTopic = (testTopic || '').trim().toLowerCase();
      const tTitle = (testTitle || '').trim().toLowerCase();
      const recTestId = r.testId || '';
      
      // Strict matching: if testId exists in record and test, match strictly by testId
      if (recTestId && testId) {
        return recTestId === testId;
      }
      // If no testId available, match exact topic or title
      if (recTopic && (recTopic === tTopic || recTopic === tTitle)) {
        return true;
      }
      return false;
    });

    const isMalpractice = matching.some(r => r.disqualified === true);
    const malpracticeRec = matching.find(r => r.disqualified === true);
    const malpracticeReason = malpracticeRec ? (malpracticeRec.violationReason || 'Proctoring security malpractice violation') : '';

    // "for number of attempts the count is set to 1 only when quiz is submitted"
    // An attempt is counted strictly when it was submitted (or completed)
    const submittedRecords = matching.filter(r => r.submitted === true || r.status === 'submitted');
    const completedAttempts = submittedRecords.length;

    return {
      matching,
      submittedRecords,
      completedAttempts,
      isMalpractice,
      malpracticeReason
    };
  } catch (err) {
    console.warn('Error evaluating candidate test status:', err);
    return { matching: [], submittedRecords: [], completedAttempts: 0, isMalpractice: false, malpracticeReason: '' };
  }
}

// ─── Administrator Assigned Exam Dispatcher ────────────────────────────────────
let currentAssignedTest = null;

async function checkActiveAssignment(forceAlert = false) {
  try {
    const data = await API.getActiveAssignment();
    const card = document.getElementById('assignedExamCard');
    const noCard = document.getElementById('noAssignedExamCard');

    if (data && data.success && data.assignedTest) {
      currentAssignedTest = data.assignedTest;
      const t = currentAssignedTest;

      const titleEl = document.getElementById('aecTitle');
      const descEl = document.getElementById('aecDesc');
      const formatEl = document.getElementById('aecFormat');
      const topicEl = document.getElementById('aecTopic');
      const timeLimitEl = document.getElementById('aecTimeLimit');
      const diffEl = document.getElementById('aecDifficulty');
      const badgesWrap = document.getElementById('aecProctorBadges');
      const statusBadge = document.getElementById('aecScheduleStatus');
      const startBtn = document.getElementById('aecStartBtn');
      const noteEl = document.getElementById('aecScheduleNote');
      const attemptsBadge = document.getElementById('aecAttempts');

      if (titleEl) titleEl.textContent = t.title || 'Assigned Assessment';
      if (descEl) descEl.textContent = t.instructions || (t.topic ? `Topic: ${t.topic}` : 'Configured by Administrator • Full Proctoring Active');
      if (formatEl) formatEl.textContent = (t.format || 'coding').toUpperCase();
      if (topicEl) topicEl.textContent = t.topic || 'General';
      if (timeLimitEl) timeLimitEl.textContent = `${t.timeLimitMin || 30} Mins`;
      if (diffEl) diffEl.textContent = t.difficulty || 'Medium';

      const opts = t.proctorOptions || {
        camera: t.proctorPreset !== 'practice',
        mic: t.proctorPreset !== 'practice',
        allowApps: t.proctorPreset === 'practice',
        fullscreen: t.proctorPreset === 'strict'
      };

      if (badgesWrap) {
        badgesWrap.innerHTML = `
          <span class="tbl-badge ${opts.camera ? 'format-coding' : 'format-mcq'}">📷 Cam: ${opts.camera ? 'ON' : 'OFF'}</span>
          <span class="tbl-badge ${opts.mic ? 'format-coding' : 'format-mcq'}">🎙️ Mic: ${opts.mic ? 'ON' : 'OFF'}</span>
          <span class="tbl-badge ${opts.allowApps ? 'format-hybrid' : 'format-coding'}">💻 Apps: ${opts.allowApps ? 'Allowed' : 'Blocked'}</span>
          <span class="tbl-badge ${opts.fullscreen ? 'format-sql' : 'format-mcq'}">⛶ Fullscreen: ${opts.fullscreen ? 'ON' : 'OFF'}</span>
        `;
      }

      // Verification of Candidate Attempts & Malpractice Status
      const candStatus = await getCandidateTestStatus(t.title, t.topic, t.id);
      const allowedAttempts = Number(t.allowedAttempts || t.maxAttempts || (t.proctorOptions && t.proctorOptions.allowedAttempts) || 1);
      const isUnlimited = allowedAttempts >= 999;

      if (attemptsBadge) {
        attemptsBadge.textContent = isUnlimited
          ? `${candStatus.completedAttempts} / Unlimited`
          : `${candStatus.completedAttempts} / ${allowedAttempts} Submissions`;
      }

      if (candStatus.isMalpractice) {
        if (statusBadge) {
          statusBadge.textContent = '🚫 BLOCKED (MALPRACTICE)';
          statusBadge.className = 'aec-schedule-status expired';
          statusBadge.style.background = 'rgba(239, 68, 68, 0.25)';
          statusBadge.style.color = '#f87171';
          statusBadge.style.border = '1px solid rgba(239, 68, 68, 0.5)';
        }
        if (startBtn) {
          startBtn.disabled = true;
          startBtn.style.opacity = '0.65';
          startBtn.style.cursor = 'not-allowed';
          startBtn.style.background = '#7f1d1d';
          startBtn.innerHTML = '<span>🚫</span><span>Assessment Blocked (Malpractice)</span>';
        }
        if (noteEl) {
          noteEl.innerHTML = `<span style="color:#f87171; font-weight:700;">🚫 Assessment Blocked: You were disqualified for proctoring malpractice ("${candStatus.malpracticeReason}"). Retaking this exam is strictly prohibited.</span>`;
        }
        if (card) card.style.display = 'block';
        if (noCard) noCard.style.display = 'none';
        return;
      }

      if (!isUnlimited && candStatus.completedAttempts >= allowedAttempts) {
        if (statusBadge) {
          statusBadge.textContent = '🔒 CLOSED (MAX ATTEMPTS)';
          statusBadge.className = 'aec-schedule-status expired';
          statusBadge.style.background = 'rgba(100, 116, 139, 0.25)';
          statusBadge.style.color = '#94a3b8';
          statusBadge.style.border = '1px solid rgba(100, 116, 139, 0.5)';
        }
        if (startBtn) {
          startBtn.disabled = true;
          startBtn.style.opacity = '0.65';
          startBtn.style.cursor = 'not-allowed';
          startBtn.style.background = '#374151';
          startBtn.innerHTML = `<span>🔒</span><span>Assessment Closed (${candStatus.completedAttempts}/${allowedAttempts} Attempts)</span>`;
        }
        if (noteEl) {
          noteEl.innerHTML = `<span style="color:#fbbf24; font-weight:600;">🔒 Assessment Closed: You have completed all allowed attempts (${candStatus.completedAttempts}/${allowedAttempts}) for this assessment.</span>`;
        }
        if (card) card.style.display = 'block';
        if (noCard) noCard.style.display = 'none';
        return;
      }

      // Schedule window verification: Quiz appears ONLY at the scheduled date and time
      const now = new Date();
      let isWindowOpen = true;
      let statusText = '🟢 OPEN NOW';
      let statusClass = 'active';
      let noteText = '';

      if (t.scheduledStart) {
        const start = new Date(t.scheduledStart);
        if (now < start) {
          isWindowOpen = false;
          // Condition 4: The quiz should appear ONLY at the scheduled date and time!
          if (card) card.style.display = 'none';
          if (noCard) {
            noCard.style.display = 'block';
            const title = noCard.querySelector('.naec-title');
            const desc = noCard.querySelector('.naec-desc');
            const diffMs = start.getTime() - now.getTime();
            const hrs = Math.floor(diffMs / (1000 * 60 * 60));
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
            const countdownStr = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

            if (title) title.innerHTML = `⏳ Upcoming Scheduled Exam: ${escHtml(t.title)}`;
            if (desc) desc.innerHTML = `This examination is configured by your administrator and will <strong>appear and unlock automatically</strong> on:<br><strong style="color:#fff; font-size:1rem;">📅 ${start.toLocaleString()}</strong><br><br><span style="display:inline-block; background:rgba(99,102,241,0.18); border:1px solid rgba(99,102,241,0.35); padding:0.4rem 0.85rem; border-radius:6px; font-weight:700; color:#a5b4fc;">⏰ Unlocks In: ${countdownStr}</span>`;
          }
          if (forceAlert) {
            alert(`⏳ Scheduled Assessment: "${t.title}"\n\nOpens at: ${start.toLocaleString()}\nThis test will appear automatically when the time arrives.`);
          }
          return;
        }
      }

      if (t.scheduledEnd) {
        const end = new Date(t.scheduledEnd);
        if (now > end) {
          isWindowOpen = false;
          if (card) card.style.display = 'none';
          if (noCard) {
            noCard.style.display = 'block';
            const title = noCard.querySelector('.naec-title');
            const desc = noCard.querySelector('.naec-desc');
            if (title) title.textContent = '🔴 Assessment Window Expired';
            if (desc) desc.textContent = `The examination window for "${t.title}" closed on ${end.toLocaleString()}. Please contact your instructor.`;
          }
          return;
        } else {
          noteText = `Window closes at ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      }

      if (statusBadge) {
        statusBadge.textContent = statusText;
        statusBadge.className = `aec-schedule-status ${statusClass}`;
      }

      if (startBtn) {
        startBtn.disabled = !isWindowOpen;
        startBtn.style.opacity = isWindowOpen ? '1' : '0.5';
        startBtn.style.cursor = isWindowOpen ? 'pointer' : 'not-allowed';
        startBtn.style.background = '';
        if (candStatus.completedAttempts > 0) {
          startBtn.innerHTML = `<span>🚀</span><span>Retake Assessment (${candStatus.completedAttempts}/${isUnlimited ? '∞' : allowedAttempts} Completed)</span>`;
        } else {
          startBtn.innerHTML = '<span>🚀</span><span>Start Assigned Examination</span>';
        }
      }

      if (noteEl) noteEl.textContent = noteText;
      if (card) card.style.display = 'block';
      if (noCard) noCard.style.display = 'none';

      if (forceAlert) {
        alert(`✅ Active assessment found: "${t.title}". Ready for launch.`);
      }
    } else {
      currentAssignedTest = null;
      if (card) card.style.display = 'none';
      if (noCard) {
        noCard.style.display = 'block';
        const title = noCard.querySelector('.naec-title');
        const desc = noCard.querySelector('.naec-desc');
        if (title) title.textContent = 'Awaiting Assessment Dispatch';
        if (desc) desc.textContent = 'There is currently no assessment assigned by your instructor or administrator. Once a test is dispatched from the Admin Dashboard, it will appear here automatically.';
      }
      if (forceAlert) {
        alert('ℹ️ No active assessment assigned yet. Please assign a test from Admin Portal or enter an Access Code.');
      }
    }
  } catch (err) {
    console.warn('Could not check active assignment:', err);
  }
}

async function startCandidateDemoTest() {
  // Immediately request browser & desktop fullscreen on user click if desired
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (_) {}

  const candidateName = document.getElementById('candidateNameInput')?.value.trim() || 'Student';
  sessionStorage.setItem('proctoriq_candidate_name', candidateName);

  // Permanent 10-Question Demo Proctoring Test:
  // 8 Introductory MCQs + 1 Simple Coding (Problem #2235 — Add Two Integers) + 1 Simple SQL (Student table)
  const demoQuestions = (typeof QUIZ !== 'undefined' && typeof QUIZ.getPermanentDemoQuestions === 'function')
    ? QUIZ.getPermanentDemoQuestions()
    : [];

  const demoTest = {
    id: 'demo-test-candidate',
    title: 'DEMO PROCTORING TEST (8 MCQ + 1 Coding + 1 SQL)',
    topic: 'Demo Practice Assessment',
    format: 'coding+sql+mcq',
    category: 'Super Easy',
    difficulty: 'Super Easy',
    numQuestions: 10,
    codingCount: 1,
    sqlCount: 1,
    mcqCount: 8,
    allowedAttempts: 999,
    maxAttempts: 999,
    isDemo: true,
    mcqTagline: 'Python, Java, C, SQL, DSA & Computer Science Foundations',
    timeLimitMin: 20,
    proctorPreset: 'balanced',
    proctorOptions: {
      camera: true,
      mic: true,
      allowApps: true,
      fullscreen: false,
      maxMalpracticeAttempts: 20,
      allowedAttempts: 999
    },
    instructions: 'Permanent Demo Proctoring Test: Complete 8 introductory MCQs, 1 simple LeetCode coding challenge (Problem #2235 — Add Two Integers), and 1 simple SQL query (SELECT * FROM Student;). Unlimited attempts allowed.',
    problemId: 'add-two-integers',
    questions: demoQuestions
  };

  await launchCustomTest(demoTest);
}

async function launchByAccessCode() {
  const code = (document.getElementById('candidateAccessCodeInput')?.value || '').trim();
  if (!code) {
    alert('Please enter a Test ID or Access Code (e.g. test-dsa-101, demo, Two Sum)');
    return;
  }

  // Quick alias for demo test
  if (['demo', 'practice', 'demo-test', 'demotest', 'demo test', 'sample'].includes(code.toLowerCase())) {
    await startCandidateDemoTest();
    return;
  }

  try {
    let testList = allCustomTests;
    if (!testList || testList.length === 0) {
      const data = await API.getCustomTests();
      if (data && data.tests) testList = data.tests;
    }

    const q = code.toLowerCase();
    const found = (testList || []).find(t =>
      t.id.toLowerCase() === q ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.topic && t.topic.toLowerCase().includes(q))
    );

    if (found) {
      await launchCustomTest(found);
    } else {
      alert(`Could not find assessment matching "${code}". Please verify the Test ID or contact your administrator.`);
    }
  } catch (err) {
    alert('Error loading test: ' + err.message);
  }
}

async function startAssignedExam() {
  if (!currentAssignedTest) return;

  // Immediately request browser & desktop fullscreen on user click
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.enter_fullscreen) {
      window.pywebview.api.enter_fullscreen().catch(() => {});
    }
  } catch (_) {}

  const candidateName = document.getElementById('candidateNameInput')?.value.trim() || 'Student';
  sessionStorage.setItem('proctoriq_candidate_name', candidateName);

  const t = currentAssignedTest;

  // Enforce attempt limits and malpractice blocking
  const candStatus = await getCandidateTestStatus(t.title, t.topic, t.id);
  const allowedAttempts = Number(t.allowedAttempts || t.maxAttempts || (t.proctorOptions && t.proctorOptions.allowedAttempts) || 1);
  const isUnlimited = allowedAttempts >= 999 || t.id === 'demo-test-candidate';

  if (!isUnlimited && candStatus.isMalpractice) {
    alert(`🚫 Assessment Blocked\n\nYour attempt was disqualified for proctoring malpractice: "${candStatus.malpracticeReason}".\n\nRetaking this examination is strictly prohibited.`);
    return;
  }

  if (!isUnlimited && candStatus.completedAttempts >= allowedAttempts) {
    alert(`🔒 Assessment Closed\n\nYou have completed the maximum number of allowed attempts (${candStatus.completedAttempts}/${allowedAttempts}) for this assessment.`);
    return;
  }

  const proctorOptions = t.proctorOptions || {
    camera: t.proctorPreset !== 'practice',
    mic: t.proctorPreset !== 'practice',
    allowApps: t.proctorPreset === 'practice',
    fullscreen: t.proctorPreset === 'strict',
    maxMalpracticeAttempts: 10
  };
  if (!proctorOptions.maxMalpracticeAttempts || proctorOptions.maxMalpracticeAttempts < 10) {
    proctorOptions.maxMalpracticeAttempts = 10;
  }
  const withProctor = Boolean(proctorOptions.camera || proctorOptions.mic || t.proctorPreset !== 'practice');

  // Pre-exam security scan: block start if forbidden AI tools are running and external apps are blocked
  if (withProctor && !proctorOptions.allowApps) {
    try {
      const url = CONFIG.PROCTOR_SCAN_URL || 'http://localhost:3000/api/proctor-scan';
      const scanRes = await fetch(url);
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (!scanData.safe && scanData.detected && scanData.detected.length > 0) {
          const names = scanData.detected.map(d => d.label || d.name).join(', ');
          alert(`🚫 Cannot Start Proctored Exam\n\nProhibited application detected: ${names}.\n\nPlease close all external AI tools before beginning.`);
          return;
        }
      }
    } catch (_) {}
  }

  // Always force fullscreen when exam starts — use PROCTOR.enterFullscreen()
  // so the grace period is set to suppress false tab-switch warnings from the blur
  // event that browsers fire when entering fullscreen
  try {
    if (typeof PROCTOR !== 'undefined' && PROCTOR.enterFullscreen) {
      PROCTOR.enterFullscreen();
    } else {
      await API.enterFullscreen();
    }
  } catch (e) {
    console.warn('Fullscreen entry error:', e);
  }

  if (typeof QUIZ !== 'undefined' && typeof QUIZ.setMeta === 'function') {
    QUIZ.setMeta({
      testId: t.id || null,
      testTitle: t.title || t.topic || '',
      allowedAttempts: allowedAttempts
    });
  }

  showScreen('quizScreen');
  const extraConfig = {
    codingCount: t.codingCount,
    sqlCount: t.sqlCount,
    mcqCount: t.mcqCount,
    mcqTagline: t.mcqTagline,
    problemId: t.problemId || null,
    timeLimitMin: t.timeLimitMin || 30,
    questions: t.questions || t.customQuestions || null
  };
  await QUIZ.start(
    t.topic,
    t.numQuestions || 1,
    withProctor,
    t.format || 'coding',
    'python',
    t.category || 'General',
    t.difficulty || 'Medium',
    proctorOptions,
    extraConfig
  );
}

// ─── Exam Format Selection ─────────────────────────────────────────────────────
function selectExamFormat(format, btn) {
  document.getElementById('examFormat').value = format;

  // Toggle active card
  document.querySelectorAll('.format-card').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Toggle presets
  const presets = {
    'mcq': 'presetsMcq',
    'coding': 'presetsCoding',
    'python': 'presetsCoding',
    'sql': 'presetsSql',
    'hybrid': 'presetsHybrid'
  };

  const isCoding = (format === 'coding' || format === 'python');
  const leetcodePanel = document.getElementById('leetcodeOptionsPanel');
  if (leetcodePanel) {
    leetcodePanel.style.display = isCoding ? 'block' : 'none';
  }

  ['presetsMcq', 'presetsCoding', 'presetsSql', 'presetsHybrid'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isCoding && id === 'presetsCoding') el.style.display = 'flex';
    else if (!isCoding && id === presets[format]) el.style.display = 'flex';
    else el.style.display = 'none';
  });

  // Toggle question count selector (for MCQ and Hybrid only)
  const countSec = document.getElementById('questionCountSection');
  if (countSec) {
    countSec.style.display = (format === 'mcq' || format === 'hybrid') ? 'block' : 'none';
  }

  // Update button and input labels
  const btnLabel = document.getElementById('startBtnLabel');
  const topicLabel = document.getElementById('topicLabelText');
  const topicInput = document.getElementById('quizTopic');

  if (isCoding) {
    if (btnLabel) btnLabel.textContent = 'Generate & Launch LeetCode Challenge';
    if (topicLabel) topicLabel.textContent = 'LeetCode Problem Name or Topic';
    if (topicInput) topicInput.placeholder = 'e.g. Two Sum, Valid Parentheses, 121. Best Time to Buy and Sell Stock, Binary Search...';
  } else if (format === 'sql') {
    if (btnLabel) btnLabel.textContent = 'Generate & Launch SQL Challenge';
    if (topicLabel) topicLabel.textContent = 'SQL Topic or Scenario';
    if (topicInput) topicInput.placeholder = 'e.g. Employee & Department Joins, Aggregate Functions, Window Ranking...';
  } else if (format === 'hybrid') {
    if (btnLabel) btnLabel.textContent = 'Generate & Launch Hybrid Exam';
    if (topicLabel) topicLabel.textContent = 'Assessment Subject';
    if (topicInput) topicInput.placeholder = 'e.g. Data Structures & Algorithms, Python OOP, Full Stack...';
  } else {
    if (btnLabel) btnLabel.textContent = 'Generate & Launch Proctored Exam';
    if (topicLabel) topicLabel.textContent = 'Subject or Topic';
    if (topicInput) topicInput.placeholder = 'e.g. Operating Systems, Computer Networks, Python OOP, SQL Queries, Machine Learning...';
  }

  // Focus topic input
  if (topicInput) topicInput.focus();
}

function selectQuestionCount(num, btn) {
  document.getElementById('quizCount').value = num;
  const parent = btn.closest('.segmented-control');
  if (parent) {
    parent.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

function setSetupTopic(topic) {
  const input = document.getElementById('quizTopic');
  if (input) {
    input.value = topic;
    input.focus();
  }
  const badge = document.getElementById('randomProblemBadge');
  if (badge) badge.style.display = 'none';
}

function selectStartLanguage(lang, btn) {
  const input = document.getElementById('selectedCodeLanguage');
  if (input) input.value = lang;
  document.querySelectorAll('.leetcode-lang-pills .lang-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function onLeetCodeCategoryChange() {
  const badge = document.getElementById('randomProblemBadge');
  if (badge) badge.style.display = 'none';
}

function pickRandomLeetCodeProblem() {
  const cat = document.getElementById('selectedLeetCodeCategory')?.value || 'All';
  const diff = document.getElementById('selectedLeetCodeDiff')?.value || 'Medium';
  if (typeof LEETCODE !== 'undefined') {
    const p = LEETCODE.getRandomProblem(cat, diff);
    if (p) {
      document.getElementById('quizTopic').value = p.title;
      const badge = document.getElementById('randomProblemBadge');
      const nameEl = document.getElementById('randomProblemName');
      if (badge && nameEl) {
        nameEl.textContent = `${p.title} (${p.difficulty}) [${p.category}]`;
        badge.style.display = 'inline-flex';
      }
    }
  }
}

function toggleProctoringSubSettings(enabled) {
  const panel = document.getElementById('granularProctorSettings');
  if (panel) {
    panel.style.display = enabled ? 'grid' : 'none';
  }
}

// ─── Direct Proctored Exam Launcher ───────────────────────────────────────────
async function startQuiz() {
  // Immediately request browser & desktop fullscreen on user click
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.enter_fullscreen) {
      window.pywebview.api.enter_fullscreen().catch(() => {});
    }
  } catch (_) {}

  const candidateName = document.getElementById('candidateNameInput')?.value.trim() || 'Student';
  sessionStorage.setItem('proctoriq_candidate_name', candidateName);

  const topic   = document.getElementById('quizTopic').value.trim();
  const format  = document.getElementById('examFormat').value || 'mcq';
  const numQ    = parseInt(document.getElementById('quizCount').value, 10) || 10;
  const proctor = document.getElementById('enableProctoring')?.checked ?? true;

  if (!topic) {
    alert('Please enter a subject or topic (or click "Pick Random LeetCode Problem") to generate your assessment!');
    document.getElementById('quizTopic').focus();
    return;
  }

  const category = document.getElementById('selectedLeetCodeCategory')?.value || 'All';
  const difficulty = document.getElementById('selectedLeetCodeDiff')?.value || 'Medium';
  const language = document.getElementById('selectedCodeLanguage')?.value || 'python';

  const proctorOptions = {
    camera: document.getElementById('cfgCamera') ? Boolean(document.getElementById('cfgCamera').checked) : true,
    mic: document.getElementById('cfgMic') ? Boolean(document.getElementById('cfgMic').checked) : true,
    allowApps: document.getElementById('cfgAllowApps') ? Boolean(document.getElementById('cfgAllowApps').checked) : false,
    fullscreen: document.getElementById('cfgFullscreen') ? Boolean(document.getElementById('cfgFullscreen').checked) : true
  };

  // Pre-exam security scan: block start if forbidden AI tools are running AND external apps are blocked
  if (proctor && !proctorOptions.allowApps) {
    try {
      const url = CONFIG.PROCTOR_SCAN_URL || 'http://localhost:3000/api/proctor-scan';
      const scanRes = await fetch(url);
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (!scanData.safe && scanData.detected && scanData.detected.length > 0) {
          const names = scanData.detected.map(d => d.label || d.name).join(', ');
          alert(`🚫 Cannot Start Proctored Exam\n\nProhibited application detected: ${names}.\n\nPlease close all external AI tools before beginning.`);
          return;
        }
      }
    } catch (_) {}
  }

  // Always force fullscreen when exam starts — use PROCTOR.enterFullscreen()
  // so the grace period is set to suppress false tab-switch warnings from the blur
  // event that browsers fire when entering fullscreen
  try {
    if (typeof PROCTOR !== 'undefined' && PROCTOR.enterFullscreen) {
      PROCTOR.enterFullscreen();
    } else {
      await API.enterFullscreen();
    }
  } catch (e) {
    console.warn('Fullscreen entry error:', e);
  }

  const strikeText = document.getElementById('strikeText');
  const badge = document.getElementById('hudStrikeBadge');
  const candidateExtraConfig = {
    codingCount: format.includes('coding') ? 1 : 0,
    sqlCount: format.includes('sql') ? 1 : 0,
    mcqCount: format.includes('mcq') ? numQ : 0,
    timeLimitMin: 30
  };

  await QUIZ.start(topic, numQ, proctor, format, language, category, difficulty, proctorOptions, candidateExtraConfig);
}

// ─── Settings Save ─────────────────────────────────────────────────────────────
async function saveSettings() {
  const keyInput = document.getElementById('omniRouteKeyInput');
  const omniRouteKey = keyInput ? keyInput.value.trim() : '';

  const msgEl = document.getElementById('settingsSaveMsg');
  try {
    await API.saveSettings({ omniRouteKey });
    if (msgEl) {
      msgEl.textContent = '✅ Settings saved successfully!';
      msgEl.style.color = '#10b981';
      msgEl.style.display = 'block';
    }
  } catch (e) {
    if (msgEl) {
      msgEl.textContent = '❌ Failed to save: ' + e.message;
      msgEl.style.color = '#ef4444';
      msgEl.style.display = 'block';
    }
  }

  setTimeout(() => {
    if (msgEl) msgEl.style.display = 'none';
  }, 3000);
}

function toggleKeyVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

// ─── Fullscreen Toggle ─────────────────────────────────────────────────────────
async function toggleFullscreen() {
  try {
    await API.toggleFullscreen();
  } catch (_) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
}

// ─── Malpractice Overlay ───────────────────────────────────────────────────────
function showMalpractice(reason) {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  document.getElementById('malpracticeReason').textContent = reason;
  document.getElementById('malpracticeOverlay').style.display = 'flex';

  // Persist Disqualification Telemetry for Admin Audit
  if (typeof API !== 'undefined' && API.recordTestResult) {
    const topic = (typeof QUIZ !== 'undefined' && QUIZ.getActiveTopic) ? QUIZ.getActiveTopic() : 'Live Assessment';
    const fmt = (typeof QUIZ !== 'undefined' && QUIZ.getActiveFormat) ? QUIZ.getActiveFormat() : 'coding';
    const elapsed = (typeof QUIZ !== 'undefined' && QUIZ.getElapsedSeconds) ? QUIZ.getElapsedSeconds() : 30;
    API.recordTestResult({
      candidateName: sessionStorage.getItem('proctoriq_candidate_name') || 'Student',
      testId: (currentAssignedTest && currentAssignedTest.id) || '',
      topic: topic,
      format: fmt,
      score: 0,
      correctCount: 0,
      totalCount: 1,
      elapsedSec: elapsed,
      proctored: true,
      proctorOptions: (typeof PROCTOR !== 'undefined' && PROCTOR.getOptions) ? PROCTOR.getOptions() : {},
      disqualified: true,
      submitted: false,
      status: 'disqualified',
      violationReason: reason || 'Proctoring Security Violation',
      tabSwitches: (typeof PROCTOR !== 'undefined' && PROCTOR.getTabSwitchCount) ? PROCTOR.getTabSwitchCount() : 1,
      soundWarnings: (typeof PROCTOR !== 'undefined' && PROCTOR.getSoundWarningCount) ? PROCTOR.getSoundWarningCount() : 0,
      timestamp: new Date().toISOString()
    }).catch(err => console.warn('Telemetry malpractice save warning:', err));
  }
}

function forceEndTest() {
  document.getElementById('malpracticeOverlay').style.display = 'none';
  if (typeof PROCTOR !== 'undefined') PROCTOR.stop();
  showScreen('landing');
  if (typeof checkActiveAssignment === 'function') {
    checkActiveAssignment().catch(() => {});
  }
}

// ─── Tab-Switch / Malpractice Warning ──────────────────────────────────────────
function showTabWarning(count, max = 3, reason = 'Tab switch / Security policy violation') {
  const overlay = document.getElementById('tabWarningOverlay');
  if (!overlay) return;

  const countEl = document.getElementById('tabWarnCount');
  if (countEl) {
    const remaining = Math.max(0, max - count);
    countEl.textContent = `Attempt ${count} of ${max}. ${remaining > 0 ? `You have ${remaining} attempt(s) remaining before your exam is closed and disqualified!` : 'Final attempt exceeded!'}`;
  }

  const noteEl = document.getElementById('tabWarnNote') || document.querySelector('#tabWarningOverlay .warning-note');
  if (noteEl) {
    noteEl.textContent = `Violation: ${reason}. Switching tabs, minimizing the exam window, or pressing forbidden keys (Alt, Ctrl, Tab) violates proctoring protocols.`;
  }

  overlay.style.display = 'flex';

  const strikeText = document.getElementById('strikeText');
  const badge = document.getElementById('hudStrikeBadge');
  if (strikeText) strikeText.textContent = `Malpractice: ${count} / ${max}`;
  if (badge) badge.className = 'security-badge danger';
}

function dismissTabWarning() {
  document.getElementById('tabWarningOverlay').style.display = 'none';
  if (typeof API !== 'undefined' && API.enterFullscreen) {
    API.enterFullscreen().catch(() => {});
  }
  window.focus();
}

// ─── Proctor Real-Time HUD Alerts ─────────────────────────────────────────────
let soundToastTimeout = null;

function showSoundWarning(count, max = 10, reason = 'Voice / talking detected') {
  // Update HUD badge
  const soundBadge = document.getElementById('hudSoundBadge');
  const soundText = document.getElementById('soundStrikeText');
  if (soundText) soundText.textContent = `Voice: ${count} / ${max}`;
  if (soundBadge) soundBadge.className = count >= 7 ? 'security-badge danger' : 'security-badge warn';

  // Display floating toast alert
  const toast = document.getElementById('soundWarningToast');
  const desc = document.getElementById('soundToastDesc');
  if (toast && desc) {
    desc.textContent = `Warning ${count} of ${max}: ${reason}. Complete silence is strictly required during the examination!`;
    toast.style.display = 'flex';
    clearTimeout(soundToastTimeout);
    soundToastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 4000);
  }
}

function handleAwayCountdown(remainingSec) {
  const toast = document.getElementById('glanceAwayToast');
  const toastSec = document.getElementById('glanceToastSec');
  const pipBadge = document.getElementById('pipCountdownBadge');
  const pipSec = document.getElementById('pipCountdownSec');

  if (remainingSec !== null) {
    if (toast) toast.style.display = 'flex';
    if (toastSec) toastSec.textContent = remainingSec;
    if (pipBadge) pipBadge.style.display = 'block';
    if (pipSec) pipSec.textContent = remainingSec;
  } else {
    if (toast) toast.style.display = 'none';
    if (pipBadge) pipBadge.style.display = 'none';
  }
}

function handleLightingWarning(isLow) {
  const toast = document.getElementById('lightingWarningToast');
  const pipBadge = document.getElementById('pipLightingBadge');

  if (toast) toast.style.display = isLow ? 'flex' : 'none';
  if (pipBadge) pipBadge.style.display = isLow ? 'block' : 'none';
}

// =============================================================================
// ADMIN PORTAL & DASHBOARD CONTROLLER
// =============================================================================

let allAdminRecords = [];
let allCustomTests = [];

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Navigation & Auth ────────────────────────────────────────────────────────
function openAdminPortal() {
  if (typeof API !== 'undefined' && API.isAdminLoggedIn()) {
    showScreen('adminDashboardScreen');
    loadAdminDashboard();
  } else {
    const modal = document.getElementById('adminLoginModal');
    if (modal) {
      const errEl = document.getElementById('admLoginError');
      if (errEl) errEl.style.display = 'none';
      modal.style.display = 'flex';
      setTimeout(() => document.getElementById('admLoginUser')?.focus(), 50);
    }
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) modal.style.display = 'none';
}

function autofillAdminCredentials() {
  const u = document.getElementById('admLoginUser');
  const p = document.getElementById('admLoginPass');
  if (u) u.value = 'loki1234';
  if (p) p.value = 'mdatraining@20267';
}

async function loginAdmin() {
  const uInput = document.getElementById('admLoginUser');
  const pInput = document.getElementById('admLoginPass');
  const errBox = document.getElementById('admLoginError');
  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value.trim() : '';

  if (!u || !p) {
    if (errBox) {
      errBox.textContent = 'Please enter both username and password.';
      errBox.style.display = 'block';
    }
    return;
  }

  try {
    const data = await API.adminLogin(u, p);
    if (data && data.success) {
      closeAdminLoginModal();
      showScreen('adminDashboardScreen');
      await loadAdminDashboard();
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'Invalid administrator credentials.';
      errBox.style.display = 'block';
    }
  }
}

function logoutAdmin() {
  if (typeof API !== 'undefined') API.adminLogout();
  showScreen('landing');
}

// ── Tab Switching ────────────────────────────────────────────────────────────
function switchAdminTab(tabName, btn) {
  document.querySelectorAll('.admin-subtab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));

  if (tabName === 'records') {
    document.getElementById('adminTabRecords')?.classList.add('active');
  } else if (tabName === 'create') {
    document.getElementById('adminTabCreate')?.classList.add('active');
    initAdminCreateTestForm();
  } else if (tabName === 'leetcode') {
    document.getElementById('adminTabLeetCode')?.classList.add('active');
    loadAdminLeetCodeTab();
  } else if (tabName === 'ai-control') {
    document.getElementById('adminTabAiControl')?.classList.add('active');
    loadAdminAiControl();
  } else if (tabName === 'proctor') {
    document.getElementById('adminTabProctor')?.classList.add('active');
    loadAdminProctorSettings();
  } else if (tabName === 'catalog') {
    document.getElementById('adminTabCatalog')?.classList.add('active');
    loadAdminCatalog();
  }
}

// ── Dashboard Data Loader ────────────────────────────────────────────────────
async function loadAdminDashboard() {
  try {
    const data = await API.getAdminRecords();
    if (data && data.success) {
      allAdminRecords = data.records || [];
      const m = data.metrics || {};

      // 1. Update KPI executive cards
      const totalEl = document.getElementById('admMetricTotalAttended');
      const compEl = document.getElementById('admMetricCompleted');
      const disqEl = document.getElementById('admMetricDisqualified');
      const overEl = document.getElementById('admMetricOverallPct');
      const passRateEl = document.getElementById('admMetricPassRate');
      const passCountEl = document.getElementById('admMetricPassedCount');
      const failCountEl = document.getElementById('admMetricFailedCount');
      const integEl = document.getElementById('admMetricIntegrityRate');
      const badgeRecords = document.getElementById('admTabBadgeRecords');

      if (totalEl) totalEl.textContent = m.totalAttended ?? allAdminRecords.length;
      if (compEl) compEl.textContent = m.completedCount ?? 0;
      if (disqEl) disqEl.textContent = m.disqualifiedCount ?? 0;
      if (overEl) overEl.textContent = `${m.overallPercentage ?? 0}%`;
      if (passRateEl) passRateEl.textContent = `${m.passRate ?? 0}%`;
      if (passCountEl) passCountEl.textContent = m.passCount ?? 0;
      if (failCountEl) failCountEl.textContent = m.failCount ?? 0;
      if (integEl) integEl.textContent = `${m.integrityRate ?? 100}%`;
      if (badgeRecords) badgeRecords.textContent = allAdminRecords.length;

      // 2. Render table
      renderAdminRecordsTable(allAdminRecords);
    }
  } catch (err) {
    console.warn('Could not load admin records:', err);
  }

  // Preload catalog and settings in background
  loadAdminCatalog().catch(() => {});
  loadAdminProctorSettings().catch(() => {});
}

// ── Attended Tests Table & Filters ───────────────────────────────────────────
function renderAdminRecordsTable(records) {
  const tbody = document.getElementById('admRecordsTableBody');
  const emptyMsg = document.getElementById('admRecordsEmptyMsg');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!records || records.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  records.forEach(r => {
    const tr = document.createElement('tr');

    // Date formatting
    const d = r.timestamp ? new Date(r.timestamp) : new Date();
    const dateFormatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Format badge class
    const fmt = (r.format || 'coding').toLowerCase();
    const fmtBadge = `<span class="tbl-badge format-${fmt}">${fmt.toUpperCase()}</span>`;

    // Status badge
    const isDisq = Boolean(r.disqualified);
    const statusBadge = isDisq
      ? `<span class="tbl-badge status-disqualified">🚨 Disqualified</span>`
      : `<span class="tbl-badge status-completed">✅ Completed</span>`;

    // Score pill
    const scoreNum = Number(r.score || 0);
    const scoreClass = scoreNum >= 75 ? 'high' : scoreNum >= 50 ? 'med' : 'low';
    const scoreHtml = isDisq
      ? `<span class="tbl-score-pill low">0% (Void)</span>`
      : `<span class="tbl-score-pill ${scoreClass}">${scoreNum}%</span>`;

    // Strikes
    const tabCount = r.tabSwitches || 0;
    const soundCount = r.soundWarnings || 0;
    const strikesHtml = `<span style="font-size:0.8rem; color:${tabCount > 0 || soundCount > 0 ? '#fbbf24' : 'var(--text-muted)'};">
      📑 Tabs: <strong>${tabCount}</strong> • 🎙️ Sound: <strong>${soundCount}</strong>
    </span>`;

    tr.innerHTML = `
      <td>
        <div class="candidate-cell">
          <span class="candidate-name">${escHtml(r.candidateName || 'Candidate')}</span>
          <span class="candidate-date">${dateFormatted}</span>
        </div>
      </td>
      <td>
        <div class="tbl-topic-text" title="${escHtml(r.topic || '')}">${escHtml(r.topic || 'General')}</div>
      </td>
      <td>${fmtBadge}</td>
      <td>${scoreHtml}</td>
      <td>${strikesHtml}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="tbl-actions-wrap">
          <button class="tbl-audit-btn" onclick="openExamAttemptReport('${r.id}')" title="View Comprehensive Exam Report" style="background:rgba(59,130,246,0.16); border-color:rgba(59,130,246,0.4); color:#93c5fd;">
            <span>📊</span>
            <span>Report</span>
          </button>
          <button class="tbl-audit-btn" onclick="openTestAuditModal('${r.id}')" title="View Detailed Audit Report">
            <span>🔍</span>
            <span>Audit</span>
          </button>
          <button class="tbl-delete-btn" onclick="deleteAdminRecord('${r.id}', event)" title="Delete This Record">
            <span>🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterAdminRecords() {
  const q = (document.getElementById('admSearchInput')?.value || '').toLowerCase().trim();
  const fmt = document.getElementById('admFilterFormat')?.value || 'all';
  const status = document.getElementById('admFilterStatus')?.value || 'all';
  const sort = document.getElementById('admFilterSort')?.value || 'newest';

  let list = allAdminRecords.filter(r => {
    if (q) {
      const matchName = (r.candidateName || '').toLowerCase().includes(q);
      const matchTopic = (r.topic || '').toLowerCase().includes(q);
      if (!matchName && !matchTopic) return false;
    }
    if (fmt !== 'all') {
      const rFmt = (r.format || 'coding').toLowerCase();
      if (rFmt !== fmt && !(fmt === 'coding+mcq' && rFmt === 'hybrid')) {
        return false;
      }
    }
    if (status === 'completed' && r.disqualified) return false;
    if (status === 'disqualified' && !r.disqualified) return false;
    return true;
  });

  if (sort === 'score_desc') {
    list.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  } else if (sort === 'score_asc') {
    list.sort((a, b) => (Number(a.score) || 0) - (Number(b.score) || 0));
  } else {
    list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }

  renderAdminRecordsTable(list);
}

async function refreshAdminRecords() {
  await loadAdminDashboard();
}

async function clearAdminRecords() {
  if (!confirm('Are you sure you want to permanently clear all candidate test records?')) return;
  try {
    await API.clearAdminRecords();
    await loadAdminDashboard();
  } catch (err) {
    alert('Could not clear records: ' + err.message);
  }
}

async function deleteAdminRecord(recordId, evt) {
  if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
  if (!recordId) return;

  const targetRec = (allAdminRecords || []).find(r => String(r.id) === String(recordId));
  const candName = targetRec?.candidateName || 'Candidate';
  const topic = targetRec?.topic || 'Assessment';

  if (!confirm(`Are you sure you want to delete the test attempt record for "${candName}" (${topic})?\n\nThis will permanently remove this record from the audit log and reset any associated attempt locks.`)) {
    return;
  }

  try {
    const res = await API.deleteAdminRecord(recordId);
    if (res && res.success) {
      allAdminRecords = res.records || allAdminRecords.filter(r => String(r.id) !== String(recordId));

      // Update UI metrics & badges
      const m = res.metrics || {};
      const totalEl = document.getElementById('admMetricTotalAttended');
      const compEl = document.getElementById('admMetricCompleted');
      const disqEl = document.getElementById('admMetricDisqualified');
      const overEl = document.getElementById('admMetricOverallScore');
      const passRateEl = document.getElementById('admMetricPassRate');
      const passCountEl = document.getElementById('admMetricPassCount');
      const failCountEl = document.getElementById('admMetricFailCount');
      const integEl = document.getElementById('admMetricIntegrityRate');
      const badgeRecords = document.getElementById('admTabBadgeRecords');

      if (totalEl) totalEl.textContent = m.totalAttended ?? allAdminRecords.length;
      if (compEl) compEl.textContent = m.completedCount ?? 0;
      if (disqEl) disqEl.textContent = m.disqualifiedCount ?? 0;
      if (overEl) overEl.textContent = `${m.overallPercentage ?? 0}%`;
      if (passRateEl) passRateEl.textContent = `${m.passRate ?? 0}%`;
      if (passCountEl) passCountEl.textContent = m.passCount ?? 0;
      if (failCountEl) failCountEl.textContent = m.failCount ?? 0;
      if (integEl) integEl.textContent = `${m.integrityRate ?? 100}%`;
      if (badgeRecords) badgeRecords.textContent = allAdminRecords.length;

      // Re-filter and re-render the records table
      filterAdminRecords();
      closeAdminAuditModal();

      // Check active assignment in case candidate attempt locks changed
      if (typeof checkActiveAssignment === 'function') {
        checkActiveAssignment(false);
      }
      if (typeof refreshStudentDashboard === 'function') {
        refreshStudentDashboard().catch(() => {});
      }
    } else {
      alert('Could not delete record: ' + (res?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Failed to delete admin record:', err);
    alert('Error deleting record: ' + err.message);
  }
}

// ── Test Audit Detail Modal ──────────────────────────────────────────────────
function openTestAuditModal(recordId) {
  const rec = allAdminRecords.find(r => r.id === recordId);
  if (!rec) return;

  const modal = document.getElementById('adminAuditModal');
  if (!modal) return;

  const delBtn = document.getElementById('audDeleteBtn');
  if (delBtn) {
    delBtn.onclick = () => deleteAdminRecord(recordId);
  }

  const titleEl = document.getElementById('audModalTitle');
  const subEl = document.getElementById('audModalSub');
  const scoreEl = document.getElementById('audScoreVal');
  const statusEl = document.getElementById('audStatusVal');
  const tabEl = document.getElementById('audTabVal');
  const soundEl = document.getElementById('audSoundVal');
  const viSec = document.getElementById('audViolationSection');
  const viReason = document.getElementById('audViolationReason');

  if (titleEl) titleEl.textContent = `${rec.candidateName || 'Candidate Session'} • ${rec.topic || ''}`;
  if (subEl) {
    const d = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '';
    subEl.textContent = `Record ID: ${rec.id} | Timestamp: ${d} | Format: ${(rec.format || '').toUpperCase()}`;
  }

  if (scoreEl) scoreEl.textContent = `${rec.score}% (${rec.correctCount || 0}/${rec.totalCount || 1} solved)`;
  if (statusEl) {
    statusEl.textContent = rec.disqualified ? '🚨 Disqualified (Void)' : '✅ Verified Completed';
    statusEl.style.color = rec.disqualified ? '#f87171' : '#34d399';
  }
  if (tabEl) tabEl.textContent = `${rec.tabSwitches || 0} switches detected`;
  if (soundEl) soundEl.textContent = `${rec.soundWarnings || 0} noise strikes`;

  if (rec.disqualified && rec.violationReason) {
    if (viSec) viSec.style.display = 'block';
    if (viReason) viReason.textContent = rec.violationReason;
  } else {
    if (viSec) viSec.style.display = 'none';
  }

  const badgesEl = document.getElementById('audProctorOptionsBadges');
  if (badgesEl) {
    const opts = rec.proctorOptions || {
      camera: rec.proctored !== false,
      mic: rec.proctored !== false,
      allowApps: false,
      fullscreen: rec.proctored !== false
    };
    badgesEl.innerHTML = `
      <span class="tbl-badge ${opts.camera ? 'format-coding' : 'format-mcq'}" style="font-size:0.75rem;">📷 Camera: ${opts.camera ? 'Enabled' : 'Disabled'}</span>
      <span class="tbl-badge ${opts.mic ? 'format-coding' : 'format-mcq'}" style="font-size:0.75rem;">🎙️ Mic: ${opts.mic ? 'Enabled' : 'Disabled'}</span>
      <span class="tbl-badge ${opts.allowApps ? 'format-hybrid' : 'format-coding'}" style="font-size:0.75rem;">💻 Running Apps: ${opts.allowApps ? 'Allowed' : 'Blocked'}</span>
      <span class="tbl-badge ${opts.fullscreen ? 'format-sql' : 'format-mcq'}" style="font-size:0.75rem;">⛶ Fullscreen: ${opts.fullscreen ? 'Locked' : 'Windowed'}</span>
      <button type="button" class="tbl-audit-btn" onclick="openExamAttemptReport('${rec.id}')" style="margin-left:auto; background:rgba(59,130,246,0.2); border-color:#3b82f6; color:#93c5fd;">
        <span>📊</span><span>Full Comprehensive Report</span>
      </button>
    `;
  }

  modal.style.display = 'flex';
}

function closeAdminAuditModal() {
  const modal = document.getElementById('adminAuditModal');
  if (modal) modal.style.display = 'none';
}

// ── Test Creation Studio ─────────────────────────────────────────────────────
function initAdminCreateTestForm() {
  const picker = document.getElementById('admQuickLeetCodeSelect');
  if (picker && typeof LEETCODE !== 'undefined') {
    picker.innerHTML = '<option value="">-- Choose From 20+ Curated LeetCode Problems --</option>';
    const catalog = LEETCODE.getCatalog();
    catalog.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.title} (${p.difficulty}) [${p.category}]`;
      picker.appendChild(opt);
    });
  }
  initAdminCategoryMultiSelect();
  updateAdminMultiFormatUI();
  restoreAdminTestDraft();
  setupAdminDraftListeners();
}

// ── Admin Create Test Draft Persistence & Auto-Fill ──────────────────────────
const ADMIN_DRAFT_KEY = 'proctoriq_admin_test_draft';
let _adminDraftSaveDebounce = null;

function saveAdminTestDraft() {
  try {
    const modules = typeof selectedAdminModules !== 'undefined' ? Array.from(selectedAdminModules) : ['coding'];
    const selectedCats = typeof getSelectedAdminCategories === 'function' ? getSelectedAdminCategories() : [];
    const draft = {
      modules,
      title: document.getElementById('admNewTestTitle')?.value || '',
      topic: document.getElementById('admNewTestTopic')?.value || '',
      categories: selectedCats,
      difficulty: document.getElementById('admNewTestDifficulty')?.value || 'Medium',
      codingCount: document.getElementById('admNewTestCodingCount')?.value || '1',
      sqlCount: document.getElementById('admNewTestSqlCount')?.value || '1',
      mcqCount: document.getElementById('admNewTestMcqCount')?.value || '10',
      mcqTags: Array.from(adminMcqTagsList || []),
      timeLimit: document.getElementById('admNewTestTimeLimit')?.value || '30',
      preset: document.getElementById('admNewTestPreset')?.value || 'strict',
      camera: Boolean(document.getElementById('admNewTestCamera')?.checked),
      mic: Boolean(document.getElementById('admNewTestMic')?.checked),
      allowApps: Boolean(document.getElementById('admNewTestAllowApps')?.checked),
      fullscreen: Boolean(document.getElementById('admNewTestFullscreen')?.checked),
      allowedAttempts: document.getElementById('admNewTestAllowedAttempts')?.value || '1',
      maxAttempts: document.getElementById('admNewTestMaxAttempts')?.value || '3',
      instructions: document.getElementById('admNewTestInstructions')?.value || '',
      assign: Boolean(document.getElementById('admNewTestAssign')?.checked),
      scheduledStart: document.getElementById('admNewTestStart')?.value || '',
      scheduledEnd: document.getElementById('admNewTestEnd')?.value || ''
    };

    const hasMeaningfulContent = Boolean(draft.title || draft.topic || draft.instructions || draft.mcqTags.length > 0);
    if (hasMeaningfulContent) {
      localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(draft));
      const badge = document.getElementById('admDraftStatusBadge');
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = '💾 Draft Auto-Saved';
      }
    }
  } catch (e) {
    console.warn('Could not save test draft:', e);
  }
}

function restoreAdminTestDraft() {
  try {
    const raw = localStorage.getItem(ADMIN_DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return false;

    if (Array.isArray(draft.modules) && draft.modules.length > 0 && typeof setAdminFormatModules === 'function') {
      setAdminFormatModules(draft.modules);
    }
    if (draft.title && document.getElementById('admNewTestTitle')) {
      document.getElementById('admNewTestTitle').value = draft.title;
    }
    if (draft.topic && document.getElementById('admNewTestTopic')) {
      document.getElementById('admNewTestTopic').value = draft.topic;
    }
    if (Array.isArray(draft.categories) && draft.categories.length > 0 && typeof setAdminCategories === 'function') {
      setAdminCategories(draft.categories);
    }
    if (draft.difficulty && document.getElementById('admNewTestDifficulty')) {
      document.getElementById('admNewTestDifficulty').value = draft.difficulty;
    }
    if (draft.codingCount && document.getElementById('admNewTestCodingCount')) {
      const c = parseInt(draft.codingCount, 10) || 1;
      const btn = document.querySelector(`#admCodingCountGroup .segment-btn:nth-child(${c})`);
      if (typeof selectAdminCodingCount === 'function') selectAdminCodingCount(c, btn);
    }
    if (draft.sqlCount && document.getElementById('admNewTestSqlCount')) {
      const c = parseInt(draft.sqlCount, 10) || 1;
      const btn = document.querySelector(`#admSqlCountGroup .segment-btn:nth-child(${c})`);
      if (typeof selectAdminSqlCount === 'function') selectAdminSqlCount(c, btn);
    }
    if (draft.mcqCount && document.getElementById('admNewTestMcqCount')) {
      const c = parseInt(draft.mcqCount, 10) || 10;
      const input = document.getElementById('admNewTestMcqCount');
      if (input) input.value = c;
      const group = document.getElementById('admMcqCountGroup');
      if (group) {
        group.querySelectorAll('.segment-btn').forEach(b => {
          b.classList.toggle('active', b.textContent.trim() === String(c));
        });
      }
    }
    if (Array.isArray(draft.mcqTags) && draft.mcqTags.length > 0) {
      adminMcqTagsList = [...draft.mcqTags];
      if (typeof renderAdminMcqTags === 'function') renderAdminMcqTags();
    }
    if (draft.timeLimit && document.getElementById('admNewTestTimeLimit')) {
      const min = parseInt(draft.timeLimit, 10) || 30;
      const btn = Array.from(document.querySelectorAll('#admTimeLimitGroup .segment-btn')).find(b => b.textContent.includes(String(min)));
      if (typeof selectAdminTimeLimit === 'function') selectAdminTimeLimit(min, btn);
    }
    if (draft.preset && document.getElementById('admNewTestPreset')) {
      document.getElementById('admNewTestPreset').value = draft.preset;
    }
    if (draft.camera !== undefined && document.getElementById('admNewTestCamera')) {
      document.getElementById('admNewTestCamera').checked = Boolean(draft.camera);
    }
    if (draft.mic !== undefined && document.getElementById('admNewTestMic')) {
      document.getElementById('admNewTestMic').checked = Boolean(draft.mic);
    }
    if (draft.allowApps !== undefined && document.getElementById('admNewTestAllowApps')) {
      document.getElementById('admNewTestAllowApps').checked = Boolean(draft.allowApps);
    }
    if (draft.fullscreen !== undefined && document.getElementById('admNewTestFullscreen')) {
      document.getElementById('admNewTestFullscreen').checked = Boolean(draft.fullscreen);
    }
    if (draft.allowedAttempts && document.getElementById('admNewTestAllowedAttempts')) {
      document.getElementById('admNewTestAllowedAttempts').value = draft.allowedAttempts;
    }
    if (draft.maxAttempts && document.getElementById('admNewTestMaxAttempts')) {
      document.getElementById('admNewTestMaxAttempts').value = draft.maxAttempts;
    }
    if (draft.instructions && document.getElementById('admNewTestInstructions')) {
      document.getElementById('admNewTestInstructions').value = draft.instructions;
    }
    if (draft.assign !== undefined && document.getElementById('admNewTestAssign')) {
      document.getElementById('admNewTestAssign').checked = Boolean(draft.assign);
    }
    if (draft.scheduledStart && document.getElementById('admNewTestStart')) {
      document.getElementById('admNewTestStart').value = draft.scheduledStart;
    }
    if (draft.scheduledEnd && document.getElementById('admNewTestEnd')) {
      document.getElementById('admNewTestEnd').value = draft.scheduledEnd;
    }
    if (typeof updateTotalQuestionCounts === 'function') {
      updateTotalQuestionCounts();
    }

    const badge = document.getElementById('admDraftStatusBadge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent = '💾 Previous Details Restored';
    }
    return true;
  } catch (e) {
    console.warn('Could not restore test draft:', e);
    return false;
  }
}

function clearAdminTestDraft() {
  if (!confirm('Are you sure you want to reset the form and clear the saved draft details?')) return;
  localStorage.removeItem(ADMIN_DRAFT_KEY);

  const titleInput = document.getElementById('admNewTestTitle');
  if (titleInput) titleInput.value = '';
  const topicInput = document.getElementById('admNewTestTopic');
  if (topicInput) topicInput.value = '';
  const instrInput = document.getElementById('admNewTestInstructions');
  if (instrInput) instrInput.value = '';
  const startInput = document.getElementById('admNewTestStart');
  if (startInput) startInput.value = '';
  const endInput = document.getElementById('admNewTestEnd');
  if (endInput) endInput.value = '';

  adminMcqTagsList = [];
  if (typeof renderAdminMcqTags === 'function') renderAdminMcqTags();

  if (typeof setAdminFormatModules === 'function') setAdminFormatModules(['coding']);
  if (typeof setAdminCategories === 'function') setAdminCategories(['Arrays & Hashing']);
  if (typeof selectAdminTimeLimit === 'function') {
    selectAdminTimeLimit(30, document.querySelector('#admTimeLimitGroup .segment-btn:nth-child(2)'));
  }
  if (typeof updateTotalQuestionCounts === 'function') updateTotalQuestionCounts();

  const badge = document.getElementById('admDraftStatusBadge');
  if (badge) {
    badge.textContent = '🧹 Draft Cleared';
    setTimeout(() => { if (badge) badge.style.display = 'none'; }, 2500);
  }
}
window.clearAdminTestDraft = clearAdminTestDraft;

function setupAdminDraftListeners() {
  const form = document.getElementById('adminCreateTestForm');
  if (!form || form._draftListenersAttached) return;
  form._draftListenersAttached = true;

  const triggerSave = () => {
    clearTimeout(_adminDraftSaveDebounce);
    _adminDraftSaveDebounce = setTimeout(() => {
      saveAdminTestDraft();
    }, 400);
  };

  form.addEventListener('input', triggerSave);
  form.addEventListener('change', triggerSave);
}

// Multi-Select Assessment Categories State & Catalog (16 LeetCode Topics + SQL & General)
const ALL_LEETCODE_CATEGORIES = [
  { id: 'arrays', name: 'Arrays & Hashing', icon: '🗃️', dsaCore: true },
  { id: 'two_pointers', name: 'Two Pointers', icon: '🎯', dsaCore: true },
  { id: 'sliding_window', name: 'Sliding Window', icon: '🪟', dsaCore: true },
  { id: 'stack_queues', name: 'Stack & Queues', icon: '📚', dsaCore: true },
  { id: 'binary_search', name: 'Binary Search', icon: '🔍', dsaCore: true },
  { id: 'linked_list', name: 'Linked List', icon: '🔗', dsaCore: true },
  { id: 'trees_bst', name: 'Trees & BST', icon: '🌳', dsaCore: true },
  { id: 'heap', name: 'Heap / Priority Queue', icon: '⛰️', dsaCore: true },
  { id: 'backtracking', name: 'Backtracking', icon: '🔄', dsaCore: false },
  { id: 'graphs', name: 'Graphs & BFS/DFS', icon: '🕸️', dsaCore: true },
  { id: 'dp_1d', name: '1-D Dynamic Programming', icon: '📈', dsaCore: true },
  { id: 'dp_2d', name: '2-D Dynamic Programming', icon: '🧩', dsaCore: false },
  { id: 'greedy', name: 'Greedy', icon: '⚡', dsaCore: false },
  { id: 'intervals', name: 'Intervals', icon: '⏱️', dsaCore: false },
  { id: 'math', name: 'Math & Geometry', icon: '🔢', dsaCore: false },
  { id: 'bit', name: 'Bit Manipulation', icon: '💻', dsaCore: false },
  { id: 'sql', name: 'SQL & Relational Databases', icon: '🗄️', dsaCore: false },
  { id: 'general', name: 'General Computer Science', icon: '🌐', dsaCore: false }
];

let selectedAdminCategories = new Set(['Arrays & Hashing']);

function initAdminCategoryMultiSelect() {
  const container = document.getElementById('admCatDropdownItems');
  if (!container) return;
  container.innerHTML = '';

  ALL_LEETCODE_CATEGORIES.forEach(cat => {
    const item = document.createElement('div');
    item.className = `cat-dropdown-item ${selectedAdminCategories.has(cat.name) ? 'selected' : ''}`;
    item.setAttribute('data-cat-name', cat.name);
    item.onclick = (e) => toggleAdminCategory(cat.name, e);

    item.innerHTML = `
      <span class="cat-item-check">${selectedAdminCategories.has(cat.name) ? '✓' : ''}</span>
      <span class="cat-item-icon">${cat.icon}</span>
      <span class="cat-item-text">${cat.name}</span>
    `;
    container.appendChild(item);
  });

  if (!window._catOutsideClickListenerAttached) {
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('admCatMultiWrapper');
      const dropdown = document.getElementById('admCatDropdownMenu');
      if (wrapper && dropdown && dropdown.style.display !== 'none') {
        if (!wrapper.contains(e.target)) {
          closeAdminCatDropdown();
        }
      }
    });
    window._catOutsideClickListenerAttached = true;
  }

  updateAdminCategoryDisplay();
}

function toggleAdminCatDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('admCatDropdownMenu');
  const trigger = document.getElementById('admCatMultiTrigger');
  if (!dropdown || !trigger) return;

  const isOpen = (dropdown.style.display === 'block');
  if (isOpen) {
    closeAdminCatDropdown();
  } else {
    dropdown.style.display = 'block';
    trigger.classList.add('active');
    const searchInput = document.getElementById('admCatSearchInput');
    if (searchInput) {
      searchInput.value = '';
      filterAdminCatSearch('');
      setTimeout(() => searchInput.focus(), 60);
    }
  }
}

function closeAdminCatDropdown() {
  const dropdown = document.getElementById('admCatDropdownMenu');
  const trigger = document.getElementById('admCatMultiTrigger');
  if (dropdown) dropdown.style.display = 'none';
  if (trigger) trigger.classList.remove('active');
}

function filterAdminCatSearch(query) {
  const q = (query || '').toLowerCase().trim();
  const items = document.querySelectorAll('#admCatDropdownItems .cat-dropdown-item');
  items.forEach(el => {
    const name = (el.getAttribute('data-cat-name') || '').toLowerCase();
    el.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
  });
}

function toggleAdminCategory(catName, e) {
  if (e) e.stopPropagation();
  if (selectedAdminCategories.has(catName)) {
    if (selectedAdminCategories.size > 1) {
      selectedAdminCategories.delete(catName);
    } else {
      selectedAdminCategories.delete(catName);
    }
  } else {
    selectedAdminCategories.add(catName);
  }
  updateAdminCategoryDisplay();
}

function removeAdminCategoryChip(catName, e) {
  if (e) e.stopPropagation();
  selectedAdminCategories.delete(catName);
  updateAdminCategoryDisplay();
}

function selectAllAdminCategories(leetcodeOnly = true) {
  const catsToSelect = leetcodeOnly
    ? ALL_LEETCODE_CATEGORIES.slice(0, 16).map(c => c.name)
    : ALL_LEETCODE_CATEGORIES.map(c => c.name);
  selectedAdminCategories = new Set(catsToSelect);
  updateAdminCategoryDisplay();
}

function selectTopDsaCategories() {
  const dsaCats = ALL_LEETCODE_CATEGORIES.filter(c => c.dsaCore).map(c => c.name);
  selectedAdminCategories = new Set(dsaCats);
  updateAdminCategoryDisplay();
}

function clearAllAdminCategories() {
  selectedAdminCategories.clear();
  updateAdminCategoryDisplay();
}

function setAdminCategories(categoriesList) {
  if (!categoriesList || categoriesList.length === 0) {
    selectedAdminCategories = new Set(['Arrays & Hashing']);
  } else {
    selectedAdminCategories = new Set(categoriesList);
  }
  updateAdminCategoryDisplay();
}

function getSelectedAdminCategories() {
  return Array.from(selectedAdminCategories);
}

function updateAdminCategoryDisplay() {
  const count = selectedAdminCategories.size;
  const isAllLc = (count === 16 && ALL_LEETCODE_CATEGORIES.slice(0, 16).every(c => selectedAdminCategories.has(c.name)));

  // 1. Update hidden input for forms
  const hiddenInput = document.getElementById('admNewTestCategory');
  if (hiddenInput) {
    hiddenInput.value = count > 0 ? Array.from(selectedAdminCategories).join(', ') : 'General';
  }

  // 2. Update badge
  const badge = document.getElementById('admCatCountBadge');
  if (badge) {
    if (isAllLc) {
      badge.textContent = '🌟 All 16 Topics Selected';
    } else if (count === 0) {
      badge.textContent = 'None Selected (Default General)';
    } else if (count === 1) {
      badge.textContent = '1 Category Selected';
    } else {
      badge.textContent = `${count} Categories Selected`;
    }
  }

  // 3. Update chips container in trigger
  const chipsContainer = document.getElementById('admCatSelectedChips');
  if (chipsContainer) {
    chipsContainer.innerHTML = '';
    if (count === 0) {
      chipsContainer.innerHTML = '<span class="cat-placeholder">Click to select one or more categories...</span>';
    } else if (isAllLc) {
      chipsContainer.innerHTML = `
        <span class="cat-chip" style="background:rgba(99,102,241,0.25); border-color:var(--primary); color:#fff;">
          🌟 All Categories (16 LeetCode Topics)
          <span class="cat-chip-remove" onclick="clearAllAdminCategories(); event.stopPropagation();">✕</span>
        </span>
      `;
    } else {
      const arr = Array.from(selectedAdminCategories);
      const showLimit = 3;
      const visible = arr.slice(0, showLimit);
      const remaining = arr.length - showLimit;

      visible.forEach(name => {
        const catObj = ALL_LEETCODE_CATEGORIES.find(c => c.name === name) || { icon: '📂', name };
        const chip = document.createElement('span');
        chip.className = 'cat-chip';
        chip.innerHTML = `
          <span class="cat-item-icon">${catObj.icon}</span>
          <span>${catObj.name}</span>
          <span class="cat-chip-remove" onclick="removeAdminCategoryChip('${catObj.name}', event)">✕</span>
        `;
        chipsContainer.appendChild(chip);
      });

      if (remaining > 0) {
        const moreChip = document.createElement('span');
        moreChip.className = 'cat-chip-more';
        moreChip.textContent = `+${remaining} more`;
        chipsContainer.appendChild(moreChip);
      }
    }
  }

  // 4. Update dropdown items
  document.querySelectorAll('#admCatDropdownItems .cat-dropdown-item').forEach(item => {
    const catName = item.getAttribute('data-cat-name');
    const isSel = selectedAdminCategories.has(catName);
    item.classList.toggle('selected', isSel);
    const checkEl = item.querySelector('.cat-item-check');
    if (checkEl) checkEl.textContent = isSel ? '✓' : '';
  });

  // 5. Sync with top panel admSelectedLeetCodeCategory
  const topSelect = document.getElementById('admSelectedLeetCodeCategory');
  if (topSelect) {
    if (isAllLc || count === 0) {
      topSelect.value = 'All';
    } else if (count === 1) {
      const single = Array.from(selectedAdminCategories)[0];
      const opt = Array.from(topSelect.options).find(o => o.value === single);
      if (opt) topSelect.value = single;
      else topSelect.value = 'custom_multi';
    } else {
      topSelect.value = 'custom_multi';
    }
  }
}

// Multi-Select Assessment Modules State
let selectedAdminModules = new Set(['coding']);

function toggleAdminFormatModule(moduleName, cardEl) {
  if (selectedAdminModules.has(moduleName)) {
    if (selectedAdminModules.size === 1) {
      alert('At least one assessment format module must be selected.');
      return;
    }
    selectedAdminModules.delete(moduleName);
  } else {
    selectedAdminModules.add(moduleName);
  }
  updateAdminMultiFormatUI();
}

function setAdminFormatModules(modulesList) {
  if (!modulesList || modulesList.length === 0) modulesList = ['coding'];
  selectedAdminModules = new Set(modulesList);
  updateAdminMultiFormatUI();
}

function selectAdminExamFormat(format, btn) {
  if (!format) return;
  const parts = format.split('+').map(p => p.trim().toLowerCase());
  const newSet = [];
  if (parts.includes('coding') || parts.includes('python')) newSet.push('coding');
  if (parts.includes('sql')) newSet.push('sql');
  if (parts.includes('mcq') || parts.includes('hybrid')) newSet.push('mcq');
  if (newSet.length === 0) newSet.push('coding');
  setAdminFormatModules(newSet);
}

function updateAdminMultiFormatUI() {
  const hasCoding = selectedAdminModules.has('coding');
  const hasSql = selectedAdminModules.has('sql');
  const hasMcq = selectedAdminModules.has('mcq');

  // Update card active states and status pills
  document.querySelectorAll('#adminTabCreate .format-toggle-card').forEach(card => {
    const mod = card.getAttribute('data-module');
    const isAct = selectedAdminModules.has(mod);
    card.classList.toggle('active', isAct);
    const pill = card.querySelector('.module-status-pill');
    if (pill) {
      pill.textContent = isAct ? 'Included' : 'Add Module';
    }
  });

  // Calculate format string in standard order: coding, sql, mcq
  const parts = [];
  if (hasCoding) parts.push('coding');
  if (hasSql) parts.push('sql');
  if (hasMcq) parts.push('mcq');
  const formatStr = parts.join('+') || 'coding';

  const hiddenInput = document.getElementById('admNewTestFormat');
  if (hiddenInput) hiddenInput.value = formatStr;

  // Update summary banner text
  const summaryEl = document.getElementById('admFormatSummaryText');
  if (summaryEl) {
    const names = [];
    if (hasCoding) names.push('💻 LeetCode Coding');
    if (hasSql) names.push('🗄️ MySQL SQL');
    if (hasMcq) names.push('📝 Multiple Choice');
    const countTag = `(${parts.length} Module${parts.length > 1 ? 's' : ''})`;
    summaryEl.textContent = `${names.join(' + ')} ${countTag}`;
  }

  // Toggle LeetCode interactive studio
  const lcPanel = document.getElementById('admLeetCodeOptionsPanel');
  if (lcPanel) {
    lcPanel.style.display = hasCoding ? 'block' : 'none';
  }

  // Toggle Category group
  const catGroup = document.getElementById('admCategoryGroup');
  if (catGroup) {
    catGroup.style.display = (hasCoding || hasSql) ? 'block' : 'none';
  }

  // Toggle Question Distribution Rows
  const codingRow = document.getElementById('admCodingCountRow');
  if (codingRow) codingRow.style.display = hasCoding ? 'flex' : 'none';

  const sqlRow = document.getElementById('admSqlCountRow');
  if (sqlRow) sqlRow.style.display = hasSql ? 'flex' : 'none';

  const mcqBlock = document.getElementById('admMcqConfigBlock');
  if (mcqBlock) mcqBlock.style.display = hasMcq ? 'block' : 'none';

  updateTotalQuestionCounts();

  // Presets pills mapping
  let activePresetId = null;
  if (hasCoding && hasSql && !hasMcq) activePresetId = 'admPresetsCodingSql';
  else if (hasCoding && !hasSql && !hasMcq) activePresetId = 'admPresetsCoding';
  else if (!hasCoding && hasSql && !hasMcq) activePresetId = 'admPresetsSql';
  else if (!hasCoding && !hasSql && hasMcq) activePresetId = 'admPresetsMcq';
  else activePresetId = null;

  ['admPresetsCoding', 'admPresetsSql', 'admPresetsMcq', 'admPresetsCodingSql'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (id === activePresetId) ? 'flex' : 'none';
  });

  // Adjust placeholders
  const topicInput = document.getElementById('admNewTestTopic');
  if (topicInput) {
    if (hasCoding && hasSql && hasMcq) {
      topicInput.placeholder = 'e.g. Full Stack Assessment (DSA Algorithms + MySQL Joins + MCQs)...';
    } else if (hasCoding && hasSql) {
      topicInput.placeholder = 'e.g. Python Algorithms & MySQL Relational Joins...';
    } else if (hasCoding && hasMcq) {
      topicInput.placeholder = 'e.g. Python Data Structures & Object Oriented Concepts...';
    } else if (hasSql && hasMcq) {
      topicInput.placeholder = 'e.g. Relational Database Design, SQL Queries & Indexing...';
    } else if (hasCoding) {
      topicInput.placeholder = 'e.g. 1. Two Sum, Valid Parentheses, Binary Search, LRU Cache...';
    } else if (hasSql) {
      topicInput.placeholder = 'e.g. Employee & Department Joins, Window Functions, Aggregate Queries...';
    } else {
      topicInput.placeholder = 'e.g. Operating Systems, Networks, Python OOP, SQL Fundamentals...';
    }
  }
}

function setAdminSetupTopic(topic) {
  const topicInput = document.getElementById('admNewTestTopic');
  const titleInput = document.getElementById('admNewTestTitle');
  if (topicInput) {
    topicInput.value = topic;
    topicInput.focus();
  }
  if (titleInput && (!titleInput.value || titleInput.value.includes('Assessment') || titleInput.value.includes('Placement'))) {
    titleInput.value = `${topic} Assessment`;
  }
  const badge = document.getElementById('admRandomProblemBadge');
  if (badge) badge.style.display = 'none';
}

function selectAdminCodingCount(count, btn) {
  const input = document.getElementById('admNewTestCodingCount');
  if (input) input.value = count;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  updateTotalQuestionCounts();
}

function selectAdminSqlCount(count, btn) {
  const input = document.getElementById('admNewTestSqlCount');
  if (input) input.value = count;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  updateTotalQuestionCounts();
}

function selectAdminMcqCount(count, btn) {
  const input = document.getElementById('admNewTestMcqCount');
  if (input) input.value = count;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  updateTotalQuestionCounts();
}

// YouTube-Style Tag Management for MCQ Topics
let adminMcqTagsList = [];

function focusMcqTagInput() {
  document.getElementById('admMcqTaglineInput')?.focus();
}

function renderAdminMcqTags() {
  const container = document.getElementById('admMcqTagChipsContainer');
  const hiddenInput = document.getElementById('admNewTestMcqTagline');
  if (!container) return;

  container.innerHTML = '';
  adminMcqTagsList.forEach((tag, idx) => {
    const chip = document.createElement('span');
    chip.className = 'yt-tag-chip';
    chip.innerHTML = `
      <span>${escHtml(tag)}</span>
      <button type="button" class="yt-tag-del" onclick="event.stopPropagation(); removeAdminMcqTag(${idx})" title="Remove tag">✕</button>
    `;
    container.appendChild(chip);
  });

  if (hiddenInput) {
    hiddenInput.value = adminMcqTagsList.join(', ');
  }
}

function addAdminMcqTag(text) {
  const clean = (text || '').trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
  if (!clean) return;
  const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
  parts.forEach(p => {
    if (!adminMcqTagsList.some(t => t.toLowerCase() === p.toLowerCase())) {
      adminMcqTagsList.push(p);
    }
  });
  renderAdminMcqTags();
  const input = document.getElementById('admMcqTaglineInput');
  if (input) input.value = '';
}

function removeAdminMcqTag(idx) {
  if (idx >= 0 && idx < adminMcqTagsList.length) {
    adminMcqTagsList.splice(idx, 1);
    renderAdminMcqTags();
  }
}

function onMcqTagKeyDown(e) {
  const input = e.target;
  const val = input.value;
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (val.trim()) {
      addAdminMcqTag(val);
      input.value = '';
    }
  } else if (e.key === 'Backspace' && !val && adminMcqTagsList.length > 0) {
    adminMcqTagsList.pop();
    renderAdminMcqTags();
  }
}

function onMcqTagInput(e) {
  const input = e.target;
  if (input.value.includes(',')) {
    addAdminMcqTag(input.value);
    input.value = '';
  }
}

function onMcqTagPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (text) {
    addAdminMcqTag(text);
  }
}

function appendAdminMcqTagline(tag) {
  addAdminMcqTag(tag);
}

function updateTotalQuestionCounts() {
  const hasCoding = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('coding');
  const hasSql = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('sql');
  const hasMcq = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('mcq');

  const codingCount = hasCoding ? (parseInt(document.getElementById('admNewTestCodingCount')?.value, 10) || 1) : 0;
  const sqlCount = hasSql ? (parseInt(document.getElementById('admNewTestSqlCount')?.value, 10) || 1) : 0;
  const mcqCount = hasMcq ? (parseInt(document.getElementById('admNewTestMcqCount')?.value, 10) || 10) : 0;

  const total = (codingCount + sqlCount + mcqCount) || 1;
  const hiddenInput = document.getElementById('admNewTestCount');
  if (hiddenInput) hiddenInput.value = total;

  const badge = document.getElementById('admTotalQuestionsBadge');
  if (badge) {
    const parts = [];
    if (codingCount > 0) parts.push(`${codingCount} Coding`);
    if (sqlCount > 0) parts.push(`${sqlCount} SQL`);
    if (mcqCount > 0) parts.push(`${mcqCount} MCQ${mcqCount > 1 ? 's' : ''}`);
    badge.textContent = `Total: ${parts.length ? parts.join(' + ') : total + ' Questions'} (${total} Total)`;
  }
}

function selectAdminQuestionCount(num, btn) {
  const input = document.getElementById('admNewTestCount');
  if (input) input.value = num;
  const parent = btn.closest('.segmented-control');
  if (parent) {
    parent.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

function selectAdminTimeLimit(min, btn) {
  const input = document.getElementById('admNewTestTimeLimit');
  if (input) {
    input.value = min;
    input.style.borderColor = '';
    input.style.boxShadow = '';
  }
  const parent = btn && btn.closest ? btn.closest('.segmented-control') : null;
  if (parent) {
    parent.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  if (typeof saveAdminTestDraft === 'function') {
    saveAdminTestDraft();
  }
}

function selectAdminStartLanguage(lang, btn) {
  const input = document.getElementById('admSelectedCodeLanguage');
  if (input) input.value = lang;
  document.querySelectorAll('#admCodeLangPills .lang-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function onAdminLeetCodeCategoryChange() {
  const topSelect = document.getElementById('admSelectedLeetCodeCategory');
  if (topSelect) {
    const val = topSelect.value;
    if (val === 'All') {
      selectAllAdminCategories(true);
    } else if (val === 'custom_multi') {
      toggleAdminCatDropdown();
    } else {
      setAdminCategories([val]);
    }
  }
  const badge = document.getElementById('admRandomProblemBadge');
  if (badge) badge.style.display = 'none';
}

function pickRandomLeetCodeForAdmin() {
  const selectedCats = getSelectedAdminCategories();
  const diff = document.getElementById('admSelectedLeetCodeDiff')?.value || 'Medium';
  if (typeof LEETCODE !== 'undefined') {
    const p = LEETCODE.getRandomProblem(selectedCats.length > 0 ? selectedCats : 'All', diff);
    if (p) {
      document.getElementById('admNewTestTopic').value = p.title;
      const titleInput = document.getElementById('admNewTestTitle');
      if (titleInput) titleInput.value = `${p.title} Assessment`;

      setAdminCategories([p.category]);

      const diffSelect = document.getElementById('admNewTestDifficulty');
      if (diffSelect) diffSelect.value = p.difficulty;

      const instr = document.getElementById('admNewTestInstructions');
      if (instr) instr.value = `Official LeetCode problem #${p.id}: ${p.title}. Solve with optimal complexity. All 10–15 test cases must pass.`;

      const badge = document.getElementById('admRandomProblemBadge');
      const nameEl = document.getElementById('admRandomProblemName');
      if (badge && nameEl) {
        nameEl.textContent = `${p.title} (${p.difficulty}) [${p.category}]`;
        badge.style.display = 'inline-flex';
      }
    }
  }
}

function onQuickLeetCodeSelect(probId) {
  if (!probId || typeof LEETCODE === 'undefined') return;
  const p = LEETCODE.getCatalog().find(item => item.id === probId);
  if (!p) return;

  const titleInput = document.getElementById('admNewTestTitle');
  const topicInput = document.getElementById('admNewTestTopic');
  const diffSelect = document.getElementById('admNewTestDifficulty');
  const instrInput = document.getElementById('admNewTestInstructions');

  selectAdminExamFormat('coding', null);
  if (titleInput) titleInput.value = `${p.title} Assessment`;
  if (topicInput) topicInput.value = p.title;
  setAdminCategories([p.category]);
  if (diffSelect) diffSelect.value = p.difficulty;
  if (instrInput) instrInput.value = `LeetCode problem #${p.id}: Solve with optimal time and space complexity. Automated unit testing with 10–15 test cases.`;
}

function onAdminFormatChange(fmt) {
  selectAdminExamFormat(fmt, null);
}

function onAdminPresetChange(preset) {
  const cam = document.getElementById('admNewTestCamera');
  const mic = document.getElementById('admNewTestMic');
  const apps = document.getElementById('admNewTestAllowApps');
  const fs = document.getElementById('admNewTestFullscreen');

  if (preset === 'strict') {
    if (cam) cam.checked = true;
    if (mic) mic.checked = true;
    if (apps) apps.checked = false;
    if (fs) fs.checked = true;
  } else if (preset === 'balanced') {
    if (cam) cam.checked = true;
    if (mic) mic.checked = true;
    if (apps) apps.checked = true;
    if (fs) fs.checked = false;
  } else if (preset === 'practice') {
    if (cam) cam.checked = false;
    if (mic) mic.checked = false;
    if (apps) apps.checked = true;
    if (fs) fs.checked = false;
  }
}

async function submitCreateTest(launchImmediately = false, forceAssign = null) {
  let title = (document.getElementById('admNewTestTitle')?.value || '').trim();
  const format = document.getElementById('admNewTestFormat')?.value || 'coding';
  let topic = (document.getElementById('admNewTestTopic')?.value || '').trim();
  const selectedCats = getSelectedAdminCategories();
  const category = selectedCats.length > 0 ? selectedCats.join(', ') : (document.getElementById('admNewTestCategory')?.value || 'Arrays & Hashing');
  const difficulty = document.getElementById('admNewTestDifficulty')?.value || 'Medium';

  const hasCoding = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('coding');
  const hasSql = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('sql');
  const hasMcq = typeof selectedAdminModules !== 'undefined' && selectedAdminModules.has('mcq');

  const codingCount = hasCoding ? (parseInt(document.getElementById('admNewTestCodingCount')?.value, 10) || 1) : 0;
  const sqlCount = hasSql ? (parseInt(document.getElementById('admNewTestSqlCount')?.value, 10) || 1) : 0;
  const mcqCount = hasMcq ? (parseInt(document.getElementById('admNewTestMcqCount')?.value, 10) || 10) : 0;
  const mcqTagline = (document.getElementById('admNewTestMcqTagline')?.value || '').trim();
  const totalCount = (codingCount + sqlCount + mcqCount) || 1;

  let rawTimeLimit = (document.getElementById('admNewTestTimeLimit')?.value || '').trim();
  let timeLimit = parseInt(rawTimeLimit, 10);
  if (isNaN(timeLimit) || timeLimit <= 0) {
    timeLimit = 30;
    const timeInput = document.getElementById('admNewTestTimeLimit');
    if (timeInput) timeInput.value = '30';
  }
  const preset = document.getElementById('admNewTestPreset')?.value || 'strict';
  const instructions = (document.getElementById('admNewTestInstructions')?.value || '').trim();
  const scheduledStart = document.getElementById('admNewTestStart')?.value || null;
  const scheduledEnd = document.getElementById('admNewTestEnd')?.value || null;

  let isAssigned = false;
  if (forceAssign !== null) {
    isAssigned = Boolean(forceAssign);
    const assignCheckbox = document.getElementById('admNewTestAssign');
    if (assignCheckbox) assignCheckbox.checked = isAssigned;
  } else {
    const assignCheckbox = document.getElementById('admNewTestAssign');
    isAssigned = assignCheckbox ? Boolean(assignCheckbox.checked) : true;
  }

  const quickProbId = document.getElementById('admQuickLeetCodeSelect')?.value || null;
  const allowedAttempts = parseInt(document.getElementById('admNewTestAllowedAttempts')?.value || '1', 10);
  const maxAttempts = parseInt(document.getElementById('admNewTestMaxAttempts')?.value || '3', 10);
  const msgEl = document.getElementById('admCreateTestMsg');

  const proctorOptions = {
    camera: Boolean(document.getElementById('admNewTestCamera')?.checked),
    mic: Boolean(document.getElementById('admNewTestMic')?.checked),
    allowApps: Boolean(document.getElementById('admNewTestAllowApps')?.checked),
    fullscreen: Boolean(document.getElementById('admNewTestFullscreen')?.checked),
    maxMalpracticeAttempts: maxAttempts,
    allowedAttempts: allowedAttempts
  };

  if (!title && topic) title = topic;
  if (!topic && title) topic = title;
  if (!title && !topic) {
    title = 'Assessment ' + new Date().toLocaleDateString();
    topic = 'General Assessment';
  }

  saveAdminTestDraft();

  const testPayload = {
    title,
    format,
    topic,
    category,
    categories: selectedCats,
    difficulty,
    numQuestions: totalCount,
    codingCount,
    sqlCount,
    mcqCount,
    mcqTagline,
    timeLimitMin: timeLimit,
    allowedAttempts,
    maxAttempts: allowedAttempts,
    maxMalpracticeAttempts: maxAttempts,
    proctorPreset: preset,
    proctorOptions,
    instructions,
    problemId: quickProbId,
    scheduledStart,
    scheduledEnd,
    isAssigned
  };

  try {
    const res = await API.saveCustomTest(testPayload);
    if (res && res.success) {
      if (isAssigned && res.test && res.test.id) {
        await API.setActiveAssignment(res.test.id, true, scheduledStart, scheduledEnd, proctorOptions, allowedAttempts);
        await checkActiveAssignment();
      }

      if (msgEl) {
        msgEl.textContent = isAssigned
          ? '📢 Assessment published & assigned as active candidate exam on Main Quiz portal!'
          : '💾 Assessment successfully saved to Test Catalog (Unpublished)!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 6000);
      }

      await loadAdminCatalog();

      if (launchImmediately) {
        launchCustomTest(res.test || testPayload);
      } else {
        // Navigate to Catalog tab so admin sees newly published test
        const catalogBtn = document.querySelector('.admin-subtab-btn[onclick*="catalog"]');
        switchAdminTab('catalog', catalogBtn);

        alert(isAssigned
          ? `📢 Assessment "${title}" has been successfully published to the Main Quiz portal!\n\nCandidates will now immediately see this assessment live on their exam screen.`
          : `💾 Assessment "${title}" saved to the Test Catalog!`);
        document.getElementById('adminCreateTestForm')?.reset();
        adminMcqTagsList = [];
        renderAdminMcqTags();
        setAdminCategories(['Arrays & Hashing']);
        setAdminFormatModules(['coding']);
        onAdminPresetChange('strict');
      }
    } else {
      const errStr = (res && (res.error || res.message)) || 'Unknown error occurred while publishing.';
      if (msgEl) {
        msgEl.textContent = '❌ Failed to save test: ' + errStr;
        msgEl.style.color = '#f87171';
        msgEl.style.display = 'block';
      }
      alert('Failed to save assessment:\n' + errStr);
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving test: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
    alert('Error saving assessment:\n' + err.message);
  }
}

// ── Test Catalog Grid & Scheduling ───────────────────────────────────────────
async function loadAdminCatalog() {
  try {
    const data = await API.getCustomTests();
    if (data && data.success) {
      allCustomTests = data.tests || [];
      const badgeCatalog = document.getElementById('admTabBadgeCatalog');
      if (badgeCatalog) badgeCatalog.textContent = allCustomTests.length;
      renderAdminCatalog(allCustomTests);
    }
  } catch (err) {
    console.warn('Could not load test catalog:', err);
  }
}

function renderAdminCatalog(tests) {
  const grid = document.getElementById('admCatalogGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!tests || tests.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted); padding:2rem;">No custom tests created yet. Use the "Create New Test" tab to design one!</div>';
    return;
  }

  tests.forEach(t => {
    const card = document.createElement('div');
    card.className = 'catalog-card';

    const fmt = (t.format || 'coding').toLowerCase();
    const fmtBadge = `<span class="tbl-badge format-${fmt}">${fmt.toUpperCase()}</span>`;
    const presetLabel = t.proctorPreset === 'practice' ? 'Practice' : t.proctorPreset === 'balanced' ? 'Balanced' : 'Strict Lockdown';

    const isAssigned = Boolean(t.isAssigned);
    const assignedBadge = isAssigned
      ? `<span class="badge-status-pill badge-assigned" style="font-size:0.72rem; padding:0.2rem 0.5rem;">⭐ Assigned Active</span>`
      : '';

    let scheduleBadge = '';
    if (t.scheduledStart || t.scheduledEnd) {
      scheduleBadge = `<span class="badge-status-pill badge-scheduled" style="font-size:0.72rem; padding:0.2rem 0.5rem;">📅 Scheduled</span>`;
    }

    const opts = t.proctorOptions || {
      camera: t.proctorPreset !== 'practice',
      mic: t.proctorPreset !== 'practice',
      allowApps: t.proctorPreset === 'practice',
      fullscreen: t.proctorPreset === 'strict'
    };
    const camBadge = `<span class="tbl-badge ${opts.camera ? 'format-coding' : 'format-mcq'}" style="font-size:0.7rem; padding:0.15rem 0.45rem;">📷 Cam: ${opts.camera ? 'ON' : 'OFF'}</span>`;
    const micBadge = `<span class="tbl-badge ${opts.mic ? 'format-coding' : 'format-mcq'}" style="font-size:0.7rem; padding:0.15rem 0.45rem;">🎙️ Mic: ${opts.mic ? 'ON' : 'OFF'}</span>`;
    const appBadge = `<span class="tbl-badge ${opts.allowApps ? 'format-hybrid' : 'format-coding'}" style="font-size:0.7rem; padding:0.15rem 0.45rem;">💻 Apps: ${opts.allowApps ? 'Allowed' : 'Blocked'}</span>`;
    const fsBadge = `<span class="tbl-badge ${opts.fullscreen ? 'format-sql' : 'format-mcq'}" style="font-size:0.7rem; padding:0.15rem 0.45rem;">⛶ Fullscreen: ${opts.fullscreen ? 'ON' : 'OFF'}</span>`;

    card.innerHTML = `
      <div>
        <div class="cat-top">
          <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
            ${fmtBadge}
            ${assignedBadge}
            ${scheduleBadge}
          </div>
          <span style="font-size:0.75rem; color:var(--text-dim); font-weight:700;">⏱️ ${t.timeLimitMin || 30} mins</span>
        </div>
        <div class="cat-title">${escHtml(t.title)}</div>
        <div class="cat-meta" style="margin-top:0.5rem;">
          <span>🎯 Topic: <strong>${escHtml(t.topic)}</strong></span>
          <span>⚡ ${escHtml(t.difficulty || 'Medium')}</span>
          <span>🛡️ ${presetLabel}</span>
        </div>
        <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-top:0.6rem;">
          ${camBadge}
          ${micBadge}
          ${appBadge}
          ${fsBadge}
        </div>
        ${t.instructions ? `<div class="cat-instructions" style="margin-top:0.75rem;">${escHtml(t.instructions)}</div>` : ''}
      </div>

      <div class="cat-actions" style="display:flex; flex-direction:column; gap:0.5rem;">
        <div style="display:flex; gap:0.5rem; width:100%;">
          <button class="cat-launch-btn" onclick='launchCustomTest(${JSON.stringify(t)})' style="flex:1;">
            <span>🚀</span>
            <span>Launch Session</span>
          </button>
          <button class="cat-delete-btn" onclick="deleteCustomTest('${t.id}')" title="Delete Test">
            🗑️
          </button>
        </div>
        ${!isAssigned ? `
          <button type="button" class="lc-action-btn assign" style="width:100%; justify-content:center; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; font-weight:800; border:none; padding:0.6rem 1rem; box-shadow: 0 2px 10px rgba(16,185,129,0.35); cursor:pointer;" onclick="publishTestToMainQuizDirectly('${t.id}')">
            <span>📢</span>
            <span>Publish Test to Main Quiz</span>
          </button>
        ` : `
          <div style="display:flex; gap:0.4rem; width:100%;">
            <button type="button" class="lc-action-btn active" style="flex:1; justify-content:center; background:rgba(16,185,129,0.18); border:1px solid #10b981; color:#34d399; font-weight:700; cursor:default;">
              <span>⭐ Active on Main Quiz</span>
            </button>
            <button type="button" class="admin-btn-danger" style="padding:0.4rem 0.65rem; font-size:0.78rem;" onclick="unassignTestDirectly('${t.id}')" title="Unassign test from candidate portal">
              <span>Unassign</span>
            </button>
          </div>
        `}
        <button type="button" class="lc-action-btn" style="width:100%; justify-content:center; font-size:0.8rem; padding:0.4rem;" onclick="openScheduleModal('${t.id}')">
          <span>📅</span>
          <span>${isAssigned ? 'Schedule & Options (Active)' : 'Schedule & Timers'}</span>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function publishTestToMainQuizDirectly(testId) {
  try {
    const t = allCustomTests.find(item => item.id === testId);
    const title = t ? t.title : 'Assessment';
    const allowedAttempts = Number(t?.allowedAttempts || t?.maxAttempts || 1);
    const res = await API.setActiveAssignment(testId, true, t?.scheduledStart || null, t?.scheduledEnd || null, t?.proctorOptions || null, allowedAttempts);
    if (res && res.success) {
      await loadAdminCatalog();
      await checkActiveAssignment();
      alert(`📢 Successfully published "${title}" to the Main Quiz portal!\n\nCandidates will now see this assessment live on the exam screen.`);
    } else {
      alert('Could not publish test: ' + (res?.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to publish test: ' + err.message);
  }
}

async function unassignTestDirectly(testId) {
  if (!confirm('Unassign this assessment from the candidate exam portal?\n\nThe candidate portal will return to the awaiting assessment standby state.')) return;
  try {
    const res = await fetch('/api/admin/active-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unassign', testId })
    });
    const data = await res.json();
    if (data.success) {
      await loadAdminCatalog();
      await checkActiveAssignment();
      alert('✅ Assessment unassigned. Candidate portal is now in standby awaiting dispatch.');
    } else {
      alert('Failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to unassign: ' + err.message);
  }
}

function openScheduleModal(testId) {
  const t = allCustomTests.find(item => item.id === testId);
  if (!t) return;

  const modal = document.getElementById('adminScheduleModal');
  if (!modal) return;

  document.getElementById('schedModalTestId').value = t.id;
  document.getElementById('schedModalTestTitle').textContent = t.title;
  document.getElementById('schedModalIsAssigned').checked = Boolean(t.isAssigned);
  document.getElementById('schedModalStart').value = t.scheduledStart ? t.scheduledStart.substring(0, 16) : '';
  document.getElementById('schedModalEnd').value = t.scheduledEnd ? t.scheduledEnd.substring(0, 16) : '';

  const opts = t.proctorOptions || {
    camera: t.proctorPreset !== 'practice',
    mic: t.proctorPreset !== 'practice',
    allowApps: t.proctorPreset === 'practice',
    fullscreen: t.proctorPreset === 'strict',
    maxMalpracticeAttempts: 10
  };
  const cam = document.getElementById('schedModalCamera');
  const mic = document.getElementById('schedModalMic');
  const apps = document.getElementById('schedModalAllowApps');
  const fs = document.getElementById('schedModalFullscreen');
  const attempts = document.getElementById('schedModalMaxAttempts');
  const allowedAttemptsEl = document.getElementById('schedModalAllowedAttempts');
  if (cam) cam.checked = Boolean(opts.camera);
  if (mic) mic.checked = Boolean(opts.mic);
  if (apps) apps.checked = Boolean(opts.allowApps);
  if (fs) fs.checked = Boolean(opts.fullscreen);
  if (attempts) attempts.value = String(opts.maxMalpracticeAttempts || 10);
  if (allowedAttemptsEl) allowedAttemptsEl.value = String(t.allowedAttempts || t.maxAttempts || 1);

  const msg = document.getElementById('schedModalStatusMsg');
  if (msg) msg.style.display = 'none';

  modal.style.display = 'flex';
}

function closeAdminScheduleModal() {
  const modal = document.getElementById('adminScheduleModal');
  if (modal) modal.style.display = 'none';
}

async function saveScheduleModalData() {
  const testId = document.getElementById('schedModalTestId')?.value;
  const isAssigned = Boolean(document.getElementById('schedModalIsAssigned')?.checked);
  const start = document.getElementById('schedModalStart')?.value || null;
  const end = document.getElementById('schedModalEnd')?.value || null;
  const allowedAttempts = parseInt(document.getElementById('schedModalAllowedAttempts')?.value || '1', 10);
  const maxAttempts = parseInt(document.getElementById('schedModalMaxAttempts')?.value || '10', 10);
  const msgEl = document.getElementById('schedModalStatusMsg');

  const proctorOptions = {
    camera: Boolean(document.getElementById('schedModalCamera')?.checked),
    mic: Boolean(document.getElementById('schedModalMic')?.checked),
    allowApps: Boolean(document.getElementById('schedModalAllowApps')?.checked),
    fullscreen: Boolean(document.getElementById('schedModalFullscreen')?.checked),
    maxMalpracticeAttempts: maxAttempts,
    allowedAttempts: allowedAttempts
  };

  try {
    const res = await API.setActiveAssignment(testId, isAssigned, start, end, proctorOptions, allowedAttempts);
    if (res && res.success) {
      if (msgEl) {
        msgEl.textContent = '✅ Schedule & Assignment updated successfully!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
      }
      await loadAdminCatalog();
      await checkActiveAssignment();
      setTimeout(() => closeAdminScheduleModal(), 1200);
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving schedule: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
  }
}

async function unassignTestFromModal() {
  const testId = document.getElementById('schedModalTestId')?.value;
  if (!testId) return;
  if (!confirm('Unassign this assessment from the candidate exam portal?\n\nThe candidate portal will return to the awaiting assessment standby state.')) return;
  try {
    const res = await fetch('/api/admin/active-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unassign', testId })
    });
    const data = await res.json();
    if (data.success) {
      closeAdminScheduleModal();
      await loadAdminCatalog();
      await checkActiveAssignment();
      alert('✅ Assessment unassigned. Candidate portal is now in standby awaiting dispatch.');
    }
  } catch (err) {
    alert('Failed to unassign: ' + err.message);
  }
}

async function resetMainQuizData() {
  if (!confirm('Are you sure you want to reset the main quiz portal data?\n\nThis will unassign all tests so no tests appear in the main candidate portal until an administrator explicitly assigns one.')) {
    return;
  }
  try {
    const res = await fetch('/api/admin/reset-mainquiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      sessionStorage.removeItem('proctoriq_current_test');
      allCustomTests = data.tests || [];
      renderAdminCatalog(allCustomTests);
      await checkActiveAssignment();
      alert('✅ Main Quiz & Portal data has been reset!\n\nAll assessments are now unassigned. The candidate portal shows "Awaiting Assessment Dispatch".');
    } else {
      alert('Error resetting portal data: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    alert('Connection error resetting quiz data: ' + err.message);
  }
}

async function launchCustomTest(t) {
  // Immediately request browser & desktop fullscreen on user click
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.enter_fullscreen) {
      window.pywebview.api.enter_fullscreen().catch(() => {});
    }
  } catch (_) {}

  const candidateName = document.getElementById('candidateNameInput')?.value.trim() || 'Student';
  sessionStorage.setItem('proctoriq_candidate_name', candidateName);

  const proctorOptions = t.proctorOptions || {
    camera: t.proctorPreset !== 'practice',
    mic: t.proctorPreset !== 'practice',
    allowApps: t.proctorPreset === 'practice',
    fullscreen: t.proctorPreset === 'strict',
    maxMalpracticeAttempts: 10
  };
  if (!proctorOptions.maxMalpracticeAttempts || proctorOptions.maxMalpracticeAttempts < 10) {
    proctorOptions.maxMalpracticeAttempts = 10;
  }
  const withProctor = Boolean(proctorOptions.camera || proctorOptions.mic || t.proctorPreset !== 'practice');

  // Pre-exam security scan: block start if forbidden AI tools are running and external apps are blocked
  if (withProctor && !proctorOptions.allowApps) {
    try {
      const url = CONFIG.PROCTOR_SCAN_URL || 'http://localhost:3000/api/proctor-scan';
      const scanRes = await fetch(url);
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (!scanData.safe && scanData.detected && scanData.detected.length > 0) {
          const names = scanData.detected.map(d => d.label || d.name).join(', ');
          alert(`🚫 Cannot Start Proctored Exam\n\nProhibited application detected: ${names}.\n\nPlease close all external AI tools before beginning.`);
          return;
        }
      }
    } catch (_) {}
  }

  // Always force fullscreen when exam starts — use PROCTOR.enterFullscreen()
  // so the grace period is set to suppress false tab-switch warnings from the blur
  // event that browsers fire when entering fullscreen
  try {
    if (typeof PROCTOR !== 'undefined' && PROCTOR.enterFullscreen) {
      PROCTOR.enterFullscreen();
    } else {
      await API.enterFullscreen();
    }
  } catch (e) {
    console.warn('Fullscreen entry error:', e);
  }

  const allowedAttempts = Number(t.allowedAttempts || t.maxAttempts || (t.id === 'demo-test-candidate' ? 999 : 1));
  if (typeof QUIZ !== 'undefined' && typeof QUIZ.setMeta === 'function') {
    QUIZ.setMeta({
      testId: t.id || null,
      testTitle: t.title || t.topic || '',
      allowedAttempts: allowedAttempts
    });
  }

  showScreen('quizScreen');
  const extraConfig = {
    codingCount: t.codingCount,
    sqlCount: t.sqlCount,
    mcqCount: t.mcqCount,
    mcqTagline: t.mcqTagline,
    problemId: t.problemId || null,
    timeLimitMin: t.timeLimitMin || 30,
    questions: t.questions || t.customQuestions || null
  };
  await QUIZ.start(t.topic, t.numQuestions || 1, withProctor, t.format || 'coding', 'python', t.category || 'General', t.difficulty || 'Medium', proctorOptions, extraConfig);
}

async function deleteCustomTest(testId) {
  if (!confirm('Are you sure you want to remove this test from the catalog?')) return;
  try {
    await API.deleteCustomTest(testId);
    await loadAdminCatalog();
    await checkActiveAssignment();
  } catch (err) {
    alert('Could not delete test: ' + err.message);
  }
}

// ── Proctoring System Policy Controller ──────────────────────────────────────
function updateProctorSliderLabel(elemId, val, unit) {
  const el = document.getElementById(elemId);
  if (el) el.textContent = `${val} ${unit}${Number(val) === 1 ? '' : (unit === 'switch' ? 'es' : '')}`;
}

async function loadAdminProctorSettings() {
  try {
    const data = await API.getProctorConfig();
    if (data && data.success && data.config) {
      const c = data.config;

      const tabInput = document.getElementById('admInputTabSwitches');
      const soundInput = document.getElementById('admInputSoundWarnings');
      const awayInput = document.getElementById('admInputAwaySec');

      if (tabInput && c.maxTabSwitches !== undefined) {
        tabInput.value = c.maxTabSwitches;
        updateProctorSliderLabel('admValTabSwitches', c.maxTabSwitches, 'switch');
      }
      if (soundInput && c.maxSoundWarnings !== undefined) {
        soundInput.value = c.maxSoundWarnings;
        updateProctorSliderLabel('admValSoundWarnings', c.maxSoundWarnings, 'warnings');
      }
      if (awayInput && c.maxAwaySec !== undefined) {
        awayInput.value = c.maxAwaySec;
        updateProctorSliderLabel('admValAwaySec', c.maxAwaySec, 'seconds');
      }

      const lightTog = document.getElementById('admToggleLighting');
      const antiTog = document.getElementById('admToggleAntiAi');
      const fsTog = document.getElementById('admToggleFullscreen');
      const dualTog = document.getElementById('admToggleDualAi');
      const omniInput = document.getElementById('admInputOmniKey');

      if (lightTog && c.lightingGuard !== undefined) lightTog.checked = Boolean(c.lightingGuard);
      if (antiTog && c.antiAiScanner !== undefined) antiTog.checked = Boolean(c.antiAiScanner);
      if (fsTog && c.fullscreenLockdown !== undefined) fsTog.checked = Boolean(c.fullscreenLockdown);
      if (dualTog && c.dualAiVerification !== undefined) dualTog.checked = Boolean(c.dualAiVerification);
      if (omniInput && c.omniRouteKey !== undefined) omniInput.value = c.omniRouteKey;
    }
  } catch (err) {
    console.warn('Could not load proctor config:', err);
  }
}

async function saveAdminProctorSettings() {
  const tabSwitches = parseInt(document.getElementById('admInputTabSwitches')?.value, 10) || 1;
  const soundWarnings = parseInt(document.getElementById('admInputSoundWarnings')?.value, 10) || 10;
  const awaySec = parseInt(document.getElementById('admInputAwaySec')?.value, 10) || 25;
  const lightingGuard = Boolean(document.getElementById('admToggleLighting')?.checked);
  const antiAiScanner = Boolean(document.getElementById('admToggleAntiAi')?.checked);
  const fullscreenLockdown = Boolean(document.getElementById('admToggleFullscreen')?.checked);
  const dualAiVerification = Boolean(document.getElementById('admToggleDualAi')?.checked);
  const omniRouteKey = (document.getElementById('admInputOmniKey')?.value || '').trim();
  const msgEl = document.getElementById('admProctorSaveMsg');

  const policy = {
    maxTabSwitches,
    maxSoundWarnings,
    maxAwaySec: awaySec,
    lightingGuard,
    antiAiScanner,
    fullscreenLockdown,
    dualAiVerification,
    omniRouteKey
  };

  try {
    const res = await API.saveProctorConfig(policy);
    if (res && res.success) {
      if (msgEl) {
        msgEl.textContent = '✅ Proctoring policy saved and applied live across all exams!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 4000);
      }
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving proctor policy: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
  }
}

// ==============================================================================
// LEETCODE INTEGRATION & PROBLEM EXPLORER (ADMIN DASHBOARD)
// ==============================================================================
let currentAdminLcCategory = 'All';
let inspectedProblem = null;
let currentLeetCodeAccount = null;

function togglePasswordVisibility(id) {
  const el = document.getElementById(id);
  if (el) {
    el.type = el.type === 'password' ? 'text' : 'password';
  }
}

async function loadAdminLeetCodeAccount() {
  try {
    const res = await fetch('/api/admin/leetcode-account');
    const data = await res.json();
    if (!data.success) return;
    currentLeetCodeAccount = data.account;
    renderLeetCodeAccountUI(data.account);
  } catch (err) {
    console.error('Error loading LeetCode account:', err);
  }
}

function renderLeetCodeAccountUI(acc) {
  const badge = document.getElementById('alcaStatusBadge');
  const connectedView = document.getElementById('alcaConnectedView');
  const connectForm = document.getElementById('alcaConnectForm');
  const userEl = document.getElementById('alcaUsername');
  const rankEl = document.getElementById('alcaRank');
  const solvedEl = document.getElementById('alcaSolved');
  const sessionEl = document.getElementById('alcaMaskedSession');
  const avatarLetter = document.getElementById('alcaAvatarLetter');

  if (acc && acc.connected) {
    if (badge) {
      badge.textContent = `Connected (@${acc.username || 'user'})`;
      badge.className = 'tbl-badge format-coding';
      badge.style.background = 'rgba(52, 211, 153, 0.15)';
      badge.style.color = '#34d399';
      badge.style.border = '1px solid rgba(52, 211, 153, 0.3)';
    }
    if (userEl) userEl.textContent = `@${acc.username}`;
    if (rankEl) rankEl.textContent = acc.ranking ? `#${acc.ranking.toLocaleString()}` : 'Top Rank';
    if (solvedEl) solvedEl.textContent = `${acc.totalSolved || 0} Solved (${acc.easySolved || 0}E / ${acc.mediumSolved || 0}M / ${acc.hardSolved || 0}H)`;
    if (sessionEl) sessionEl.textContent = acc.maskedSession || 'Session Active';
    if (avatarLetter) avatarLetter.textContent = (acc.username || 'L')[0].toUpperCase();

    if (connectedView) connectedView.style.display = 'block';
    if (connectForm) connectForm.style.display = 'none';
  } else {
    if (badge) {
      badge.textContent = 'Disconnected (Sandbox Active)';
      badge.className = 'tbl-badge format-mcq';
      badge.style.background = 'rgba(148, 163, 184, 0.15)';
      badge.style.color = '#94a3b8';
      badge.style.border = '1px solid rgba(148, 163, 184, 0.3)';
    }
    if (connectedView) connectedView.style.display = 'none';
    if (connectForm) connectForm.style.display = 'block';
  }
}

function toggleLeetCodeEditMode() {
  const form = document.getElementById('alcaConnectForm');
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (currentLeetCodeAccount && form.style.display === 'block') {
      const u = document.getElementById('alcaInputUser');
      if (u) u.value = currentLeetCodeAccount.username || '';
    }
  }
}

async function connectAdminLeetCodeAccount() {
  const username = (document.getElementById('alcaInputUser')?.value || '').trim();
  const sessionCookie = (document.getElementById('alcaInputSession')?.value || '').trim();
  const csrfToken = (document.getElementById('alcaInputCsrf')?.value || '').trim();
  const feedback = document.getElementById('alcaFeedback');

  if (!username && !sessionCookie) {
    alert('Please enter your LeetCode username and/or LEETCODE_SESSION cookie token.');
    return;
  }

  if (feedback) {
    feedback.textContent = 'Verifying account credentials with LeetCode API...';
    feedback.style.color = '#ffa116';
    feedback.style.display = 'block';
  }

  try {
    const res = await fetch('/api/admin/leetcode-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, sessionCookie, csrfToken })
    });
    const data = await res.json();
    if (data.success) {
      if (feedback) {
        feedback.textContent = `✅ Successfully connected LeetCode account: @${data.account.username}!`;
        feedback.style.color = '#34d399';
      }
      currentLeetCodeAccount = data.account;
      renderLeetCodeAccountUI(data.account);
      setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 3000);
    } else {
      if (feedback) {
        feedback.textContent = `❌ ${data.error || 'Connection failed'}`;
        feedback.style.color = '#ef4444';
      }
    }
  } catch (err) {
    if (feedback) {
      feedback.textContent = `❌ Network error: ${err.message}`;
      feedback.style.color = '#ef4444';
    }
  }
}

async function disconnectAdminLeetCodeAccount() {
  if (!confirm('Are you sure you want to disconnect your LeetCode account? The runner will revert to the built-in compiler sandbox.')) return;
  try {
    const res = await fetch('/api/admin/leetcode-disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    currentLeetCodeAccount = null;
    renderLeetCodeAccountUI(data.account);
  } catch (err) {
    alert('Error disconnecting: ' + err.message);
  }
}

async function testAdminLeetCodeSync() {
  const badge = document.getElementById('alcaStatusBadge');
  const orig = badge ? badge.textContent : '';
  if (badge) badge.textContent = 'Pinging...';
  try {
    const res = await fetch('/api/admin/leetcode-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      alert(`⚡ LeetCode API Live Ping Successful!\n\nRound-trip latency: ${data.latencyMs} ms\nTotal LeetCode Catalog: ${data.totalLeetCodeProblems} problems\nAccount Status: ${data.account.connected ? `@${data.account.username} (Connected)` : 'Offline Sandbox Active'}`);
      renderLeetCodeAccountUI(data.account);
    } else {
      alert(`LeetCode API Ping: ${data.error || 'Unreachable'}`);
    }
  } catch (err) {
    alert('Ping error: ' + err.message);
  } finally {
    if (badge) badge.textContent = orig;
  }
}

function loadAdminLeetCodeTab() {
  if (typeof LEETCODE === 'undefined') return;
  loadAdminLeetCodeAccount();
  const pillsContainer = document.getElementById('admLeetCodeCatPills');
  if (pillsContainer) {
    pillsContainer.innerHTML = '';
    const cats = ['All', ...LEETCODE.getCategories()];
    cats.forEach(cat => {
      const isAll = (cat === 'All');
      const catName = isAll ? 'All' : (typeof cat === 'object' ? cat.name : cat);
      const catIcon = isAll ? '🌐 ' : (typeof cat === 'object' && cat.icon ? cat.icon + ' ' : '');
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `lc-cat-pill ${catName === currentAdminLcCategory ? 'active' : ''}`;
      pill.textContent = `${catIcon}${catName}`;
      pill.onclick = () => filterAdminLeetCodeCategory(catName, pill);
      pillsContainer.appendChild(pill);
    });
  }
  filterAdminLeetCode();
}

function filterAdminLeetCodeCategory(cat, btn) {
  currentAdminLcCategory = typeof cat === 'object' ? cat.name : cat;
  document.querySelectorAll('.lc-cat-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filterAdminLeetCode();
}

function filterAdminLeetCode() {
  if (typeof LEETCODE === 'undefined') return;
  const q = (document.getElementById('admLeetCodeSearch')?.value || '').toLowerCase().trim();
  const diff = document.getElementById('admLeetCodeDiffFilter')?.value || 'all';
  const grid = document.getElementById('admLeetCodeGrid');
  if (!grid) return;

  const catalog = LEETCODE.getCatalog();
  const filtered = catalog.filter(p => {
    if (currentAdminLcCategory !== 'All') {
      const cLower = currentAdminLcCategory.toLowerCase();
      const pCat = (p.category || '').toLowerCase();
      const matchCat = (pCat === cLower || pCat.includes(cLower) || cLower.includes(pCat));
      if (!matchCat) return false;
    }
    if (diff !== 'all' && p.difficulty.toLowerCase() !== diff.toLowerCase()) return false;
    if (q) {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchCat = (p.category || '').toLowerCase().includes(q);
      const matchTags = (p.tags || []).some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchCat && !matchTags) return false;
    }
    return true;
  });

  grid.innerHTML = '';
  if (filtered.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted); padding:2rem; grid-column:1/-1;">No LeetCode problems found matching your filters.</div>';
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'lc-prob-card';
    const diffClass = p.difficulty.toLowerCase();
    const tagsHtml = (p.tags || []).map(t => `<span class="badge-status-pill badge-neutral" style="font-size:0.7rem;">${escHtml(t)}</span>`).join(' ');

    card.innerHTML = `
      <div>
        <div class="lc-prob-meta" style="margin-bottom:0.5rem;">
          <span class="lc-diff-badge ${diffClass}">${p.difficulty}</span>
          <span style="font-size:0.8rem; color:var(--text-muted); font-weight:700;">${escHtml(p.category)}</span>
        </div>
        <div class="lc-prob-title">${escHtml(p.title)}</div>
        <div style="font-size:0.82rem; color:var(--text-dim); margin-top:0.4rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${escHtml(p.description.substring(0, 140))}...
        </div>
        <div style="margin-top:0.6rem; display:flex; gap:0.35rem; flex-wrap:wrap;">
          ${tagsHtml}
        </div>
      </div>

      <div class="lc-prob-actions">
        <button type="button" class="lc-action-btn primary" onclick="openLeetCodeInspector('${p.id}')">
          <span>📖</span>
          <span>View Description</span>
        </button>
        <button type="button" class="lc-action-btn" onclick="quickFillFromLeetCode('${p.id}')">
          <span>⚡</span>
          <span>Create Test</span>
        </button>
        <button type="button" class="lc-action-btn assign" onclick="assignLeetCodeDirectly('${p.id}')">
          <span>⭐</span>
          <span>Assign Direct</span>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function pickRandomLeetCodeAdmin() {
  if (typeof LEETCODE === 'undefined') return;
  const p = LEETCODE.getRandomProblem(currentAdminLcCategory, 'Medium');
  if (p) {
    openLeetCodeInspector(p.id);
  }
}

function openLeetCodeInspector(probId) {
  if (typeof LEETCODE === 'undefined') return;
  const p = LEETCODE.getCatalog().find(item => item.id === probId);
  if (!p) return;

  inspectedProblem = p;
  const modal = document.getElementById('adminLeetCodeModal');
  if (!modal) return;

  const catEl = document.getElementById('alcModalCategory');
  const diffEl = document.getElementById('alcModalDifficulty');
  const titleEl = document.getElementById('alcModalTitle');
  const descEl = document.getElementById('alcModalDescription');
  const starterEl = document.getElementById('alcModalStarterCode');
  const tcCountEl = document.getElementById('alcModalTcCount');
  const tcListEl = document.getElementById('alcModalTestcasesList');

  if (catEl) catEl.textContent = p.category;
  if (diffEl) {
    diffEl.textContent = p.difficulty;
    diffEl.className = `lc-diff-badge ${p.difficulty.toLowerCase()}`;
  }
  if (titleEl) titleEl.textContent = p.title;

  if (descEl) {
    if (typeof marked !== 'undefined') {
      descEl.innerHTML = marked.parse(p.description);
    } else {
      descEl.textContent = p.description;
    }
  }

  if (starterEl) {
    starterEl.textContent = (p.starterCode && p.starterCode.python) || '# Python solution starter';
  }

  if (tcCountEl) {
    tcCountEl.textContent = `${(p.testcases || []).length} Curated Test Cases (15-Case Suite)`;
  }

  if (tcListEl) {
    tcListEl.innerHTML = '';
    (p.testcases || []).forEach((tc, idx) => {
      const tcRow = document.createElement('div');
      tcRow.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid var(--surface-border); border-radius:6px; padding:0.6rem 0.85rem; font-family:monospace; font-size:0.78rem; margin-bottom:0.45rem;';
      const edgeBadge = tc.hidden ? '<span style="color:#f59e0b; font-size:0.72rem; font-weight:700;">[Edge Case]</span>' : '<span style="color:#38bdf8; font-size:0.72rem; font-weight:700;">[Sample Case]</span>';
      tcRow.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
          <span style="color:var(--primary); font-weight:700;">Test Case ${idx + 1} ${edgeBadge}</span>
          <span style="color:#64748b; font-size:0.72rem;">ID: ${tc.id || idx + 1}</span>
        </div>
        <div style="color:#94a3b8; word-break:break-all;">Input: <strong style="color:#e2e8f0;">${escHtml(tc.input || '')}</strong></div>
        <div style="color:#34d399; margin-top:0.25rem; word-break:break-all;">Expected: <strong>${escHtml(JSON.stringify(tc.expected))}</strong></div>
      `;
      tcListEl.appendChild(tcRow);
    });
  }

  modal.style.display = 'flex';
}

function closeAdminLeetCodeModal() {
  const modal = document.getElementById('adminLeetCodeModal');
  if (modal) modal.style.display = 'none';
}

function applyLeetCodeToCreateTest() {
  if (!inspectedProblem) return;
  const p = inspectedProblem;
  closeAdminLeetCodeModal();

  // Switch to Create Test subtab
  const createSubtabBtn = document.querySelectorAll('.admin-subtab-btn')[1];
  switchAdminTab('create', createSubtabBtn);

  // Quick fill fields
  const picker = document.getElementById('admQuickLeetCodeSelect');
  if (picker) picker.value = p.id;
  onQuickLeetCodeSelect(p.id);
}

function quickFillFromLeetCode(probId) {
  const p = LEETCODE.getCatalog().find(item => item.id === probId);
  if (!p) return;
  inspectedProblem = p;
  applyLeetCodeToCreateTest();
}

async function assignLeetCodeDirectly(probId) {
  if (typeof LEETCODE === 'undefined') return;
  const p = LEETCODE.getCatalog().find(item => item.id === probId);
  if (!p) return;

  const testPayload = {
    title: `${p.title} Assessment`,
    format: 'coding',
    topic: p.title,
    category: p.category,
    difficulty: p.difficulty,
    numQuestions: 1,
    timeLimitMin: 30,
    proctorPreset: 'strict',
    instructions: `Official LeetCode problem #${p.id}: ${p.title}. Solve with 10–15 automated test cases and full proctoring.`,
    problemId: p.id,
    isAssigned: true,
    scheduledStart: null,
    scheduledEnd: null
  };

  try {
    const res = await API.saveCustomTest(testPayload);
    if (res && res.success && res.test) {
      await API.setActiveAssignment(res.test.id, true);
      await checkActiveAssignment();
      await loadAdminCatalog();
      alert(`⭐ Successfully assigned "${p.title}" as active candidate test on Main App!`);
    }
  } catch (err) {
    alert('Could not assign test: ' + err.message);
  }
}

// ==============================================================================
// TAUFA.AI & OMNIROUTE CONTROL CENTER (ADMIN DASHBOARD)
// ==============================================================================
let currentPromptTab = 'mcq';
let systemConfigCache = null;

async function loadAdminAiControl() {
  try {
    const data = await API.getSystemConfig();
    if (data && data.success) {
      systemConfigCache = data;

      // Card 1: Taufa info
      const taufaInfo = document.getElementById('admTaufaCookieInfo');
      const taufaBadge = document.getElementById('admTaufaStatusBadge');
      if (taufaInfo) {
        taufaInfo.textContent = data.taufa?.hasCookie
          ? `Active (${data.taufa.cookiePreview}) • Conv ID: ${data.taufa.conversationId}`
          : 'No session cookie configured in cookie.txt';
      }
      if (taufaBadge) {
        taufaBadge.textContent = data.taufa?.hasCookie ? 'READY' : 'NEEDS COOKIE';
        taufaBadge.className = `tbl-badge ${data.taufa?.hasCookie ? 'status-completed' : 'status-disqualified'}`;
      }

      // Card 2: Prompts
      const prompts = data.taufaPrompts || {};
      const textarea = document.getElementById('admPromptTemplateEditor');
      if (textarea) {
        textarea.value = prompts[currentPromptTab] || (CONFIG.DEFAULT_PROMPTS && CONFIG.DEFAULT_PROMPTS[currentPromptTab]) || '';
      }

      // Card 3: OmniRoute config
      const omniUrl = document.getElementById('admOmniUrlInput');
      const omniModel = document.getElementById('admOmniModelInput');
      const omniKey = document.getElementById('admOmniKeyInput');
      if (omniUrl && data.omniRoute?.endpoint) omniUrl.value = data.omniRoute.endpoint;
      if (omniModel && data.omniRoute?.model) omniModel.value = data.omniRoute.model;
      if (omniKey && data.omniRoute?.apiKey) omniKey.value = data.omniRoute.apiKey;
    }

    // Check OmniRoute process status
    await checkOmniRouteStatusLive();
  } catch (err) {
    console.warn('Could not load AI Control config:', err);
  }
}

async function checkOmniRouteStatusLive() {
  try {
    const stat = await API.getOmniRouteStatus();
    const procEl = document.getElementById('admOmniProcessStatus');
    const badgeEl = document.getElementById('admOmniStatusBadge');
    if (stat && stat.running) {
      if (procEl) procEl.textContent = '🟢 Server running on localhost:20128 (Listening)';
      if (badgeEl) {
        badgeEl.textContent = 'ONLINE';
        badgeEl.className = 'tbl-badge status-completed';
      }
    } else {
      if (procEl) procEl.textContent = '⚪ Server not detected on port 20128. Click "Restart Headless Server" to spawn.';
      if (badgeEl) {
        badgeEl.textContent = 'STANDBY';
        badgeEl.className = 'tbl-badge format-hybrid';
      }
    }
  } catch (err) {
    console.warn('OmniRoute status check error:', err);
  }
}

function switchPromptTab(tabName, btn) {
  // Save current textarea content to cache
  const textarea = document.getElementById('admPromptTemplateEditor');
  if (textarea && systemConfigCache) {
    if (!systemConfigCache.taufaPrompts) systemConfigCache.taufaPrompts = {};
    systemConfigCache.taufaPrompts[currentPromptTab] = textarea.value;
  }

  currentPromptTab = tabName;
  document.querySelectorAll('.prompt-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (textarea) {
    const val = (systemConfigCache?.taufaPrompts && systemConfigCache.taufaPrompts[tabName])
      || (CONFIG.CUSTOM_PROMPTS && CONFIG.CUSTOM_PROMPTS[tabName])
      || (CONFIG.DEFAULT_PROMPTS && CONFIG.DEFAULT_PROMPTS[tabName])
      || '';
    textarea.value = val;
  }
}

function resetCurrentPromptDefault() {
  if (confirm(`Reset ${currentPromptTab.toUpperCase()} prompt command to factory default?`)) {
    const def = (CONFIG.DEFAULT_PROMPTS && CONFIG.DEFAULT_PROMPTS[currentPromptTab]) || '';
    const textarea = document.getElementById('admPromptTemplateEditor');
    if (textarea) textarea.value = def;
    if (systemConfigCache) {
      if (!systemConfigCache.taufaPrompts) systemConfigCache.taufaPrompts = {};
      systemConfigCache.taufaPrompts[currentPromptTab] = def;
    }
  }
}

async function savePromptCommands() {
  const textarea = document.getElementById('admPromptTemplateEditor');
  const msgEl = document.getElementById('admPromptSaveMsg');
  if (!textarea) return;

  if (!systemConfigCache) systemConfigCache = { taufaPrompts: {} };
  if (!systemConfigCache.taufaPrompts) systemConfigCache.taufaPrompts = {};
  systemConfigCache.taufaPrompts[currentPromptTab] = textarea.value;

  try {
    const res = await API.saveSystemConfig({ taufaPrompts: systemConfigCache.taufaPrompts });
    if (res && res.success) {
      if (CONFIG.CUSTOM_PROMPTS) {
        CONFIG.CUSTOM_PROMPTS = { ...CONFIG.CUSTOM_PROMPTS, ...systemConfigCache.taufaPrompts };
      }
      if (msgEl) {
        msgEl.textContent = '✅ Command prompt templates successfully saved & synced with assessment generator!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 4000);
      }
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving prompts: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
  }
}

async function executeSandboxPrompt() {
  const topic = (document.getElementById('admSandboxTopic')?.value || '').trim();
  const outputEl = document.getElementById('admSandboxOutput');
  const textarea = document.getElementById('admPromptTemplateEditor');
  if (!topic) {
    alert('Please enter a test topic for the sandbox execution.');
    return;
  }
  if (!outputEl) return;

  outputEl.style.display = 'block';
  outputEl.textContent = `⏳ Transmitting command to Taufa.ai with topic "${topic}"...\n`;

  let prompt = textarea?.value || '';
  prompt = prompt.replace(/{topic}/g, topic)
                 .replace(/{numQ}/g, '1')
                 .replace(/{category}/g, 'General')
                 .replace(/{difficulty}/g, 'Medium');

  try {
    const res = await API.testTaufaPrompt(prompt);
    if (res && res.success) {
      outputEl.textContent = `✅ [Taufa.ai Response Received in ${res.latencyMs}ms]\n\n${res.rawResponse}`;
    } else {
      outputEl.textContent = `❌ [Taufa.ai Execution Failed]\n${res?.error || 'Unknown error'}`;
    }
  } catch (err) {
    outputEl.textContent = `❌ [Sandbox Error]: ${err.message}`;
  }
}

async function saveTaufaSession() {
  const cookie = (document.getElementById('admTaufaCookieInput')?.value || '').trim();
  const msgEl = document.getElementById('admTaufaSaveMsg');
  if (!cookie) {
    if (msgEl) {
      msgEl.textContent = '❌ Please enter a session cookie string.';
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
    return;
  }

  try {
    const res = await API.saveSystemConfig({ sessionCookie: cookie });
    if (res && res.success) {
      if (msgEl) {
        msgEl.textContent = '✅ Session cookie saved to cookie.txt and proxy reloaded!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 4000);
      }
      document.getElementById('admTaufaCookieInput').value = '';
      await loadAdminAiControl();
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving cookie: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
  }
}

async function testTaufaStreamLive() {
  const resEl = document.getElementById('admTaufaTestResult');
  if (!resEl) return;
  resEl.style.display = 'block';
  resEl.style.color = '#38bdf8';
  resEl.textContent = '⚡ Benchmarking Taufa.ai reverse-proxy stream...';

  try {
    const res = await API.testTaufaPrompt('Respond with exact word "PONG" for live latency check.');
    if (res && res.success) {
      resEl.style.color = '#34d399';
      resEl.textContent = `🟢 Taufa.ai Stream Connected! Latency: ${res.latencyMs}ms. Response: "${res.rawResponse.substring(0, 40)}"`;
    } else {
      resEl.style.color = '#f87171';
      resEl.textContent = `🔴 Taufa.ai Error: ${res?.error || 'Connection failed'}`;
    }
  } catch (err) {
    resEl.style.color = '#f87171';
    resEl.textContent = `🔴 Diagnostic failed: ${err.message}`;
  }
}

async function saveOmniRouteConfig() {
  const endpoint = (document.getElementById('admOmniUrlInput')?.value || '').trim();
  const model = (document.getElementById('admOmniModelInput')?.value || '').trim();
  const apiKey = (document.getElementById('admOmniKeyInput')?.value || '').trim();
  const msgEl = document.getElementById('admOmniSaveMsg');

  try {
    const res = await API.saveSystemConfig({
      omniRouteConfig: {
        endpoint: endpoint || 'http://localhost:20128/v1/chat/completions',
        model: model || 'gpt-4o-mini',
        apiKey: apiKey
      }
    });

    if (res && res.success) {
      if (msgEl) {
        msgEl.textContent = '✅ OmniRoute API configuration successfully updated and saved!';
        msgEl.style.color = '#34d399';
        msgEl.style.display = 'block';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 4000);
      }
    }
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = '❌ Error saving OmniRoute config: ' + err.message;
      msgEl.style.color = '#f87171';
      msgEl.style.display = 'block';
    }
  }
}

let _omniPingDebounceTimer = null;
function scheduleOmniRoutePingDebounced() {
  clearTimeout(_omniPingDebounceTimer);
  _omniPingDebounceTimer = setTimeout(() => {
    testOmniRouteLive();
  }, 400);
}

function onOmniRouteInputPaste(e, inputEl) {
  setTimeout(() => {
    testOmniRouteLive();
  }, 80);
}

async function onOmniRouteCandidatePaste(e, inputEl) {
  setTimeout(async () => {
    await testOmniRouteCandidate(inputEl.value);
  }, 80);
}

async function onOmniRouteCandidateInput(val) {
  clearTimeout(_omniPingDebounceTimer);
  _omniPingDebounceTimer = setTimeout(async () => {
    await testOmniRouteCandidate(val);
  }, 500);
}

async function testOmniRouteCandidate(apiKey) {
  const msgEl = document.getElementById('omniCandidateStatusMsg');
  if (!msgEl) return;
  msgEl.style.display = 'block';
  msgEl.style.color = '#38bdf8';
  msgEl.textContent = '⚡ Testing connection to OmniRoute...';

  try {
    const res = await API.testOmniRoute(CONFIG.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions', apiKey, 'gpt-4o-mini');
    if (res && res.success) {
      msgEl.style.color = '#34d399';
      msgEl.textContent = `🟢 Connected successfully! Ping: ${res.latencyMs}ms.`;
    } else {
      msgEl.style.color = '#f87171';
      msgEl.textContent = `🔴 Connection failed: ${res?.error || 'Server unreachable'}`;
    }
  } catch (err) {
    msgEl.style.color = '#f87171';
    msgEl.textContent = `🔴 Connection error: ${err.message}`;
  }
}

async function testOmniRouteLive() {
  const resEl = document.getElementById('admOmniTestResult');
  const endpoint = (document.getElementById('admOmniUrlInput')?.value || '').trim() || 'http://localhost:20128/v1/chat/completions';
  const model = (document.getElementById('admOmniModelInput')?.value || '').trim() || 'gpt-4o-mini';
  const apiKey = (document.getElementById('admOmniKeyInput')?.value || '').trim();

  if (!resEl) return;
  resEl.style.display = 'block';
  resEl.style.color = '#38bdf8';
  resEl.textContent = '⚡ Pinging OmniRoute completions API...';

  try {
    const res = await API.testOmniRoute(endpoint, apiKey, model);
    if (res && res.success) {
      resEl.style.color = '#34d399';
      resEl.textContent = `🟢 OmniRoute Online! Latency: ${res.latencyMs}ms. Model reply: "${res.reply || res.response?.substring(0, 40) || 'OK'}"`;
      const badgeEl = document.getElementById('admOmniStatusBadge');
      if (badgeEl) {
        badgeEl.textContent = 'ONLINE';
        badgeEl.className = 'tbl-badge status-completed';
      }
    } else {
      resEl.style.color = '#f87171';
      resEl.textContent = `🔴 OmniRoute Ping Failed (${res?.latencyMs || 0}ms): ${res?.error || 'No response'}`;
    }
  } catch (err) {
    resEl.style.color = '#f87171';
    resEl.textContent = `🔴 Ping Error: ${err.message}`;
  }
}

async function restartOmniRouteProcess() {
  const procEl = document.getElementById('admOmniProcessStatus');
  if (procEl) procEl.textContent = '🔄 Spawning headless OmniRoute process...';

  try {
    const res = await API.startOmniRouteHeadless();
    if (res && res.success) {
      if (procEl) procEl.textContent = '🟢 OmniRoute headless process started on port 20128!';
      setTimeout(() => checkOmniRouteStatusLive(), 2000);
    } else {
      if (procEl) procEl.textContent = '❌ ' + (res?.message || 'Could not spawn OmniRoute process');
    }
  } catch (err) {
    if (procEl) procEl.textContent = '❌ Process error: ' + err.message;
  }
}

// Active background watcher: reveal scheduled tests automatically the second the scheduled time arrives
if (typeof window !== 'undefined' && !window._activeExamScheduleWatcher) {
  window._activeExamScheduleWatcher = setInterval(() => {
    checkActiveAssignment().catch(() => {});
  }, 5000);
}

// ─── Bug & Issue Reporting System (Shared by Candidate & Admin) ───────────────
function openBugReportModal(prefillScreen, prefillSummary) {
  const modal = document.getElementById('bugReportModal');
  if (!modal) return;

  // Prepopulate candidate or admin name
  const nameInput = document.getElementById('bugReportName');
  const roleSelect = document.getElementById('bugReportRole');
  const screenInput = document.getElementById('bugReportScreen');
  const summaryInput = document.getElementById('bugReportSummary');
  const descInput = document.getElementById('bugReportDesc');
  const feedbackEl = document.getElementById('bugReportFeedback');

  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
  }
  if (summaryInput) summaryInput.value = prefillSummary || '';
  if (descInput) descInput.value = '';

  const isAdmin = (typeof API !== 'undefined' && API.isAdminLoggedIn && API.isAdminLoggedIn());
  const adminUser = sessionStorage.getItem('proctoriq_admin_user');
  const candName = (sessionStorage.getItem('proctoriq_candidate_name') || document.getElementById('candidateNameInput')?.value || '').trim();

  if (nameInput) {
    if (isAdmin && adminUser) {
      nameInput.value = adminUser;
    } else if (candName && candName !== 'Student') {
      nameInput.value = candName;
    } else {
      nameInput.value = 'Candidate';
    }
  }

  if (roleSelect) {
    roleSelect.value = isAdmin ? 'Administrator' : 'Candidate';
  }

  // Detect active screen / state
  if (screenInput) {
    if (prefillScreen) {
      screenInput.value = prefillScreen;
    } else {
      const activeScreen = document.querySelector('.screen.active')?.id || 'home';
      let screenLabel = 'Assessment Hub';
      if (activeScreen === 'quizScreen') screenLabel = 'Live Proctored Exam (HUD / Compiler)';
      else if (activeScreen === 'resultScreen') screenLabel = 'Exam Results & Scorecard';
      else if (activeScreen === 'adminDashboardScreen' || activeScreen === 'adminPortal') screenLabel = 'Admin Dashboard Portal';
      else if (activeScreen === 'settingsScreen') screenLabel = 'Settings Configuration';
      screenInput.value = screenLabel;
    }
  }

  window._isBugReportModalOpen = true;
  modal.style.display = 'flex';
  setTimeout(() => {
    if (summaryInput && !summaryInput.value) summaryInput.focus();
    else if (descInput) descInput.focus();
  }, 100);
}

function closeBugReportModal() {
  window._isBugReportModalOpen = false;
  const modal = document.getElementById('bugReportModal');
  if (modal) modal.style.display = 'none';
}

window.openBugReportModal = openBugReportModal;
window.closeBugReportModal = closeBugReportModal;
window.submitBugReportForm = submitBugReportForm;

// Global Escape listener to dismiss bug report modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && window._isBugReportModalOpen) {
    closeBugReportModal();
  }
});

async function submitBugReportForm() {
  const nameInput = document.getElementById('bugReportName');
  const roleSelect = document.getElementById('bugReportRole');
  const catSelect = document.getElementById('bugReportCategory');
  const screenInput = document.getElementById('bugReportScreen');
  const summaryInput = document.getElementById('bugReportSummary');
  const descInput = document.getElementById('bugReportDesc');
  const submitBtn = document.getElementById('bugReportSubmitBtn');
  const feedbackEl = document.getElementById('bugReportFeedback');

  const reporterName = nameInput?.value.trim() || 'Anonymous';
  const reporterRole = roleSelect?.value || 'Candidate';
  const category = catSelect?.value || 'General';
  const screen = screenInput?.value.trim() || 'Unknown Screen';
  const summary = summaryInput?.value.trim();
  const description = descInput?.value.trim();

  if (!summary || !description) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
      feedbackEl.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      feedbackEl.style.color = '#f87171';
      feedbackEl.textContent = '⚠️ Please enter both a summary headline and detailed description.';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span><span>Appending Report...</span>';
  }

  try {
    const reportPayload = {
      reporterName,
      reporterRole,
      category,
      screen,
      summary,
      description,
      userAgent: navigator.userAgent + ` | Screen: ${window.innerWidth}x${window.innerHeight}`
    };

    const res = await API.submitBugReport(reportPayload);
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(16, 185, 129, 0.15)';
      feedbackEl.style.border = '1px solid rgba(16, 185, 129, 0.35)';
      feedbackEl.style.color = '#34d399';
      feedbackEl.textContent = `✅ Bug report recorded! Appended to bug_reports.txt (ID: ${res.reportId || 'Saved'}).`;
    }

    if (summaryInput) summaryInput.value = '';
    if (descInput) descInput.value = '';

    setTimeout(() => {
      closeBugReportModal();
    }, 1800);
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
      feedbackEl.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      feedbackEl.style.color = '#f87171';
      feedbackEl.textContent = '❌ ' + (err.message || 'Error saving report');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🐞</span><span>Submit Report</span>';
    }
  }
}

// ─── Admin Bug Reports Log Viewer ─────────────────────────────────────────────
async function viewAllBugReportsModal() {
  const modal = document.getElementById('adminViewBugReportsModal');
  const viewer = document.getElementById('adminBugReportsLogViewer');
  const pathEl = document.getElementById('adminBugReportsPath');
  const countEl = document.getElementById('adminBugReportsCount');
  if (!modal || !viewer) return;

  modal.style.display = 'flex';
  viewer.textContent = 'Loading bug_reports.txt...';
  if (countEl) countEl.textContent = 'Fetching logs from server...';

  try {
    const data = await API.getBugReports();
    const content = data.content || '';
    if (!content.trim()) {
      viewer.textContent = '--- No bug reports recorded yet in bug_reports.txt ---\n(Reports submitted by candidates or administrators will append here.)';
      if (countEl) countEl.textContent = '0 Reports recorded';
    } else {
      viewer.textContent = content;
      const count = (content.match(/REPORT ID:/g) || []).length;
      if (countEl) countEl.textContent = `${count} Bug Report${count === 1 ? '' : 's'} recorded`;
    }
    if (pathEl) {
      pathEl.textContent = `File Location: ${data.path || 'bug_reports.txt'}`;
    }
  } catch (err) {
    viewer.textContent = 'Failed to load bug reports: ' + err.message;
    if (countEl) countEl.textContent = 'Error loading log';
  }
}

function closeAdminViewBugReportsModal() {
  const modal = document.getElementById('adminViewBugReportsModal');
  if (modal) modal.style.display = 'none';
}

function copyBugReportsLog() {
  const viewer = document.getElementById('adminBugReportsLogViewer');
  if (!viewer) return;
  navigator.clipboard.writeText(viewer.textContent).then(() => {
    alert('Bug reports log copied to clipboard!');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = viewer.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('Bug reports log copied to clipboard!');
  });
}

// ─── Student Dashboard Attempt History & Global Comprehensive Report ──────────
async function refreshStudentDashboard() {
  const listEl = document.getElementById('studentAttemptHistoryList');
  const demoBadgeEl = document.getElementById('demoAttemptsCountBadge');
  try {
    const data = await API.getAdminRecords();
    const records = (data && data.records) || [];
    if (Array.isArray(records) && records.length > 0) {
      allAdminRecords = records;
    }

    // Calculate chronological attempt numbers for demo vs assigned exams
    const chrono = [...records].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    const attemptCounters = {};
    let demoCompletedCount = 0;

    chrono.forEach(r => {
      const isDemoRec = Boolean(r.isDemo || r.testId === 'demo-test-candidate' || (r.topic || '').toLowerCase().includes('demo'));
      const key = `${(r.candidateName || 'student').toLowerCase()}::${isDemoRec ? 'demo' : (r.testId || r.topic || 'exam').toLowerCase()}`;
      attemptCounters[key] = (attemptCounters[key] || 0) + 1;
      if (!r.attemptNumber) r.attemptNumber = attemptCounters[key];
      r._isDemoResolved = isDemoRec;
      if (isDemoRec) demoCompletedCount++;
    });

    if (demoBadgeEl) {
      demoBadgeEl.textContent = `${demoCompletedCount} Completed`;
    }

    if (!listEl) return;
    if (records.length === 0) {
      listEl.innerHTML = `<div class="attempt-history-empty" style="color:var(--text-muted); font-size:0.88rem; padding:1rem; background:rgba(15,23,42,0.5); border:1px dashed rgba(148,163,184,0.2); border-radius:10px; text-align:center;">No exam attempts recorded yet. Start the <strong>Demo Proctoring Test</strong> above to generate your first interactive report.</div>`;
      return;
    }

    // Sort newest first for display
    const sorted = [...records].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    listEl.innerHTML = sorted.slice(0, 15).map(r => {
      const isDemo = Boolean(r._isDemoResolved || r.isDemo || r.testId === 'demo-test-candidate');
      const attNum = r.attemptNumber || 1;
      const label = isDemo
        ? `Demo Attempt #${attNum} — ${escHtml(r.topic || 'Demo Practice Assessment')}`
        : `Assigned Exam (Attempt #${attNum}) — ${escHtml(r.testTitle || r.topic || 'Assessment')}`;
      const dStr = r.timestamp ? new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
      const isDisq = Boolean(r.disqualified);
      const statusHtml = isDisq
        ? `<span class="tbl-badge status-disqualified" style="font-size:0.72rem;">🚨 Disqualified</span>`
        : `<span class="tbl-badge status-completed" style="font-size:0.72rem;">✅ Completed</span>`;
      const scoreVal = isDisq ? '0% (Void)' : `${r.score ?? 0}%`;

      return `
        <div class="attempt-history-item" style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; padding:0.75rem 1rem; background:rgba(15,23,42,0.68); border:1px solid rgba(148,163,184,0.16); border-radius:10px; margin-bottom:0.55rem;">
          <div style="display:flex; flex-direction:column; gap:0.2rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span style="font-weight:700; color:#f8fafc; font-size:0.9rem;">${label}</span>
              ${statusHtml}
              <span class="tbl-badge format-${(r.format || 'coding').toLowerCase()}" style="font-size:0.68rem;">${escHtml((r.format || 'HYBRID').toUpperCase())}</span>
            </div>
            <div style="font-size:0.76rem; color:#94a3b8;">
              👤 ${escHtml(r.candidateName || 'Student')} • 📅 ${dStr} • 🎯 Score: <strong style="color:#38bdf8;">${scoreVal}</strong> (${r.correctCount ?? 0}/${r.totalCount ?? 1} correct) • ⏱️ ${r.durationSec ?? 0}s
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <button type="button" class="tbl-audit-btn" onclick="openExamAttemptReport('${r.id}')" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#93c5fd; font-weight:700; padding:0.42rem 0.85rem; border-radius:8px; cursor:pointer;">
              <span>📊</span>
              <span>View Report</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Could not refresh student attempt history:', err);
  }
}

async function openExamAttemptReport(recordId) {
  const modal = document.getElementById('comprehensiveReportModal');
  const bodyEl = document.getElementById('crmBodyContent');
  const subEl = document.getElementById('crmSubtitle');
  if (!modal || !bodyEl) return;

  let rec = null;
  if (recordId) {
    rec = (allAdminRecords || []).find(r => String(r.id) === String(recordId));
    if (!rec) {
      try {
        const data = await API.getAdminRecords();
        if (data && data.records) {
          allAdminRecords = data.records;
          rec = allAdminRecords.find(r => String(r.id) === String(recordId));
        }
      } catch (_) {}
    }
  }
  if (!rec && window._lastCompletedAttemptRecord) {
    rec = window._lastCompletedAttemptRecord;
  }
  if (!rec && Array.isArray(allAdminRecords) && allAdminRecords.length > 0) {
    rec = allAdminRecords[0];
  }

  if (!rec) {
    bodyEl.innerHTML = `<div style="padding:2rem; text-align:center; color:#94a3b8;">No report data found for this attempt.</div>`;
    modal.style.display = 'flex';
    return;
  }

  const isDemo = Boolean(rec.isDemo || rec.testId === 'demo-test-candidate' || (rec.topic || '').toLowerCase().includes('demo'));
  const attemptNum = rec.attemptNumber || 1;
  const examName = rec.testTitle || rec.topic || (isDemo ? 'DEMO PROCTORING TEST' : 'Assigned Examination');
  const dFormatted = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : new Date().toLocaleString();

  if (subEl) {
    subEl.textContent = `${rec.candidateName || 'Student'} • ${isDemo ? `Demo Attempt #${attemptNum}` : `Attempt #${attemptNum}`} • ${examName} • ${dFormatted}`;
  }

  const totalQ = Number(rec.totalCount || 1);
  const correctQ = Number(rec.correctCount || 0);
  const skippedQ = rec.skippedCount !== undefined ? Number(rec.skippedCount) : 0;
  const incorrectQ = rec.incorrectCount !== undefined ? Number(rec.incorrectCount) : Math.max(0, totalQ - correctQ - skippedQ);
  const attemptedQ = rec.questionsAttempted !== undefined ? Number(rec.questionsAttempted) : (totalQ - skippedQ);
  const durSec = Number(rec.durationSec || 0);
  const mins = Math.floor(durSec / 60);
  const secs = durSec % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const events = Array.isArray(rec.proctorEvents) ? rec.proctorEvents : [];
  const countByTypes = (types) => events.filter(e => types.includes(e.event_type)).length;

  const tabSwitchCount = Math.max(Number(rec.tabSwitches || 0), countByTypes(['TAB_SWITCH']));
  const focusLostCount = Math.max(Number(rec.windowBlurs || 0), countByTypes(['WINDOW_FOCUS_LOST', 'LOOKING_OUT_OF_MONITOR']));
  const fsExitCount = Math.max(Number(rec.fullscreenExits || 0), countByTypes(['FULLSCREEN_EXIT']));
  const speechCount = Math.max(Number(rec.soundWarnings || 0), countByTypes(['SPEECH_WARNING', 'SPEECH_SUSPICIOUS', 'MULTI_SIGNAL_SPEAKING', 'AUDIO_ONLY_SPEECH']));
  const multiSignalCount = countByTypes(['MULTI_SIGNAL_SPEAKING']);
  const mouthOnlyIgnoredCount = countByTypes(['MOUTH_ONLY_IGNORED']);
  const gazeHeadCount = countByTypes(['GAZE_DEVIATION', 'HEAD_POSE_DEVIATION', 'LOOKING_OUT_OF_MONITOR']);
  const cameraFaceCount = countByTypes(['FACE_MISSING_WARNING', 'FACE_MISSING_CRITICAL', 'MULTIPLE_FACES_DETECTED', 'CAMERA_DISCONNECTED', 'CAMERA_ERROR', 'POOR_LIGHTING', 'CAMERA_OBSTRUCTED']);
  const shortcutCount = countByTypes(['COPY_ATTEMPT', 'PASTE_ATTEMPT', 'CUT_ATTEMPT', 'SELECT_ALL_ATTEMPT']);

  const codingSummary = Array.isArray(rec.codingSummary) ? rec.codingSummary : [];
  const sqlSummary = Array.isArray(rec.sqlSummary) ? rec.sqlSummary : [];

  const codingRowsHtml = codingSummary.length > 0
    ? codingSummary.map(c => `
        <tr>
          <td><strong>Problem #${escHtml(String(c.problemNumber || 2235))}</strong> — ${escHtml(c.title || 'Coding Problem')}</td>
          <td><span class="tbl-badge format-coding">${escHtml((c.language || 'python').toUpperCase())}</span></td>
          <td>${c.passed ? '<span style="color:#34d399; font-weight:700;">✅ Accepted</span>' : '<span style="color:#fbbf24; font-weight:700;">⚠️ Attempted / Partial</span>'}</td>
          <td>${c.passedCount ?? 0} / ${c.totalCount ?? 0}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="color:#64748b; text-align:center;">No coding questions in this session</td></tr>`;

  const sqlRowsHtml = sqlSummary.length > 0
    ? sqlSummary.map(s => `
        <tr>
          <td><strong>${escHtml(s.title || 'SQL Query Challenge')}</strong></td>
          <td><span class="tbl-badge format-sql">SQLITE</span></td>
          <td>${s.passed ? '<span style="color:#34d399; font-weight:700;">✅ Passed</span>' : '<span style="color:#fbbf24; font-weight:700;">⚠️ Attempted / Pending</span>'}</td>
          <td>${s.passedCount ?? 0} / ${s.totalCount ?? 1}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="color:#64748b; text-align:center;">No SQL questions in this session</td></tr>`;

  const eventRowsHtml = events.length > 0
    ? events.slice().reverse().slice(0, 40).map(ev => {
        const t = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '--:--:--';
        const sev = (ev.severity || 'INFO').toUpperCase();
        const sevColor = sev === 'CRITICAL' ? '#f87171' : sev === 'HIGH' ? '#fb923c' : sev === 'WARNING' ? '#fbbf24' : '#38bdf8';
        return `
          <tr>
            <td style="font-family:monospace; font-size:0.75rem; color:#94a3b8;">${escHtml(t)}</td>
            <td><strong style="color:#e2e8f0; font-size:0.78rem;">${escHtml(ev.event_type || 'EVENT')}</strong></td>
            <td><span style="color:${sevColor}; font-weight:700; font-size:0.74rem;">${escHtml(sev)}</span></td>
            <td style="font-size:0.75rem; color:#cbd5e1;">${ev.duration_ms ? `${ev.duration_ms}ms` : '—'}</td>
            <td style="font-size:0.75rem; color:#cbd5e1;">${ev.confidence !== undefined ? Number(ev.confidence).toFixed(2) : '—'}</td>
            <td style="font-size:0.76rem; color:#cbd5e1;">${escHtml(ev.reason || '')}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="6" style="color:#34d399; text-align:center; padding:1rem;">✅ Clean Proctoring Session — Zero suspicious proctoring events logged.</td></tr>`;

  bodyEl.innerHTML = `
    <div class="crm-section-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(155px, 1fr)); gap:0.75rem; margin-bottom:1.25rem;">
      <div class="crm-stat-box" style="background:rgba(30,41,59,0.75); border:1px solid rgba(148,163,184,0.2); border-radius:10px; padding:0.8rem;">
        <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Candidate & Attempt</div>
        <div style="font-size:1rem; font-weight:800; color:#f8fafc; margin-top:0.25rem;">${escHtml(rec.candidateName || 'Student')}</div>
        <div style="font-size:0.76rem; color:#38bdf8;">${isDemo ? `Demo Attempt #${attemptNum}` : `Assigned Attempt #${attemptNum}`}</div>
      </div>
      <div class="crm-stat-box" style="background:rgba(30,41,59,0.75); border:1px solid rgba(148,163,184,0.2); border-radius:10px; padding:0.8rem;">
        <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Final Score</div>
        <div style="font-size:1.35rem; font-weight:800; color:${rec.disqualified ? '#f87171' : '#34d399'}; margin-top:0.2rem;">${rec.disqualified ? '0% (Void)' : `${rec.score ?? 0}%`}</div>
        <div style="font-size:0.75rem; color:#cbd5e1;">${rec.disqualified ? 'Disqualified' : 'Verified Submission'}</div>
      </div>
      <div class="crm-stat-box" style="background:rgba(30,41,59,0.75); border:1px solid rgba(148,163,184,0.2); border-radius:10px; padding:0.8rem;">
        <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Question Breakdown</div>
        <div style="font-size:0.86rem; font-weight:700; color:#f8fafc; margin-top:0.25rem;">
          <span style="color:#34d399;">✓ ${correctQ} Correct</span> • <span style="color:#f87171;">✗ ${incorrectQ} Wrong</span>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8;">⏭ ${skippedQ} Skipped (${attemptedQ}/${totalQ} Attempted)</div>
      </div>
      <div class="crm-stat-box" style="background:rgba(30,41,59,0.75); border:1px solid rgba(148,163,184,0.2); border-radius:10px; padding:0.8rem;">
        <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase; font-weight:700;">Time & Format</div>
        <div style="font-size:1.1rem; font-weight:800; color:#e2e8f0; margin-top:0.25rem;">⏱️ ${timeStr}</div>
        <div style="font-size:0.75rem; color:#a5b4fc;">Format: ${escHtml((rec.format || 'HYBRID').toUpperCase())}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1rem; margin-bottom:1.25rem;">
      <div style="background:rgba(15,23,42,0.75); border:1px solid rgba(148,163,184,0.18); border-radius:10px; padding:0.9rem;">
        <h4 style="margin:0 0 0.6rem 0; font-size:0.86rem; color:#93c5fd;">💻 Coding Questions Summary</h4>
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead>
            <tr style="border-bottom:1px solid rgba(148,163,184,0.2); color:#94a3b8; text-align:left;">
              <th style="padding:0.35rem;">Problem</th>
              <th style="padding:0.35rem;">Lang</th>
              <th style="padding:0.35rem;">Status</th>
              <th style="padding:0.35rem;">Tests</th>
            </tr>
          </thead>
          <tbody>${codingRowsHtml}</tbody>
        </table>
      </div>
      <div style="background:rgba(15,23,42,0.75); border:1px solid rgba(148,163,184,0.18); border-radius:10px; padding:0.9rem;">
        <h4 style="margin:0 0 0.6rem 0; font-size:0.86rem; color:#c4b5fd;">🗄️ SQL Execution Summary</h4>
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead>
            <tr style="border-bottom:1px solid rgba(148,163,184,0.2); color:#94a3b8; text-align:left;">
              <th style="padding:0.35rem;">Challenge</th>
              <th style="padding:0.35rem;">Engine</th>
              <th style="padding:0.35rem;">Status</th>
              <th style="padding:0.35rem;">Checks</th>
            </tr>
          </thead>
          <tbody>${sqlRowsHtml}</tbody>
        </table>
      </div>
    </div>

    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(148,163,184,0.22); border-radius:10px; padding:1rem; margin-bottom:1.25rem;">
      <h4 style="margin:0 0 0.75rem 0; font-size:0.88rem; color:#f8fafc;">🛡️ Multi-Signal AI Proctoring Telemetry Summary</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(145px, 1fr)); gap:0.6rem; font-size:0.78rem;">
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">📑 Tab Switches: <strong style="color:#fbbf24;">${tabSwitchCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">🪟 Focus Lost: <strong style="color:#fbbf24;">${focusLostCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">⛶ Fullscreen Exits: <strong style="color:#fbbf24;">${fsExitCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">🎙️ Speech Events: <strong style="color:#fbbf24;">${speechCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">👄 Mouth+Voice Fusion: <strong style="color:#f87171;">${multiSignalCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">🤫 Silent Mouth Ignored: <strong style="color:#34d399;">${mouthOnlyIgnoredCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">👁️ Gaze / Head Pose: <strong style="color:#fbbf24;">${gazeHeadCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">📷 Camera / Face: <strong style="color:#fbbf24;">${cameraFaceCount}</strong></div>
        <div style="padding:0.55rem 0.7rem; background:rgba(30,41,59,0.7); border-radius:8px;">⌨️ Blocked Shortcuts: <strong style="color:#38bdf8;">${shortcutCount}</strong></div>
      </div>
    </div>

    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(148,163,184,0.22); border-radius:10px; padding:1rem;">
      <h4 style="margin:0 0 0.65rem 0; font-size:0.88rem; color:#f8fafc;">📋 Proctoring Event Log (${events.length} Events)</h4>
      <div style="max-height:240px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.76rem;">
          <thead>
            <tr style="border-bottom:1px solid rgba(148,163,184,0.22); color:#94a3b8; text-align:left;">
              <th style="padding:0.4rem;">Time</th>
              <th style="padding:0.4rem;">Event Type</th>
              <th style="padding:0.4rem;">Severity</th>
              <th style="padding:0.4rem;">Duration</th>
              <th style="padding:0.4rem;">Conf</th>
              <th style="padding:0.4rem;">Reason / Telemetry</th>
            </tr>
          </thead>
          <tbody>${eventRowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeExamAttemptReport() {
  const modal = document.getElementById('comprehensiveReportModal');
  if (modal) modal.style.display = 'none';
}

if (typeof window !== 'undefined') {
  window.openBugReportModal = openBugReportModal;
  window.closeBugReportModal = closeBugReportModal;
  window.submitBugReportForm = submitBugReportForm;
  window.viewAllBugReportsModal = viewAllBugReportsModal;
  window.closeAdminViewBugReportsModal = closeAdminViewBugReportsModal;
  window.copyBugReportsLog = copyBugReportsLog;
  window.startCandidateDemoTest = startCandidateDemoTest;
  window.refreshStudentDashboard = refreshStudentDashboard;
  window.openExamAttemptReport = openExamAttemptReport;
  window.closeExamAttemptReport = closeExamAttemptReport;
}
