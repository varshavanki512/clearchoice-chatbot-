(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'clearchoice_explicitly_saved_chats_v1';
  const API_URL = (document.body.dataset.apiUrl || '') + '/api/chat';
  const REQUEST_TIMEOUT_MS = 90000; // allows for free-tier cold starts
  const MAX_SAVED = 50;
  const state = { messages: [], busy: false, saved: [] };

  const welcome = $('welcome'), conversation = $('conversation'), messagesEl = $('messages');
  const input = $('messageInput'), form = $('chatForm'), sendBtn = $('sendBtn');
  const typing = $('typing'), saveBtn = $('saveChatBtn'), saveDialog = $('saveDialog');
  let toastTimer;

  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Markdown (safe: all text is escaped before any tags are added) ----------
  function inline(raw) {
    const codes = [];
    let s = escapeHTML(raw).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/__(.+?)__/g, '<strong>$1</strong>')
         .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>')
         .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  }

  const RE = {
    fence: /^\s*```/, hr: /^\s*(-{3,}|\*{3,}|_{3,})\s*$/, heading: /^(#{1,6})\s+(.*)$/,
    ul: /^\s*[-*+]\s+(.*)$/, ol: /^\s*\d+[.)]\s+(.*)$/, quote: /^\s*>\s?(.*)$/,
    tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
  };
  const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  function isBlockStart(line, next) {
    return RE.fence.test(line) || RE.hr.test(line) || RE.heading.test(line) || RE.ul.test(line) ||
      RE.ol.test(line) || RE.quote.test(line) || (line.includes('|') && next !== undefined && RE.tableSep.test(next));
  }

  function markdown(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const out = []; let i = 0, m;
    while (i < lines.length) {
      const line = lines[i];
      if (RE.fence.test(line)) {
        const code = []; i++;
        while (i < lines.length && !RE.fence.test(lines[i])) code.push(lines[i++]);
        i++; out.push('<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>'); continue;
      }
      if (!line.trim()) { i++; continue; }
      if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }
      if ((m = line.match(RE.heading))) { const l = Math.min(m[1].length, 4); out.push(`<h${l}>${inline(m[2])}</h${l}>`); i++; continue; }
      if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
        const head = splitRow(line); i += 2; const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (RE.ul.test(line) || RE.ol.test(line)) {
        const ordered = RE.ol.test(line), re = ordered ? RE.ol : RE.ul, items = [];
        while (i < lines.length && (m = lines[i].match(re))) { items.push(m[1]); i++; }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>` + items.map(t => `<li>${inline(t)}</li>`).join('') + `</${tag}>`); continue;
      }
      if (RE.quote.test(line)) {
        const q = [];
        while (i < lines.length && (m = lines[i].match(RE.quote))) { q.push(m[1]); i++; }
        out.push('<blockquote>' + inline(q.join('\n')).replace(/\n/g, '<br>') + '</blockquote>'); continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i], lines[i + 1]))) para.push(lines[i++]);
      out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('');
  }

  // ---------- Rendering ----------
  function renderMessage(m, isLast) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const wrap = document.createElement('article'); wrap.className = 'message ' + role;
    const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'user' ? '●' : '✳';
    const body = document.createElement('div'); body.className = 'message-body';
    const name = document.createElement('div'); name.className = 'message-name'; name.textContent = role === 'user' ? 'YOU' : 'CLEARCHOICE';
    const bubble = document.createElement('div'); bubble.className = 'bubble';
    if (role === 'user') bubble.textContent = m.content; else bubble.innerHTML = markdown(m.content);
    body.append(name, bubble);
    if (m.error && isLast) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = 'Try again';
      retry.addEventListener('click', retryLast); body.appendChild(retry);
    }
    wrap.append(avatar, body); messagesEl.appendChild(wrap);
  }

  function renderAll() {
    messagesEl.replaceChildren();
    state.messages.forEach((m, idx) => renderMessage(m, idx === state.messages.length - 1));
    const has = state.messages.length > 0;
    welcome.classList.toggle('hidden', has); conversation.classList.toggle('hidden', !has);
    saveBtn.disabled = !has || state.busy;
    reportButton.classList.toggle('hidden', !has);
    if (has) messagesEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setBusy(busy) {
    state.busy = busy; sendBtn.disabled = busy; input.disabled = busy;
    typing.classList.toggle('hidden', !busy);
    saveBtn.disabled = busy || state.messages.length === 0;
    if (busy) typing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- Chat ----------
  const persistable = () => state.messages.filter(m => !m.error).map(({ role, content }) => ({ role, content }));

  async function requestReply() {
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: persistable() }), signal: controller.signal
      });
      let data = {};
      try { data = await response.json(); } catch { /* non-JSON response */ }
      if (!response.ok) throw new Error(data.error || `The server returned an error (${response.status}).`);
      if (!data.reply) throw new Error('The server returned an empty reply.');
      state.messages.push({ role: 'assistant', content: data.reply });
    } catch (error) {
      let msg = error.message || 'Something went wrong.';
      if (error.name === 'AbortError') msg = 'The server took too long to respond. It may be waking up — please try again.';
      else if (error instanceof TypeError) msg = 'Could not reach the server. Check your connection and try again.';
      state.messages.push({ role: 'assistant', content: '**I could not get a reply.**\n\n' + msg, error: true });
      toast('Message could not be sent.');
    } finally {
      clearTimeout(timer); setBusy(false); renderAll();
      if (!window.matchMedia('(pointer: coarse)').matches) input.focus();
    }
  }

  function sendMessage(text) {
    const value = text.trim(); if (!value || state.busy) return;
    state.messages = state.messages.filter(m => !m.error);
    state.messages.push({ role: 'user', content: value });
    renderAll(); input.value = ''; resizeInput(); requestReply();
  }

  function retryLast() {
    if (state.busy) return;
    state.messages = state.messages.filter(m => !m.error); renderAll(); requestReply();
  }

  function resizeInput() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }

  function startNewChat() {
    if (state.busy) return toast('Please wait for the current reply to finish.');
    state.messages = []; renderAll(); input.value = ''; resizeInput(); input.focus();
    $('sidebar').classList.remove('open'); toast('New private session started.');
  }

  // ---------- Saved chats (explicit, local only) ----------
  function readSaved() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(v)) return [];
      return v.filter(c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages))
        .map(c => ({ id: c.id, title: c.title, messages: c.messages
          .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map(m => ({ role: m.role, content: m.content })) }));
    } catch { return []; }
  }

  function writeSaved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved)); }
    catch { toast('Could not save. Browser storage may be full or disabled.'); }
    renderSaved();
  }

  function renderSaved() {
    $('savedCount').textContent = state.saved.length;
    const list = $('savedList'); list.replaceChildren();
    if (!state.saved.length) { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'No saved chats yet.'; list.appendChild(p); return; }
    state.saved.slice().reverse().forEach(chat => {
      const row = document.createElement('div'); row.className = 'saved-item';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'saved-open'; open.textContent = chat.title; open.title = chat.title;
      open.addEventListener('click', () => loadSaved(chat.id));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'saved-delete'; del.textContent = '×'; del.title = 'Delete saved chat'; del.setAttribute('aria-label', 'Delete saved chat ' + chat.title);
      del.addEventListener('click', () => {
        if (confirm('Delete this saved chat from this browser?')) { state.saved = state.saved.filter(c => c.id !== chat.id); writeSaved(); toast('Saved chat deleted.'); }
      });
      row.append(open, del); list.appendChild(row);
    });
  }

  function loadSaved(id) {
    if (state.busy) return toast('Please wait for the current reply to finish.');
    const chat = state.saved.find(c => c.id === id); if (!chat) return;
    state.messages = chat.messages.map(m => ({ ...m })); renderAll();
    $('savedPanel').classList.add('hidden'); $('savedToggle').setAttribute('aria-expanded', 'false');
    $('sidebar').classList.remove('open'); toast('Saved conversation opened.');
  }

  function saveCurrentChat() {
    const msgs = persistable();
    if (!msgs.length || state.busy) return;
    const first = msgs.find(m => m.role === 'user');
    $('chatTitle').value = first ? first.content.slice(0, 52).replace(/\s+/g, ' ').trim() : 'My decision';
    if (typeof saveDialog.showModal === 'function') saveDialog.showModal(); else toast('Your browser does not support the save dialog.');
  }

  $('saveForm').addEventListener('submit', event => {
    if (event.submitter && event.submitter.value === 'cancel') return; // native dialog close
    event.preventDefault();
    const title = $('chatTitle').value.trim(); if (!title) return;
    const idx = state.saved.findIndex(c => c.title === title);
    const record = {
      id: idx >= 0 ? state.saved[idx].id : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title, messages: persistable()
    };
    if (idx >= 0) state.saved[idx] = record;
    else { state.saved.push(record); if (state.saved.length > MAX_SAVED) state.saved.shift(); }
    writeSaved(); saveDialog.close(); toast('Saved on this device only.');
  });

  // ---------- Download report ----------
  const reportButton = document.createElement('button');
  reportButton.type = 'button'; reportButton.className = 'text-button hidden'; reportButton.textContent = 'Download report';
  reportButton.style.margin = '0 0 12px 40px'; reportButton.style.alignSelf = 'flex-start';
  conversation.insertBefore(reportButton, messagesEl);
  reportButton.addEventListener('click', () => {
    const text = ['ClearChoice — Decision report', 'Created: ' + new Date().toLocaleString(), 'Generated from the current in-memory session.', '',
      ...persistable().map(m => (m.role === 'user' ? 'YOU' : 'CLEARCHOICE') + '\n' + m.content + '\n')].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'clearchoice-decision-report.txt';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---------- Wiring ----------
  $('newChatBtn').addEventListener('click', startNewChat);
  $('forgetBtn').addEventListener('click', () => {
    if (state.busy) return toast('Please wait for the current reply to finish.');
    state.messages = []; renderAll(); input.value = ''; resizeInput(); $('sidebar').classList.remove('open');
    toast('Current session forgotten. Deliberately saved chats remain.');
  });
  $('saveChatBtn').addEventListener('click', saveCurrentChat);
  $('savedToggle').addEventListener('click', () => {
    const hidden = $('savedPanel').classList.toggle('hidden'); $('savedToggle').setAttribute('aria-expanded', String(!hidden));
  });
  $('deleteAllSaved').addEventListener('click', () => {
    if (!state.saved.length) return toast('There are no saved chats to delete.');
    if (confirm('Delete every saved chat from this browser? This cannot be undone.')) { state.saved = []; writeSaved(); toast('All saved chats deleted.'); }
  });
  $('mobileMenu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('currentChatLink').addEventListener('click', () => { $('sidebar').classList.remove('open'); if (!state.messages.length) welcome.scrollIntoView({ behavior: 'smooth' }); });
  document.querySelectorAll('[data-prompt]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.prompt; resizeInput(); input.focus(); }));
  form.addEventListener('submit', e => { e.preventDefault(); sendMessage(input.value); });
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  saveDialog.addEventListener('click', e => { if (e.target === saveDialog) saveDialog.close(); });
  saveDialog.addEventListener('close', () => { $('chatTitle').value = ''; });

  state.saved = readSaved(); renderSaved(); renderAll();
})();
