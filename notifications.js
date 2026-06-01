// notifications.js - Final: closes both modals on action

let notificationsUnsubscribe = null;
let currentNotifications = [];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;').replace(/\n/g, '<br>');
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

async function createNotification(targetUserId, type, fromUserId, postId = null, extraText = '') {
  if (!targetUserId || targetUserId === fromUserId) return;
  const fromUserDoc = await window.db.collection('users').doc(fromUserId).get();
  const fromUserName = fromUserDoc.exists ? fromUserDoc.data().username : 'Someone';
  let message = '';
  switch(type) {
    case 'follow': message = `${fromUserName} followed you`; break;
    case 'love': message = `${fromUserName} loved your post`; break;
    case 'haha': message = `${fromUserName} laughed at your post`; break;
    case 'wow': message = `${fromUserName} was amazed by your post`; break;
    case 'sad': message = `${fromUserName} felt sad about your post`; break;
    case 'dislike': message = `${fromUserName} disliked your post`; break;
    case 'comment': message = `${fromUserName} commented on your post: "${extraText.substring(0, 50)}"`; break;
    default: return;
  }
  await window.db.collection('notifications').add({
    userId: targetUserId, type, fromUserId, fromUserName, postId: postId || null,
    message, extraText: extraText || null,
    read: false, timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  updateNotificationCount();
}

async function getPostData(postId) {
  if (!postId) return null;
  const doc = await window.db.collection('posts').doc(postId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function ensurePostInFeed(postId) {
  if (window.currentFeedPosts && window.currentFeedPosts.some(p => p.id === postId)) return true;
  const postDoc = await window.db.collection('posts').doc(postId).get();
  if (!postDoc.exists) return false;
  const postData = postDoc.data();
  const userReaction = window.getUserReactionForPost ? await window.getUserReactionForPost(postId, window.getCurrentUser()?.uid) : null;
  const comments = window.getComments ? await window.getComments(postId) : [];
  const newPost = { id: postId, ...postData, userReaction, comments };
  if (window.currentFeedPosts) {
    window.currentFeedPosts.unshift(newPost);
    if (window.renderFeed) window.renderFeed(window.currentFeedPosts);
  }
  return true;
}

// Helper to close all notification modals
function closeAllNotificationModals() {
  const listModal = document.getElementById('notificationModal');
  const detailModal = document.getElementById('notificationDetailModal');
  if (listModal) listModal.style.display = 'none';
  if (detailModal) detailModal.style.display = 'none';
}

async function showNotificationDetail(notification) {
  let modal = document.getElementById('notificationDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notificationDetailModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 550px;">
        <span class="close close-detail-modal">&times;</span>
        <div id="notificationDetailContent" style="margin-bottom: 16px;"></div>
        <div id="notificationActionButtons"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.close-detail-modal').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  }
  
  const modalElement = modal;
  const contentDiv = document.getElementById('notificationDetailContent');
  const actionDiv = document.getElementById('notificationActionButtons');
  
  contentDiv.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';
  actionDiv.innerHTML = '';
  modalElement.style.display = 'flex';
  
  let post = null;
  if (notification.postId) {
    post = await getPostData(notification.postId);
  }
  
  let detailHtml = `<div style="text-align: left;">`;
  detailHtml += `<p><strong>${escapeHtml(notification.fromUserName)}</strong></p>`;
  
  const reactionEmojis = { love: '❤️', haha: '😆', wow: '😲', sad: '😓', dislike: '👎' };
  
  if (notification.type === 'comment') {
    detailHtml += `<p><i class="fas fa-comment"></i> <strong>Commented on your post:</strong></p>`;
    if (notification.extraText) {
      detailHtml += `<div style="background: #f0f2f5; border-radius: 12px; padding: 12px; margin: 8px 0;">"${escapeHtml(notification.extraText)}"</div>`;
    }
    if (post) {
      detailHtml += `<p><strong>📝 Your post:</strong></p>`;
      detailHtml += `<div style="background: #f8fafc; border-radius: 12px; padding: 12px;">${escapeHtml(post.text)}</div>`;
    }
    actionDiv.innerHTML = `<button id="goToPostBtn" class="submit-post-btn" style="width: auto; padding: 8px 20px; background: #3b82f6;">Go to Post</button>`;
  } 
  else if (notification.type === 'follow') {
    detailHtml += `<p><i class="fas fa-user-plus"></i> Started following you.</p>`;
    actionDiv.innerHTML = `<button id="viewProfileBtn" class="submit-post-btn" style="width: auto; padding: 8px 20px; background: #3b82f6;">View Profile</button>`;
  }
  else if (notification.type && reactionEmojis[notification.type]) {
    detailHtml += `<p>${reactionEmojis[notification.type]} <strong>Reacted ${notification.type.toUpperCase()} to your post:</strong></p>`;
    if (post) {
      detailHtml += `<div style="background: #f8fafc; border-radius: 12px; padding: 12px; margin-top: 8px;">${escapeHtml(post.text)}</div>`;
    } else {
      detailHtml += `<div style="background: #fee2e2; border-radius: 12px; padding: 12px;">⚠️ Post may have been deleted.</div>`;
    }
    actionDiv.innerHTML = `<button id="goToPostBtn" class="submit-post-btn" style="width: auto; padding: 8px 20px; background: #3b82f6;">Go to Post</button>`;
  }
  else {
    detailHtml += `<p>${escapeHtml(notification.message)}</p>`;
    actionDiv.innerHTML = `<button id="closeNotifBtn" class="submit-post-btn" style="width: auto; padding: 8px 20px; background: #6c757d;">Close</button>`;
  }
  detailHtml += `</div>`;
  contentDiv.innerHTML = detailHtml;
  
  const goToPostBtn = document.getElementById('goToPostBtn');
  const viewProfileBtn = document.getElementById('viewProfileBtn');
  const closeNotifBtn = document.getElementById('closeNotifBtn');
  
  if (goToPostBtn) {
    goToPostBtn.onclick = async () => {
      // Close both modals
      closeAllNotificationModals();
      if (notification.postId && post) {
        if (window.showSection) window.showSection('community');
        else document.querySelector('[data-section="community"]')?.click();
        window.showToast('Loading post...', 'info');
        await ensurePostInFeed(notification.postId);
        setTimeout(() => {
          const postElement = document.querySelector(`.community-post[data-post-id="${notification.postId}"]`);
          if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postElement.style.transition = 'background 0.3s';
            postElement.style.backgroundColor = '#fef3c7';
            setTimeout(() => { postElement.style.backgroundColor = ''; }, 2000);
          } else {
            window.showToast('Post could not be displayed.', 'error');
          }
        }, 600);
      } else if (!notification.postId) {
        window.showSection('community');
      } else {
        window.showToast('Post not found.', 'error');
      }
    };
  }
  
  if (viewProfileBtn) {
    viewProfileBtn.onclick = () => {
      closeAllNotificationModals();
      if (window.showUserProfileModal && notification.fromUserId) {
        window.showUserProfileModal(notification.fromUserId);
      } else {
        window.showToast('Cannot open profile at this time.', 'error');
      }
    };
  }
  
  if (closeNotifBtn) {
    closeNotifBtn.onclick = () => {
      modalElement.style.display = 'none';
    };
  }
}

function loadNotifications() {
  const currentUser = window.getCurrentUser();
  if (!currentUser) return;
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  notificationsUnsubscribe = window.db.collection('notifications')
    .where('userId', '==', currentUser.uid)
    .limit(50)
    .onSnapshot(snapshot => {
      currentNotifications = [];
      snapshot.forEach(doc => currentNotifications.push({ id: doc.id, ...doc.data() }));
      currentNotifications.sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(0);
        const timeB = b.timestamp?.toDate?.() || new Date(0);
        return timeB - timeA;
      });
      renderNotificationList();
      updateNotificationCount();
    });
}

function renderNotificationList() {
  const container = document.getElementById('notificationList');
  if (!container) return;
  if (currentNotifications.length === 0) {
    container.innerHTML = '<div class="empty-state">No notifications yet</div>';
    return;
  }
  let html = '';
  for (const notif of currentNotifications) {
    const timeStr = notif.timestamp ? timeAgo(notif.timestamp) : '';
    let iconClass = 'fa-bell';
    if (notif.type === 'love') iconClass = 'fa-heart';
    else if (notif.type === 'haha') iconClass = 'fa-laugh-squint';
    else if (notif.type === 'wow') iconClass = 'fa-surprise';
    else if (notif.type === 'sad') iconClass = 'fa-sad-tear';
    else if (notif.type === 'dislike') iconClass = 'fa-thumbs-down';
    else if (notif.type === 'comment') iconClass = 'fa-comment';
    else if (notif.type === 'follow') iconClass = 'fa-user-plus';
    
    html += `
      <div class="notification-item ${notif.read ? '' : 'unread'}" data-id="${notif.id}">
        <div class="notif-icon"><i class="fas ${iconClass}"></i></div>
        <div class="notif-content">
          <div class="notif-text">${escapeHtml(notif.message)}</div>
          <div class="notif-time">${timeStr}</div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
  document.querySelectorAll('.notification-item').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      const notif = currentNotifications.find(n => n.id === id);
      if (notif) {
        await window.db.collection('notifications').doc(id).update({ read: true });
        el.classList.remove('unread');
        updateNotificationCount();
        showNotificationDetail(notif);
      }
    });
  });
}

function updateNotificationCount() {
  const unreadCount = currentNotifications.filter(n => !n.read).length;
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    if (unreadCount > 0) {
      badge.style.display = 'flex';
      badge.innerText = unreadCount > 9 ? '9+' : unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }
}

function openNotificationModal() {
  document.getElementById('notificationModal').style.display = 'flex';
}

function closeNotificationModal() {
  document.getElementById('notificationModal').style.display = 'none';
}

function initNotifications() {
  loadNotifications();
  const closeBtns = document.querySelectorAll('#notificationModal .close, #notificationModal .close-modal');
  closeBtns.forEach(btn => btn.addEventListener('click', closeNotificationModal));
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('notificationModal');
    if (e.target === modal) closeNotificationModal();
  });
}

window.getComments = window.getComments || async function(postId) {
  const comments = [];
  const commentSnap = await window.db.collection('posts').doc(postId).collection('comments').orderBy('timestamp', 'asc').get();
  for (const doc of commentSnap.docs) {
    const replySnap = await doc.ref.collection('replies').orderBy('timestamp', 'asc').get();
    const replies = replySnap.docs.map(r => ({ id: r.id, ...r.data(), replies: [] }));
    comments.push({ id: doc.id, ...doc.data(), replies });
  }
  return comments;
};

window.getUserReactionForPost = window.getUserReactionForPost || async function(postId, userId) {
  if (!userId) return null;
  const doc = await window.db.collection('posts').doc(postId).collection('reactions').doc(userId).get();
  return doc.exists ? doc.data().type : null;
};

window.createNotification = createNotification;
window.openNotificationModal = openNotificationModal;
window.initNotifications = initNotifications;
window.loadNotifications = loadNotifications;