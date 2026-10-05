/**
 * api.js – Taufa.ai API + In-built Compiler Bridge + Universal Quiz & Coding Parser
 */
const API = (() => {

  let chatHistory = [];
  let omniRouteKey = '';

  // ── Load settings ──────────────────────────────────────────────────────────
  // ── Load settings & proctor policy ─────────────────────────────────────────
  async function loadSettings() {
    try {
      const res = await fetch(CONFIG.SETTINGS_URL);
      if (res.ok) {
        const data = await res.json();
        omniRouteKey = data.omniRouteKey || '';
        if (data.proctorPolicy) {
          const p = data.proctorPolicy;
          if (p.maxTabSwitches !== undefined) CONFIG.MAX_TAB_SWITCHES = Number(p.maxTabSwitches);
          if (p.maxSoundWarnings !== undefined) CONFIG.MAX_SOUND_WARNINGS = Number(p.maxSoundWarnings);
          if (p.maxAwaySec !== undefined) CONFIG.MAX_AWAY_SECONDS = Number(p.maxAwaySec);
          if (p.lightingGuard !== undefined) CONFIG.LIGHTING_GUARD = Boolean(p.lightingGuard);
          if (p.antiAiScanner !== undefined) CONFIG.ANTI_AI_SCANNER = Boolean(p.antiAiScanner);
          if (p.fullscreenLockdown !== undefined) CONFIG.FULLSCREEN_LOCKDOWN = Boolean(p.fullscreenLockdown);
          if (p.dualAiVerification !== undefined) CONFIG.DUAL_AI_VERIFICATION = Boolean(p.dualAiVerification);
          if (p.omniRouteKey) omniRouteKey = p.omniRouteKey;
        }
        if (data.taufaPrompts) {
          CONFIG.CUSTOM_PROMPTS = data.taufaPrompts;
        }
        if (data.conversationId) {
          CONFIG.CONVERSATION_ID = data.conversationId;
        }
        if (data.omniRouteConfig) {
          if (data.omniRouteConfig.url) CONFIG.OMNIROUTE_URL = data.omniRouteConfig.url;
          if (data.omniRouteConfig.apiKey) omniRouteKey = data.omniRouteConfig.apiKey;
        }
      }
    } catch (_) {}
  }

  async function saveSettings(settings) {
    try {
      const res = await fetch(CONFIG.SETTINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        omniRouteKey = settings.omniRouteKey || '';
        return data;
      }
    } catch (e) {
      throw new Error('Failed to save settings: ' + e.message);
    }
  }

  function getSettings() {
    return { omniRouteKey };
  }

  // ── Admin Portal API ───────────────────────────────────────────────────────
  async function adminLogin(username, password) {
    const res = await fetch(CONFIG.ADMIN_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('proctoriq_admin_token', data.token);
      sessionStorage.setItem('proctoriq_admin_user', data.username);
      return data;
    }
    throw new Error(data.error || 'Authentication failed. Please verify credentials.');
  }

  function isAdminLoggedIn() {
    return !!sessionStorage.getItem('proctoriq_admin_token');
  }

  function adminLogout() {
    sessionStorage.removeItem('proctoriq_admin_token');
    sessionStorage.removeItem('proctoriq_admin_user');
  }

  async function getAdminRecords() {
    const res = await fetch(CONFIG.ADMIN_RECORDS_URL);
    if (!res.ok) throw new Error('Failed to fetch test attendance records');
    return await res.json();
  }

  async function recordTestResult(record) {
    try {
      const res = await fetch(CONFIG.ADMIN_RECORDS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      return await res.json();
    } catch (err) {
      console.warn('Could not record test result:', err);
      return null;
    }
  }

  async function deleteAdminRecord(recordId) {
    const res = await fetch(CONFIG.ADMIN_RECORDS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: recordId })
    });
    return await res.json();
  }

  async function clearAdminRecords() {
    const res = await fetch(CONFIG.ADMIN_RECORDS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' })
    });
    return await res.json();
  }

  async function getCustomTests() {
    const res = await fetch(CONFIG.ADMIN_CUSTOM_TESTS_URL);
    if (!res.ok) throw new Error('Failed to fetch custom tests');
    return await res.json();
  }

  async function saveCustomTest(test) {
    const res = await fetch(CONFIG.ADMIN_CUSTOM_TESTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', test })
    });
    return await res.json();
  }

  async function deleteCustomTest(testId) {
    const res = await fetch(CONFIG.ADMIN_CUSTOM_TESTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: testId })
    });
    return await res.json();
  }

  async function getProctorConfig() {
    const res = await fetch(CONFIG.ADMIN_PROCTOR_CONFIG_URL);
    if (!res.ok) throw new Error('Failed to fetch proctoring configuration');
    return await res.json();
  }

  async function saveProctorConfig(config) {
    const res = await fetch(CONFIG.ADMIN_PROCTOR_CONFIG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (config.maxTabSwitches !== undefined) CONFIG.MAX_TAB_SWITCHES = Number(config.maxTabSwitches);
      if (config.maxSoundWarnings !== undefined) CONFIG.MAX_SOUND_WARNINGS = Number(config.maxSoundWarnings);
      if (config.maxAwaySec !== undefined) CONFIG.MAX_AWAY_SECONDS = Number(config.maxAwaySec);
      if (config.lightingGuard !== undefined) CONFIG.LIGHTING_GUARD = Boolean(config.lightingGuard);
      if (config.antiAiScanner !== undefined) CONFIG.ANTI_AI_SCANNER = Boolean(config.antiAiScanner);
      if (config.fullscreenLockdown !== undefined) CONFIG.FULLSCREEN_LOCKDOWN = Boolean(config.fullscreenLockdown);
      if (config.dualAiVerification !== undefined) CONFIG.DUAL_AI_VERIFICATION = Boolean(config.dualAiVerification);
      if (config.omniRouteKey !== undefined) omniRouteKey = config.omniRouteKey;
    }
    return data;
  }

  // ── Admin Active Assignment & Scheduling ────────────────────────────────────
  async function getActiveAssignment() {
    try {
      const res = await fetch(CONFIG.ADMIN_ACTIVE_ASSIGNMENT_URL);
      if (res.ok) return await res.json();
    } catch (_) {}
    return { success: false, assignedTest: null };
  }

  async function setActiveAssignment(testId, isAssigned = true, scheduledStart = null, scheduledEnd = null, proctorOptions = null, allowedAttempts = 1) {
    let payload = {};
    if (typeof isAssigned === 'string') {
      // Legacy signature: (testId, action, extra)
      payload = Object.assign({ action: isAssigned, testId }, scheduledStart || {});
    } else {
      payload = {
        action: 'schedule',
        testId,
        isAssigned: Boolean(isAssigned),
        scheduledStart: scheduledStart || null,
        scheduledEnd: scheduledEnd || null,
        proctorOptions: proctorOptions || null,
        allowedAttempts: Number(allowedAttempts || 1),
        maxAttempts: Number(allowedAttempts || 1)
      };
    }
    const res = await fetch(CONFIG.ADMIN_ACTIVE_ASSIGNMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  // ── Admin System Config (Taufa, OmniRoute, Prompts) ──────────────────────────
  async function getSystemConfig() {
    const res = await fetch(CONFIG.ADMIN_SYSTEM_CONFIG_URL);
    if (!res.ok) throw new Error('Failed to fetch system configuration');
    return await res.json();
  }

  async function saveSystemConfig(cfg) {
    const res = await fetch(CONFIG.ADMIN_SYSTEM_CONFIG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (cfg.taufaPrompts) CONFIG.CUSTOM_PROMPTS = cfg.taufaPrompts;
      if (cfg.conversationId) CONFIG.CONVERSATION_ID = cfg.conversationId;
      if (cfg.omniRoute && cfg.omniRoute.url) CONFIG.OMNIROUTE_URL = cfg.omniRoute.url;
      if (cfg.omniRoute && cfg.omniRoute.apiKey) omniRouteKey = cfg.omniRoute.apiKey;
    }
    return data;
  }

  async function testOmniRoute(urlOrKey, apiKeyOrUrl, model = 'gpt-4o-mini') {
    let url = 'http://localhost:20128/v1/chat/completions';
    let apiKey = '';
    let mdl = model || 'gpt-4o-mini';

    if (typeof urlOrKey === 'object' && urlOrKey !== null) {
      url = urlOrKey.url || url;
      apiKey = urlOrKey.apiKey || urlOrKey.key || '';
      mdl = urlOrKey.model || mdl;
    } else {
      const a = String(urlOrKey || '').trim();
      const b = String(apiKeyOrUrl || '').trim();
      if (a.startsWith('http://') || a.startsWith('https://')) {
        url = a;
        apiKey = b;
      } else if (b.startsWith('http://') || b.startsWith('https://')) {
        url = b;
        apiKey = a;
      } else {
        apiKey = a;
        if (b) url = b;
      }
    }

    try {
      const res = await fetch(CONFIG.ADMIN_TEST_OMNIROUTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, apiKey, model: mdl })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function testTaufaPrompt(prompt, conversationId) {
    const res = await fetch(CONFIG.ADMIN_TEST_TAUFA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, conversationId })
    });
    return await res.json();
  }

  async function startOmniRouteHeadless() {
    const res = await fetch(CONFIG.ADMIN_START_OMNIROUTE_URL, { method: 'POST' });
    return await res.json();
  }

  async function getOmniRouteStatus() {
    try {
      const res = await fetch(CONFIG.ADMIN_OMNIROUTE_STATUS_URL);
      if (res.ok) return await res.json();
    } catch (_) {}
    return { success: false, running: false };
  }

  // ── SSE streaming fetch ─────────────────────────────────────────────────────
  async function streamChat(body, onDelta, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(CONFIG.TAUFA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr);
            if (event.type === 'text-delta' && event.delta) {
              fullText += event.delta;
              onDelta && onDelta(event.delta, fullText);
            }
          } catch (_) {}
        }
      }

      return fullText;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Generate quiz via Taufa ─────────────────────────────────────────────────
  async function generateQuiz(topic, numQ, taglines = '') {
    const targetCount = Math.min(100, Math.max(1, parseInt(numQ, 10) || 5));
    if (targetCount <= 25) {
      const prompt = CONFIG.buildQuizPrompt(topic, targetCount, taglines);
      const body = CONFIG.buildBody(prompt, []);
      let fullText = '';
      await streamChat(body, (_, accumulated) => { fullText = accumulated; });
      return parseQuiz(fullText);
    }

    // For larger counts (e.g. 30, 50, 75, 90, 100), generate in parallel batches of 20-25
    const batchSize = 25;
    const allQuestions = [];
    const numBatches = Math.ceil(targetCount / batchSize);
    const tags = taglines ? taglines.split(',').map(s => s.trim()).filter(Boolean) : [];

    for (let b = 0; b < numBatches; b++) {
      const needed = Math.min(batchSize, targetCount - allQuestions.length);
      if (needed <= 0) break;
      const batchTag = tags.length ? tags[b % tags.length] : taglines;
      const batchTopic = batchTag ? `${topic} - Focus: ${batchTag} (Part ${b + 1})` : `${topic} (Part ${b + 1})`;
      const prompt = CONFIG.buildQuizPrompt(batchTopic, needed, batchTag, b);
      const body = CONFIG.buildBody(prompt, []);
      let fullText = '';
      try {
        await streamChat(body, (_, accumulated) => { fullText = accumulated; });
        const res = parseQuiz(fullText);
        if (res && res.quiz && res.quiz.length) {
          allQuestions.push(...res.quiz);
        }
      } catch (e) {
        console.warn('Batch generation notice:', e);
      }
    }

    if (allQuestions.length > 0) {
      return { quiz: allQuestions.slice(0, targetCount) };
    }

    // Fallback: single call
    const prompt = CONFIG.buildQuizPrompt(topic, Math.min(25, targetCount), taglines);
    const body = CONFIG.buildBody(prompt, []);
    let fullText = '';
    await streamChat(body, (_, accumulated) => { fullText = accumulated; });
    return parseQuiz(fullText);
  }

  // ── Generate SQL Challenge (SQL_CATALOG primary, Taufa AI fallback) ─────────
  async function generateSqlChallenge(topic, difficulty = 'Medium') {
    // 1. Local SQL catalog first — fast, MySQL-ready problems
    if (typeof SQL_CATALOG !== 'undefined') {
      const p = (topic && topic.trim() && topic.trim().toLowerCase() !== 'random')
        ? SQL_CATALOG.findProblemByTopic(topic, null, difficulty)
        : SQL_CATALOG.getRandomProblem(null, difficulty);
      if (p) return { ...p, type: 'coding' };
    }
    // 2. Taufa AI fallback
    try {
      const prompt = CONFIG.buildCodingPrompt(topic || 'SQL queries', 'sql');
      const body = CONFIG.buildBody(prompt, []);
      let fullText = '';
      await streamChat(body, (_, acc) => { fullText = acc; });
      const parsed = parseCodingChallenge(fullText, topic, 'sql');
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Taufa SQL generation failed:', err.message);
    }
    // 3. Last resort: random SQL catalog item
    if (typeof SQL_CATALOG !== 'undefined') {
      const p = SQL_CATALOG.getRandomProblem(null, difficulty);
      if (p) return { ...p, type: 'coding' };
    }
    return null;
  }

  // ── Generate Coding Challenge (LeetCode / Taufa AI / Catalog) ──────────────
  async function generateCodingChallenge(topic, language = 'python', category = 'General', difficulty = 'Medium', problemId = null) {
    // If specific problem requested, find directly in LeetCode catalog (0ms instant)
    if (problemId && typeof LEETCODE !== 'undefined') {
      const p = LEETCODE.getCatalog().find(x => x.id === problemId || String(x.number) === String(problemId));
      if (p) return { ...p, type: 'coding' };
    }

    // SQL format, category, or SQL topic → route to SQL_CATALOG (MySQL-backed problems with real testcases)
    if (language === 'sql' || (category && category.toLowerCase() === 'sql') || (topic && topic.toLowerCase().startsWith('sql-'))) {
      return generateSqlChallenge(topic, difficulty);
    }

    // Coding (Python/Java/C++/C) → LeetCode catalog first (instant fast path)
    if (typeof LEETCODE !== 'undefined') {
      const p = (!topic || topic.trim().toLowerCase() === 'random' || topic.trim() === '')
        ? LEETCODE.getRandomProblem(category, difficulty)
        : LEETCODE.findProblemByTopic(topic, category, difficulty);
      if (p) return { ...p, type: 'coding' };
    }

    // Try Taufa AI for custom problem generation (capped at 6s timeout)
    try {
      const prompt = CONFIG.buildLeetCodePrompt ? CONFIG.buildLeetCodePrompt(topic, category, difficulty) : CONFIG.buildCodingPrompt(topic, language);
      const body = CONFIG.buildBody(prompt, []);
      let fullText = '';
      await streamChat(body, (_, accumulated) => { fullText = accumulated; }, 6000);
      const parsed = parseCodingChallenge(fullText, topic, language);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Taufa AI LeetCode generation fallback:', err.message);
    }

    // Final fallback: curated LeetCode catalog
    if (typeof LEETCODE !== 'undefined') {
      const p = LEETCODE.getRandomProblem(category, difficulty) || LEETCODE.findProblemByTopic(topic, category, difficulty);
      if (p) return { ...p, type: 'coding' };
    }

    return generateFallbackCodingChallenge(topic, language, '', category, difficulty);
  }

  // ── Run Code on In-built Compiler (Python & SQL) ───────────────────────────
  async function runCode(language, code, schema, testcases) {
    const res = await fetch(CONFIG.RUN_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code, schema, testcases })
    });
    if (!res.ok) throw new Error(`Compiler error: HTTP ${res.status}`);
    return await res.json();
  }

  // ── Backend Fullscreen Controls ─────────────────────────────────────────────
  async function enterFullscreen() {
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.enter_fullscreen) {
        await window.pywebview.api.enter_fullscreen();
      }
    } catch (_) {}
    try {
      await fetch(CONFIG.FULLSCREEN_ENTER_URL, { method: 'POST' });
    } catch (_) {}
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (_) {}
  }

  async function exitFullscreen() {
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.exit_fullscreen) {
        await window.pywebview.api.exit_fullscreen();
      }
    } catch (_) {}
    try {
      await fetch(CONFIG.FULLSCREEN_EXIT_URL, { method: 'POST' });
    } catch (_) {}
    try {
      if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
    } catch (_) {}
  }

  async function toggleFullscreen() {
    try {
      const res = await fetch(CONFIG.FULLSCREEN_TOGGLE_URL, { method: 'POST' });
      const data = await res.json();
      return data.fullscreen;
    } catch (_) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        return true;
      } else {
        document.exitFullscreen().catch(() => {});
        return false;
      }
    }
  }

  // ── AI Verification Helper (OmniRoute + Taufa AI Fallback) ──────────────────
  async function callAiCompletion(prompt, maxTokens = 220) {
    // 1. Try OmniRoute first
    const endpoint = CONFIG.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (omniRouteKey) headers['Authorization'] = `Bearer ${omniRouteKey}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.2,
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (_) {}

    // 2. Fallback: Taufa AI streaming chat
    try {
      const body = CONFIG.buildBody(prompt, []);
      let taufaReply = '';
      await streamChat(body, (_, accumulated) => { taufaReply = accumulated; });
      if (taufaReply) return taufaReply.trim();
    } catch (_) {}

    return null;
  }

  // ── OmniRoute AI Verification for MCQ ───────────────────────────────────────
  async function verifyWithOmniRoute(question, choices, correctAnswer, userAnswer) {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const choicesText = (choices || []).map((c, i) => `${labels[i]}) ${c}`).join('\n');
    const correctLabel = Array.isArray(correctAnswer)
      ? correctAnswer.map(idx => labels[idx]).join(', ')
      : (correctAnswer !== undefined && correctAnswer !== null ? labels[correctAnswer] : 'N/A');
    const userLabel = Array.isArray(userAnswer)
      ? (userAnswer.length ? userAnswer.map(idx => labels[idx]).join(', ') : 'Skipped')
      : (userAnswer !== null && userAnswer !== undefined ? labels[userAnswer] : 'Skipped');

    const prompt = `Question: ${question}\n\nChoices:\n${choicesText}\n\nCorrect Answer: ${correctLabel}\nUser's Selected Answer: ${userLabel}\n\nValidate the candidate's answer and explain why the correct choice is accurate in 2-3 concise sentences.`;

    return await callAiCompletion(prompt, 180);
  }

  // ── OmniRoute AI Verification for SQL Challenges ────────────────────────────
  async function verifySqlWithOmniRoute(problemTitle, problemDesc, schema, userSql) {
    const cleanSql = (userSql || '').trim();
    if (!cleanSql) return 'No SQL query submitted by candidate.';

    const prompt = `Assessment: SQL Challenge - "${problemTitle}"\n\nProblem Requirements:\n${problemDesc}\n\nDatabase Schema / Context:\n${schema || 'MySQL 8.0 Employee/Sales Tables'}\n\nCandidate's Submitted SQL Query:\n\`\`\`sql\n${cleanSql}\n\`\`\`\n\nTask: Validate this SQL query. Is the SQL syntax valid MySQL 8.0? Does it satisfy the problem requirement? Note any logical oversights (joins, group by, order by, null handling) in 2-3 concise bullet points.`;

    return await callAiCompletion(prompt, 220);
  }

  // ── Batch verify all answers (MCQ + SQL) ────────────────────────────────────
  async function verifyAllAnswers(questions, userAnswers, onProgress) {
    const results = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      onProgress && onProgress(i, questions.length);

      if (q.type === 'coding') {
        if (q.language === 'sql') {
          const userSql = userAnswers[i] || '';
          const sqlReview = await verifySqlWithOmniRoute(
            q.title || 'SQL Challenge',
            q.description || '',
            q.schema || q.testcasesText || '',
            userSql
          );
          results.push(sqlReview);
        } else {
          results.push(null);
        }
        continue;
      }

      const explanation = await verifyWithOmniRoute(
        q.question, q.choices,
        q.answer, userAnswers[i]
      );
      results.push(explanation);
    }
    return results;
  }

  // ── Universal Quiz Parser ───────────────────────────────────────────────────
  function parseQuiz(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Markdown JSON fence
    try {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) {
        const obj = JSON.parse(fence[1].trim());
        const res = cleanAndStandardizeQuiz(obj);
        if (res && res.quiz.length) return res;
      }
    } catch (_) {}

    // 2. Raw JSON block
    try {
      const block = text.match(/\{[\s\S]*"quiz"[\s\S]*\}/);
      if (block) {
        const obj = JSON.parse(block[0]);
        const res = cleanAndStandardizeQuiz(obj);
        if (res && res.quiz.length) return res;
      }
    } catch (_) {}

    // 3. Universal Plain Text Parser
    return parsePlainTextUniversal(text);
  }

  function cleanAndStandardizeQuiz(obj) {
    if (!obj || !Array.isArray(obj.quiz)) return null;
    const cleaned = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];

    for (const q of obj.quiz) {
      if (!q.question || !Array.isArray(q.choices) || q.choices.length < 2) continue;

      let qText = q.question.trim();
      if (!qText.includes('?') && !qText.endsWith('?')) qText += '?';

      const choices = q.choices.map((c) => {
        let text = String(c).trim();
        return text.replace(/^[A-Ea-e1-5][\)\.\:\-]\s*/, '').trim();
      });

      let ans;
      let isMulti = q.multi === true;

      if (Array.isArray(q.answer)) {
        ans = q.answer.map(a => {
          if (typeof a === 'number') return a;
          const m = String(a).trim().match(/^([A-Ea-e])/);
          if (m) return labels.indexOf(m[1].toUpperCase());
          return parseInt(a, 10) || 0;
        }).filter(n => n >= 0 && n < choices.length);
        isMulti = ans.length > 1;
      } else if (typeof q.answer === 'string' && (q.answer.includes(',') || q.answer.includes('&') || /and/i.test(q.answer))) {
        ans = q.answer.split(/[,&]|\band\b/i).map(a => {
          const m = a.trim().match(/^([A-Ea-e])/);
          if (m) return labels.indexOf(m[1].toUpperCase());
          return parseInt(a.trim(), 10) || 0;
        }).filter(n => n >= 0 && n < choices.length);
        isMulti = ans.length > 1;
      } else if (typeof q.answer === 'number') {
        ans = q.answer;
      } else {
        const m = String(q.answer || 'A').trim().match(/^([A-Ea-e])/);
        ans = m ? labels.indexOf(m[1].toUpperCase()) : 0;
      }

      cleaned.push({ type: 'mcq', question: qText, choices, answer: ans, multi: isMulti });
    }

    return cleaned.length > 0 ? { quiz: cleaned } : null;
  }

  function parsePlainTextUniversal(text) {
    const questions = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];

    const answersMap = {};
    const bottomKeyMatch = text.match(/(?:answers?|answer\s*key|correct\s*answers?)[:\s]*\n([\s\S]*)$/i);
    if (bottomKeyMatch) {
      const keyLines = bottomKeyMatch[1];
      const keyRegex = /(?:(\d+)[\.\)\:\-]\s*([A-Ea-e](?:\s*[,&/and]+\s*[A-Ea-e])*))/gi;
      let km;
      while ((km = keyRegex.exec(keyLines)) !== null) {
        const qNum = parseInt(km[1], 10);
        const letters = km[2].toUpperCase().match(/[A-E]/g) || ['A'];
        answersMap[qNum] = letters.map(l => labels.indexOf(l)).filter(n => n >= 0);
      }
    }

    const blocks = text.split(/(?=(?:^|\n)\s*(?:Q(?:uestion)?\s*)?\d+[\.\)\:]\s+)/i).filter(b => b.trim());

    for (let bi = 0; bi < blocks.length; bi++) {
      const rawBlock = blocks[bi].trim();

      const choiceStartMatch = rawBlock.match(/(?:^|\n|\s)\s*([A-Ea-e])[\)\.\:\-]\s+/);
      if (!choiceStartMatch) continue;

      const choiceStartIndex = choiceStartMatch.index;
      let qPart = rawBlock.substring(0, choiceStartIndex).trim();
      qPart = qPart.replace(/^(?:Q(?:uestion)?\s*)?\d+[\.\)\:]\s*/i, '').trim();
      if (!qPart) continue;

      let choicesPart = rawBlock.substring(choiceStartIndex).trim();

      const ansKeyIdx = choicesPart.search(/(?:answers?|answer\s*key|correct\s*answers?)[:\s]*\n/i);
      if (ansKeyIdx !== -1) {
        choicesPart = choicesPart.substring(0, ansKeyIdx).trim();
      }

      let questionAnswer = null;
      const inlineAnsMatch = choicesPart.match(/(?:(?:answer|correct)[:\s]*([A-Ea-e](?:\s*[,&/and]+\s*[A-Ea-e])*))/i);
      if (inlineAnsMatch) {
        const letters = inlineAnsMatch[1].toUpperCase().match(/[A-E]/g) || [];
        if (letters.length) {
          questionAnswer = letters.map(l => labels.indexOf(l)).filter(n => n >= 0);
        }
        choicesPart = choicesPart.replace(inlineAnsMatch[0], '').trim();
      }

      const choiceRegex = /(?:^|\s|\n)([A-Ea-e])[\)\.\:\-]\s+([\s\S]*?)(?=(?:(?:\s|\n)[A-Ea-e][\)\.\:\-]\s+)|$)/gi;
      const choices = [];
      let cm;
      while ((cm = choiceRegex.exec(choicesPart)) !== null) {
        let choiceText = cm[2].trim();
        choiceText = choiceText.replace(/(?:\n\s*)*\b(?:answers?|answer\s*key|correct\s*answers?)[\s\S]*$/i, '').trim();
        choices.push(choiceText);
      }

      if (choices.length < 2) continue;

      const qNum = questions.length + 1;
      let ansIndices = questionAnswer || answersMap[qNum] || [0];
      const isMulti = ansIndices.length > 1 || /select\s+all|multiple\s+answers/i.test(qPart);

      if (!qPart.includes('?') && !qPart.endsWith('?')) {
        qPart += '?';
      }

      questions.push({
        type: 'mcq',
        question: qPart,
        choices,
        answer: isMulti ? ansIndices : (ansIndices[0] ?? 0),
        multi: isMulti
      });
    }

    return questions.length > 0 ? { quiz: questions } : null;
  }

  // ── Coding Challenge Parser ────────────────────────────────────────────────
  function parseCodingChallenge(text, topic, language) {
    if (!text || typeof text !== 'string') return null;

    let parsedObj = null;

    // Try JSON inside code fence
    try {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) parsedObj = JSON.parse(fence[1].trim());
    } catch (_) {}

    // Try raw JSON
    if (!parsedObj) {
      try {
        const match = text.match(/\{[\s\S]*"coding"[\s\S]*\}/);
        if (match) parsedObj = JSON.parse(match[0]);
      } catch (_) {}
    }

    const c = parsedObj?.coding;
    if (c && c.description && Array.isArray(c.testcases) && c.testcases.length >= 4) {
      const starterCodes = c.starterCodes || {};
      if (!starterCodes.python && c.starterCode) starterCodes.python = c.starterCode;

      if (!starterCodes.java) {
        starterCodes.java = `import java.util.*;\n\npublic class Solution {\n    // Implement your solution here\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Test runner driver\n    }\n}`;
      }
      if (!starterCodes.cpp) {
        starterCodes.cpp = `#include <iostream>\n#include <vector>\n#include <string>\n#include <unordered_map>\n#include <algorithm>\nusing namespace std;\n\nclass Solution {\npublic:\n    // Implement your solution here\n};\n\nint main() {\n    // Test runner driver\n    return 0;\n}`;
      }
      if (!starterCodes.c) {
        starterCodes.c = `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\n// Implement your solution here\n\nint main() {\n    // Test runner driver\n    return 0;\n}`;
      }
      if (!starterCodes.python) {
        starterCodes.python = `class Solution:\n    def solution(self, *args):\n        # Implement your solution here\n        pass\n`;
      }

      return {
        type: 'coding',
        title: c.title || `${topic} Coding Challenge`,
        category: c.category || 'Algorithms',
        difficulty: c.difficulty || 'Medium',
        description: c.description,
        starterCodes: starterCodes,
        starterCode: starterCodes[language] || starterCodes.python,
        schema: c.schema || '',
        testcases: c.testcases
      };
    }

    // Resilient fallback coding problem generator
    return generateFallbackCodingChallenge(topic, language, text);
  }

  function generateFallbackCodingChallenge(topic, language, rawText, category = 'General', difficulty = 'Medium') {
    if (typeof LEETCODE !== 'undefined') {
      const p = LEETCODE.findProblemByTopic(topic, category, difficulty);
      if (p) return { ...p, type: 'coding' };
    }

    if (language === 'sql') {
      return {
        type: 'coding',
        title: `SQL: ${topic}`,
        language: 'sql',
        difficulty: 'Medium',
        description: rawText || `Write a SQL query for **${topic}**.\n\nRetrieve the required records sorted appropriately based on the schema below.`,
        starterCode: `-- Write your SQL solution below\n\nSELECT `,
        schema: `CREATE TABLE employees (id INT, name TEXT, salary INT, department TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 75000, 'Engineering'), (2, 'Bob', 48000, 'HR'), (3, 'Charlie', 85000, 'Engineering'), (4, 'David', 60000, 'Finance');`,
        testcases: [
          { id: 1, description: "Base query check", expected: [["Charlie", "85000"], ["Alice", "75000"], ["David", "60000"]], hidden: false },
          { id: 2, description: "Edge case with new hire", setup: "INSERT INTO employees VALUES (5, 'Eve', 92000, 'Engineering');", expected: [["Eve", "92000"], ["Charlie", "85000"], ["Alice", "75000"], ["David", "60000"]], hidden: false },
          { id: 3, description: "Hidden test 3", hidden: true },
          { id: 4, description: "Hidden test 4", hidden: true },
          { id: 5, description: "Hidden test 5", hidden: true },
          { id: 6, description: "Hidden test 6", hidden: true },
          { id: 7, description: "Hidden test 7", hidden: true },
          { id: 8, description: "Hidden test 8", hidden: true },
          { id: 9, description: "Hidden test 9", hidden: true },
          { id: 10, description: "Hidden test 10", hidden: true },
          { id: 11, description: "Hidden test 11", hidden: true },
          { id: 12, description: "Hidden test 12", hidden: true }
        ]
      };
    }

    return {
      type: 'coding',
      title: `1. Two Sum`,
      category: 'Arrays & Hashing',
      difficulty: 'Easy',
      description: `### 1. Two Sum\n\nGiven an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.\n\n### Example 1:\n\`\`\`\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n\`\`\``,
      starterCodes: {
        python: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        # Write your code here\n        pass\n`,
        java: `import java.util.*;\n\npublic class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write your code here\n        return new int[]{};\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();\n        int target = sc.nextInt();\n        Solution sol = new Solution();\n        System.out.println(Arrays.toString(sol.twoSum(nums, target)));\n    }\n}\n`,
        cpp: `#include <iostream>\n#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your code here\n        return {};\n    }\n};\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    int target;\n    cin >> target;\n    Solution sol;\n    vector<int> ans = sol.twoSum(nums, target);\n    cout << "[" << ans[0] << ", " << ans[1] << "]" << endl;\n    return 0;\n}\n`,
        c: `#include <stdio.h>\n#include <stdlib.h>\n\nint* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    // Write your code here\n    *returnSize = 0;\n    return NULL;\n}\n\nint main() {\n    int n;\n    if (scanf("%d", &n) != 1) return 0;\n    int* nums = (int*)malloc(n * sizeof(int));\n    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);\n    int target;\n    scanf("%d", &target);\n    int returnSize = 0;\n    int* ans = twoSum(nums, n, target, &returnSize);\n    printf("[%d, %d]\\n", ans[0], ans[1]);\n    free(nums); free(ans);\n    return 0;\n}\n`
      },
      starterCode: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        # Write your code here\n        pass\n`,
      testcases: [
        { id: 1, input: "4\n2 7 11 15\n9", expected: "[0, 1]", hidden: false },
        { id: 2, input: "3\n3 2 4\n6", expected: "[1, 2]", hidden: false },
        { id: 3, input: "2\n3 3\n6", expected: "[0, 1]", hidden: false },
        { id: 4, input: "4\n1 5 8 3\n8", expected: "[1, 3]", hidden: false },
        { id: 5, input: "4\n10 -2 5 8\n3", expected: "[1, 2]", hidden: true },
        { id: 6, input: "2\n0 0\n0", expected: "[0, 1]", hidden: true },
        { id: 7, input: "3\n100 200 300\n500", expected: "[1, 2]", hidden: true },
        { id: 8, input: "3\n-5 -3 -1\n-4", expected: "[1, 2]", hidden: true },
        { id: 9, input: "5\n1 2 3 4 5\n9", expected: "[3, 4]", hidden: true },
        { id: 10, input: "3\n7 14 21\n28", expected: "[0, 2]", hidden: true },
        { id: 11, input: "3\n50 25 75\n125", expected: "[0, 2]", hidden: true },
        { id: 12, input: "4\n9 1 8 2\n10", expected: "[0, 1]", hidden: true }
      ]
    };
  }

  // ── Bug / Issue Reporting ──────────────────────────────────────────────────
  async function submitBugReport(report) {
    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (e) {
      throw new Error('Failed to submit bug report: ' + e.message);
    }
  }

  async function getBugReports() {
    try {
      const res = await fetch('/api/bug-reports');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (e) {
      throw new Error('Failed to load bug reports: ' + e.message);
    }
  }

  return {
    generateQuiz,
    generateCodingChallenge,
    runCode,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    verifyAllAnswers,
    loadSettings,
    saveSettings,
    getSettings,
    adminLogin,
    isAdminLoggedIn,
    adminLogout,
    getAdminRecords,
    recordTestResult,
    deleteAdminRecord,
    clearAdminRecords,
    getCustomTests,
    saveCustomTest,
    deleteCustomTest,
    getProctorConfig,
    saveProctorConfig,
    getActiveAssignment,
    setActiveAssignment,
    getSystemConfig,
    saveSystemConfig,
    testOmniRoute,
    testTaufaPrompt,
    startOmniRouteHeadless,
    getOmniRouteStatus,
    verifySqlWithOmniRoute,
    submitBugReport,
    getBugReports
  };
})();
