// chatbot.js – Improved: exact color names in Ask Bot, dynamic palette generation, partial UI updates

// ---------- Color utilities (unchanged) ----------
function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) h = s = 0;
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  h %= 360;
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function generateMatchingColors(baseHex, count = 4) {
  const hsl = hexToHsl(baseHex);
  const results = [];
  const offsets = [30, -30, 180, 120, 240, 60, -60, 150, -150];
  for (let i = 0; i < offsets.length && results.length < count; i++) {
    let h = (hsl.h + offsets[i]) % 360;
    if (h < 0) h += 360;
    let s = Math.min(100, Math.max(0, hsl.s + (Math.random() * 20 - 10)));
    let l = Math.min(100, Math.max(0, hsl.l + (Math.random() * 15 - 5)));
    const hexColor = hslToHex(h, s, l);
    if (!results.includes(hexColor) && hexColor !== baseHex.toUpperCase()) {
      results.push(hexColor);
    }
  }
  while (results.length < count) {
    results.push(hslToHex((hsl.h + 60) % 360, hsl.s, hsl.l));
  }
  return results;
}

// NEW: Generate palette based on user input count
function generatePaletteFromUserInput(hexCodes) {
  const totalNeeded = 5;
  const givenCount = hexCodes.length;
  if (givenCount >= totalNeeded) return hexCodes.slice(0, totalNeeded);
  const needed = totalNeeded - givenCount;
  // Generate from the first hex only (or could use average, but first is fine)
  const generated = generateMatchingColors(hexCodes[0], needed);
  return [...hexCodes, ...generated];
}

// ---------- Color maps (local fallback) ----------
const builtinColorMap = {
  red: '#FF0000', green: '#00FF00', blue: '#0000FF', black: '#000000', white: '#FFFFFF',
  yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', orange: '#FFA500', purple: '#800080',
  pink: '#FFC0CB', brown: '#A52A2A', navy: '#000080', teal: '#008080', olive: '#808000',
  maroon: '#800000', coral: '#FF7F50', gold: '#FFD700', silver: '#C0C0C0', indigo: '#4B0082',
  violet: '#EE82EE', lime: '#00FF00', turquoise: '#40E0D0', tan: '#D2B48C', lavender: '#E6E6FA',
  crimson: '#DC143C', salmon: '#FA8072', aqua: '#00FFFF', fuchsia: '#FF00FF', gray: '#808080'
};

let customColorMap = {};

function isColorKnown(name) {
  const lower = name.toLowerCase();
  return builtinColorMap[lower] || customColorMap[lower];
}

function getExistingHex(name) {
  const lower = name.toLowerCase();
  return customColorMap[lower] || builtinColorMap[lower] || null;
}

function nameToHex(name) {
  const lower = name.toLowerCase().trim();
  return customColorMap[lower] || builtinColorMap[lower] || null;
}

function getLocalColorNameForHex(hex) {
  const upperHex = hex.toUpperCase();
  for (let [name, h] of Object.entries(customColorMap)) {
    if (h === upperHex) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  for (let [name, h] of Object.entries(builtinColorMap)) {
    if (h === upperHex) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}

async function getColorNameFromAPI(hex) {
  try {
    const cleanHex = hex.replace('#', '');
    const response = await fetch(`https://www.thecolorapi.com/id?hex=${cleanHex}&format=json`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    if (data.name && data.name.value && data.name.value !== "Unknown") {
      return data.name.value;
    }
    return null;
  } catch (err) {
    console.warn(`Color API failed for ${hex}:`, err);
    return null;
  }
}

async function getColorNamesForHexes(hexes) {
  const names = [];
  for (const hex of hexes) {
    let name = await getColorNameFromAPI(hex);
    if (!name) name = getLocalColorNameForHex(hex);
    if (name) names.push(`${name} (${hex})`);
    else names.push(hex);
  }
  return names.join(', ');
}

// ---------- Firestore helpers (unchanged) ----------
async function getUserReaction(paletteId, userId) {
  if (!userId) return null;
  try {
    const doc = await window.db.collection('palettes').doc(paletteId).collection('reactions').doc(userId).get();
    return doc.exists ? doc.data().type : null;
  } catch (err) {
    console.warn('Could not fetch reaction:', err);
    return null;
  }
}

async function handleReaction(paletteId, userId, reactionType) {
  if (!userId) {
    window.showToast('Please login to react', 'error');
    return null;
  }
  const reactionRef = window.db.collection('palettes').doc(paletteId).collection('reactions').doc(userId);
  const paletteRef = window.db.collection('palettes').doc(paletteId);
  try {
    const result = await window.db.runTransaction(async (transaction) => {
      const reactionDoc = await transaction.get(reactionRef);
      const paletteDoc = await transaction.get(paletteRef);
      if (!paletteDoc.exists) return null;
      let currentLike = paletteDoc.data().likesCount || 0;
      let currentDislike = paletteDoc.data().dislikesCount || 0;
      let oldReaction = reactionDoc.exists ? reactionDoc.data().type : null;
      if (oldReaction === reactionType) {
        transaction.delete(reactionRef);
        if (reactionType === 'like') currentLike--;
        else currentDislike--;
      } else {
        if (oldReaction) {
          if (oldReaction === 'like') currentLike--;
          else currentDislike--;
        }
        transaction.set(reactionRef, { type: reactionType, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        if (reactionType === 'like') currentLike++;
        else currentDislike++;
      }
      transaction.update(paletteRef, { likesCount: currentLike, dislikesCount: currentDislike });
      return { likes: currentLike, dislikes: currentDislike };
    });
    return result;
  } catch (err) {
    console.error('Reaction transaction failed:', err);
    window.showToast('Failed to update reaction. Try again later.', 'error');
    return null;
  }
}

async function incrementViewCount(paletteId, userId) {
  if (!userId) return;
  const paletteRef = window.db.collection('palettes').doc(paletteId);
  try {
    await paletteRef.update({ viewsCount: firebase.firestore.FieldValue.increment(1) });
  } catch (err) {
    console.warn('Could not increment view count:', err);
  }
}

async function loadCustomColors() {
  const local = localStorage.getItem('customColors');
  if (local) {
    try { customColorMap = { ...customColorMap, ...JSON.parse(local) }; } catch(e) {}
  }
  if (window.db && firebase.auth().currentUser) {
    try {
      const snapshot = await window.db.collection('customColors').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.hex) customColorMap[data.name.toLowerCase()] = data.hex.toUpperCase();
      });
      localStorage.setItem('customColors', JSON.stringify(customColorMap));
    } catch (err) {}
  }
}

// ---------- DOM and chat functions ----------
let chatMessages, chatInput, sendBtn, randomBtn;
let isProcessing = false;

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  }).replace(/\n/g, '<br>');
}

function appendMessage(sender, content, isHtml = false) {
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  const avatar = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
  let bubbleContent = isHtml ? content : escapeHtml(content);
  div.innerHTML = `<div class="avatar">${avatar}</div><div class="message-bubble">${bubbleContent}</div>`;
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth' });
  return div;
}

async function postPalette(paletteData, paletteName) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!user) {
    window.showToast('Please login to share palettes', 'error');
    return false;
  }
  try {
    const userDoc = await window.db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) { window.showToast('User profile not found', 'error'); return false; }
    const userData = userDoc.data();
    await window.db.collection('palettes').add({
      uid: user.uid,
      username: userData.username || user.email,
      userPhoto: userData.photoURL || '',
      paletteName,
      primaryColor: paletteData.primary,
      colors: paletteData.colors,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      likesCount: 0, dislikesCount: 0, viewsCount: 0
    });
    window.showToast('Posted! View on Home.', 'success');
    if (document.getElementById('homeSection')?.classList.contains('active') && window.loadPublicPalettes) {
      window.loadPublicPalettes(user);
    }
    return true;
  } catch (err) { window.showToast(err.message, 'error'); return false; }
}

function showPaletteSuggestions(inputHexes, fullPalette) {
  const primaryHex = inputHexes[0] || fullPalette[0];
  const paletteData = { primary: primaryHex, colors: fullPalette.map(hex => ({ name: '', hex })) };
  let html = `<strong>🎨 Palette for ${inputHexes.join(', ')}</strong><div class="palette-suggest">`;
  fullPalette.forEach(hex => {
    html += `<div class="swatch-item" data-hex="${hex}">
      <div class="swatch-color" style="background: ${hex};"></div>
      <div class="swatch-info">${hex}</div>
    </div>`;
  });
  html += `</div><button class="post-palette-btn"><i class="fas fa-cloud-upload-alt"></i> Post to Community</button>`;
  const msgDiv = appendMessage('bot', html, true);
  const postBtn = msgDiv.querySelector('.post-palette-btn');
  if (postBtn) {
    postBtn.addEventListener('click', async () => {
      const modal = document.getElementById('paletteNameModal');
      const input = document.getElementById('paletteNameInput');
      const confirmBtn = document.getElementById('confirmPostBtn');
      const cancelBtn = document.getElementById('cancelPostBtn');
      const closeBtn = document.querySelector('#paletteNameModal .close-palette-modal');
      input.value = `Palette ${new Date().toLocaleTimeString()}`;
      modal.style.display = 'flex';
      const handleConfirm = async () => {
        let paletteName = input.value.trim();
        if (!paletteName) { window.showToast('Please enter a palette name', 'error'); return; }
        modal.style.display = 'none';
        cleanup();
        await postPalette(paletteData, paletteName);
      };
      const handleCancel = () => { modal.style.display = 'none'; cleanup(); };
      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
        window.removeEventListener('click', outsideClickHandler);
      };
      const outsideClickHandler = (e) => { if (e.target === modal) handleCancel(); };
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      if (closeBtn) closeBtn.addEventListener('click', handleCancel);
      window.addEventListener('click', outsideClickHandler);
    });
  }
  msgDiv.querySelectorAll('.swatch-color').forEach(el => {
    el.addEventListener('click', e => {
      const hex = e.target.closest('.swatch-item')?.dataset.hex;
      if (hex) { navigator.clipboard.writeText(hex); window.showToast(`Copied ${hex}`, 'success'); }
    });
  });
}

function showSingleColorSwatch(colorName, hexCode) {
  const displayName = colorName.charAt(0).toUpperCase() + colorName.slice(1);
  const html = `<div class="palette-suggest">
    <div class="swatch-item" data-hex="${hexCode}">
      <div class="swatch-color" style="background: ${hexCode};"></div>
      <div class="swatch-info">${displayName}<br>${hexCode}</div>
    </div>
  </div>`;
  appendMessage('bot', html, true);
  setTimeout(() => {
    const swatch = document.querySelector('.message.bot:last-child .swatch-item');
    if (swatch) swatch.addEventListener('click', () => { navigator.clipboard.writeText(hexCode); window.showToast(`Copied ${hexCode}`, 'success'); });
  }, 50);
}

// ---------- Teaching helpers ----------
function parseSingleTeaching(text) {
  const patterns = [
    /(\w+)\s*=\s*#?([A-Fa-f0-9]{6})/i, /(\w+)\s*:\s*#?([A-Fa-f0-9]{6})/i,
    /(\w+)\s+is\s+#?([A-Fa-f0-9]{6})/i, /(\w+)\s+equals\s+#?([A-Fa-f0-9]{6})/i,
  ];
  for (let pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].toLowerCase();
      let hex = match[2];
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) return { name, hex: hex.toUpperCase() };
    }
  }
  return null;
}

async function saveCustomColor(name, hex) {
  const lowerName = name.toLowerCase();
  const hexUpper = hex.toUpperCase();
  customColorMap[lowerName] = hexUpper;
  localStorage.setItem('customColors', JSON.stringify(customColorMap));
  if (!window.db) return true;
  const user = firebase.auth().currentUser;
  if (!user) return true;
  try {
    const existing = await window.db.collection('customColors').where('name', '==', lowerName).get();
    if (!existing.empty) await existing.docs[0].ref.update({ hex: hexUpper });
    else await window.db.collection('customColors').add({ name: lowerName, hex: hexUpper, created: firebase.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (err) { return true; }
}

async function processTeachingBatch(userInput) {
  let lines = userInput.split(/[,\n;]+/).map(l => l.trim()).filter(l => l.length > 0);
  let newlyLearned = [], alreadyKnown = [], failed = [];
  for (let line of lines) {
    const parsed = parseSingleTeaching(line);
    if (parsed) {
      const { name, hex } = parsed;
      if (isColorKnown(name)) alreadyKnown.push(`${name} (already = ${getExistingHex(name)})`);
      else {
        const saved = await saveCustomColor(name, hex);
        if (saved) newlyLearned.push(`${name} = ${hex}`);
        else failed.push(name);
      }
    }
  }
  let reply = '';
  if (newlyLearned.length) reply += `🎉 I've learned:\n${newlyLearned.join('\n')}`;
  if (alreadyKnown.length) { if (reply) reply += '\n\n'; reply += `ℹ️ I already know:\n${alreadyKnown.join('\n')}`; }
  if (failed.length) { if (reply) reply += '\n\n'; reply += `❌ Could not save: ${failed.join(', ')}`; }
  if (reply) { appendMessage('bot', reply); return true; }
  return false;
}

// Strict hex extraction (rejects pure numbers)
function extractHexCodes(input) {
  const matches = [];
  const regex = /\b(#?[A-Fa-f0-9]{6}|#?[A-Fa-f0-9]{3})\b/g;
  let m;
  while ((m = regex.exec(input)) !== null) {
    let hex = m[1];
    const hasHash = hex.startsWith('#');
    if (!hasHash) hex = '#' + hex;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex) || /^#[0-9A-Fa-f]{3}$/.test(hex)) {
      const token = m[1];
      if (!hasHash && /^\d+$/.test(token)) continue;
      matches.push(hex);
    }
  }
  return matches;
}

// ---------- MULTI‑AI PROVIDER MANAGER ----------
const AI_PROVIDERS = [
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: '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',
    model: 'llama-3.3-70b-versatile',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' })
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: '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',
    model: 'openrouter/auto',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' })
  }
];

let currentProviderIndex = 0;

async function callAIWithFallback(messages, systemMessage, providerStartIndex = null) {
  const startIdx = (providerStartIndex !== null) ? providerStartIndex : currentProviderIndex;
  for (let i = 0; i < AI_PROVIDERS.length; i++) {
    const idx = (startIdx + i) % AI_PROVIDERS.length;
    const provider = AI_PROVIDERS[idx];
    try {
      const fullMessages = [{ role: 'system', content: systemMessage }, ...messages];
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: provider.headers(provider.key),
        body: JSON.stringify({
          model: provider.model,
          messages: fullMessages,
          temperature: 0.7,
          max_tokens: 500
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`${provider.name} failed with status ${response.status}: ${errorText}`);
        continue;
      }
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        currentProviderIndex = (idx + 1) % AI_PROVIDERS.length;
        return data.choices[0].message.content.trim();
      }
    } catch (err) {
      console.warn(`${provider.name} error:`, err);
      continue;
    }
  }
  throw new Error('All AI providers failed');
}

async function detectIntentWithAI(userMessage) {
  const systemMsg = `You are an intent classifier. Determine if the user wants to generate an image.
If yes, output ONLY the image prompt (the description of what to generate) without any extra words.
If no, output exactly "NO_IMAGE".
Be concise.`;
  const messages = [{ role: 'user', content: userMessage }];
  try {
    const result = await callAIWithFallback(messages, systemMsg);
    if (result === "NO_IMAGE") return null;
    return result;
  } catch (err) {
    console.error('Intent detection failed:', err);
    return null;
  }
}

let conversationHistory = [];

async function getUserDisplayName() {
  const user = window.getCurrentUser();
  if (!user) return 'Guest';
  try {
    const userDoc = await window.db.collection('users').doc(user.uid).get();
    if (userDoc.exists && userDoc.data().username) return userDoc.data().username;
    return user.email || 'User';
  } catch { return 'User'; }
}

async function chatWithAI(question, convHistory) {
  const userName = await getUserDisplayName();
  const systemMessage = `You are "ChromaBot", the official AI assistant of ChromaShare – a color community platform.
Website features:
- Home: Browse and share color palettes (5 colors each). Users can like, dislike, copy palette, share, and ask the bot about color names.
- ColorBot: Generate harmonious palettes from hex codes, teach the bot new color names (e.g., "mauve = #E0B0FF"), ask for color names of any hex.
- Community: Text posts, reactions (Love, Haha, Wow, Dislike), comments, follow/unfollow other users, view profiles.
- Profile: Customize avatar (upload to Cloudinary), bio, favorite color, birthday (DD-MM-YYYY), and view followers/following.

Developer Information:
- Name: Faizul Islam Riyad
- ChromaShare Profile: https://chromashare.web.app/profile?uid=faizul (or view in app)
- Project started: 2025
- Major development completed: 30 May 2026
- Role: Full-stack developer and founder of ChromaShare.

Current user: ${userName}. Answer in a friendly, helpful tone. Keep answers concise unless asked for details. If asked about the developer, provide the above information. Remember the conversation context.`;
  const messages = convHistory.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: question });
  try {
    const answer = await callAIWithFallback(messages, systemMessage);
    return answer;
  } catch (err) {
    console.error('All AI providers failed for chat:', err);
    return "Sorry, all AI services are currently unavailable. Please try again later. In the meantime, you can ask me about colors or generate palettes!";
  }
}

// Image generation (Pollinations)
async function generateImage(prompt) {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&enhance=true&nologo=false`;
    return { imageUrl, downloadUrl: imageUrl };
  } catch (err) {
    console.error('Image generation error:', err);
    return null;
  }
}

function showImageLoadingMessage() {
  const html = `<div class="image-loading-spinner">
    <i class="fas fa-spinner fa-pulse"></i>
    <span>🎨 Generating your image... please wait</span>
  </div>`;
  return appendMessage('bot', html, true);
}

function showGeneratedImage(prompt, imageUrl, downloadUrl) {
  const timestamp = Date.now();
  const filename = `ChromaShare_Generate_${timestamp}.png`;
  const html = `
    <div class="generated-image-container" id="imgContainer_${timestamp}">
      <img src="${imageUrl}" alt="Generated: ${escapeHtml(prompt)}" id="genImg_${timestamp}">
      <button class="download-image-overlay" data-url="${downloadUrl}" data-filename="${filename}" title="Download Image">
        <i class="fas fa-download"></i>
      </button>
    </div>
    <div class="image-prompt-text">✨ ${escapeHtml(prompt)}</div>
  `;
  const msgDiv = appendMessage('bot', html, true);
  const img = msgDiv.querySelector(`#genImg_${timestamp}`);
  const container = msgDiv.querySelector(`#imgContainer_${timestamp}`);
  if (img) {
    if (img.complete) container.classList.add('loaded');
    else {
      img.addEventListener('load', () => container.classList.add('loaded'));
      img.addEventListener('error', () => container.classList.add('loaded'));
    }
  }
  setTimeout(() => {
    const btn = msgDiv.querySelector('.download-image-overlay');
    if (btn) {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        const fileName = btn.dataset.filename;
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          window.showToast('Image downloaded!', 'success');
        } catch (err) {
          window.showToast('Download failed. Right-click + Save As.', 'error');
          window.open(url, '_blank');
        }
      });
    }
  }, 100);
}

// ---------- Main processUserInput (throttled, with improved palette generation) ----------
async function processUserInput(rawInput) {
  if (isProcessing) {
    window.showToast('Please wait, still processing your previous request...', 'info');
    return;
  }
  isProcessing = true;
  if (sendBtn) sendBtn.disabled = true;
  
  const input = rawInput.trim();
  appendMessage('user', input);
  
  try {
    // 1. Color name query (ask for names of hexes)
    const nameQueryMatch = input.match(/names? of (?:#?[A-F0-9]{6}(?:,?\s*#?[A-F0-9]{6})*)/i);
    if (nameQueryMatch) {
      const hexes = extractHexCodes(input);
      if (hexes.length) {
        const names = await getColorNamesForHexes(hexes);
        appendMessage('bot', `🎨 ${names}`);
        return;
      }
    }
    
    // 2. Teaching batch
    const isTeaching = await processTeachingBatch(input);
    if (isTeaching) return;
    
    // 3. Single color name (alphabetic only)
    const possibleName = input.toLowerCase().replace(/[^a-z]/g, '');
    const hexFromName = nameToHex(possibleName);
    const hasHex = extractHexCodes(input).length > 0;
    if (!hasHex && hexFromName && possibleName.length > 0 && /^[a-z]+$/.test(possibleName)) {
      showSingleColorSwatch(possibleName, hexFromName);
      return;
    }
    
    // 4. Hex codes for palette generation (NEW: dynamic count)
    let hexCodes = extractHexCodes(input);
    if (hexCodes.length > 0) {
      hexCodes = hexCodes.map(h => h.toUpperCase());
      let finalPalette;
      if (hexCodes.length >= 5) {
        finalPalette = hexCodes.slice(0, 5);
      } else {
        finalPalette = generatePaletteFromUserInput(hexCodes);
      }
      // Ensure exactly 5 colors
      while (finalPalette.length < 5) finalPalette.push('#CCCCCC');
      finalPalette = finalPalette.slice(0, 5);
      showPaletteSuggestions(hexCodes, finalPalette);
      return;
    }
    
    // 5. Image intent detection
    const imagePrompt = await detectIntentWithAI(input);
    if (imagePrompt) {
      const loadingMsg = showImageLoadingMessage();
      const result = await generateImage(imagePrompt);
      if (loadingMsg) loadingMsg.remove();
      if (result && result.imageUrl) {
        showGeneratedImage(imagePrompt, result.imageUrl, result.downloadUrl);
      } else {
        appendMessage('bot', "Sorry, I couldn't generate the image. Please try again.");
      }
      return;
    }
    
    // 6. General chat
    const thinkingMsg = appendMessage('bot', '🤔 Let me think...', false);
    const aiAnswer = await chatWithAI(input, conversationHistory);
    if (thinkingMsg) thinkingMsg.remove();
    appendMessage('bot', aiAnswer);
    
    conversationHistory.push({ role: 'user', content: input });
    conversationHistory.push({ role: 'assistant', content: aiAnswer });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    
  } catch (err) {
    console.error('processUserInput error:', err);
    appendMessage('bot', "An error occurred. Please try again later.");
  } finally {
    isProcessing = false;
    setTimeout(() => {
      if (sendBtn) sendBtn.disabled = false;
    }, 2000);
  }
}

// ---------- Home: load public palettes with partial updates ----------
window.loadPublicPalettes = async function(currentUser) {
  const grid = document.getElementById('publicPalettesGrid');
  if (!grid) return;
  
  // Show skeleton only if grid is empty (first load)
  if (grid.children.length === 0 || grid.innerHTML.includes('skeleton')) {
    const skeletonHtml = `
      <div class="skeleton-card">
        <div class="skeleton-swatch-row">
          <div class="skeleton-swatch"></div><div class="skeleton-swatch"></div>
          <div class="skeleton-swatch"></div><div class="skeleton-swatch"></div>
          <div class="skeleton-swatch"></div>
        </div>
        <div class="skeleton-content">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>`.repeat(3);
    grid.innerHTML = skeletonHtml;
  }
  
  try {
    const snap = await window.db.collection('palettes').orderBy('timestamp', 'desc').get();
    if (snap.empty) {
      grid.innerHTML = '<div class="empty-state"><i class="fas fa-palette"></i><p>No palettes yet. Generate and share one!</p></div>';
      return;
    }
    
    let html = '';
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const isOwner = currentUser && currentUser.uid === data.uid;
      const timestamp = data.timestamp ? data.timestamp.toDate() : new Date();
      const paletteId = docSnap.id;
      const hexes = data.colors.map(c => c.hex);
      const viewedKey = `viewed_${paletteId}`;
      if (currentUser && !sessionStorage.getItem(viewedKey)) {
        sessionStorage.setItem(viewedKey, 'true');
        await incrementViewCount(paletteId, currentUser.uid);
      }
      const updatedDoc = await window.db.collection('palettes').doc(paletteId).get();
      const updatedData = updatedDoc.data();
      const likesCount = updatedData?.likesCount || 0;
      const dislikesCount = updatedData?.dislikesCount || 0;
      const viewsCount = updatedData?.viewsCount || 0;
      let userReaction = null;
      if (currentUser) {
        try { userReaction = await getUserReaction(paletteId, currentUser.uid); } catch(err) {}
      }
      html += `
        <div class="palette-card" data-pid="${paletteId}">
          <div class="palette-swatch-row">
            ${data.colors.map(c => `<div class="swatch-mini" style="background:${c.hex}" data-hex="${c.hex}"></div>`).join('')}
          </div>
          <div class="card-content">
            <div class="palette-meta">
              <img src="${data.userPhoto || 'https://via.placeholder.com/48'}" class="user-avatar" onerror="this.src='https://via.placeholder.com/48'">
              <div class="meta-text">
                <div class="username">${escapeHtml(data.username)}</div>
                <div class="palette-name-line">${escapeHtml(data.paletteName).toUpperCase()}</div>
                <div class="timestamp">${timestamp.toLocaleDateString()}</div>
              </div>
            </div>
            <div class="palette-actions">
              <button class="copy-all-btn" data-hexes='${JSON.stringify(hexes)}'><i class="fas fa-copy"></i> Copy</button>
              <button class="share-palette-btn" data-name="${escapeHtml(data.paletteName)}" data-hexes='${JSON.stringify(hexes)}'><i class="fas fa-share-alt"></i> Share</button>
              <button class="ask-bot-btn" data-hexes='${JSON.stringify(hexes)}'><i class="fas fa-robot"></i> Ask Bot</button>
              ${isOwner ? `<button class="delete-btn" data-id="${paletteId}"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
            <div class="post-stats">
              <div class="reactions">
                <button class="like-btn ${userReaction === 'like' ? 'active' : ''}" data-id="${paletteId}">
                  <i class="fas fa-thumbs-up"></i> <span class="like-count">${likesCount}</span>
                </button>
                <button class="dislike-btn ${userReaction === 'dislike' ? 'active' : ''}" data-id="${paletteId}">
                  <i class="fas fa-thumbs-down"></i> <span class="dislike-count">${dislikesCount}</span>
                </button>
              </div>
              <div class="views-count"><i class="fas fa-eye"></i> ${viewsCount}</div>
            </div>
          </div>
        </div>
      `;
    }
    grid.innerHTML = html;
    
    // Attach event listeners (same as before, but delete now removes the card without reload)
    document.querySelectorAll('.copy-all-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hexes = JSON.parse(btn.dataset.hexes);
        navigator.clipboard.writeText(hexes.join(', '));
        window.showToast('Copied all colors!', 'success');
      });
    });
    
    document.querySelectorAll('.share-palette-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const paletteName = btn.dataset.name;
        const hexes = JSON.parse(btn.dataset.hexes);
        const shareText = `🎨 Check out my palette "${paletteName}": ${hexes.join(', ')} - shared via ChromaShare`;
        navigator.clipboard.writeText(shareText);
        window.showToast('Share text copied!', 'success');
      });
    });
    
    document.querySelectorAll('.ask-bot-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const hexes = JSON.parse(btn.dataset.hexes);
        const query = `What are the names of ${hexes.join(', ')}?`;
        window.showSection('chatbot');
        setTimeout(() => {
          const chatInputEl = document.getElementById('chatInput');
          if (chatInputEl) {
            chatInputEl.value = query;
            document.getElementById('sendColorBtn').click();
          }
        }, 200);
      });
    });
    
    // Like/Dislike handlers (optimistic, updates only counts)
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const paletteId = btn.dataset.id;
        const user = window.getCurrentUser();
        if (!user) { window.showToast('Please login to like', 'error'); return; }
        const result = await handleReaction(paletteId, user.uid, 'like');
        if (result) {
          btn.querySelector('.like-count').textContent = result.likes;
          const dislikeBtn = btn.closest('.post-stats').querySelector('.dislike-btn');
          dislikeBtn.querySelector('.dislike-count').textContent = result.dislikes;
          const newReaction = await getUserReaction(paletteId, user.uid);
          btn.classList.toggle('active', newReaction === 'like');
          dislikeBtn.classList.toggle('active', newReaction === 'dislike');
        }
      });
    });
    
    document.querySelectorAll('.dislike-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const paletteId = btn.dataset.id;
        const user = window.getCurrentUser();
        if (!user) { window.showToast('Please login to dislike', 'error'); return; }
        const result = await handleReaction(paletteId, user.uid, 'dislike');
        if (result) {
          btn.querySelector('.dislike-count').textContent = result.dislikes;
          const likeBtn = btn.closest('.post-stats').querySelector('.like-btn');
          likeBtn.querySelector('.like-count').textContent = result.likes;
          const newReaction = await getUserReaction(paletteId, user.uid);
          likeBtn.classList.toggle('active', newReaction === 'like');
          btn.classList.toggle('active', newReaction === 'dislike');
        }
      });
    });
    
    // Delete handler – removes card without full reload
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this palette?')) {
          try {
            await window.db.collection('palettes').doc(id).delete();
            window.showToast('Palette deleted', 'success');
            // Remove the card from DOM
            const card = btn.closest('.palette-card');
            if (card) card.remove();
            // If no cards left, show empty state
            if (document.querySelectorAll('.palette-card').length === 0) {
              document.getElementById('publicPalettesGrid').innerHTML = '<div class="empty-state"><i class="fas fa-palette"></i><p>No palettes yet. Generate and share one!</p></div>';
            }
          } catch (err) { window.showToast(err.message, 'error'); }
        }
      });
    });
    
    document.querySelectorAll('.swatch-mini').forEach(el => {
      el.addEventListener('click', () => {
        const hex = el.dataset.hex;
        if (hex) { navigator.clipboard.writeText(hex); window.showToast(`Copied ${hex}`, 'success'); }
      });
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading palettes</p></div>';
    window.showToast('Error loading community palettes', 'error');
  }
};

// ---------- Autocomplete (unchanged) ----------
let suggestionBox = null;
const commonSuggestions = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF', '#000000', '#FFFFFF',
  '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#008080', '#808000', '#3B82F6', '#EF4444',
  '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
  'red', 'green', 'blue', 'black', 'white', 'yellow', 'cyan', 'magenta', 'orange', 'purple',
  'pink', 'brown', 'navy', 'teal', 'olive', 'maroon', 'coral', 'gold', 'silver', 'indigo',
  'violet', 'lime', 'turquoise', 'tan', 'lavender', 'crimson', 'salmon', 'aqua', 'fuchsia', 'gray'
];

function createSuggestionBox() {
  if (suggestionBox) suggestionBox.remove();
  const box = document.createElement('div');
  box.className = 'chat-suggestion-box';
  box.style.position = 'absolute';
  box.style.backgroundColor = 'white';
  box.style.border = '1px solid #cbd5e1';
  box.style.borderRadius = '1rem';
  box.style.maxHeight = '200px';
  box.style.overflowY = 'auto';
  box.style.zIndex = '1000';
  box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
  box.style.display = 'none';
  document.body.appendChild(box);
  suggestionBox = box;
  return box;
}

function updateSuggestions(filterText) {
  if (!suggestionBox) createSuggestionBox();
  const filter = filterText.toLowerCase();
  let matches = commonSuggestions.filter(item => item.toLowerCase().includes(filter));
  matches = matches.slice(0, 5);
  if (matches.length === 0 || filter.length < 1) { suggestionBox.style.display = 'none'; return; }
  suggestionBox.innerHTML = '';
  matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = m;
    div.style.padding = '8px 12px';
    div.style.cursor = 'pointer';
    div.style.fontSize = '0.9rem';
    div.style.borderBottom = '1px solid #e2e8f0';
    div.onmouseenter = () => div.style.backgroundColor = '#f1f5f9';
    div.onmouseleave = () => div.style.backgroundColor = 'white';
    div.onclick = () => { chatInput.value = m; suggestionBox.style.display = 'none'; chatInput.focus(); };
    suggestionBox.appendChild(div);
  });
  const rect = chatInput.getBoundingClientRect();
  suggestionBox.style.top = rect.bottom + window.scrollY + 4 + 'px';
  suggestionBox.style.left = rect.left + window.scrollX + 'px';
  suggestionBox.style.width = rect.width + 'px';
  suggestionBox.style.display = 'block';
}

// ---------- Initialize chatbot ----------
window.initChatbot = async function() {
  chatMessages = document.getElementById('chatMessages');
  chatInput = document.getElementById('chatInput');
  sendBtn = document.getElementById('sendColorBtn');
  randomBtn = document.getElementById('randomColorBtn');
  if (!chatMessages || !chatInput || !sendBtn || !randomBtn) return;
  await loadCustomColors();
  chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
  chatInput.addEventListener('input', (e) => updateSuggestions(e.target.value));
  chatInput.addEventListener('blur', () => { setTimeout(() => { if (suggestionBox) suggestionBox.style.display = 'none'; }, 200); });
  chatInput.addEventListener('focus', () => { if (chatInput.value.length > 0) updateSuggestions(chatInput.value); });
  sendBtn.onclick = () => {
    if (isProcessing) {
      window.showToast('Please wait, still processing...', 'info');
      return;
    }
    const raw = chatInput.value.trim();
    if (!raw) return;
    processUserInput(raw);
    chatInput.value = '';
    if (suggestionBox) suggestionBox.style.display = 'none';
  };
  randomBtn.onclick = () => {
    if (isProcessing) {
      window.showToast('Please wait, still processing...', 'info');
      return;
    }
    const rand = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
    chatInput.value = rand;
    sendBtn.click();
  };
  createSuggestionBox();
};