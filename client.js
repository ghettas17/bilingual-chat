
// Client side
const params = new URLSearchParams(location.search);
const userId = params.get('userId') || `user-${Math.random().toString(36).slice(2,6)}`;
const conversationId = 'demo-1'; // 1:1 demo room

const autoTranslateEl = document.getElementById('autoTranslate');
const targetLangEl = document.getElementById('targetLang');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const messagesEl = document.getElementById('messages');

// Connect socket with userId
const socket = io({ query: { userId } });

function setDirByLang(lang) {
  const rtl = (lang === 'ar');
  messagesEl.dir = rtl ? 'rtl' : 'ltr';
  inputEl.dir = rtl ? 'rtl' : 'ltr';
}
setDirByLang(targetLangEl.value);

socket.on('connect', () => {
  socket.emit('presence:join', { conversationId });
  socket.emit('prefs:set', { peerId: 'peer', autoTranslate: autoTranslateEl.checked, targetLang: targetLangEl.value });
});

socket.on('presence:state', ({ usersOnline }) => {
  // Optionally show presence; not displayed in UI for simplicity
  console.log('Online in room:', usersOnline);
});

socket.on('prefs:sync', (prefs) => {
  console.log('Prefs synced:', prefs);
});

socket.on('message:new', (m) => {
  const el = document.createElement('div');
  el.className = 'msg ' + (m.senderId === userId ? 'me' : 'you');
  el.textContent = m.text;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `from ${m.senderId} • src=${m.original_lang}`;
  el.appendChild(meta);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

autoTranslateEl.addEventListener('change', () => {
  socket.emit('prefs:set', { peerId: 'peer', autoTranslate: autoTranslateEl.checked, targetLang: targetLangEl.value });
});
targetLangEl.addEventListener('change', () => {
  setDirByLang(targetLangEl.value);
  socket.emit('prefs:set', { peerId: 'peer', autoTranslate: autoTranslateEl.checked, targetLang: targetLangEl.value });
});

function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('message:send', { conversationId, text });
  inputEl.value = '';
}
sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
