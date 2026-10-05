/**
 * quiz.js – ProctorIQ Exam Engine with In-Built Python & SQL Compilers,
 * 10–15 Automated Testcases, Multi-Choice Checkboxes & Dual AI Grading
 */

var QUIZ = (() => {

  // ─── State ────────────────────────────────────────────────────────────────────
  let questions         = [];
  let answers           = [];      // MCQ: number | Set<number>, Coding: { code, passedCount, totalCount, score }
  let currentIdx        = 0;
  let timerStart        = null;
  let timerEl           = null;
  let timerInterval     = null;
  let proctoringEnabled = false;
  let activeTopic       = '';
  let activeFormat      = 'coding';
  let activeLanguage    = 'python';
  let lastReviewDetails = [];
  let omniExplanations  = null;
  let examDurationSec   = 1800; // default 30 mins, computed dynamically
  let activeProctorOptions = { camera: true, mic: true, allowApps: false, fullscreen: true };
  let timerAlertsTriggered = { half: false, quarter: false, tenth: false };
  let _timerAlertTimeout = null;
  let activeExtraConfig = {};
  let currentTestMeta   = { testId: null, testTitle: '', allowedAttempts: 1 };

  function setMeta(meta = {}) {
    currentTestMeta = Object.assign({ testId: null, testTitle: '', allowedAttempts: 1 }, meta);
  }

  // ─── Start Assessment Engine ─────────────────────────────────────────────────
  async function start(topic, numQ, withProctoring, format = 'coding', language = 'python', category = 'General', difficulty = 'Medium', proctorOptions = {}, extraConfig = {}) {
    proctoringEnabled = withProctoring;
    activeTopic = topic;
    activeFormat = format;
    activeLanguage = language || 'python';
    activeProctorOptions = Object.assign({ camera: true, mic: true, allowApps: false, fullscreen: true }, proctorOptions || {});
    activeExtraConfig = Object.assign({}, extraConfig || {});
    omniExplanations = null;

    showScreen('quizScreen');
    showLoading(true, format);

    const proctorHUD = document.getElementById('proctorHUD');
    if (proctorHUD) proctorHUD.style.display = 'flex';

    try {
      const hasCoding = format.includes('coding') || format === 'python';
      const hasSql = format.includes('sql');
      const hasMcq = format.includes('mcq') || format === 'hybrid' || format === 'all' || format === 'mixed';

      const reqCodingCount = Math.max(1, parseInt(activeExtraConfig.codingCount || proctorOptions.codingCount || (hasCoding && !hasSql && !hasMcq ? numQ : 1), 10) || 1);
      const reqSqlCount = Math.max(1, parseInt(activeExtraConfig.sqlCount || proctorOptions.sqlCount || 1, 10) || 1);
      const reqMcqCount = Math.max(1, parseInt(activeExtraConfig.mcqCount || proctorOptions.mcqCount || (hasMcq && !hasCoding && !hasSql ? numQ : (numQ >= 3 ? numQ : 5)), 10) || 5);
      const mcqTagline = (activeExtraConfig.mcqTagline || proctorOptions.mcqTagline || '').trim();

      const generatedQuestions = [];

      // Priority 0: Pre-configured test questions (e.g. Candidate Demo Test)
      if (Array.isArray(activeExtraConfig.questions) && activeExtraConfig.questions.length > 0) {
        generatedQuestions.push(...activeExtraConfig.questions.map(q => {
          const base = { ...q, type: q.type || (q.choices ? 'mcq' : 'coding') };
          if (base.type === 'coding' && base.language !== 'sql' && typeof LEETCODE !== 'undefined' && LEETCODE.QuestionNormalizer) {
            return LEETCODE.QuestionNormalizer.normalize(base);
          }
          return base;
        }));
      } else if (format === 'demo' || (topic && topic.toLowerCase().includes('demo'))) {
        generatedQuestions.push(...getPermanentDemoQuestions());
      } else {
        // 1. Multiple Choice Questions
        if (hasMcq) {
          const mcqTopic = mcqTagline ? `${topic} (Topics: ${mcqTagline})` : topic;
          const mcqResult = await API.generateQuiz(mcqTopic, reqMcqCount, mcqTagline);
          const mcqs = (mcqResult && mcqResult.quiz) ? mcqResult.quiz : [];
          if (mcqs.length) {
            generatedQuestions.push(...mcqs);
          } else if (!hasCoding && !hasSql) {
            throw new Error('Could not generate MCQ questions.');
          }
        }

        // 2. LeetCode Coding Challenges (via QuestionProvider & QuestionNormalizer)
        if (hasCoding) {
          const codingCategory = (category === 'SQL' ? 'General' : category);
          const pickedIds = new Set();
          const targetProbId = activeExtraConfig.problemId || proctorOptions.problemId;
          for (let i = 0; i < reqCodingCount; i++) {
            let cq = null;
            // Priority 1: Specified problem ID from catalog (0ms instant)
            if (i === 0 && targetProbId && typeof LEETCODE !== 'undefined') {
              const found = LEETCODE.QuestionProvider
                ? LEETCODE.QuestionProvider.getByIdOrNumber(targetProbId)
                : LEETCODE.getCatalog().find(p => p.id === targetProbId || String(p.number) === String(targetProbId));
              if (found) cq = { ...found, type: 'coding' };
            }
            // Priority 2: Direct match in LeetCode catalog (0ms instant)
            if (!cq && typeof LEETCODE !== 'undefined') {
              const fastMatch = (i === 0) ? LEETCODE.findProblemByTopic(topic, codingCategory, difficulty) : null;
              if (fastMatch && !pickedIds.has(fastMatch.id)) {
                cq = { ...fastMatch, type: 'coding' };
              }
            }
            // Priority 3: API challenge generator
            if (!cq) {
              cq = await API.generateCodingChallenge(i === 0 ? topic : `${topic} Challenge ${i + 1}`, activeLanguage, codingCategory, difficulty, targetProbId);
            }
            // Priority 4: Fallback to curated catalog
            if (!cq && typeof LEETCODE !== 'undefined') {
              const allProblems = LEETCODE.getCatalog();
              const pool = allProblems.filter(p => !pickedIds.has(p.id));
              const randomPick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : LEETCODE.getRandomProblem(codingCategory, difficulty);
              if (randomPick) cq = { ...randomPick, type: 'coding' };
            }
            if (cq) {
              if (typeof LEETCODE !== 'undefined' && LEETCODE.QuestionNormalizer && cq.language !== 'sql') {
                cq = LEETCODE.QuestionNormalizer.normalize(cq);
              }
              if (cq.id) pickedIds.add(cq.id);
              generatedQuestions.push(cq);
            }
          }
        }

        // 3. MySQL Database SQL Challenges
        if (hasSql) {
          const pickedSqlIds = new Set();
          for (let j = 0; j < reqSqlCount; j++) {
            let sq = null;
            if (j === 0) {
              sq = await API.generateCodingChallenge(topic, 'sql', 'SQL', difficulty);
            } else {
              if (typeof SQL_CATALOG !== 'undefined') {
                const allSql = SQL_CATALOG.getCatalog();
                const pool = allSql.filter(p => !pickedSqlIds.has(p.id));
                const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : SQL_CATALOG.getRandomProblem('SQL', difficulty);
                if (pick) sq = { ...pick, type: 'coding' };
              }
            }
            if (sq) {
              if (sq.id) pickedSqlIds.add(sq.id);
              generatedQuestions.push(sq);
            }
          }
        }
      }

      if (generatedQuestions.length === 0) {
        throw new Error('Could not generate any assessment questions.');
      }
      questions = generatedQuestions;
    } catch (err) {
      showLoading(false);
      alert('Failed to generate assessment:\n' + err.message);
      showScreen('landing');
      return;
    }

    try {
      launchExamEngine(withProctoring, activeProctorOptions, activeExtraConfig);
    } catch (engineErr) {
      console.error('Error starting exam engine:', engineErr);
      showLoading(false);
      alert('Error initializing exam engine: ' + engineErr.message);
    }
  }

  // ─── Core Exam Initializer ──────────────────────────────────────────────────
  function launchExamEngine(withProctoring, proctorOptions = {}, extraConfig = activeExtraConfig) {
    try {
      answers = questions.map(q => {
        if (q.type === 'coding') {
          const isSqlQ = (q.language === 'sql');
          const userCodes = isSqlQ ? {} : {
            python: q.starterCodes?.python || q.starterCode || '',
            java: q.starterCodes?.java || '',
            cpp: q.starterCodes?.cpp || '',
            c: q.starterCodes?.c || ''
          };
          const lang = isSqlQ ? 'sql' : activeLanguage;
          const code = isSqlQ ? (q.starterCode || '') : (userCodes[activeLanguage] || q.starterCode || '');
          return {
            userCodes,
            code,
            language: lang,
            passedCount: 0,
            totalCount: q.testcases?.length || 12,
            score: 0,
            evaluated: false
          };
        }
        return q.multi ? new Set() : null;
      });

      currentIdx = 0;

      // Set Countdown Duration based on test configuration / extraConfig
      const cfg = extraConfig || activeExtraConfig || {};
      if (cfg && cfg.timeLimitMin && !isNaN(cfg.timeLimitMin) && Number(cfg.timeLimitMin) > 0) {
        examDurationSec = Math.max(60, Number(cfg.timeLimitMin) * 60);
      } else if (proctorOptions && proctorOptions.timeLimitMin && !isNaN(proctorOptions.timeLimitMin) && Number(proctorOptions.timeLimitMin) > 0) {
        examDurationSec = Math.max(60, Number(proctorOptions.timeLimitMin) * 60);
      } else if (activeFormat === 'python' || activeFormat === 'sql') {
        examDurationSec = 1800; // 30 minutes
      } else if (questions.length <= 5) {
        examDurationSec = 900;  // 15 minutes
      } else if (questions.length <= 10) {
        examDurationSec = 1800; // 30 minutes
      } else {
        examDurationSec = Math.min(3600, questions.length * 180);
      }

      timerAlertsTriggered = { half: false, quarter: false, tenth: false };

      if (withProctoring) {
        const pip = document.getElementById('proctorPip');
        if (pip) {
          pip.style.display = 'flex';
        }

        const maxMalpractice = (activeProctorOptions && activeProctorOptions.maxMalpracticeAttempts) ? Math.max(10, Number(activeProctorOptions.maxMalpracticeAttempts)) : 10;
        const strikeText = document.getElementById('strikeText');
        const strikeBadge = document.getElementById('hudStrikeBadge');
        if (strikeText) strikeText.textContent = `Malpractice: 0 / ${maxMalpractice}`;
        if (strikeBadge) {
          strikeBadge.className = 'security-badge';
          strikeBadge.style.display = 'inline-flex';
        }

        const soundBadge = document.getElementById('hudSoundBadge');
        const soundText = document.getElementById('soundStrikeText');
        if (soundText) soundText.textContent = 'Voice: 0 / 10';
        if (soundBadge) {
          soundBadge.className = 'security-badge';
          soundBadge.style.display = activeProctorOptions.mic ? 'inline-flex' : 'none';
        }

        PROCTOR.init({
          onMalpractice: (reason) => showMalpractice(reason),
          onTabWarning:  (count, max, reason) => showTabWarning(count, max, reason),
          onSoundWarning:(count, max) => showSoundWarning(count, max),
          onAwayCountdown:(sec) => handleAwayCountdown(sec),
          onLightingWarning:(isLow) => handleLightingWarning(isLow)
        }, activeProctorOptions);
      } else {
        const pip = document.getElementById('proctorPip');
        if (pip) pip.style.display = 'none';
      }

      timerStart = Date.now();
      timerEl    = document.getElementById('quizTimer');
      clearInterval(timerInterval);
      timerInterval = setInterval(updateTimer, 1000);

      let titlePrefix = '📝 Exam:';
      if (activeFormat === 'coding' || activeFormat === 'python') titlePrefix = '💻 LeetCode Challenge:';
      else if (activeFormat === 'sql') titlePrefix = '🗄️ SQL Challenge:';
      else if (activeFormat === 'coding+sql' || activeFormat === 'sql+coding') titlePrefix = '🚀 Coding & SQL Exam:';
      else if (activeFormat === 'coding+mcq' || activeFormat === 'hybrid') titlePrefix = '⚡ Coding & MCQ Exam:';
      else if (activeFormat === 'sql+mcq') titlePrefix = '📊 SQL & MCQ Exam:';
      else if (activeFormat === 'coding+sql+mcq' || (activeFormat.includes('coding') && activeFormat.includes('sql') && activeFormat.includes('mcq'))) titlePrefix = '🏆 Tri-Assessment:';

      document.getElementById('quizTitle').textContent = `${titlePrefix} ${activeTopic}`;

      renderPalette();
      renderQuestion();

      window.removeEventListener('keydown', handleQuizKeydown);
      window.addEventListener('keydown', handleQuizKeydown);
    } finally {
      finishLoadingProgress();
    }
  }

  // ─── Palette ──────────────────────────────────────────────────────────────────
  function renderPalette() {
    const paletteEl = document.getElementById('questionPalette');
    const container = document.querySelector('.palette-container');
    if (container) {
      container.style.display = (questions.length <= 1) ? 'none' : 'flex';
    }
    if (!paletteEl) return;
    paletteEl.innerHTML = '';

    questions.forEach((q, i) => {
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.id = `palette-btn-${i}`;
      let icon = '📝';
      if (q.type === 'coding') {
        icon = (q.language === 'sql') ? '🗄️' : '💻';
      }
      btn.textContent = `${icon} Q${i + 1}`;
      if (i === currentIdx) btn.classList.add('active');
      if (isAnswered(i)) btn.classList.add('answered');
      btn.addEventListener('click', () => jumpTo(i));
      paletteEl.appendChild(btn);
    });
  }

  function updatePalette() {
    questions.forEach((_, i) => {
      const btn = document.getElementById(`palette-btn-${i}`);
      if (!btn) return;
      btn.classList.toggle('active', i === currentIdx);
      btn.classList.toggle('answered', isAnswered(i));
    });
  }

  function isAnswered(i) {
    const a = answers[i];
    if (a === null || a === undefined) return false;
    if (questions[i]?.type === 'coding') {
      return a.evaluated === true || a.passedCount > 0 || Boolean(a.code && a.code.trim().length > 0);
    }
    if (a instanceof Set) return a.size > 0;
    return true;
  }

  function jumpTo(idx) {
    saveCurrentEditorCode();
    if (idx >= 0 && idx < questions.length) {
      currentIdx = idx;
      renderQuestion();
    }
  }

  // ─── Rendering ────────────────────────────────────────────────────────────────
  function renderQuestion() {
    const q = questions[currentIdx];
    if (!q) return;

    // Progress stats
    const progressEl = document.getElementById('quizProgress');
    if (progressEl) progressEl.textContent = `Question ${currentIdx + 1} of ${questions.length}`;

    const answeredCount = answers.filter((a, i) => isAnswered(i)).length;
    const answeredEl = document.getElementById('quizAnsweredCount');
    if (answeredEl) answeredEl.textContent = `${answeredCount} Completed`;

    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      const pct = Math.round(((currentIdx + 1) / questions.length) * 100);
      progressBar.style.width = `${pct}%`;
    }

    const mcqCard = document.getElementById('questionCard');
    const codingWs = document.getElementById('codingWorkspace');
    const actionsBar = document.querySelector('.question-actions-bar');
    const paletteCont = document.querySelector('.palette-container');

    // Update Top HUD navigation buttons (‹ Question X of Y ›)
    const hudPrevBtn = document.getElementById('hudPrevBtn');
    const hudNextBtn = document.getElementById('hudNextBtn');
    if (hudPrevBtn) {
      hudPrevBtn.disabled = (currentIdx === 0);
      hudPrevBtn.style.display = questions.length > 1 ? 'inline-flex' : 'none';
    }
    if (hudNextBtn) {
      hudNextBtn.disabled = (currentIdx === questions.length - 1);
      hudNextBtn.style.display = questions.length > 1 ? 'inline-flex' : 'none';
    }

    if (q.type === 'coding') {
      // ── Show Coding Workspace ──────────────────────────────────────────────
      if (mcqCard) mcqCard.style.display = 'none';
      if (codingWs) codingWs.style.display = 'grid';
      if (actionsBar) actionsBar.style.display = 'none';
      if (paletteCont) paletteCont.style.display = 'none';

      renderCodingWorkspace(q);
    } else {
      // ── Show MCQ Card ──────────────────────────────────────────────────────
      if (codingWs) codingWs.style.display = 'none';
      if (mcqCard) mcqCard.style.display = 'block';
      if (actionsBar) actionsBar.style.display = 'flex';
      if (paletteCont) paletteCont.style.display = questions.length > 1 ? 'flex' : 'none';

      renderMcqCard(q);

      // Navigation buttons for MCQ mode
      const prevBtn = document.getElementById('prevBtn');
      if (prevBtn) prevBtn.style.display = currentIdx === 0 ? 'none' : 'inline-flex';

      const nextBtn = document.getElementById('nextBtn');
      if (nextBtn) nextBtn.style.display = currentIdx === questions.length - 1 ? 'none' : 'inline-flex';

      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) submitBtn.style.display = currentIdx === questions.length - 1 ? 'inline-flex' : 'none';
    }

    updatePalette();
  }

  // ─── MCQ Renderer ─────────────────────────────────────────────────────────────
  function renderMcqCard(q) {
    const tagEl = document.getElementById('qNumberTag');
    if (tagEl) tagEl.textContent = `Q${currentIdx + 1}`;

    const textEl = document.getElementById('questionText');
    if (textEl) {
      textEl.innerHTML = formatMarkdown(q.question);
      if (typeof hljs !== 'undefined') {
        textEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (_) {} });
      }
    }

    const multiHint = document.getElementById('multiChoiceHint');
    if (multiHint) multiHint.style.display = q.multi ? 'flex' : 'none';

    const container = document.getElementById('choicesContainer');
    container.innerHTML = '';

    const labels = ['A', 'B', 'C', 'D', 'E'];
    const currentAnswer = answers[currentIdx];

    q.choices.forEach((choice, i) => {
      let isSelected;
      if (q.multi) {
        isSelected = (currentAnswer instanceof Set) && currentAnswer.has(i);
      } else {
        isSelected = currentAnswer === i;
      }

      const box = document.createElement('div');
      box.className = `choice-box ${isSelected ? 'selected' : ''}`;
      box.setAttribute('role', q.multi ? 'checkbox' : 'radio');
      box.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      box.tabIndex = 0;

      const checkIcon = q.multi
        ? `<span class="custom-check-icon">${isSelected ? '✓' : ''}</span>`
        : `<span class="custom-check-icon radio-style">${isSelected ? '●' : ''}</span>`;

      box.innerHTML = `
        <div class="choice-checkbox-indicator">
          ${checkIcon}
        </div>
        <span class="choice-badge">${labels[i]})</span>
        <span class="choice-text">${formatChoice(choice)}</span>
      `;

      box.addEventListener('click', () => selectMcqAnswer(i));
      box.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          selectMcqAnswer(i);
        }
      });
      container.appendChild(box);
    });
  }

  function selectMcqAnswer(idx) {
    const q = questions[currentIdx];
    if (q.multi) {
      if (!(answers[currentIdx] instanceof Set)) {
        answers[currentIdx] = new Set();
      }
      const s = answers[currentIdx];
      if (s.has(idx)) s.delete(idx);
      else s.add(idx);
    } else {
      answers[currentIdx] = idx;
    }
    renderQuestion();
  }

  // ─── Permanent 10-Question Candidate Demo Test (Section 6) ───────────────────
  function getPermanentDemoQuestions() {
    const demoMcqs = [
      {
        type: 'mcq',
        question: 'Which of the following data structures follows the **Last-In, First-Out (LIFO)** principle?',
        choices: ['Stack', 'Queue', 'Array', 'Binary Tree'],
        answer: 0,
        multi: false,
        explanation: 'A Stack operates on a Last-In, First-Out (LIFO) basis, where elements are pushed and popped from the top.'
      },
      {
        type: 'mcq',
        question: 'What is the output of `print(type([1, 2, 3]))` in Python 3?',
        choices: ["<class 'list'>", "<class 'tuple'>", "<class 'dict'>", "<class 'set'>"],
        answer: 0,
        multi: false,
        explanation: 'Square brackets `[1, 2, 3]` define a Python `list` object.'
      },
      {
        type: 'mcq',
        question: 'Which keyword is used in **Java** to declare a constant variable whose value cannot be reassigned?',
        choices: ['final', 'const', 'static', 'immutable'],
        answer: 0,
        multi: false,
        explanation: 'In Java, the `final` keyword prevents a variable from being reassigned after initialization.'
      },
      {
        type: 'mcq',
        question: 'In **C programming**, which format specifier is used with `printf()` to print a standard signed integer (`int`)?',
        choices: ['%d', '%s', '%f', '%c'],
        answer: 0,
        multi: false,
        explanation: '`%d` (or `%i`) formats a signed decimal integer in `printf` and `scanf`.'
      },
      {
        type: 'mcq',
        question: 'Which **SQL** clause is used to filter rows returned by a `SELECT` query based on a condition?',
        choices: ['WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT'],
        answer: 0,
        multi: false,
        explanation: 'The `WHERE` clause filters individual rows before grouping or ordering.'
      },
      {
        type: 'mcq',
        question: 'What is the time complexity of accessing an element by its index `arr[i]` in a standard contiguous array?',
        choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        answer: 0,
        multi: false,
        explanation: 'Array indexing computes the memory address directly in constant `O(1)` time.'
      },
      {
        type: 'mcq',
        question: 'How many **bits** make up a single **Byte** in standard modern computer architecture?',
        choices: ['8 bits', '4 bits', '16 bits', '32 bits'],
        answer: 0,
        multi: false,
        explanation: '1 Byte consists of 8 binary bits (capable of representing 256 distinct values).'
      },
      {
        type: 'mcq',
        question: 'What does the boolean expression `True and False` evaluate to?',
        choices: ['False', 'True', 'None', 'SyntaxError'],
        answer: 0,
        multi: false,
        explanation: 'Logical `AND` requires both operands to be True; since one is False, it evaluates to `False`.'
      }
    ];

    let demoCoding = (typeof LEETCODE !== 'undefined' && LEETCODE.QuestionProvider)
      ? LEETCODE.QuestionProvider.getByIdOrNumber(2235)
      : ((typeof LEETCODE !== 'undefined') ? LEETCODE.getCatalog().find(p => p.id === 'add-two-integers') : null);
    if (!demoCoding) {
      demoCoding = {
        id: 'add-two-integers',
        type: 'coding',
        number: 2235,
        title: 'Problem #2235 — Add Two Integers',
        leetcodeBadge: 'LeetCode Problem #2235',
        category: 'Super Easy',
        difficulty: 'Super Easy',
        description: 'Given two integers `num1` and `num2`, return *the sum of the two integers*.',
        starterCodes: {
          python: 'class Solution:\n    def sum(self, num1: int, num2: int) -> int:\n        return num1 + num2\n'
        },
        starterCode: 'class Solution:\n    def sum(self, num1: int, num2: int) -> int:\n        return num1 + num2\n',
        testcases: [
          { id: 1, input: '12\n5', expected: '17', hidden: false },
          { id: 2, input: '-10\n4', expected: '-6', hidden: false }
        ]
      };
    } else {
      demoCoding = { ...demoCoding, type: 'coding' };
    }

    const demoSql = {
      id: 'demo-sql-select-students',
      type: 'coding',
      language: 'sql',
      title: 'SQL Challenge — Select All Students',
      leetcodeBadge: 'SQL Database Challenge',
      category: 'SQL',
      topic: 'Database & SQL',
      difficulty: 'Super Easy',
      description: `### Select All Students\n\nTable: \`Student\`\n\n\`\`\`\n+-------------+-------------+\n| Column Name | Type        |\n+-------------+-------------+\n| id          | INT         |\n| name        | VARCHAR(50) |\n+-------------+-------------+\n\`\`\`\n\n**Task:**\nWrite a SQL query to select **all columns and rows** from the \`Student\` table.\n\n---\n### Example:\n\`\`\`\nInput:\nStudent table:\n+----+---------+\n| id | name    |\n+----+---------+\n| 1  | Alice   |\n| 2  | Bob     |\n| 3  | Charlie |\n+----+---------+\n\nOutput:\n+----+---------+\n| id | name    |\n+----+---------+\n| 1  | Alice   |\n| 2  | Bob     |\n| 3  | Charlie |\n+----+---------+\n\`\`\``,
      schema: `CREATE TABLE Student (\n    id INT PRIMARY KEY,\n    name VARCHAR(50)\n);\nINSERT INTO Student (id, name) VALUES (1, 'Alice');\nINSERT INTO Student (id, name) VALUES (2, 'Bob');\nINSERT INTO Student (id, name) VALUES (3, 'Charlie');`,
      starterCode: `-- Write your SQL query below to select all students\nSELECT * FROM Student;`,
      testcases: [
        {
          id: 1,
          input: 'Default Student Table (3 rows)',
          setupSql: '',
          expected: [[1, 'Alice'], [2, 'Bob'], [3, 'Charlie']],
          hidden: false
        },
        {
          id: 2,
          input: 'Additional Student Row (id=4, David)',
          setupSql: "INSERT INTO Student (id, name) VALUES (4, 'David');",
          expected: [[1, 'Alice'], [2, 'Bob'], [3, 'Charlie'], [4, 'David']],
          hidden: false
        }
      ]
    };

    return [...demoMcqs, demoCoding, demoSql];
  }

  // ─── Coding Workspace Renderer (Section 2 & Section 3) ───────────────────────
  function renderCodingWorkspace(rawQ) {
    const isSql = (rawQ.language === 'sql');
    const q = (!isSql && typeof LEETCODE !== 'undefined' && LEETCODE.QuestionNormalizer)
      ? LEETCODE.QuestionNormalizer.normalize(rawQ)
      : rawQ;
    questions[currentIdx] = q;

    // Problem title & description (Section 2: "Problem #XXXX — Title")
    const titleEl = document.getElementById('cwProblemTitle');
    if (titleEl) {
      if (!isSql && q.number) {
        titleEl.textContent = `Problem #${q.number} — ${q.cleanTitle || q.title.replace(/^Problem\s*#\d+\s*[—\-:]\s*/i, '').replace(/^\d+\.\s*/, '')}`;
      } else {
        titleEl.textContent = q.title || 'Coding Challenge';
      }
    }

    // Solved Badge
    const solvedBadge = document.getElementById('cwProblemSolvedBadge');
    if (solvedBadge) {
      solvedBadge.style.display = (answers[currentIdx]?.solved) ? 'inline-flex' : 'none';
    }

    // Difficulty Chip
    const diffPill = document.getElementById('cwProblemDifficulty');
    if (diffPill) {
      const diff = (q.difficulty || 'Medium').toLowerCase().replace(/\s+/g, '-');
      diffPill.textContent = q.difficulty || 'Medium';
      diffPill.className = `cw-diff-pill ${diff}`;
    }

    // Topic Chip
    const topicChip = document.getElementById('cwTopicChip');
    if (topicChip) {
      topicChip.innerHTML = `${escHtml(q.topic || (isSql ? 'Database' : 'Algorithms'))} <span class="cw-chip-caret">▾</span>`;
    }

    const bodyEl = document.getElementById('cwProblemBody');
    if (bodyEl) {
      let descText = q.description || '';
      if (q.title) {
        const cleanT = (q.cleanTitle || q.title).replace(/^[0-9]+\.\s*/, '').replace(/^Problem\s*#\d+\s*[—\-:]\s*/i, '').trim();
        const titleRegex = new RegExp(`^#+\\s*(?:[0-9]+\\.\\s*)?(?:${cleanT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|[^\n]+)\\n+`, 'i');
        descText = descText.replace(titleRegex, '').trim();
      }
      const lcHeaderHtml = (!isSql && q.number)
        ? `<div class="cw-lc-meta-banner" id="cwLcMetaBanner">
             <span class="cw-lc-number-badge">LeetCode Problem #${q.number}</span>
             <span class="cw-lc-meta-sep">•</span>
             <span class="cw-lc-meta-title">${escHtml(q.cleanTitle || q.title)}</span>
             ${Array.isArray(q.tags) && q.tags.length ? `<span class="cw-lc-tags-wrap">${q.tags.map(t => `<span class="cw-lc-tag-chip">${escHtml(t)}</span>`).join('')}</span>` : ''}
           </div>`
        : `<div class="cw-lc-meta-banner" id="cwLcMetaBanner">
             <span class="cw-lc-number-badge">${isSql ? 'SQL Database Challenge' : 'Coding Problem'}</span>
             <span class="cw-lc-meta-sep">•</span>
             <span class="cw-lc-meta-title">${escHtml(q.title || 'Challenge')}</span>
           </div>`;
      bodyEl.innerHTML = lcHeaderHtml + formatMarkdown(descText);
      if (typeof hljs !== 'undefined') {
        bodyEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (_) {} });
      }
    }

    // Language badge & dropdown
    const langSelect = document.getElementById('cwLangSelect');
    if (isSql) {
      if (langSelect) {
        langSelect.innerHTML = '<option value="mysql">MySQL 8.0</option>';
        langSelect.value = 'mysql';
        langSelect.disabled = false;
      }
    } else {
      if (langSelect) {
        langSelect.innerHTML = `
          <option value="python">Python 3.14</option>
          <option value="java">Java 11</option>
          <option value="cpp">C++14</option>
          <option value="c">C</option>
        `;
        langSelect.value = activeLanguage;
        langSelect.disabled = false;
      }
    }

    // SQL Schema Tab Button
    const schemaTabBtn = document.getElementById('cwSchemaTabBtn');
    const schemaCode = document.getElementById('cwSchemaCode');
    if (schemaTabBtn) schemaTabBtn.style.display = isSql ? 'inline-block' : 'none';
    if (schemaCode && isSql) {
      schemaCode.textContent = q.schema || '-- No schema defined';
      if (typeof hljs !== 'undefined') {
        try { hljs.highlightElement(schemaCode); } catch (_) {}
      }
    }

    // Sample Testcases Explorer & Results
    renderSampleCasesExplorer(q);

    // Code Editor Textarea, Synchronized Line Numbers & Undo/Redo Stack (Section 3)
    const editor = document.getElementById('cwCodeInput');
    if (editor) {
      editor.placeholder = isSql
        ? "# Write your MySQL query statement below\n"
        : "# Write your code solution here...\n";
      let currentCode = '';
      if (isSql) {
        currentCode = answers[currentIdx]?.code !== undefined ? answers[currentIdx].code : (q.starterCode || '# Write your MySQL query statement below\nSELECT ');
      } else {
        const uCodes = answers[currentIdx]?.userCodes;
        if (uCodes && uCodes[activeLanguage]) {
          currentCode = uCodes[activeLanguage];
        } else if (q.starterCodes && q.starterCodes[activeLanguage]) {
          currentCode = q.starterCodes[activeLanguage];
        } else {
          currentCode = answers[currentIdx]?.code || q.starterCode || '';
        }
      }
      editor.value = currentCode;

      if (!answers[currentIdx]) answers[currentIdx] = {};
      if (!Array.isArray(answers[currentIdx].undoStack) || answers[currentIdx].undoStack.length === 0) {
        answers[currentIdx].undoStack = [{ value: currentCode, start: currentCode.length, end: currentCode.length }];
        answers[currentIdx].redoStack = [];
      }

      const pushUndoSnapshot = (ed) => {
        const ans = answers[currentIdx];
        if (!ans) return;
        ans.undoStack = ans.undoStack || [];
        ans.redoStack = ans.redoStack || [];
        const top = ans.undoStack[ans.undoStack.length - 1];
        if (!top || top.value !== ed.value) {
          ans.undoStack.push({ value: ed.value, start: ed.selectionStart, end: ed.selectionEnd });
          if (ans.undoStack.length > 100) ans.undoStack.shift();
          ans.redoStack = [];
        }
      };

      updateEditorLineNumbers();
      updateCursorPosition();
      highlightEditorCode();

      // Smart Indentation, Bracket/Quote Auto-Pairing, Tab Handling & Controlled Undo/Redo (Section 3)
      editor.onkeydown = function(e) {
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const val = this.value;
        const keyUpper = (e.key || '').toUpperCase();

        // 0. Controlled Undo / Redo Shortcuts (Section 3: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const ans = answers[currentIdx];
          if (keyUpper === 'Z' && !e.shiftKey) {
            e.preventDefault();
            if (ans && Array.isArray(ans.undoStack) && ans.undoStack.length > 1) {
              const currentSnap = ans.undoStack.pop();
              ans.redoStack = ans.redoStack || [];
              ans.redoStack.push(currentSnap);
              const prevSnap = ans.undoStack[ans.undoStack.length - 1];
              this.value = prevSnap.value;
              this.selectionStart = prevSnap.start;
              this.selectionEnd = prevSnap.end;
              syncEditorChanges(this);
            }
            return;
          }
          if ((keyUpper === 'Y' && !e.shiftKey) || (keyUpper === 'Z' && e.shiftKey)) {
            e.preventDefault();
            if (ans && Array.isArray(ans.redoStack) && ans.redoStack.length > 0) {
              const nextSnap = ans.redoStack.pop();
              ans.undoStack = ans.undoStack || [];
              ans.undoStack.push(nextSnap);
              this.value = nextSnap.value;
              this.selectionStart = nextSnap.start;
              this.selectionEnd = nextSnap.end;
              syncEditorChanges(this);
            }
            return;
          }
        }

        // 1. Run Sample Testcases Shortcut: Ctrl+Enter or Cmd+Enter
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          runSampleCases();
          return;
        }

        // 2. Smart Indentation on Enter
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          pushUndoSnapshot(this);

          // Get line up to cursor
          const lastNewline = val.lastIndexOf('\n', start - 1);
          const currentLineBeforeCursor = val.substring(lastNewline + 1, start);
          const indentMatch = currentLineBeforeCursor.match(/^(\s*)/);
          const currentIndent = indentMatch ? indentMatch[1] : '';

          const trimmedBefore = currentLineBeforeCursor.trimEnd();
          const nextChar = val.charAt(start);
          let extraIndent = '';

          // If line ends with ':' or '{' or '(' or '[', add 4 spaces
          if (trimmedBefore.endsWith(':') || trimmedBefore.endsWith('{') || trimmedBefore.endsWith('(') || trimmedBefore.endsWith('[')) {
            extraIndent = '    ';
          }

          // Special case: Enter between { and }, ( and ), or [ and ]
          if (
            (trimmedBefore.endsWith('{') && nextChar === '}') ||
            (trimmedBefore.endsWith('(') && nextChar === ')') ||
            (trimmedBefore.endsWith('[') && nextChar === ']')
          ) {
            const insertText = '\n' + currentIndent + extraIndent + '\n' + currentIndent;
            this.value = val.substring(0, start) + insertText + val.substring(end);
            this.selectionStart = this.selectionEnd = start + 1 + currentIndent.length + extraIndent.length;
          } else {
            const insertText = '\n' + currentIndent + extraIndent;
            this.value = val.substring(0, start) + insertText + val.substring(end);
            this.selectionStart = this.selectionEnd = start + insertText.length;
          }

          pushUndoSnapshot(this);
          syncEditorChanges(this);
          return;
        }

        // 3. Tab and Shift+Tab (Indentation & Dedentation)
        if (e.key === 'Tab') {
          e.preventDefault();
          pushUndoSnapshot(this);
          if (start !== end) {
            // Multi-line selection indent/unindent
            const startLine = val.lastIndexOf('\n', start - 1) + 1;
            let endLine = val.indexOf('\n', end);
            if (endLine === -1) endLine = val.length;

            const selectedBlock = val.substring(startLine, endLine);
            const lines = selectedBlock.split('\n');
            let modifiedLines;

            if (e.shiftKey) {
              // Dedent: strip up to 4 spaces from line start
              modifiedLines = lines.map(line => {
                const m = line.match(/^ {1,4}/);
                if (m) return line.substring(m[0].length);
                if (line.startsWith('\t')) return line.substring(1);
                return line;
              });
            } else {
              // Indent: add 4 spaces to each line
              modifiedLines = lines.map(line => '    ' + line);
            }

            const newBlock = modifiedLines.join('\n');
            this.value = val.substring(0, startLine) + newBlock + val.substring(endLine);
            this.selectionStart = startLine;
            this.selectionEnd = endLine + (newBlock.length - selectedBlock.length);
          } else {
            // Single cursor Tab / Shift+Tab
            if (e.shiftKey) {
              // Dedent current line
              const lineStart = val.lastIndexOf('\n', start - 1) + 1;
              const lineText = val.substring(lineStart, start);
              const m = lineText.match(/( {1,4})$/);
              if (m) {
                const count = m[1].length;
                this.value = val.substring(0, start - count) + val.substring(start);
                this.selectionStart = this.selectionEnd = start - count;
              }
            } else {
              // Insert 4 spaces
              this.value = val.substring(0, start) + '    ' + val.substring(end);
              this.selectionStart = this.selectionEnd = start + 4;
            }
          }

          pushUndoSnapshot(this);
          syncEditorChanges(this);
          return;
        }

        // 4. Bracket & Quote Auto-Pairing
        const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
        const closeChars = [')', ']', '}', '"', "'"];

        if (pairs[e.key]) {
          const openChar = e.key;
          const closeChar = pairs[openChar];

          // Overtype quote if next char is already the quote
          if (start === end && (openChar === '"' || openChar === "'") && val.charAt(start) === openChar) {
            e.preventDefault();
            this.selectionStart = this.selectionEnd = start + 1;
            updateCursorPosition();
            return;
          }

          e.preventDefault();
          pushUndoSnapshot(this);
          if (start !== end) {
            // Wrap selected text
            const selected = val.substring(start, end);
            this.value = val.substring(0, start) + openChar + selected + closeChar + val.substring(end);
            this.selectionStart = start + 1;
            this.selectionEnd = end + 1;
          } else {
            // Insert pair and place cursor between
            this.value = val.substring(0, start) + openChar + closeChar + val.substring(end);
            this.selectionStart = this.selectionEnd = start + 1;
          }
          pushUndoSnapshot(this);
          syncEditorChanges(this);
          return;
        }

        // Overtype closing brackets
        if (closeChars.includes(e.key)) {
          if (start === end && val.charAt(start) === e.key) {
            e.preventDefault();
            this.selectionStart = this.selectionEnd = start + 1;
            updateCursorPosition();
            return;
          }
        }

        // 5. Backspace: smart 4-space indent dedent & matching pairs
        if (e.key === 'Backspace') {
          if (start === end && start > 0) {
            // Smart 4-space indent removal
            const lastNl = val.lastIndexOf('\n', start - 1);
            const lineTextBefore = val.substring(lastNl + 1, start);
            if (/^ +$/.test(lineTextBefore) && lineTextBefore.length >= 4 && lineTextBefore.length % 4 === 0) {
              e.preventDefault();
              pushUndoSnapshot(this);
              this.value = val.substring(0, start - 4) + val.substring(start);
              this.selectionStart = this.selectionEnd = start - 4;
              pushUndoSnapshot(this);
              syncEditorChanges(this);
              return;
            }

            const charBefore = val.charAt(start - 1);
            const charAfter = val.charAt(start);
            if (
              (charBefore === '(' && charAfter === ')') ||
              (charBefore === '[' && charAfter === ']') ||
              (charBefore === '{' && charAfter === '}') ||
              (charBefore === '"' && charAfter === '"') ||
              (charBefore === "'" && charAfter === "'")
            ) {
              e.preventDefault();
              pushUndoSnapshot(this);
              this.value = val.substring(0, start - 1) + val.substring(start + 1);
              this.selectionStart = this.selectionEnd = start - 1;
              pushUndoSnapshot(this);
              syncEditorChanges(this);
              return;
            }
          }
        }
      };

      editor.oninput = function() {
        pushUndoSnapshot(this);
        syncEditorChanges(this);
      };

      editor.onclick = function() {
        updateCursorPosition();
        highlightEditorCode();
      };

      editor.onkeyup = function(e) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
          updateCursorPosition();
          highlightEditorCode();
        }
      };

      editor.onscroll = function() {
        const lineGutter = document.getElementById('cwLineNumbers');
        if (lineGutter) lineGutter.scrollTop = this.scrollTop;
        const highlightPre = document.getElementById('cwHighlightPre');
        if (highlightPre) {
          highlightPre.scrollTop = this.scrollTop;
          highlightPre.scrollLeft = this.scrollLeft;
        }
      };

      editor.onclick = updateCursorPosition;
      editor.onkeyup = updateCursorPosition;
      editor.onselect = updateCursorPosition;
    }

    // LeetCode Result Drawer initial state
    if (answers[currentIdx]?.lastResult) {
      renderTestResultsView(answers[currentIdx].lastResult, q.testcases || []);
      switchLcDrawerTab('result');
    } else {
      const emptyEl = document.getElementById('cwLcResultEmpty');
      const errEl = document.getElementById('cwLcResultError');
      const succEl = document.getElementById('cwLcResultSuccess');
      const loadEl = document.getElementById('cwLcResultLoading');
      if (emptyEl) emptyEl.style.display = 'flex';
      if (errEl) errEl.style.display = 'none';
      if (succEl) succEl.style.display = 'none';
      if (loadEl) loadEl.style.display = 'none';
      switchLcDrawerTab('result');
    }

    // Default to problem tab on question change
    switchCwTab('problem');
  }

  function renderMiniTable(rows, cols) {
    if (!rows && !cols) return '<span style="color:#64748b; font-style:italic;">(Empty result)</span>';
    if (Array.isArray(rows) && rows.length === 0 && (!cols || cols.length === 0)) {
      return '<span style="color:#64748b; font-style:italic;">(0 rows / empty result)</span>';
    }

    let html = '<div class="cw-lc-table-wrapper"><table class="cw-lc-mini-table">';
    if (cols && Array.isArray(cols) && cols.length > 0) {
      html += '<thead><tr>';
      cols.forEach(c => { html += `<th>${escHtml(String(c))}</th>`; });
      html += '</tr></thead>';
    }

    html += '<tbody>';
    if (Array.isArray(rows) && rows.length > 0) {
      rows.slice(0, 15).forEach(r => {
        html += '<tr>';
        if (Array.isArray(r)) {
          r.forEach(c => { html += `<td>${escHtml(String(c))}</td>`; });
        } else {
          html += `<td>${escHtml(String(r))}</td>`;
        }
        html += '</tr>';
      });
      if (rows.length > 15) {
        html += `<tr><td colspan="15" style="text-align:center; color:#8c8c8c; font-size:0.75rem;">... +${rows.length - 15} more rows</td></tr>`;
      }
    } else {
      html += '<tr><td colspan="15" style="color:#8c8c8c; font-style:italic; text-align:center;">(0 rows returned)</td></tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  let activeSampleCaseIdx = 0;
  let activeResultCaseIdx = 0;
  let lastTestcaseResults = null;
  let activeLcDrawerTab = 'testcase';

  function switchLcDrawerTab(tab) {
    activeLcDrawerTab = tab;
    const btnTc = document.getElementById('cwLcTabBtnTestcase');
    const btnRes = document.getElementById('cwLcTabBtnResult');
    const viewTc = document.getElementById('cwLcTabTestcaseView');
    const viewRes = document.getElementById('cwLcTabResultView');

    if (btnTc) btnTc.classList.toggle('active', tab === 'testcase');
    if (btnRes) btnRes.classList.toggle('active', tab === 'result');
    if (viewTc) viewTc.style.display = (tab === 'testcase') ? 'flex' : 'none';
    if (viewRes) viewRes.style.display = (tab === 'result') ? 'flex' : 'none';
  }

  function renderLeetCodeInputCards(container, rawInput, isSql, setupSql) {
    if (!container) return;
    container.innerHTML = '';

    // If SQL and setupSql provided
    if (isSql && setupSql) {
      const item = document.createElement('div');
      item.className = 'cw-lc-param-item';
      item.innerHTML = `
        <div class="cw-lc-param-name">Database Setup =</div>
        <div class="cw-lc-param-card">${escHtml(setupSql)}</div>
      `;
      container.appendChild(item);
      if (!rawInput || !String(rawInput).trim()) return;
    }

    if (rawInput === undefined || rawInput === null || !String(rawInput).trim()) {
      if (!isSql) {
        container.innerHTML = '<div class="cw-lc-param-card" style="color:#64748b;">(No input parameters)</div>';
      }
      return;
    }

    const trimmed = String(rawInput).trim();
    let parsedJson = null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        parsedJson = JSON.parse(trimmed);
      } catch (_) {}
    }

    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      Object.entries(parsedJson).forEach(([key, val]) => {
        const item = document.createElement('div');
        item.className = 'cw-lc-param-item';
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        item.innerHTML = `
          <div class="cw-lc-param-name">${escHtml(key)} =</div>
          <div class="cw-lc-param-card">${escHtml(valStr)}</div>
        `;
        container.appendChild(item);
      });
      return;
    }

    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const hasEquals = lines.some(l => /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(l));

    if (hasEquals) {
      lines.forEach(line => {
        const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
        const item = document.createElement('div');
        item.className = 'cw-lc-param-item';
        if (match) {
          item.innerHTML = `
            <div class="cw-lc-param-name">${escHtml(match[1])} =</div>
            <div class="cw-lc-param-card">${escHtml(match[2])}</div>
          `;
        } else {
          item.innerHTML = `<div class="cw-lc-param-card">${escHtml(line)}</div>`;
        }
        container.appendChild(item);
      });
      return;
    }

    if (lines.length > 1) {
      lines.forEach((line, idx) => {
        const item = document.createElement('div');
        item.className = 'cw-lc-param-item';
        item.innerHTML = `
          <div class="cw-lc-param-name">param ${idx + 1} =</div>
          <div class="cw-lc-param-card">${escHtml(line)}</div>
        `;
        container.appendChild(item);
      });
      return;
    }

    const item = document.createElement('div');
    item.className = 'cw-lc-param-item';
    item.innerHTML = `<div class="cw-lc-param-card">${escHtml(trimmed)}</div>`;
    container.appendChild(item);
  }

  function renderSampleCasesExplorer(q) {
    const tcList = q?.testcases || [];
    const sampleCases = tcList.filter(tc => !tc.hidden).length > 0
      ? tcList.filter(tc => !tc.hidden)
      : tcList.slice(0, 4);

    // Update Difficulty and Topic chips
    const diffPill = document.getElementById('cwProblemDifficulty');
    if (diffPill) {
      const diff = (q?.difficulty || 'Medium').toLowerCase();
      diffPill.textContent = q?.difficulty || 'Medium';
      diffPill.className = `cw-diff-pill ${diff}`;
    }
    const topicChip = document.getElementById('cwTopicChip');
    if (topicChip) {
      topicChip.textContent = q?.topic || (q?.language === 'sql' ? 'Database & SQL' : 'Algorithms');
    }

    const pillsRow = document.getElementById('cwLcSampleCasePills');
    if (pillsRow) {
      pillsRow.innerHTML = '';
      sampleCases.forEach((tc, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cw-lc-case-pill ${idx === activeSampleCaseIdx ? 'active' : ''}`;
        btn.innerHTML = `<span>Case ${idx + 1}</span>`;
        btn.onclick = () => selectSampleCase(idx, q);
        pillsRow.appendChild(btn);
      });
    }

    // Default to Case 1
    activeSampleCaseIdx = 0;
    selectSampleCase(0, q);

    // If there is no previous result, show empty state in Result tab
    if (!answers[currentIdx]?.lastResult) {
      const emptyEl = document.getElementById('cwLcResultEmpty');
      const loadEl = document.getElementById('cwLcResultLoading');
      const errEl = document.getElementById('cwLcResultError');
      const succEl = document.getElementById('cwLcResultSuccess');
      if (emptyEl) emptyEl.style.display = 'flex';
      if (loadEl) loadEl.style.display = 'none';
      if (errEl) errEl.style.display = 'none';
      if (succEl) succEl.style.display = 'none';
    }
  }

  function selectSampleCase(idx, q) {
    const question = q || questions[currentIdx];
    const tcList = question?.testcases || [];
    const isSql = (question?.language === 'sql');
    const sampleCases = tcList.filter(tc => !tc.hidden).length > 0
      ? tcList.filter(tc => !tc.hidden)
      : tcList.slice(0, 4);

    if (!sampleCases.length) return;
    activeSampleCaseIdx = Math.max(0, Math.min(idx, sampleCases.length - 1));

    const pillsRow = document.getElementById('cwLcSampleCasePills');
    if (pillsRow) {
      pillsRow.querySelectorAll('.cw-lc-case-pill').forEach((btn, i) => {
        btn.classList.toggle('active', i === activeSampleCaseIdx);
      });
    }

    const tc = sampleCases[activeSampleCaseIdx];
    if (!tc) return;

    // Database Table Setup if present (SQL or custom setup)
    const setupGroup = document.getElementById('cwLcSetupGroup');
    const setupCode = document.getElementById('cwLcSetupCode');
    if (setupGroup && setupCode) {
      if (tc.setup) {
        setupGroup.style.display = 'block';
        setupCode.textContent = tc.setup;
      } else {
        setupGroup.style.display = 'none';
      }
    }

    // Input cards
    const inputCardsList = document.getElementById('cwLcInputCardsList');
    if (isSql && !tc.input && tc.setup) {
      if (setupGroup) setupGroup.style.display = 'none';
      renderLeetCodeInputCards(inputCardsList, '', true, tc.setup);
    } else {
      renderLeetCodeInputCards(inputCardsList, tc.input, isSql, tc.setup);
    }

    // Sync Custom Stdin Box
    const customStdinGroup = document.getElementById('cwCustomStdinGroup');
    const customStdinInput = document.getElementById('cwCustomStdinInput');
    if (customStdinGroup) {
      customStdinGroup.style.display = isSql ? 'none' : 'block';
    }
    if (customStdinInput && !isSql) {
      customStdinInput.value = String(tc.input || '').replace(/\\n/g, '\n');
      customStdinInput.oninput = () => {
        tc.input = customStdinInput.value;
        renderLeetCodeInputCards(inputCardsList, tc.input, false, tc.setup);
      };
    }

    setupDrawerResizer();
  }

  function setupDrawerResizer() {
    const resizer = document.getElementById('cwDrawerResizer');
    const drawer = document.getElementById('cwLcDrawer');
    const rightPanel = document.querySelector('.cw-right-panel');
    if (!resizer || !drawer || !rightPanel || resizer._initialized) return;
    resizer._initialized = true;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = drawer.offsetHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dy = startY - e.clientY;
      const panelHeight = rightPanel.offsetHeight || window.innerHeight;
      const minH = 130;
      const maxH = Math.max(220, Math.floor(panelHeight * 0.65));
      const newH = Math.max(minH, Math.min(maxH, startHeight + dy));
      drawer.style.height = `${newH}px`;
      drawer.style.maxHeight = `${newH}px`;
      drawer.style.flex = `0 0 ${newH}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  function updateCompilerHeaderTelemetry(statusLabel, statusKind, execTimeMs, compileTimeMs) {
    const statusBadge = document.getElementById('cwCompilerStatusBadge');
    const timeBadge = document.getElementById('cwCompilerExecTime');
    if (statusBadge) {
      statusBadge.textContent = `Status: ${statusLabel}`;
      statusBadge.className = `cw-compiler-status-badge ${statusKind || ''}`;
    }
    if (timeBadge) {
      if (execTimeMs !== undefined && execTimeMs !== null) {
        const totalMs = Number(execTimeMs) || 0;
        const secStr = (totalMs / 1000).toFixed(2);
        timeBadge.textContent = `Execution Time: ${secStr}s (${Math.round(totalMs)} ms)`;
      } else {
        timeBadge.textContent = 'Execution Time: —';
      }
    }
  }

  function renderTestResultsView(result, targetCases) {
    if (!result) return;
    lastTestcaseResults = result;

    // Switch drawer tab to 'result'
    switchLcDrawerTab('result');

    const emptyEl = document.getElementById('cwLcResultEmpty');
    const loadEl = document.getElementById('cwLcResultLoading');
    const errEl = document.getElementById('cwLcResultError');
    const succEl = document.getElementById('cwLcResultSuccess');

    if (emptyEl) emptyEl.style.display = 'none';
    if (loadEl) loadEl.style.display = 'none';

    const execMs = result.execution_time_ms !== undefined ? result.execution_time_ms : (result.runtime !== undefined ? result.runtime : 0);
    const compMs = result.compile_time_ms || 0;

    // If execution encountered an error / exception (Image 2)
    if (result.error || (!result.success && (!result.results || result.results.length === 0))) {
      if (errEl) errEl.style.display = 'block';
      if (succEl) succEl.style.display = 'none';

      const errorHeading = document.getElementById('cwLcErrorHeading');
      const errorCallout = document.getElementById('cwLcErrorCallout');
      const errorInputCards = document.getElementById('cwLcErrorInputCards');

      const errLower = String(result.error || '').toLowerCase();
      const isTimeout = result.status === 'TIME_LIMIT_EXCEEDED' || errLower.includes('time limit');
      const isCompile = result.status === 'COMPILE_ERROR' || errLower.includes('syntax') || errLower.includes('compile') || errLower.includes('sandbox violation');
      const headingLabel = isTimeout ? 'Time Limit Exceeded' : (isCompile ? 'Compile Error' : 'Runtime Error');

      if (errorHeading) errorHeading.textContent = headingLabel;
      if (errorCallout) errorCallout.textContent = result.error || 'Execution Error';
      updateCompilerHeaderTelemetry(headingLabel, 'err', execMs, compMs);

      // Last Executed Input
      const firstTc = targetCases && targetCases[0] ? targetCases[0] : null;
      const q = questions[currentIdx];
      renderLeetCodeInputCards(errorInputCards, firstTc?.input || '', q?.language === 'sql', firstTc?.setup);
      return;
    }

    // Normal evaluated results (Image 3)
    if (errEl) errEl.style.display = 'none';
    if (succEl) succEl.style.display = 'block';

    const verdictHeading = document.getElementById('cwLcVerdictHeading');
    const verdictRuntime = document.getElementById('cwLcVerdictRuntime');

    const isAllPass = Boolean(result.allPassed);
    const statusText = isAllPass ? 'Accepted' : (result.status === 'RUNTIME_ERROR' ? 'Runtime Error' : 'Wrong Answer');
    if (verdictHeading) {
      verdictHeading.textContent = statusText;
      verdictHeading.className = `cw-lc-verdict-heading ${isAllPass ? 'accepted' : 'wrong'}`;
    }
    if (verdictRuntime) {
      const sec = (Number(execMs) / 1000).toFixed(2);
      verdictRuntime.textContent = `Execution Time: ${sec}s (${Math.round(execMs)} ms)`;
    }
    updateCompilerHeaderTelemetry(statusText, isAllPass ? 'ok' : 'warn', execMs, compMs);

    // Render Case Pills: ✓ Case 1, ✓ Case 2, ✗ Case 3
    const pillsRow = document.getElementById('cwLcResultCasePills');
    if (pillsRow) {
      pillsRow.innerHTML = '';
      (result.results || []).forEach((r, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cw-lc-case-pill ${idx === activeResultCaseIdx ? 'active' : ''}`;
        const iconClass = r.passed ? 'pass' : 'fail';
        const iconSym = r.passed ? '✓' : '✗';
        btn.innerHTML = `<span class="cw-lc-pill-icon ${iconClass}">${iconSym}</span><span>Case ${r.id || idx + 1}</span>`;
        btn.onclick = () => selectResultCase(idx);
        pillsRow.appendChild(btn);
      });
    }

    activeResultCaseIdx = 0;
    selectResultCase(0);
  }

  function selectResultCase(idx) {
    if (!lastTestcaseResults || !lastTestcaseResults.results) return;
    const results = lastTestcaseResults.results;
    if (!results.length) return;
    activeResultCaseIdx = Math.max(0, Math.min(idx, results.length - 1));

    const pillsRow = document.getElementById('cwLcResultCasePills');
    if (pillsRow) {
      pillsRow.querySelectorAll('.cw-lc-case-pill').forEach((btn, i) => {
        btn.classList.toggle('active', i === activeResultCaseIdx);
      });
    }

    const r = results[activeResultCaseIdx];
    if (!r) return;
    const q = questions[currentIdx];
    const isSql = (q?.language === 'sql');

    // Render Input Cards (supports SQL setup tables and Python variables)
    const inputCardsList = document.getElementById('cwLcResultInputCards');
    renderLeetCodeInputCards(inputCardsList, r.input, isSql, r.setup);

    // Render Output Card
    const outputCard = document.getElementById('cwLcResultOutputCard');
    if (outputCard) {
      outputCard.className = `cw-lc-param-card ${r.passed ? '' : 'failed'}`;
      if (r.actual !== undefined) {
        if (Array.isArray(r.actual) && r.actual.length > 0 && Array.isArray(r.actual[0])) {
          outputCard.innerHTML = renderMiniTable(r.actual, r.columns);
        } else if (Array.isArray(r.actual) && r.actual.length === 0) {
          outputCard.innerHTML = renderMiniTable([], r.columns);
        } else {
          outputCard.textContent = typeof r.actual === 'object' ? JSON.stringify(r.actual, null, 2) : String(r.actual);
        }
      } else if (r.error) {
        outputCard.textContent = `Error: ${r.error}`;
      } else {
        outputCard.textContent = '--';
      }
    }

    // Render Expected Card
    const expectedCard = document.getElementById('cwLcResultExpectedCard');
    if (expectedCard) {
      if (r.expected !== undefined) {
        if (Array.isArray(r.expected) && r.expected.length > 0 && Array.isArray(r.expected[0])) {
          expectedCard.innerHTML = renderMiniTable(r.expected, r.columns);
        } else if (Array.isArray(r.expected) && r.expected.length === 0) {
          expectedCard.innerHTML = renderMiniTable([], r.columns);
        } else {
          expectedCard.textContent = typeof r.expected === 'string' ? r.expected : JSON.stringify(r.expected, null, 2);
        }
      } else {
        expectedCard.textContent = '--';
      }
    }

    // Program Stdout (if present)
    const stdoutGroup = document.getElementById('cwLcStdoutGroup');
    const stdoutCard = document.getElementById('cwLcStdoutCard');
    if (stdoutGroup && stdoutCard) {
      if (lastTestcaseResults.stdout && lastTestcaseResults.stdout.trim()) {
        stdoutGroup.style.display = 'block';
        stdoutCard.textContent = lastTestcaseResults.stdout;
      } else {
        stdoutGroup.style.display = 'none';
      }
    }
  }

  function highlightEditorCode() {
    const editor = document.getElementById('cwCodeInput');
    const codeEl = document.getElementById('cwHighlightCode');
    const highlightPre = document.getElementById('cwHighlightPre');
    if (!editor || !codeEl) return;
    const code = editor.value || '';
    const q = questions[currentIdx];
    const isSql = (q && q.language === 'sql');
    let lang = isSql ? 'sql' : (activeLanguage || 'python');
    if (lang === 'c' || lang === 'cpp') lang = 'cpp';

    // If text ends with newline, append space so <pre> does not drop trailing newline
    const textToHighlight = code.endsWith('\n') ? (code + ' ') : (code || ' ');

    let rawHighlight = '';
    if (window.hljs && typeof hljs.highlight === 'function') {
      try {
        const res = hljs.highlight(textToHighlight, { language: lang, ignoreIllegals: true });
        rawHighlight = res.value;
      } catch (_) {
        rawHighlight = escHtml(textToHighlight);
      }
    } else {
      rawHighlight = escHtml(textToHighlight);
    }

    // Determine current cursor line for active Indentation Match Line highlight
    const cursorPos = editor.selectionStart || 0;
    const currentLineIndex = (code.substring(0, cursorPos).match(/\n/g) || []).length;

    // Process line-by-line and insert visual Indentation Match Lines (Indent Guides)
    const rawLines = textToHighlight.split('\n');
    const hlLines = rawHighlight.split('\n');

    const formattedLines = hlLines.map((hlLine, lineIdx) => {
      const rawLine = rawLines[lineIdx] || '';
      const indentMatch = rawLine.match(/^( +)/);
      if (!indentMatch) return hlLine;

      const totalSpaces = indentMatch[1].length;
      const numGuides = Math.floor(totalSpaces / 4);
      if (numGuides === 0) return hlLine;

      const remainderSpaces = totalSpaces % 4;
      const isCurrentLine = (lineIdx === currentLineIndex);

      let guidesHtml = '';
      for (let g = 0; g < numGuides; g++) {
        const guideLevel = g + 1;
        const isActive = isCurrentLine;
        guidesHtml += `<span class="cw-indent-guide${isActive ? ' active' : ''}" data-level="${guideLevel}">    </span>`;
      }
      if (remainderSpaces > 0) {
        guidesHtml += ' '.repeat(remainderSpaces);
      }

      const spacesPattern = ' '.repeat(totalSpaces);
      if (hlLine.startsWith(spacesPattern)) {
        return guidesHtml + hlLine.substring(totalSpaces);
      }
      return hlLine.replace(/^( +)/, guidesHtml);
    });

    codeEl.innerHTML = formattedLines.join('\n');

    if (highlightPre) {
      highlightPre.scrollTop = editor.scrollTop;
      highlightPre.scrollLeft = editor.scrollLeft;
    }
  }

  function syncEditorChanges(editor) {
    if (!editor) return;
    if (answers[currentIdx]) {
      answers[currentIdx].code = editor.value;
      if (answers[currentIdx].userCodes && activeLanguage) {
        answers[currentIdx].userCodes[activeLanguage] = editor.value;
      }
    }
    updateEditorLineNumbers();
    updateCursorPosition();
    highlightEditorCode();
    triggerAutoSaveIndicator();
  }

  function updateEditorLineNumbers() {
    const editor = document.getElementById('cwCodeInput');
    const gutter = document.getElementById('cwLineNumbers');
    if (!editor || !gutter) return;
    const count = (editor.value.match(/\n/g) || []).length + 1;
    let nums = '';
    for (let i = 1; i <= Math.max(1, count); i++) {
      nums += i + '\n';
    }
    gutter.textContent = nums;
    gutter.scrollTop = editor.scrollTop;
  }

  function updateCursorPosition() {
    const editor = document.getElementById('cwCodeInput');
    const posEl = document.getElementById('cwCursorPos');
    if (!editor || !posEl) return;
    const textBefore = editor.value.substring(0, editor.selectionStart || 0);
    const lines = textBefore.split('\n');
    const lineNum = lines.length;
    const currentLine = lines[lines.length - 1];
    const colNum = currentLine.length + 1;

    // Detect indentation level of current line
    const leadingSpaces = (currentLine.match(/^( +)/) || [''])[0].length;
    const indentLevel = Math.floor(leadingSpaces / 4);
    const indentBadge = leadingSpaces > 0 ? ` • Indent: Level ${indentLevel} (${leadingSpaces} sp)` : ' • Indent: Level 0';

    posEl.textContent = `Ln ${lineNum}, Col ${colNum}${indentBadge}`;
  }

  let saveTimer = null;
  function triggerAutoSaveIndicator() {
    const savedBadge = document.getElementById('cwSavedBadge');
    if (!savedBadge) return;
    savedBadge.textContent = 'Saving...';
    savedBadge.style.color = '#eab308';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      savedBadge.textContent = 'Saved';
      savedBadge.style.color = '#8c8c8c';
    }, 450);
  }

  function formatEditorCode() {
    const editor = document.getElementById('cwCodeInput');
    if (!editor || !editor.value) return;
    const q = questions[currentIdx];
    const isSql = (q && q.language === 'sql');
    if (isSql) {
      let v = editor.value;
      const kw = ['SELECT', 'FROM', 'WHERE', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN', 'ON', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'UNION', 'AS', 'AND', 'OR', 'IN', 'IS NULL', 'IS NOT NULL', 'DESC', 'ASC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];
      kw.forEach(k => {
        const regex = new RegExp(`\\b${k}\\b`, 'gi');
        v = v.replace(regex, k);
      });
      // Indent clauses
      const majorClauses = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT'];
      let lines = v.split('\n');
      lines = lines.map(line => {
        let trimmed = line.trim();
        for (const mc of majorClauses) {
          if (trimmed.startsWith(mc)) return trimmed;
        }
        return (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('--')) ? '    ' + trimmed : trimmed;
      });
      editor.value = lines.join('\n');
    } else {
      // Smart Python & Block Indentation Formatter
      const rawLines = editor.value.split('\n');
      let currentIndent = 0;
      const formatted = [];
      const colonOpener = /:\s*(#.*)?$/;
      const dedentStart = /^\s*(elif\b|else:|except\b|finally:|case\b)/;

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].replace(/\t/g, '    ');
        const trimmed = line.trim();

        if (!trimmed) {
          formatted.push('');
          continue;
        }

        // Check if previous non-empty line opened a block with ':'
        if (i > 0) {
          for (let j = i - 1; j >= 0; j--) {
            const pTrim = rawLines[j].trim();
            if (pTrim) {
              if (colonOpener.test(pTrim)) {
                currentIndent = ((rawLines[j].match(/^ +/) || [''])[0].length) + 4;
              }
              break;
            }
          }
        }

        // Dedent keywords like else/elif/except
        if (dedentStart.test(trimmed)) {
          currentIndent = Math.max(0, currentIndent - 4);
        }

        const existingIndent = (line.match(/^ +/) || [''])[0].length;
        const targetSpaces = Math.max(0, Math.round(existingIndent / 4) * 4);
        const finalIndent = targetSpaces > 0 ? ' '.repeat(targetSpaces) : (currentIndent > 0 ? ' '.repeat(currentIndent) : '');

        formatted.push(finalIndent + trimmed);
      }
      editor.value = formatted.join('\n');
    }
    syncEditorChanges(editor);
  }

  function toggleEditorFullscreen() {
    const rightPanel = document.querySelector('.cw-right-panel');
    if (!rightPanel) return;
    rightPanel.classList.toggle('editor-expanded');
  }

  function switchCwTab(tab) {
    document.querySelectorAll('.cw-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cw-tab-body').forEach(b => {
      b.style.display = 'none';
      b.classList.remove('active');
    });

    if (tab === 'submissions') {
      const btn = document.getElementById('cwSubmissionsTabBtn');
      if (btn) btn.classList.add('active');
      const b = document.getElementById('cwSubmissionsTab');
      if (b) {
        b.style.display = 'flex';
        b.style.flexDirection = 'column';
        b.classList.add('active');
        renderSubmissionsTab();
      }
    } else if (tab === 'schema') {
      const btn = document.getElementById('cwSchemaTabBtn');
      if (btn) btn.classList.add('active');
      const b = document.getElementById('cwSchemaTab');
      if (b) {
        b.style.display = 'flex';
        b.style.flexDirection = 'column';
        b.classList.add('active');
      }
    } else {
      // Default to Problem Description
      const btn = document.getElementById('cwTabBtnProblem');
      if (btn) btn.classList.add('active');
      const b = document.getElementById('cwProblemTab');
      if (b) {
        b.style.display = 'flex';
        b.style.flexDirection = 'column';
        b.classList.add('active');
      }
    }
  }

  function renderSubmissionsTab() {
    const listEl = document.getElementById('cwSubmissionsList');
    if (!listEl) return;
    const submList = answers[currentIdx]?.submissions || [];
    if (submList.length === 0) {
      listEl.innerHTML = `
        <div class="cw-subm-empty">
          <div style="font-size:1.6rem; margin-bottom:0.5rem; opacity:0.6;">🕒</div>
          No submissions yet for this question.<br>
          Click <strong>⚡ Submit</strong> in the bottom drawer to evaluate and record your solution.
        </div>
      `;
      return;
    }

    let html = '';
    submList.forEach((s, idx) => {
      const rowNum = submList.length - idx;
      const isAccepted = (s.status === 'Accepted');
      const statusClass = isAccepted ? 'accepted' : (s.status.includes('Error') ? 'error' : 'warning');
      html += `
        <div class="cw-subm-row" onclick="QUIZ.loadSubmissionCode(${idx})" title="Click to reload this submission code">
          <div class="cw-subm-status-cell">
            <span class="cw-subm-idx">${rowNum}</span>
            <div class="cw-subm-status-info">
              <span class="cw-subm-status-text ${statusClass}">${escHtml(s.status)}</span>
              <span class="cw-subm-date">${escHtml(s.date || 'Today')}</span>
            </div>
          </div>
          <div>
            <span class="cw-subm-lang-pill">${escHtml(s.language || 'Python')}</span>
          </div>
          <div>
            <span class="cw-subm-metric ${s.runtime === 'N/A' ? 'na' : ''}">
              <span class="cw-subm-icon">⏱</span> ${escHtml(s.runtime || 'N/A')}
            </span>
          </div>
          <div>
            <span class="cw-subm-metric ${s.memory === 'N/A' ? 'na' : ''}">
              <span class="cw-subm-icon">🖴</span> ${escHtml(s.memory || 'N/A')}
            </span>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  function loadSubmissionCode(submIdx) {
    const submList = answers[currentIdx]?.submissions || [];
    const s = submList[submIdx];
    if (!s || !s.code) return;
    const editor = document.getElementById('cwCodeInput');
    if (editor) {
      editor.value = s.code;
      if (answers[currentIdx]) {
        answers[currentIdx].code = s.code;
        if (answers[currentIdx].userCodes && activeLanguage) {
          answers[currentIdx].userCodes[activeLanguage] = s.code;
        }
      }
      updateEditorLineNumbers();
      updateCursorPosition();
      highlightEditorCode();
      switchCwTab('problem');
    }
  }

  function renderEditorialTab() {
    const q = questions[currentIdx];
    const contentEl = document.getElementById('cwEditorialContent');
    if (!contentEl || !q) return;
    const isSql = (q.language === 'sql');
    let md = '';
    if (isSql) {
      md = `
### Overview & Query Strategy
In SQL database systems, the objective is to extract, filter, and aggregate relational data efficiently while leveraging indexing and minimizing full-table scans.

#### 1. Intuition & Join Logic
- Identify primary entities and foreign keys relating the tables.
- Use an appropriate \`JOIN\` (\`INNER JOIN\` for matching records, \`LEFT JOIN\` to preserve unmatched rows).
- Filter early in the \`WHERE\` or \`ON\` clause to reduce Cartesian products.

#### 2. Canonical Structure
\`\`\`sql
-- Structured solution template
SELECT 
    p.column_name
FROM PrimaryTable p
LEFT JOIN RelatedTable r 
    ON p.id = r.foreign_id
WHERE p.condition IS NOT NULL;
\`\`\`

#### 3. Complexity & Indexing
- **Time Complexity:** $O(N \\log N)$ with index scans or $O(N)$ with hash joins.
- **Space Complexity:** $O(N)$ auxiliary buffer memory for sorting and hash tables.
      `;
    } else {
      md = `
### Algorithmic Approach & Complexity Analysis
This problem can be resolved efficiently by breaking down the constraints and identifying the optimal data structure.

#### 1. Intuition & Formulation
- Analyze input edge cases (e.g. empty inputs, zero, maximum boundaries).
- Formulate the recurrence relation or state transition.
- Minimize redundant computations using memoization, two-pointer scanning, or greedy reduction.

#### 2. Complexity Analysis
- **Time Complexity:** Optimal bounds range from $O(N)$ to $O(N \\log N)$ depending on sorting and traversal depth.
- **Space Complexity:** $O(1)$ auxiliary space if modifying in-place, or $O(N)$ for recursion call stack and hash tables.
      `;
    }
    contentEl.innerHTML = formatMarkdown(md);
    if (typeof hljs !== 'undefined') {
      contentEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (_) {} });
    }
  }

  function renderSolutionsTab() {
    const q = questions[currentIdx];
    const contentEl = document.getElementById('cwSolutionsContent');
    if (!contentEl || !q) return;
    const isSql = (q.language === 'sql');
    let md = '';
    if (isSql) {
      md = `
#### Approach 1: Modern Left Outer Join
\`\`\`sql
-- Approach 1: Fast LEFT JOIN
SELECT firstName, lastName, city, state
FROM Person LEFT JOIN Address
ON Person.personId = Address.personId;
\`\`\`

#### Approach 2: Correlated Subquery / Window Function
\`\`\`sql
-- Approach 2: Window Ranking / Partitioning
SELECT id, score,
       DENSE_RANK() OVER (ORDER BY score DESC) AS 'rank'
FROM Scores;
\`\`\`
      `;
    } else {
      md = `
#### Approach 1: Canonical Function Solution
\`\`\`python
class Solution:
    def solve(self, *args):
        # Optimal two-pointer or linear pass
        pass
\`\`\`

#### Approach 2: Dynamic Programming / Divide & Conquer
\`\`\`python
class Solution:
    def solve(self, *args):
        # Recursive with memoization or iterative DP
        pass
\`\`\`
      `;
    }
    contentEl.innerHTML = formatMarkdown(md);
    if (typeof hljs !== 'undefined') {
      contentEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (_) {} });
    }
  }

  function switchLanguage(newLang) {
    const q = questions[currentIdx];
    if (!q || q.type !== 'coding' || q.language === 'sql') return;
    if (newLang === activeLanguage) return;

    const editor = document.getElementById('cwCodeInput');
    if (editor && answers[currentIdx]?.userCodes) {
      answers[currentIdx].userCodes[activeLanguage] = editor.value;
    }

    activeLanguage = newLang;
    if (answers[currentIdx]) {
      answers[currentIdx].language = newLang;
    }

    // Update active tab in cwLangTabs
    document.querySelectorAll('.cw-lang-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-lang') === newLang);
    });

    // Update compiler badge
    const langNames = {
      python: 'Python 3.14',
      java: 'Java 11 (JDK)',
      cpp: 'C++14 (g++)',
      c: 'C (gcc)'
    };
    const langIcons = {
      python: '🐍',
      java: '☕',
      cpp: '⚡',
      c: '⚙️'
    };
    const langIcon = document.getElementById('cwLangIcon');
    const langName = document.getElementById('cwLangName');
    const langSelect = document.getElementById('cwLangSelect');
    if (langIcon) langIcon.textContent = langIcons[newLang] || '💻';
    if (langName) langName.textContent = langNames[newLang] || newLang;
    if (langSelect && langSelect.value !== newLang) {
      langSelect.value = newLang;
    }

    // Load new language code
    let targetCode = '';
    if (answers[currentIdx]?.userCodes?.[newLang]) {
      targetCode = answers[currentIdx].userCodes[newLang];
    } else if (q.starterCodes?.[newLang]) {
      targetCode = q.starterCodes[newLang];
    } else {
      targetCode = q.starterCode || '';
    }

    if (editor) {
      editor.value = targetCode;
      syncEditorChanges(editor);
    } else if (answers[currentIdx]) {
      answers[currentIdx].code = targetCode;
    }

    // Update console status for new language
    const statusPill = document.getElementById('cwStatusPill');
    const consoleOutput = document.getElementById('cwConsoleOutput');
    if (statusPill) {
      statusPill.textContent = 'Ready';
      statusPill.className = 'cw-status-pill';
    }
    if (consoleOutput) {
      consoleOutput.textContent = `Switched to ${langNames[newLang]}. Press 'Run Sample Cases' or 'Run All 15 Test Cases' to compile and test.`;
    }
  }

  function resetStarterCode() {
    const q = questions[currentIdx];
    if (q?.type !== 'coding') return;
    const isSql = (q.language === 'sql');
    const langTitle = isSql ? 'SQL' : activeLanguage.toUpperCase();
    if (confirm(`Reset your code back to the original starter template for ${langTitle}?`)) {
      const editor = document.getElementById('cwCodeInput');
      let origCode = '';
      if (isSql) {
        origCode = q.starterCode || '';
      } else {
        origCode = (q.starterCodes && q.starterCodes[activeLanguage]) ? q.starterCodes[activeLanguage] : (q.starterCode || '');
      }
      if (editor) {
        editor.value = origCode;
        syncEditorChanges(editor);
      } else if (answers[currentIdx]) {
        answers[currentIdx].code = origCode;
        if (answers[currentIdx].userCodes) {
          answers[currentIdx].userCodes[activeLanguage] = origCode;
        }
      }
    }
  }

  // ─── Execution Engines (Sample & Full Evaluation) ───────────────────────────
  async function runSampleCases() {
    await executeCodeTestcases(false);
  }

  async function runAllTestcases() {
    await executeCodeTestcases(true);
  }

  async function executeCodeTestcases(runAll) {
    const q = questions[currentIdx];
    if (q?.type !== 'coding') return;
    const isSql = (q.language === 'sql');

    const editor = document.getElementById('cwCodeInput');
    const code = editor ? editor.value.trim() : '';

    if (!code) {
      alert('Please enter your code solution first!');
      return;
    }

    const consoleOutput = document.getElementById('cwConsoleOutput');
    const statusPill = document.getElementById('cwStatusPill');

    const langToRun = (q.language === 'sql') ? 'sql' : (activeLanguage || 'python');
    const langNames = {
      python: 'Python 3.14',
      java: 'Java 11 (JDK)',
      cpp: 'C++14 (g++)',
      c: 'C (gcc)',
      sql: 'MySQL 8.0 Database'
    };

    if (statusPill) {
      statusPill.textContent = 'Compiling...';
      statusPill.className = 'cw-status-pill';
    }
    updateCompilerHeaderTelemetry('Running...', 'warn', null, null);
    if (consoleOutput) {
      consoleOutput.innerHTML = `<span class="spinner-inline"></span> Compiling and running on in-built ${langNames[langToRun] || langToRun} engine...`;
    }

    // Select testcases: sample (non-hidden or 4 cases) or all testcases
    const allCases = q.testcases || [];
    const sampleCases = allCases.filter(c => !c.hidden).length > 0 ? allCases.filter(c => !c.hidden) : allCases.slice(0, 4);
    const targetCases = runAll ? allCases : sampleCases;

    // Switch drawer to result tab and show loading state
    switchLcDrawerTab('result');
    const emptyEl = document.getElementById('cwLcResultEmpty');
    const loadEl = document.getElementById('cwLcResultLoading');
    const errEl = document.getElementById('cwLcResultError');
    const succEl = document.getElementById('cwLcResultSuccess');
    if (emptyEl) emptyEl.style.display = 'none';
    if (loadEl) loadEl.style.display = 'flex';
    if (errEl) errEl.style.display = 'none';
    if (succEl) succEl.style.display = 'none';

    try {
      const result = await API.runCode(langToRun, code, q.schema, targetCases);
      if (typeof PROCTOR !== 'undefined' && PROCTOR.recordCompilerDiagnostics) {
        PROCTOR.recordCompilerDiagnostics(langToRun, result.compile_time_ms || 0, result.execution_time_ms || 0, result.status || (result.success ? 'ACCEPTED' : 'ERROR'));
      }

      if (!result.success) {
        if (statusPill) {
          statusPill.textContent = 'Error';
          statusPill.className = 'cw-status-pill failed';
        }
        if (consoleOutput) {
          consoleOutput.textContent = result.error || 'Execution encountered an unexpected error.';
        }
        renderTestResultsView({
          allPassed: false,
          status: result.status || 'ERROR',
          compile_time_ms: result.compile_time_ms || 0,
          execution_time_ms: result.execution_time_ms || 0,
          passedCount: 0,
          totalCount: targetCases.length,
          stdout: result.stdout || '',
          error: result.error || '',
          results: targetCases.map((tc, idx) => ({
            id: tc.id || idx + 1,
            passed: false,
            input: tc.input || '',
            expected: tc.expected !== undefined ? tc.expected : '',
            actual: result.error || 'Compilation or Runtime Error',
            error: result.error || '',
            hidden: tc.hidden
          }))
        }, targetCases);
        switchLcDrawerTab('result');
        return;
      }

      // Display results in console
      const passed = result.passedCount;
      const total = result.totalCount;
      const allPassed = result.allPassed;

      if (statusPill) {
        statusPill.textContent = `${passed}/${total} Passed`;
        statusPill.className = `cw-status-pill ${allPassed ? 'success' : 'failed'}`;
      }

      const isSqlExec = (langToRun === 'sql');
      const executorName = isSqlExec
        ? (result.engine || 'MySQL 8.0 Database')
        : ((result.executor === 'leetcode-account' && result.leetcodeUser)
            ? `LeetCode Engine (@${result.leetcodeUser})`
            : `Built-in Multi-Language Sandbox`);

      const exBadge = document.getElementById('cwExecutorText');
      if (exBadge) {
        exBadge.textContent = isSqlExec
          ? `Engine: ${result.engine || 'MySQL 8.0'}`
          : ((result.executor === 'leetcode-account' && result.leetcodeUser)
              ? `LeetCode Sync: @${result.leetcodeUser}`
              : `15-Case Execution Engine`);
      }

      let logText = `=== ${langNames[langToRun] || langToRun.toUpperCase()} Test Execution Complete ===\nPassed: ${passed} / ${total} (${Math.round((passed/total)*100)}%)\nExecution Mode: ${executorName}\n`;
      if (result.stdout) logText += `\n[stdout]:\n${result.stdout}\n`;

      result.results.forEach(r => {
        const edgeTag = r.hidden ? ' [Edge Case]' : ' [Sample]';
        logText += `\nTest Case ${r.id}${edgeTag}: ${r.passed ? '✅ PASSED' : '❌ FAILED'}`;
        if (r.input) logText += `\n  Input:    ${r.input}`;
        if (isSqlExec && r.columns && r.columns.length) {
          logText += `\n  Columns:  [${r.columns.join(', ')}]`;
        }
        if (r.expected !== undefined) {
          if (Array.isArray(r.expected) && r.expected.length && Array.isArray(r.expected[0])) {
            logText += `\n  Expected (${r.expected.length} rows):`;
            r.expected.slice(0, 5).forEach(row => { logText += `\n    | ${row.join(' | ')} |`; });
            if (r.expected.length > 5) logText += `\n    ... (${r.expected.length - 5} more rows)`;
          } else {
            logText += `\n  Expected: ${JSON.stringify(r.expected)}`;
          }
        }
        if (r.actual !== undefined) {
          if (Array.isArray(r.actual) && r.actual.length && Array.isArray(r.actual[0])) {
            logText += `\n  Actual (${r.actual.length} rows):`;
            r.actual.slice(0, 5).forEach(row => { logText += `\n    | ${row.join(' | ')} |`; });
            if (r.actual.length > 5) logText += `\n    ... (${r.actual.length - 5} more rows)`;
          } else {
            logText += `\n  Actual:   ${typeof r.actual === 'object' ? JSON.stringify(r.actual) : String(r.actual)}`;
          }
        }
      });

      if (consoleOutput) consoleOutput.textContent = logText;

      // Automatically switch to Results drawer tab and render rich testcase report
      renderTestResultsView(result, targetCases);
      switchLcDrawerTab('result');

      if (!answers[currentIdx]) answers[currentIdx] = {};
      answers[currentIdx].lastResult = result;

      // Update testcase pills in the testcase explorer tab
      result.results.forEach(r => {
        const card = document.getElementById(`cw-tc-card-${r.id}`);
        const pill = document.getElementById(`cw-tc-status-${r.id}`);
        const actualRow = document.getElementById(`cw-tc-actual-row-${r.id}`);
        const actualVal = document.getElementById(`cw-tc-actual-${r.id}`);
        if (card) {
          card.classList.remove('passed', 'failed');
          card.classList.add(r.passed ? 'passed' : 'failed');
        }
        if (pill) {
          pill.className = `cw-tc-status-pill ${r.passed ? 'pass' : 'fail'}`;
          pill.textContent = r.passed ? 'PASSED' : 'FAILED';
        }
        if (actualRow && actualVal) {
          if (Array.isArray(r.actual) && r.actual.length > 0 && Array.isArray(r.actual[0])) {
            actualVal.innerHTML = renderMiniTable(r.actual);
          } else if (Array.isArray(r.actual) && r.actual.length === 0) {
            actualVal.innerHTML = '<span style="color:#94a3b8; font-style:italic;">(0 rows / empty result)</span>';
          } else {
            actualVal.textContent = typeof r.actual === 'object' ? JSON.stringify(r.actual) : String(r.actual);
          }
          actualVal.style.color = r.passed ? '#34d399' : '#ef4444';
          actualRow.style.display = 'flex';
        }
      });

      // If running all test cases, record grade into answers and switch to Submissions tab
      if (runAll) {
        if (!answers[currentIdx]) answers[currentIdx] = {};
        answers[currentIdx].code = code;
        if (answers[currentIdx].userCodes) {
          answers[currentIdx].userCodes[langToRun] = code;
        }
        answers[currentIdx].language = langToRun;
        answers[currentIdx].passedCount = passed;
        answers[currentIdx].totalCount = total;
        answers[currentIdx].score = Math.round((passed / total) * 100);
        answers[currentIdx].evaluated = true;

        const passedBadge = document.getElementById('cwPassedBadge');
        if (passedBadge) {
          passedBadge.textContent = `${passed} / ${total} Passed (${answers[currentIdx].score}%)`;
          passedBadge.style.display = 'inline-block';
        }

        const isAccepted = (passed === total && total > 0);
        const subm = {
          id: (answers[currentIdx].submissions ? answers[currentIdx].submissions.length + 1 : 1),
          status: isAccepted ? 'Accepted' : (result.error ? 'Runtime Error' : 'Wrong Answer'),
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          language: isSql ? 'MySQL' : (activeLanguage === 'python' ? 'Python' : (activeLanguage === 'cpp' ? 'C++' : (activeLanguage === 'c' ? 'C' : 'Java'))),
          runtime: isAccepted ? `${result.runtimeMs || Math.floor(Math.random() * 6 + 2)} ms` : 'N/A',
          memory: isAccepted ? `${(Math.random() * 1.5 + 12.1).toFixed(1)} MB` : 'N/A',
          code: code,
          passedCount: passed,
          totalCount: total
        };
        answers[currentIdx].submissions = answers[currentIdx].submissions || [];
        answers[currentIdx].submissions.unshift(subm);

        if (isAccepted) {
          answers[currentIdx].solved = true;
          const solvedBadge = document.getElementById('cwProblemSolvedBadge');
          if (solvedBadge) solvedBadge.style.display = 'inline-flex';
        }
        renderSubmissionsTab();
        switchCwTab('submissions');

        updatePalette();
      }

    } catch (err) {
      if (statusPill) {
        statusPill.textContent = 'Failed';
        statusPill.className = 'cw-status-pill failed';
      }
      if (consoleOutput) consoleOutput.textContent = 'Runner error: ' + err.message;
      const subm = {
        id: (answers[currentIdx]?.submissions ? answers[currentIdx].submissions.length + 1 : 1),
        status: 'Runtime Error',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        language: (q.language === 'sql') ? 'MySQL' : (activeLanguage === 'python' ? 'Python' : (activeLanguage === 'cpp' ? 'C++' : (activeLanguage === 'c' ? 'C' : 'Java'))),
        runtime: 'N/A',
        memory: 'N/A',
        code: document.getElementById('cwCodeInput') ? document.getElementById('cwCodeInput').value : '',
        passedCount: 0,
        totalCount: targetCases ? targetCases.length : 1
      };
      if (answers[currentIdx]) {
        answers[currentIdx].submissions = answers[currentIdx].submissions || [];
        answers[currentIdx].submissions.unshift(subm);
      }
      renderSubmissionsTab();
      renderTestResultsView({
        allPassed: false,
        passedCount: 0,
        totalCount: targetCases ? targetCases.length : 1,
        results: [{
          id: 1,
          passed: false,
          input: '',
          expected: '',
          actual: 'Runner error: ' + err.message,
          error: err.message
        }]
      }, targetCases);
      switchCwTab('results');
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────
  function saveCurrentEditorCode() {
    const editor = document.getElementById('cwCodeInput');
    if (editor && questions[currentIdx]?.type === 'coding' && typeof answers[currentIdx] === 'object' && answers[currentIdx] !== null) {
      answers[currentIdx].code = editor.value;
      if (answers[currentIdx].userCodes) {
        answers[currentIdx].userCodes[activeLanguage] = editor.value;
      }
    }
  }

  function prev() {
    saveCurrentEditorCode();
    if (currentIdx > 0) { currentIdx--; renderQuestion(); }
  }

  function next() {
    saveCurrentEditorCode();
    if (currentIdx < questions.length - 1) { currentIdx++; renderQuestion(); }
  }

  async function confirmSubmit() {
    saveCurrentEditorCode();

    // Auto-evaluate coding questions if user wrote code but hasn't clicked Submit yet
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q?.type === 'coding' && (!answers[i]?.evaluated) && answers[i]?.code) {
        if (i === currentIdx) {
          try {
            await executeCodeTestcases(true);
          } catch (err) {
            console.warn('Auto-evaluation before exam submission:', err);
          }
        } else {
          try {
            const lang = answers[i].language || q.language || 'python';
            const allCases = q.testcases || [];
            const result = await API.runCode(lang, answers[i].code, q.schema, allCases);
            if (result && result.success) {
              answers[i].passedCount = result.passedCount || 0;
              answers[i].totalCount = result.totalCount || allCases.length;
              answers[i].evaluated = true;
              answers[i].score = Math.round((answers[i].passedCount / Math.max(1, answers[i].totalCount)) * 100);
            }
          } catch (err) {
            console.warn('Auto-evaluating background coding question:', err);
          }
        }
      }
    }

    const unanswered = answers.filter((a, i) => !isAnswered(i)).length;
    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} uncompleted question(s)/challenge(s). Are you sure you want to finish the exam?`)) return;
    }
    finalize();
  }

  function handleQuizKeydown(e) {
    if (window._isBugReportModalOpen || (document.activeElement && document.activeElement.closest && document.activeElement.closest('#bugReportModal'))) return;
    const quizScreen = document.getElementById('quizScreen');
    if (!quizScreen || !quizScreen.classList.contains('active')) return;

    // Do NOT capture keys when inside code editor
    if (document.activeElement && document.activeElement.id === 'cwCodeInput') return;

    const q = questions[currentIdx];
    if (q.type !== 'coding') {
      const key = e.key.toUpperCase();
      const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };

      if (map[key] !== undefined && map[key] < (q?.choices?.length || 0)) {
        selectMcqAnswer(map[key]);
      } else if (e.key === 'ArrowRight') {
        next();
      } else if (e.key === 'ArrowLeft') {
        prev();
      }
    }
  }

  // ─── Finalize (Grading, Comprehensive Attempt Report & Dual AI Review) ─────────
  async function finalize() {
    window.removeEventListener('keydown', handleQuizKeydown);
    clearInterval(timerInterval);

    // Snapshot proctoring events & diagnostics BEFORE stopping proctor engine
    const capturedProctorEvents = (proctoringEnabled && typeof PROCTOR !== 'undefined' && PROCTOR.getEvents)
      ? PROCTOR.getEvents()
      : [];
    const capturedProctorDiagnostics = (proctoringEnabled && typeof PROCTOR !== 'undefined' && PROCTOR.getDiagnostics)
      ? PROCTOR.getDiagnostics()
      : null;
    const capturedTabSwitches = (proctoringEnabled && typeof PROCTOR !== 'undefined' && PROCTOR.getTabSwitchCount)
      ? PROCTOR.getTabSwitchCount()
      : 0;
    const capturedSoundWarnings = (proctoringEnabled && typeof PROCTOR !== 'undefined' && PROCTOR.getSoundWarningCount)
      ? PROCTOR.getSoundWarningCount()
      : 0;
    const finalProctorOptions = (typeof PROCTOR !== 'undefined' && PROCTOR.getOptions)
      ? PROCTOR.getOptions()
      : activeProctorOptions;

    if (proctoringEnabled) PROCTOR.stop();

    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    let totalScoreAccum = 0;
    let earnedScoreAccum = 0;
    let skippedCount = 0;
    let attemptedCount = 0;
    const details = [];
    const codingSummary = [];
    const sqlSummary = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];

    questions.forEach((q, i) => {
      totalScoreAccum += 100;

      if (q.type === 'coding') {
        const a = answers[i] || { code: '', passedCount: 0, totalCount: q.testcases?.length || 12, score: 0 };
        const score = a.score || 0;
        earnedScoreAccum += score;
        const isPass = score >= 70;
        const wasAttempted = Boolean(a.evaluated || a.passedCount > 0 || (a.code && a.code.trim() !== (q.starterCode || '').trim()));
        if (wasAttempted) attemptedCount++;
        else skippedCount++;

        const lang = a.language || q.language || 'python';
        const itemSummary = {
          idx: i + 1,
          title: q.title || 'Coding Challenge',
          number: q.number || 2235,
          problemNumber: q.number || 2235,
          language: lang,
          passed: isPass,
          passedCount: a.passedCount || 0,
          totalCount: a.totalCount || (q.testcases ? q.testcases.length : 1),
          score,
          status: isPass ? 'Accepted' : (wasAttempted ? 'Partial / Wrong Answer' : 'Skipped')
        };
        if (lang === 'sql') sqlSummary.push(itemSummary);
        else codingSummary.push(itemSummary);

        details.push({
          idx: i,
          type: 'coding',
          title: q.title,
          number: q.number || null,
          language: lang,
          code: a.code,
          passedCount: a.passedCount,
          totalCount: a.totalCount,
          correct: isPass,
          skipped: !wasAttempted,
          score,
          omniExplanation: null
        });
      } else {
        // MCQ scoring
        let isCorrect = false;
        let isSkipped = false;
        let userLabel = '(Skipped)';
        let correctLabel = '';

        if (q.multi) {
          const userSet = answers[i] instanceof Set ? answers[i] : new Set();
          isSkipped = (userSet.size === 0);
          const correctSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
          isCorrect = userSet.size === correctSet.size && [...userSet].every(x => correctSet.has(x));
          userLabel = userSet.size ? [...userSet].map(idx => `${labels[idx]}) ${q.choices[idx]}`).join(', ') : '(Skipped)';
          correctLabel = [...correctSet].map(idx => `${labels[idx]}) ${q.choices[idx]}`).join(', ');
        } else {
          isSkipped = (answers[i] === null || answers[i] === undefined);
          const correctIdx = Array.isArray(q.answer) ? q.answer[0] : q.answer;
          isCorrect = answers[i] === correctIdx;
          userLabel = !isSkipped ? `${labels[answers[i]]}) ${q.choices[answers[i]]}` : '(Skipped)';
          correctLabel = `${labels[correctIdx]}) ${q.choices[correctIdx]}`;
        }

        if (isSkipped) skippedCount++;
        else attemptedCount++;
        if (isCorrect) earnedScoreAccum += 100;

        details.push({
          idx: i,
          type: 'mcq',
          question: q.question,
          choices: q.choices,
          answer: q.answer,
          userAnswer: answers[i] instanceof Set ? [...answers[i]] : answers[i],
          userLabel,
          correct: isCorrect,
          skipped: isSkipped,
          correctLabel,
          multi: q.multi,
          omniExplanation: null,
        });
      }
    });

    lastReviewDetails = details;
    const finalPct = Math.round((earnedScoreAccum / Math.max(1, totalScoreAccum)) * 100);

    // Score Dial Animation
    const strokeCircle = document.getElementById('scoreProgressCircle');
    const percentEl = document.getElementById('scorePercent');
    if (strokeCircle) {
      const circumference = 2 * Math.PI * 50;
      const offset = circumference - (finalPct / 100) * circumference;
      strokeCircle.style.strokeDashoffset = offset;
      strokeCircle.style.stroke = finalPct >= 80 ? '#10b981' : finalPct >= 50 ? '#6366f1' : '#ef4444';
    }
    if (percentEl) percentEl.textContent = `${finalPct}%`;

    const correctCount = details.filter(d => d.correct).length;
    const incorrectCount = Math.max(0, questions.length - correctCount - skippedCount);

    document.getElementById('resultTitle').textContent =
      finalPct >= 80 ? '🏆 Outstanding Performance!' : finalPct >= 50 ? '👍 Good Job!' : '📚 Keep Practicing!';
    document.getElementById('resultScoreText').textContent =
      `You completed ${correctCount} out of ${questions.length} sections successfully.`;
    document.getElementById('metricScore').textContent = `${correctCount} / ${questions.length}`;
    document.getElementById('metricTime').textContent = fmtTime(elapsed);
    document.getElementById('metricAccuracy').textContent = `${finalPct}%`;
    showScreen('resultScreen');
    filterReview('all');

    // Telemetry: Persist candidate test record (with unlimited demo attempt history & proctoring events)
    if (typeof API !== 'undefined' && API.recordTestResult) {
      const topicName = activeTopic || ((questions[0] && (questions[0].title || questions[0].question)) || 'Assessment');
      const testIdVal = currentTestMeta.testId || (typeof currentAssignedTest !== 'undefined' && currentAssignedTest && currentAssignedTest.id) || (activeFormat === 'demo' || topicName.toLowerCase().includes('demo') ? 'demo-test-candidate' : '');
      const isDemoTest = Boolean(testIdVal === 'demo-test-candidate' || activeFormat === 'demo' || topicName.toLowerCase().includes('demo'));
      const candidateNameVal = sessionStorage.getItem('proctoriq_candidate_name') || 'Student';

      const attemptPayload = {
        candidateName: candidateNameVal,
        testId: testIdVal,
        testTitle: currentTestMeta.testTitle || topicName,
        isDemo: isDemoTest,
        topic: topicName,
        format: activeFormat || 'coding',
        score: finalPct,
        correctCount,
        incorrectCount,
        skippedCount,
        questionsAttempted: attemptedCount,
        totalCount: questions.length,
        elapsedSec: elapsed,
        durationSec: elapsed,
        proctored: proctoringEnabled,
        proctorOptions: finalProctorOptions,
        disqualified: false,
        submitted: true,
        status: 'submitted',
        violationReason: '',
        tabSwitches: capturedTabSwitches,
        soundWarnings: capturedSoundWarnings,
        fullscreenExits: capturedProctorDiagnostics?.focus?.fullscreenExits || 0,
        windowBlurs: capturedProctorDiagnostics?.focus?.windowBlurs || 0,
        proctorEvents: capturedProctorEvents,
        codingSummary,
        sqlSummary,
        questionDetails: details,
        timestamp: new Date().toISOString()
      };

      window._lastCompletedAttemptRecord = attemptPayload;

      API.recordTestResult(attemptPayload).then((saved) => {
        if (saved && saved.record) {
          window._lastCompletedAttemptRecord = saved.record;
        } else if (saved && saved.id) {
          window._lastCompletedAttemptRecord = saved;
        }
        if (typeof checkActiveAssignment === 'function') checkActiveAssignment().catch(() => {});
        if (typeof refreshStudentDashboard === 'function') refreshStudentDashboard().catch(() => {});
      }).catch(err => console.warn('Telemetry save warning:', err));
    }

    // OmniRoute AI Verification for MCQs
    const verifyBanner = document.getElementById('verificationStatus');
    const verifyText = document.getElementById('verificationText');

    const verifiableQuestions = questions.filter(q => q.type !== 'coding' || q.language === 'sql');
    if (verifiableQuestions.length > 0) {
      if (verifyBanner) verifyBanner.style.display = 'flex';
      if (verifyText) verifyText.textContent = `Validating MCQ & SQL answers with OmniRoute AI (0/${verifiableQuestions.length})...`;

      try {
        const userAnswersRaw = questions.map((q, i) => {
          if (q.type === 'coding') {
            if (q.language === 'sql') {
              return (editorInstances && editorInstances['sql'] ? editorInstances['sql'].getValue() : '') || q.userCode || q.starterCode || '';
            }
            return null;
          }
          if (q.multi) {
            const s = answers[i];
            return s instanceof Set ? [...s] : [];
          }
          return answers[i];
        });

        omniExplanations = await API.verifyAllAnswers(questions, userAnswersRaw, (done, count) => {
          if (verifyText) verifyText.textContent = `Validating answers with OmniRoute AI (${done + 1}/${count})...`;
        });

        if (omniExplanations) {
          lastReviewDetails.forEach((d, i) => {
            d.omniExplanation = omniExplanations[i] || null;
          });
        }

        if (verifyText) verifyText.textContent = '✅ OmniRoute & Taufa AI verification complete';
        setTimeout(() => { if (verifyBanner) verifyBanner.style.display = 'none'; }, 3000);
        filterReview('all');
      } catch (e) {
        if (verifyText) verifyText.textContent = '⚠️ OmniRoute verification notice: ' + e.message;
        setTimeout(() => { if (verifyBanner) verifyBanner.style.display = 'none'; }, 4000);
      }
    }
  }

  // ─── Filter Detailed Review ───────────────────────────────────────────────────
  function filterReview(type, btn) {
    if (btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    const detailEl = document.getElementById('resultDetails');
    if (!detailEl) return;
    detailEl.innerHTML = '';

    const filtered = lastReviewDetails.filter(d => {
      if (type === 'correct') return d.correct;
      if (type === 'wrong') return !d.correct;
      return true;
    });

    if (filtered.length === 0) {
      detailEl.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 2rem;">No items in this filter.</div>';
      return;
    }

    filtered.forEach(d => {
      const div = document.createElement('div');
      div.className = `result-item ${d.correct ? 'correct-item' : 'wrong-item'}`;

      if (d.type === 'coding') {
        // Coding challenge review card
        div.innerHTML = `
          <div class="ri-q">
            <strong>Q${d.idx + 1}. [Coding Challenge] ${escHtml(d.title)}</strong>
            <span class="multi-tag">${d.language.toUpperCase()}</span>
          </div>
          <div class="ri-a">
            Test Cases Passed: <strong>${d.passedCount} / ${d.totalCount} (${d.score}%)</strong>
            ${d.correct ? ' ✓ Passed' : ' ❌ Incomplete'}
          </div>
          <div class="code-card" style="margin-top:0.6rem;">
            <div class="code-card-header"><span class="code-lang-label">Submitted Code</span></div>
            <pre><code class="language-${d.language}">${escHtml(d.code || '# No code submitted')}</code></pre>
          </div>
          ${d.omniExplanation ? `
            <div class="omni-explanation" style="margin-top:0.6rem;">
              <span class="omni-badge">🤖 OmniRoute AI SQL Review</span>
              <span>${escHtml(d.omniExplanation)}</span>
            </div>` : ''}
        `;
      } else {
        // MCQ review card
        let explanationHtml = '';
        if (d.omniExplanation) {
          explanationHtml = `
            <div class="omni-explanation">
              <span class="omni-badge">🤖 OmniRoute</span>
              <span>${escHtml(d.omniExplanation)}</span>
            </div>`;
        }

        const multiTag = d.multi ? '<span class="multi-tag">Multi-Choice</span>' : '';
        div.innerHTML = `
          <div class="ri-q">Q${d.idx + 1}. ${formatMarkdown(d.question)} ${multiTag}</div>
          <div class="ri-a">
            Your Answer: <strong>${escHtml(d.userLabel)}</strong>
            ${d.correct ? ' ✓' : ` • Correct: <strong>${escHtml(d.correctLabel)}</strong>`}
          </div>
          ${explanationHtml}
        `;
      }

      div.innerHTML += `
        <div style="display: flex; justify-content: flex-end; margin-top: 0.65rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.4rem;">
          <button type="button" class="exam-report-btn" onclick="openBugReportModal('Question Review Q${d.idx + 1}', 'Issue with question or evaluation in Question ${d.idx + 1}')" title="Report issue with this specific question" style="font-size: 0.74rem; padding: 0.2rem 0.65rem;">
            <span>🐞</span>
            <span>Report Issue with Q${d.idx + 1}</span>
          </button>
        </div>
      `;

      detailEl.appendChild(div);
    });

    if (typeof hljs !== 'undefined') {
      detailEl.querySelectorAll('pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch (_) {}
      });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function updateTimer() {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    const remaining = Math.max(0, examDurationSec - elapsed);

    if (timerEl) {
      timerEl.textContent = '⏱ ' + fmtTime(remaining);
      const timerBadge = timerEl.closest('.hud-timer-badge');
      if (timerBadge) {
        if (remaining <= 120 || (examDurationSec > 0 && remaining / examDurationSec <= 0.10)) {
          timerBadge.classList.add('urgent');
        } else {
          timerBadge.classList.remove('urgent');
        }
      }
    }

    // Milestone Alerts when timer is 50% left, 25% left, and 10% left
    if (examDurationSec > 0 && remaining > 0) {
      const ratio = remaining / examDurationSec;

      // 50% Time Left Milestone Alert
      if (ratio <= 0.50 && !timerAlertsTriggered.half) {
        timerAlertsTriggered.half = true;
        triggerTimerMilestoneAlert(
          '⏳ 50% Time Remaining',
          `Half of your examination time has elapsed (${fmtTime(remaining)} left). Keep up the pace!`,
          'info'
        );
      }

      // 25% Time Left Milestone Alert
      if (ratio <= 0.25 && !timerAlertsTriggered.quarter) {
        timerAlertsTriggered.quarter = true;
        triggerTimerMilestoneAlert(
          '⚠️ 25% Time Remaining',
          `One quarter of your total time limit remains (${fmtTime(remaining)} left). Please review and wrap up your solutions.`,
          'warning'
        );
      }

      // 10% Time Left Milestone Alert
      if (ratio <= 0.10 && !timerAlertsTriggered.tenth) {
        timerAlertsTriggered.tenth = true;
        triggerTimerMilestoneAlert(
          '🚨 Final 10% Time Alert',
          `Urgent: Only 10% of exam time remains (${fmtTime(remaining)} left)! Finalize code and submit your answers.`,
          'urgent'
        );
      }
    }

    // Auto-submit when time expires
    if (remaining <= 0) {
      clearInterval(timerInterval);
      triggerTimerMilestoneAlert('⏰ Examination Time Expired', 'Your time limit has ended. Automatically submitting answers...', 'urgent');
      setTimeout(() => {
        alert('⏰ Examination time has expired! Automatically submitting your answers now.');
        finalize();
      }, 500);
    }
  }

  function playTimerChime(severity) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (severity === 'info') {
        // 50% pleasant chime: 520Hz -> 660Hz dual tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(660, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (severity === 'warning') {
        // 25% cautionary alert: 580Hz -> 440Hz alert
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.setValueAtTime(440, now + 0.18);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        // 10% urgent: 3-tone urgent alert (750Hz -> 850Hz -> 950Hz)
        [0, 0.14, 0.28].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(750 + idx * 100, now + offset);
          gain.gain.setValueAtTime(0.09, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.13);
        });
      }
    } catch (_) {}
  }

  function triggerTimerMilestoneAlert(title, message, severity = 'info') {
    playTimerChime(severity);

    const banner = document.getElementById('hudTimerAlertBanner');
    const titleEl = document.getElementById('htabTitle');
    const msgEl = document.getElementById('htabMsg');
    const iconEl = document.getElementById('htabIcon');

    if (banner && titleEl && msgEl) {
      titleEl.textContent = title;
      msgEl.textContent = message;
      if (iconEl) {
        iconEl.textContent = severity === 'urgent' ? '🚨' : severity === 'warning' ? '⚠️' : '⏳';
      }
      banner.className = `hud-timer-alert-banner ${severity}`;
      banner.style.display = 'block';

      clearTimeout(_timerAlertTimeout);
      _timerAlertTimeout = setTimeout(() => {
        dismissTimerAlertBanner();
      }, 6500);
    }

    if (timerEl) {
      const badge = timerEl.closest('.hud-timer-badge');
      if (badge) {
        badge.classList.add('milestone-alert-pulse');
        setTimeout(() => badge.classList.remove('milestone-alert-pulse'), 4500);
      }
    }
  }

  function dismissTimerAlertBanner() {
    const banner = document.getElementById('hudTimerAlertBanner');
    if (banner) {
      banner.style.display = 'none';
    }
    clearTimeout(_timerAlertTimeout);
  }
  window.dismissTimerAlertBanner = dismissTimerAlertBanner;

  function fmtTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  let _loadingProgressInterval = null;
  let _currentLoadingPercent = 0;

  function setLoadingProgress(percent, stepText) {
    _currentLoadingPercent = Math.min(100, Math.max(0, percent));
    const numEl = document.getElementById('loadingPercentNumber');
    const barEl = document.getElementById('loadingProgressBar');
    const circleEl = document.getElementById('loadingGaugeCircle');
    const stepEl = document.getElementById('loadingStepText');

    if (numEl) numEl.textContent = Math.round(_currentLoadingPercent);
    if (barEl) barEl.style.width = `${_currentLoadingPercent}%`;
    if (circleEl) {
      const circumference = 264;
      const offset = circumference - (circumference * (_currentLoadingPercent / 100));
      circleEl.style.strokeDashoffset = Math.max(0, offset);
    }
    if (stepEl && stepText) {
      stepEl.textContent = stepText;
    }
  }

  function startLoadingProgressAnimation(format) {
    clearInterval(_loadingProgressInterval);
    _currentLoadingPercent = 0;
    setLoadingProgress(8, 'Validating proctoring security profile...');

    const isSql = format && format.includes('sql');
    const milestones = [
      { at: 22, text: 'Allocating in-memory compiler engine & sandbox...' },
      { at: 50, text: isSql ? 'Generating MySQL database schema & sample tables...' : 'Formulating algorithmic challenge & 10–15 test cases...' },
      { at: 78, text: 'Finalizing starter templates & verification suite...' }
    ];

    let currentMilestone = 0;
    _loadingProgressInterval = setInterval(() => {
      if (_currentLoadingPercent < 92) {
        const step = Math.max(0.6, (92 - _currentLoadingPercent) * 0.08);
        _currentLoadingPercent = Math.min(92, _currentLoadingPercent + step);

        if (currentMilestone < milestones.length && _currentLoadingPercent >= milestones[currentMilestone].at) {
          setLoadingProgress(_currentLoadingPercent, milestones[currentMilestone].text);
          currentMilestone++;
        } else {
          setLoadingProgress(_currentLoadingPercent);
        }
      }
    }, 110);
  }

  function finishLoadingProgress(callback) {
    clearInterval(_loadingProgressInterval);
    setLoadingProgress(100, 'Assessment Ready! Launching examination...');
    setTimeout(() => {
      showLoading(false);
      if (typeof callback === 'function') callback();
    }, 380);
  }

  function showLoading(show, format = 'mcq') {
    const el = document.getElementById('quizLoading');
    if (el) el.classList.toggle('hidden', !show);

    if (show) {
      startLoadingProgressAnimation(format);
    } else {
      clearInterval(_loadingProgressInterval);
    }

    const titleEl = document.getElementById('loadingTitleText');
    const subEl = document.getElementById('loadingSubText');
    if (titleEl && subEl) {
      if (format === 'coding+sql+mcq' || (format.includes('coding') && format.includes('sql') && format.includes('mcq'))) {
        titleEl.textContent = 'Generating Tri-Module Assessment...';
        subEl.textContent = 'Assembling LeetCode coding problem, MySQL database challenge & MCQs';
      } else if (format === 'coding+sql' || format === 'sql+coding') {
        titleEl.textContent = 'Generating Coding & SQL Assessment...';
        subEl.textContent = 'Loading LeetCode algorithmic problem & MySQL database challenge';
      } else if (format === 'coding+mcq' || format === 'hybrid') {
        titleEl.textContent = 'Generating Coding & MCQ Assessment...';
        subEl.textContent = 'Formulating multiple-choice questions & LeetCode coding challenge';
      } else if (format === 'sql+mcq') {
        titleEl.textContent = 'Generating SQL & MCQ Assessment...';
        subEl.textContent = 'Formulating MCQs & MySQL relational database challenge';
      } else if (format === 'sql') {
        titleEl.textContent = 'Generating SQL Challenge with MySQL...';
        subEl.textContent = 'Building database schema, sample tables, and automated test cases';
      } else if (format === 'coding' || format === 'python') {
        titleEl.textContent = 'Crafting LeetCode Coding Challenge...';
        subEl.textContent = 'Generating problem statement, starter templates, and 10–15 test cases';
      } else {
        titleEl.textContent = 'Generating Your Assessment with Taufa AI...';
        subEl.textContent = 'Formulating questions, choices, and answer keys';
      }
    }
  }

  function formatMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try { return marked.parse(text); } catch (_) {}
    }
    return escHtml(text).replace(/\n/g, '<br/>');
  }

  function formatChoice(text) {
    let t = escHtml(text);
    return t.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    start,
    prev,
    next,
    jumpTo,
    confirmSubmit,
    filterReview,
    switchCwTab,
    switchLcDrawerTab,
    switchLanguage,
    resetStarterCode,
    runSampleCases,
    runAllTestcases,
    selectSampleCase,
    selectResultCase,
    formatEditorCode,
    toggleEditorFullscreen,
    loadSubmissionCode,
    renderSubmissionsTab,
    getPermanentDemoQuestions,
    setMeta,
    getActiveTopic: () => activeTopic,
    getActiveFormat: () => activeFormat,
    getElapsedSeconds: () => timerStart ? Math.floor((Date.now() - timerStart) / 1000) : 0
  };
})();

if (typeof window !== 'undefined') {
  window.QUIZ = QUIZ;
}

// Global wrappers
function prevQuestion()   { QUIZ.prev(); }
function nextQuestion()   { QUIZ.next(); }
function confirmSubmit()  { QUIZ.confirmSubmit(); }
function jumpTo(idx)      { QUIZ.jumpTo(idx); }
function filterReview(type, btn) { QUIZ.filterReview(type, btn); }
function switchLanguage(lang) { QUIZ.switchLanguage(lang); }
function switchCwTab(tab) { QUIZ.switchCwTab(tab); }
function switchLcDrawerTab(tab) { QUIZ.switchLcDrawerTab(tab); }
function formatEditorCode() { QUIZ.formatEditorCode(); }
function toggleEditorFullscreen() { QUIZ.toggleEditorFullscreen(); }
function resetStarterCode() { QUIZ.resetStarterCode(); }
function runSampleCases() { QUIZ.runSampleCases(); }
function runAllTestcases() { QUIZ.runAllTestcases(); }

