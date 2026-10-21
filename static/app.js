
(() => {
  const $ = (id) => document.getElementById(id);

  const API_BASE_URL = 'https://clearchoice-chatbot.onrender.com';
  const STORAGE_KEY = 'clearchoice_explicitly_saved_chats_v1';

  const state = { messages: [], busy: false, saved: [] };

  const welcome = $('welcome');
  const conversation = $('conversation');
  const messagesEl = $('messages');
  const input = $('messageInput');
  const form = $('chatForm');
  const sendBtn = $('sendBtn');
  const typing = $('typing');
  const saveBtn = $('saveChatBtn');
  const saveDialog = $('saveDialog');

  let toastTimer;

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }

  function markdown(text) {
    let s = escapeHTML(text);

    s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
      '<pre><code>' + code.trim() + '</code></pre>'
    );

    s = s.replace(/^### (.*)$/gm, '<h3>$1</h3>')
         .replace(/^## (.*)$/gm, '<h2>$1</h2>')
         .replace(/^# (.*)$/gm, '<h1>$1</h1>');

    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/\*(.+?)\*/g, '<em>$1</em>')
         .replace(/`([^`]+)`/g, '<code>$1</code>');

    s = s.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>');
    s = s.replace(/(?:<li>.*<\/li>\n?)+/g, block =>
      '<ul>' + block + '</ul>'
    );

    s = s.replace(/^\s*\d+\. (.*)$/gm, '<li>$1</li>');

    s = s.split(/\n{2,}/).map(block => {
      const t = block.trim();
      if (!t) return '';

      if (/^<(h[1-3]|ul|ol|pre)>/.test(t)) return t;

      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    }).join('');

    return s;
  }

  function renderMessage(role, content) {
    const wrap = document.createElement('article');
    wrap.className = 'message ' +
      (role === 'user' ? 'user' : 'assistant');

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '●' : '✳';

    const body = document.createElement('div');
    body.className = 'message-body';

    const name = document.createElement('div');
    name.className = 'message-name';
    name.textContent = role === 'user' ? 'YOU' : 'CLEARCHOICE';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = markdown(content);
    }

    body.append(name, bubble);
    wrap.append(avatar, body);
    messagesEl.appendChild(wrap);
  }

  function renderAll() {
    messagesEl.replaceChildren();

    state.messages.forEach(m =>
      renderMessage(m.role, m.content)
    );

    const hasMessages = state.messages.length > 0;

    welcome.classList.toggle('hidden', hasMessages);
    conversation.classList.toggle('hidden', !hasMessages);

    saveBtn.disabled = !hasMessages || state.busy;

    if (hasMessages) {
      messagesEl.lastElementChild?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    sendBtn.disabled = busy;
    input.disabled = busy;
    typing.classList.toggle('hidden', !busy);
    saveBtn.disabled = busy || state.messages.length === 0;
  }

  async function sendMessage(text) {
    const value = text.trim();

    if (!value || state.busy) return;

    state.messages.push({ role: 'user', content: value });

    renderAll();
    input.value = '';
    resizeInput();
    setBusy(true);

    try {
      // Connect to the deployed Render backend.
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: state.messages
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Backend request failed (${response.status}).`
        );
      }

      if (typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The backend did not return a valid reply.');
      }

      state.messages.push({
        role: 'assistant',
        content: data.reply
      });
    } catch (error) {
      state.messages.push({
        role: 'assistant',
        content:
          '**I could not get a reply.**\n\n' +
          (error.message || 'Please check the backend and try again.')
      });

      toast(
        'Could not contact the backend. Check your connection and server logs.'
      );
    } finally {
      setBusy(false);
      renderAll();
      input.focus();
    }
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  }

  function startNewChat() {
    if (state.busy) {
      return toast('Please wait for the current reply to finish.');
    }

    state.messages = [];
    renderAll();
    input.value = '';
    resizeInput();
    input.focus();

    $('sidebar').classList.remove('open');
    toast('New private session started.');
  }

  function readSaved() {
    try {
      const value = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '[]'
      );

      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeSaved() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.saved)
      );
    } catch {
      toast('Could not save. Browser storage may be full or disabled.');
    }

    renderSaved();
  }

  function renderSaved() {
    $('savedCount').textContent = state.saved.length;

    const list = $('savedList');
    list.replaceChildren();

    if (!state.saved.length) {
      const p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = 'No saved chats yet.';
      list.appendChild(p);
      return;
    }

    state.saved.slice().reverse().forEach(chat => {
      const row = document.createElement('div');
      row.className = 'saved-item';

      const open = document.createElement('button');
      open.className = 'saved-open';
      open.textContent = chat.title;
      open.title = chat.title;
      open.addEventListener('click', () => loadSaved(chat.id));

      const del = document.createElement('button');
      del.className = 'saved-delete';
      del.textContent = '×';
      del.title = 'Delete saved chat';

      del.addEventListener('click', () => {
        if (confirm('Delete this saved chat from this browser?')) {
          state.saved = state.saved.filter(c => c.id !== chat.id);
          writeSaved();
          toast('Saved chat deleted.');
        }
      });

      row.append(open, del);
      list.appendChild(row);
    });
  }

  function loadSaved(id) {
    if (state.busy) {
      return toast('Please wait for the current reply to finish.');
    }

    const chat = state.saved.find(c => c.id === id);
    if (!chat) return;

    state.messages = chat.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    renderAll();
    $('savedPanel').classList.add('hidden');
    toast('Saved conversation opened.');
  }

  function saveCurrentChat() {
    if (!state.messages.length || state.busy) return;

    const first = state.messages.find(m => m.role === 'user');

    $('chatTitle').value = first
      ? first.content.slice(0, 52).replace(/\s+/g, ' ').trim()
      : 'My decision';

    if (typeof saveDialog.showModal === 'function') {
      saveDialog.showModal();
    } else {
      toast('Your browser does not support the save dialog.');
    }
  }

  $('saveForm').addEventListener('submit', event => {
    if (event.submitter?.value === 'cancel') return;

    event.preventDefault();

    const title = $('chatTitle').value.trim();
    if (!title) return;

    const existing = state.saved.findIndex(c => c.title === title);

    const record = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random(),
      title,
      savedAt: new Date().toISOString(),
      messages: state.messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    if (existing >= 0) {
      state.saved[existing] = record;
    } else {
      state.saved.push(record);
    }

    writeSaved();
    saveDialog.close();
    toast('Saved on this device only.');
  });

  $('newChatBtn').addEventListener('click', startNewChat);

  $('forgetBtn').addEventListener('click', () => {
    if (state.busy) {
      return toast('Please wait for the current reply to finish.');
    }

    state.messages = [];
    renderAll();
    input.value = '';
    resizeInput();

    $('sidebar').classList.remove('open');
    toast('Current session forgotten. Deliberately saved chats remain.');
  });

  $('saveChatBtn').addEventListener('click', saveCurrentChat);

  $('savedToggle').addEventListener('click', () =>
    $('savedPanel').classList.toggle('hidden')
  );

  $('deleteAllSaved').addEventListener('click', () => {
    if (!state.saved.length) {
      return toast('There are no saved chats to delete.');
    }

    if (confirm('Delete every saved chat from this browser? This cannot be undone.')) {
      state.saved = [];
      writeSaved();
      toast('All saved chats deleted.');
    }
  });

  $('mobileMenu').addEventListener('click', () =>
    $('sidebar').classList.toggle('open')
  );

  $('currentChatLink').addEventListener('click', () => {
    $('sidebar').classList.remove('open');

    if (!state.messages.length) {
      welcome.scrollIntoView({ behavior: 'smooth' });
    }
  });

  document.querySelectorAll('[data-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt;
      resizeInput();
      input.focus();
    });
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('input', resizeInput);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  saveDialog.addEventListener('click', event => {
    if (event.target === saveDialog) saveDialog.close();
  });

  saveDialog.addEventListener('close', () => {
    $('chatTitle').value = '';
  });

  const reportButton = document.createElement('button');
  reportButton.className = 'text-button';
  reportButton.textContent = 'Download report';
  reportButton.style.margin = '0 0 12px 40px';
  reportButton.style.alignSelf = 'flex-start';
  reportButton.classList.add('hidden');

  conversation.insertBefore(reportButton, messagesEl);

  reportButton.addEventListener('click', () => {
    const text = [
      'ClearChoice — Decision report',
      'Created: ' + new Date().toLocaleString(),
      'This report was generated from the current in-memory session.',
      '',
      ...state.messages.map(m =>
        (m.role === 'user' ? 'YOU' : 'CLEARCHOICE') +
        '\n' + m.content + '\n'
      )
    ].join('\n');

    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'clearchoice-decision-report.txt';
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const observer = new MutationObserver(() => {
    reportButton.classList.toggle(
      'hidden',
      state.messages.length === 0
    );
  });

  observer.observe(messagesEl, { childList: true });

  state.saved = readSaved();
  renderSaved();
  renderAll();
})();
