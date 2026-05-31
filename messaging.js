// messaging.js – Real‑time chat (Messenger style)

let currentChatConversations = [];
let currentActiveChat = null;
let messagesUnsubscribe = null;

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

const MESSAGING_DEFAULT_AVATAR = (typeof DEFAULT_AVATAR !== 'undefined') ? DEFAULT_AVATAR : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"%3E%3C/path%3E%3Ccircle cx="12" cy="7" r="4"%3E%3C/circle%3E%3C/svg%3E';

function getConversationId(user1Id, user2Id) {
  return user1Id < user2Id ? `${user1Id}_${user2Id}` : `${user2Id}_${user1Id}`;
}

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
    let lastMessage = null, lastUpdated = null, unread = false;
    if (convDoc.exists) {
      const data = convDoc.data();
      lastMessage = data.lastMessage || '';
      lastUpdated = data.lastUpdated?.toDate() || null;
      unread = data.unreadCounts?.[currentUser.uid] > 0;
    }
    conversations.push({
      conversationId: convId,
      otherUserId: otherId,
      otherUserName: userProfiles[otherId]?.username || 'User',
      otherUserPhoto: userProfiles[otherId]?.photoURL || MESSAGING_DEFAULT_AVATAR,
      lastMessage,
      lastUpdated,
      unread
    });
  }
  conversations.sort((a, b) => (b.lastUpdated?.getTime() || 0) - (a.lastUpdated?.getTime() || 0));
  currentChatConversations = conversations;
  renderConversationList();
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
    html += `
      <div class="conversation-item" data-conv-id="${conv.conversationId}" data-other-id="${conv.otherUserId}" data-other-name="${escapeHtml(conv.otherUserName)}" data-other-photo="${conv.otherUserPhoto}">
        <img src="${conv.otherUserPhoto}" class="conv-avatar" onerror="this.src='${MESSAGING_DEFAULT_AVATAR}'">
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

async function openChatConversation(convId, otherUserId, otherUserName, otherUserPhoto) {
  if (messagesUnsubscribe) messagesUnsubscribe();
  currentActiveChat = { conversationId: convId, otherUserId, otherUserName, otherUserPhoto };
  
  // Set chat header name and avatar
  document.getElementById('chatModalTitle').innerText = otherUserName;
  const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
  if (chatHeaderAvatar) {
    chatHeaderAvatar.src = otherUserPhoto || MESSAGING_DEFAULT_AVATAR;
    chatHeaderAvatar.onerror = () => { chatHeaderAvatar.src = MESSAGING_DEFAULT_AVATAR; };
  }
  
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
        unreadCounts: {}
      });
    }
    await convRef.update({
      [`unreadCounts.${currentUser.uid}`]: firebase.firestore.FieldValue.delete()
    });
    loadConversations();
  }
  messagesUnsubscribe = window.db.collection('conversations').doc(convId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      const messages = [];
      snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
      renderMessages(messages);
    });
}

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
    html += `
      <div class="chat-message ${isMe ? 'me' : 'other'}">
        <div class="chat-bubble">${escapeHtml(msg.text)}</div>
        <div class="chat-time">${timeStr}</div>
      </div>
    `;
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

async function sendMessage(text) {
  if (!currentActiveChat) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) { window.showToast('Please login to send messages', 'error'); return; }
  const convRef = window.db.collection('conversations').doc(currentActiveChat.conversationId);
  const newMessage = {
    senderId: currentUser.uid,
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await window.db.runTransaction(async (transaction) => {
      const convDoc = await transaction.get(convRef);
      if (!convDoc.exists) {
        transaction.set(convRef, {
          participants: [currentUser.uid, currentActiveChat.otherUserId],
          lastMessage: text,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          unreadCounts: { [currentActiveChat.otherUserId]: firebase.firestore.FieldValue.increment(1) }
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
    // Clear and reset textarea
    const textarea = document.getElementById('chatInputField');
    textarea.value = '';
    textarea.style.height = 'auto';
    window.showToast('Message sent', 'success');
  } catch (err) {
    console.error("Send message error:", err);
    window.showToast('Failed to send message: ' + err.message, 'error');
  }
}

function openChatModal() {
  // Reset to conversation list view
  document.getElementById('conversationList').style.display = 'block';
  document.getElementById('chatView').style.display = 'none';
  loadConversations();
  document.getElementById('chatModal').style.display = 'flex';
}

function closeChatModal() {
  document.getElementById('chatModal').style.display = 'none';
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  currentActiveChat = null;
}

function initMessaging() {
  const sendBtn = document.getElementById('chatSendBtn');
  const textarea = document.getElementById('chatInputField');
  
  if (sendBtn && textarea) {
    sendBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (text) {
        sendMessage(text);
      }
    });
    
    // Auto-resize textarea as user types
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    // Send on Ctrl+Enter
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }
  
  // Back button handler
  const backBtn = document.getElementById('backToConvBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('conversationList').style.display = 'block';
      document.getElementById('chatView').style.display = 'none';
      if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
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
}

window.openChatModal = openChatModal;
window.initMessaging = initMessaging;
window.loadConversations = loadConversations;