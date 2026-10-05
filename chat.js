/**
 * chat.js – High-Fidelity Chatbot with Syntax Highlighting, Code Copying & Auto-Quiz Detection
 */
const CHAT = (() => {

  const storedChatQuizzes = {};

  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false,
    });
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try {
        let html = marked.parse(text);
        html = enhanceCodeBlocks(html);
        return html;
      } catch (e) {
        console.warn('Marked error:', e);
      }
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  }

  function enhanceCodeBlocks(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      if (!code) return;

      let lang = 'code';
      code.classList.forEach(cls => {
        if (cls.startsWith('language-')) {
          lang = cls.replace('language-', '');
        }
      });

      if (typeof hljs !== 'undefined') {
        try {
          if (lang && lang !== 'code' && hljs.getLanguage(lang)) {
            code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
          } else {
            code.innerHTML = hljs.highlightAuto(code.textContent).value;
          }
        } catch (_) {}
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'code-card';

      const header = document.createElement('div');
      header.className = 'code-card-header';
      header.innerHTML = `
        <span class="code-lang-label">${lang}</span>
        <button class="code-copy-btn" onclick="CHAT.copyCodeBlock(this)">📋 Copy</button>
      `;

      wrapper.appendChild(header);
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
    });

    return temp.innerHTML;
  }

  function addMessage(role, text = '', msgId = null) {
    const container = document.getElementById('chatMessages');

    const row = document.createElement('div');
    row.className = `msg-row ${role}`;
    if (msgId) row.id = `msg-${msgId}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role}`;
    avatar.innerHTML = role === 'user' ? '👤' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role}`;

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = renderMarkdown(text);

    bubble.appendChild(content);

    if (role === 'bot') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `
        <button class="action-btn" title="Copy response" onclick="CHAT.copyMessageText(this)">
          📋 Copy
        </button>
      `;
      bubble.appendChild(actions);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

    return { row, bubble, content };
  }

  async function send(message) {
    message = message.trim();
    if (!message) return;

    addMessage('user', message);

    const isQuizRequest = /(?:quiz|mcq|test|exam)/i.test(message);

    const botMsgId = 'msg-' + Date.now();
    const botMsg = addMessage('bot', '', botMsgId);
    const contentEl = botMsg.content;
    const container = document.getElementById('chatMessages');

    contentEl.innerHTML = isQuizRequest
      ? '<div class="quiz-prep-hint"><span class="spinner-inline"></span> Formulating your proctored exam questions with Taufa AI...</div>'
      : '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

    try {
      const fullReply = await API.sendChat(message, (delta, fullText) => {
        contentEl.innerHTML = renderMarkdown(fullText) + '<span class="streaming-cursor"></span>';
        container.scrollTop = container.scrollHeight;
      });

      contentEl.innerHTML = renderMarkdown(fullReply || '');

      // Check if response contains a quiz
      const parsed = API.parseQuiz(fullReply);
      if (parsed && parsed.quiz && parsed.quiz.length >= 2) {
        storedChatQuizzes[botMsgId] = {
          topic: extractTopicFromMessage(message, fullReply),
          questions: parsed.quiz
        };

        // Render interactive Proctored Exam Launch Card
        const launchCard = document.createElement('div');
        launchCard.className = 'chat-quiz-banner';
        launchCard.innerHTML = `
          <div class="cqb-header">
            <span class="cqb-badge">🛡️ PROCTORIQ EXAM DETECTED</span>
            <span class="cqb-count">${parsed.quiz.length} Questions</span>
          </div>
          <div class="cqb-title">Launch Interactive Proctored Exam</div>
          <div class="cqb-desc">Take this test with checkbox choices, 1-strike tab lockdown, fullscreen security, and dual AI grading.</div>
          <button class="cqb-btn" onclick="CHAT.launchExam('${botMsgId}')">
            <span>🚀</span> Launch Proctored Exam Now →
          </button>
        `;

        botMsg.bubble.insertBefore(launchCard, contentEl);
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="error-badge">⚠️ Error: ${err.message}</div>`;
    }
  }

  function extractTopicFromMessage(userMsg, replyText) {
    const m = userMsg.match(/(?:quiz|test|mcq|exam)\s+(?:on|about|for)?\s*([^\,\.\?]+)/i);
    if (m) return m[1].trim();
    const titleMatch = replyText.match(/#+\s*([^\n]+)/);
    if (titleMatch) return titleMatch[1].replace(/[-—–].*$/, '').trim();
    return 'Knowledge Assessment';
  }

  function launchExam(botMsgId) {
    const data = storedChatQuizzes[botMsgId];
    if (!data || !data.questions) return;
    QUIZ.startWithQuestions(data.questions, data.topic, true);
  }

  function reset() {
    API.resetChat();
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    addMessage('bot', '👋 Hi! I\'m your Taufa AI assistant. What would you like to explore or practice today?');
  }

  function copyCodeBlock(btn) {
    const card = btn.closest('.code-card');
    const code = card.querySelector('code');
    if (!code) return;

    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  }

  function copyMessageText(btn) {
    const bubble = btn.closest('.msg-bubble');
    const content = bubble.querySelector('.msg-content');
    if (!content) return;

    navigator.clipboard.writeText(content.innerText).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = '📋 Copy';
      }, 2000);
    });
  }

  return { addMessage, send, reset, copyCodeBlock, copyMessageText, launchExam };
})();

// Global input handlers
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value;
  input.value = '';
  input.style.height = 'auto';
  CHAT.send(msg);
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
  const ta = e.target;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}
