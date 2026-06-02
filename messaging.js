// messaging.js – Real‑time chat (Messenger style) with delete, clear chat, disappearing mode, online status, unread badge

let currentChatConversations = [];
let currentActiveChat = null;
let messagesUnsubscribe = null;
let presenceUnsubscribe = null;
let disappearingTimers = {};

// ========== Helper functions ==========
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  }).replace(/\n/g, '<br>');
}

function timeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

const MESSAGING_DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"%3E%3C/path%3E%3Ccircle cx="12" cy="7" r="4"%3E%3C/circle%3E%3C/svg%3E';

function getConversationId(user1Id, user2Id) {
  return user1Id < user2Id ? `${user1Id}_${user2Id}` : `${user2Id}_${user1Id}`;
}

// ========== Online / Offline Presence ==========
function initPresence() {
  const user = window.getCurrentUser();
  if (!user) return;
  
  const userStatusRef = window.db.collection('users').doc(user.uid);
  const userStatusOnline = {
    online: true,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  userStatusRef.update(userStatusOnline).catch(() => userStatusRef.set(userStatusOnline));
  
  window.db.collection('users').doc(user.uid).onDisconnect().set({
    online: false,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// ========== Load Conversations ==========
async function loadConversations() {
  const currentUser = window.getCurrentUser();
  if (!currentUser) return [];

  const following = await window.db.collection('follows').where('followerId', '==', currentUser.uid).get();
  const followingIds = following.docs.map(doc => doc.data().followingId);
  const followers = await window.db.collection('follows').where('followingId', '==', currentUser.uid).get();
  const followerIds = followers.docs.map(doc => doc.data().followerId);
  const allRelatedIds = [...new Set([...followingIds, ...followerIds])];
  if (allRelatedIds.length === 0) return [];

  const userProfiles = {};
  for (const id of allRelatedIds) {
    const userDoc = await window.db.collection('users').doc(id).get();
    if (userDoc.exists) userProfiles[id] = userDoc.data();
  }

  const conversations = [];
  for (const otherId of allRelatedIds) {
    const convId = getConversationId(currentUser.uid, otherId);
    const convDoc = await window.db.collection('conversations').doc(convId).get();
    let lastMessage = null, lastUpdated = null, unread = false, disappearingMode = false;
    if (convDoc.exists) {
      const data = convDoc.data();
      lastMessage = data.lastMessage || '';
      lastUpdated = data.lastUpdated?.toDate() || null;
      unread = data.unreadCounts?.[currentUser.uid] > 0;
      disappearingMode = data.disappearingMode || false;
    }
    conversations.push({
      conversationId: convId,
      otherUserId: otherId,
      otherUserName: userProfiles[otherId]?.username || 'User',
      otherUserPhoto: userProfiles[otherId]?.photoURL || MESSAGING_DEFAULT_AVATAR,
      lastMessage,
      lastUpdated,
      unread,
      disappearingMode,
      otherUserOnline: userProfiles[otherId]?.online || false
    });
  }
  conversations.sort((a, b) => (b.lastUpdated?.getTime() || 0) - (a.lastUpdated?.getTime() || 0));
  currentChatConversations = conversations;
  renderConversationList();
  updateTotalUnreadBadge();
  return conversations;
}

function renderConversationList() {
  const listContainer = document.getElementById('conversationList');
  if (!listContainer) return;
  if (currentChatConversations.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">No conversations yet. Follow someone to start chatting.</div>';
    return;
  }
  let html = '';
  for (const conv of currentChatConversations) {
    const timeStr = conv.lastUpdated ? timeAgo(conv.lastUpdated) : '';
    const onlineDot = conv.otherUserOnline ? '<span class="online-dot"></span>' : '';
    html += `
      <div class="conversation-item" data-conv-id="${conv.conversationId}" data-other-id="${conv.otherUserId}" data-other-name="${escapeHtml(conv.otherUserName)}" data-other-photo="${conv.otherUserPhoto}">
        <div class="conv-avatar-wrapper">
          <img src="${conv.otherUserPhoto}" class="conv-avatar" onerror="this.src='${MESSAGING_DEFAULT_AVATAR}'">
          ${onlineDot}
        </div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(conv.otherUserName)}</div>
          <div class="conv-last-msg">${escapeHtml(conv.lastMessage || 'No messages yet')}</div>
        </div>
        ${conv.unread ? '<div class="conv-unread-dot"></div>' : ''}
        <div class="conv-time">${timeStr}</div>
      </div>
    `;
  }
  listContainer.innerHTML = html;
  document.querySelectorAll('.conversation-item').forEach(el => {
    el.addEventListener('click', () => {
      const convId = el.dataset.convId;
      const otherId = el.dataset.otherId;
      const otherName = el.dataset.otherName;
      const otherPhoto = el.dataset.otherPhoto;
      openChatConversation(convId, otherId, otherName, otherPhoto);
    });
  });
}

// ========== Open Chat ==========
async function openChatConversation(convId, otherUserId, otherUserName, otherUserPhoto) {
  if (messagesUnsubscribe) messagesUnsubscribe();
  currentActiveChat = { conversationId: convId, otherUserId, otherUserName, otherUserPhoto };
  
  // Set chat header
  document.getElementById('chatModalTitle').innerText = otherUserName;
  const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
  if (chatHeaderAvatar) {
    chatHeaderAvatar.src = otherUserPhoto || MESSAGING_DEFAULT_AVATAR;
    chatHeaderAvatar.onerror = () => { chatHeaderAvatar.src = MESSAGING_DEFAULT_AVATAR; };
  }
  
  // Update online status dot in header
  updateHeaderOnlineStatus(otherUserId);
  
  // --- FIX: Ensure 3-dot menu button exists and attach click handler ---
  let menuBtn = document.querySelector('.chat-header-menu');
  if (!menuBtn) {
    const header = document.querySelector('.chat-header');
    menuBtn = document.createElement('button');
    menuBtn.className = 'chat-header-menu';
    menuBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    header.appendChild(menuBtn);
  }
  // Attach handler using onclick to prevent duplicates
  menuBtn.onclick = showChatMenu;
  
  const messagesContainer = document.getElementById('chatMessagesContainer');
  messagesContainer.innerHTML = '<div class="loading">Loading messages...</div>';
  document.getElementById('conversationList').style.display = 'none';
  document.getElementById('chatView').style.display = 'flex';
  
  const currentUser = window.getCurrentUser();
  if (currentUser) {
    const convRef = window.db.collection('conversations').doc(convId);
    const convDoc = await convRef.get();
    if (!convDoc.exists) {
      await convRef.set({
        participants: [currentUser.uid, otherUserId],
        lastMessage: '',
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        unreadCounts: {},
        disappearingMode: false
      });
    }
    // Clear unread count for current user
    await convRef.update({
      [`unreadCounts.${currentUser.uid}`]: firebase.firestore.FieldValue.delete()
    });
    loadConversations(); // refresh list to remove unread dot
    
    // Mark messages as read to trigger disappearing deletion
    const messagesSnap = await convRef.collection('messages').where('read', '==', false).get();
    messagesSnap.forEach(doc => {
      doc.ref.update({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() });
      if (convDoc.data()?.disappearingMode) {
        scheduleMessageDeletion(convId, doc.id);
      }
    });
  }
  
  // Real-time messages listener
  messagesUnsubscribe = window.db.collection('conversations').doc(convId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      const messages = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.deletedFor && data.deletedFor.includes(currentUser.uid)) return;
        messages.push({ id: doc.id, ...data });
      });
      renderMessages(messages);
    });
  
  // Subscribe to online status of other user
  if (presenceUnsubscribe) presenceUnsubscribe();
  presenceUnsubscribe = window.db.collection('users').doc(otherUserId)
    .onSnapshot(doc => {
      if (doc.exists) updateHeaderOnlineStatus(doc.data().online);
    });
}

function updateHeaderOnlineStatus(userId) {
  window.db.collection('users').doc(userId).get().then(doc => {
    const online = doc.exists && doc.data().online;
    const header = document.querySelector('.chat-header');
    let dot = header.querySelector('.online-dot-header');
    if (!dot && online) {
      dot = document.createElement('span');
      dot.className = 'online-dot-header';
      header.appendChild(dot);
    } else if (dot && !online) {
      dot.remove();
    }
  });
}

function scheduleMessageDeletion(convId, messageId, delay = 10000) {
  if (disappearingTimers[messageId]) clearTimeout(disappearingTimers[messageId]);
  disappearingTimers[messageId] = setTimeout(async () => {
    const convRef = window.db.collection('conversations').doc(convId);
    const convDoc = await convRef.get();
    if (convDoc.exists && convDoc.data().disappearingMode) {
      await convRef.collection('messages').doc(messageId).delete();
    }
    delete disappearingTimers[messageId];
  }, delay);
}

// ========== Render Messages with Delete Button (sender only) ==========
function renderMessages(messages) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;
  if (messages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
    return;
  }
  const currentUser = window.getCurrentUser();
  let html = '';
  for (const msg of messages) {
    const isMe = msg.senderId === currentUser.uid;
    const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
    const deleteBtn = isMe ? `<button class="delete-message-btn" data-id="${msg.id}" data-conv-id="${msg.convId || currentActiveChat.conversationId}"><i class="fas fa-trash-alt"></i></button>` : '';
    html += `
      <div class="chat-message ${isMe ? 'me' : 'other'}" data-msg-id="${msg.id}">
        <div class="chat-bubble">
          ${escapeHtml(msg.text)}
          ${deleteBtn}
        </div>
        <div class="chat-time">${timeStr}</div>
      </div>
    `;
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  
  // Attach delete handlers
  document.querySelectorAll('.delete-message-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.id;
      const convId = btn.dataset.convId;
      if (confirm('Delete this message? It will be removed for everyone.')) {
        await deleteMessage(convId, msgId);
      }
    });
  });
}

async function deleteMessage(convId, messageId) {
  const msgRef = window.db.collection('conversations').doc(convId).collection('messages').doc(messageId);
  const msgDoc = await msgRef.get();
  const data = msgDoc.data();
  const currentUser = window.getCurrentUser();
  if (data.senderId === currentUser.uid) {
    await msgRef.delete();
  } else {
    window.showToast('You can only delete your own messages', 'error');
  }
}

async function clearChat(convId) {
  if (!confirm('Delete ALL messages in this conversation? This cannot be undone.')) return;
  const messagesSnap = await window.db.collection('conversations').doc(convId).collection('messages').get();
  const batch = window.db.batch();
  messagesSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  await window.db.collection('conversations').doc(convId).update({
    lastMessage: '',
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  });
  window.showToast('Chat cleared', 'success');
}

async function toggleDisappearingMode(convId) {
  const convRef = window.db.collection('conversations').doc(convId);
  const convDoc = await convRef.get();
  const currentMode = convDoc.data()?.disappearingMode || false;
  await convRef.update({ disappearingMode: !currentMode });
  window.showToast(`Disappearing mode ${!currentMode ? 'ON' : 'OFF'}`, 'success');
  loadConversations(); // refresh list
}

function showChatMenu() {
  const convId = currentActiveChat.conversationId;
  const menu = document.createElement('div');
  menu.className = 'chat-menu-dropdown';
  menu.innerHTML = `
    <div class="chat-menu-item" data-action="clear">Clear Chat</div>
    <div class="chat-menu-item" data-action="disappear">Toggle Disappearing Mode</div>
  `;
  document.body.appendChild(menu);
  const rect = document.querySelector('.chat-header-menu').getBoundingClientRect();
  menu.style.top = rect.bottom + window.scrollY + 5 + 'px';
  menu.style.right = window.innerWidth - rect.right + 'px';
  menu.style.position = 'absolute';
  menu.style.zIndex = 2000;
  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (action === 'clear') await clearChat(convId);
    if (action === 'disappear') await toggleDisappearingMode(convId);
    menu.remove();
  });
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) menu.remove();
    document.removeEventListener('click', closeHandler);
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 100);
}

// ========== Send Message ==========
async function sendMessage(text) {
  if (!currentActiveChat) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) { window.showToast('Please login to send messages', 'error'); return; }
  const convRef = window.db.collection('conversations').doc(currentActiveChat.conversationId);
  const newMessage = {
    senderId: currentUser.uid,
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false,
    convId: currentActiveChat.conversationId
  };
  try {
    await window.db.runTransaction(async (transaction) => {
      const convDoc = await transaction.get(convRef);
      if (!convDoc.exists) {
        transaction.set(convRef, {
          participants: [currentUser.uid, currentActiveChat.otherUserId],
          lastMessage: text,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          unreadCounts: { [currentActiveChat.otherUserId]: firebase.firestore.FieldValue.increment(1) },
          disappearingMode: false
        });
      } else {
        transaction.update(convRef, {
          lastMessage: text,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          [`unreadCounts.${currentActiveChat.otherUserId}`]: firebase.firestore.FieldValue.increment(1)
        });
      }
      const messagesRef = convRef.collection('messages');
      transaction.set(messagesRef.doc(), newMessage);
    });
    const textarea = document.getElementById('chatInputField');
    textarea.value = '';
    textarea.style.height = 'auto';
    window.showToast('Message sent', 'success');
    updateTotalUnreadBadge();
  } catch (err) {
    console.error("Send message error:", err);
    window.showToast('Failed to send message: ' + err.message, 'error');
  }
}

// ========== Update Floating Button Unread Badge ==========
function updateTotalUnreadBadge() {
  const totalUnread = currentChatConversations.reduce((sum, conv) => sum + (conv.unread ? 1 : 0), 0);
  const chatBtn = document.getElementById('chatFloatingBtn');
  if (!chatBtn) return;
  let chatBadge = chatBtn.querySelector('.chat-unread-badge');
  if (!chatBadge && totalUnread > 0) {
    chatBadge = document.createElement('span');
    chatBadge.className = 'chat-unread-badge';
    chatBtn.appendChild(chatBadge);
  }
  if (chatBadge) {
    if (totalUnread > 0) {
      chatBadge.style.display = 'inline-flex';
      chatBadge.innerText = totalUnread > 9 ? '9+' : totalUnread;
    } else {
      chatBadge.style.display = 'none';
    }
  }
}

// ========== Modal Controls ==========
function openChatModal() {
  document.getElementById('conversationList').style.display = 'block';
  document.getElementById('chatView').style.display = 'none';
  loadConversations();
  document.getElementById('chatModal').style.display = 'flex';
  
  const floatingBtns = document.querySelector('.floating-buttons');
  if (floatingBtns) {
    floatingBtns.style.display = 'none';
  }
}

function closeChatModal() {
  document.getElementById('chatModal').style.display = 'none';
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
  currentActiveChat = null;
  // Remove menu button if dynamically created (optional)
  const menuBtn = document.querySelector('.chat-header-menu');
  if (menuBtn && !menuBtn.hasAttribute('data-original')) {
    menuBtn.remove();
  }
  const floatingBtns = document.querySelector('.floating-buttons');
  if (floatingBtns) {
    floatingBtns.style.display = 'flex';
  }
}

// ========== Initialize Messaging ==========
function initMessaging() {
  const sendBtn = document.getElementById('chatSendBtn');
  const textarea = document.getElementById('chatInputField');
  
  if (sendBtn && textarea) {
    sendBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (text) sendMessage(text);
    });
    
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }
  
  const backBtn = document.getElementById('backToConvBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('conversationList').style.display = 'block';
      document.getElementById('chatView').style.display = 'none';
      if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
      }
      if (presenceUnsubscribe) {
        presenceUnsubscribe();
        presenceUnsubscribe = null;
      }
      currentActiveChat = null;
      loadConversations();
    });
  }
  
  const closeBtns = document.querySelectorAll('#chatModal .close, #chatModal .close-modal');
  closeBtns.forEach(btn => btn.addEventListener('click', closeChatModal));
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('chatModal');
    if (e.target === modal) closeChatModal();
  });
  
  initPresence();
}

window.openChatModal = openChatModal;
window.initMessaging = initMessaging;
window.loadConversations = loadConversations;