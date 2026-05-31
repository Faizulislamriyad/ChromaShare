// notifications.js – Real‑time notifications with count (no Firestore index needed)

let notificationsUnsubscribe = null;
let currentNotifications = [];

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
    message, read: false, timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  updateNotificationCount();
}

function loadNotifications() {
  const currentUser = window.getCurrentUser();
  if (!currentUser) return;
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  // Remove .orderBy to avoid index requirement; sort client‑side
  notificationsUnsubscribe = window.db.collection('notifications')
    .where('userId', '==', currentUser.uid)
    .limit(50)
    .onSnapshot(snapshot => {
      currentNotifications = [];
      snapshot.forEach(doc => currentNotifications.push({ id: doc.id, ...doc.data() }));
      // Sort by timestamp descending manually
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
    html += `
      <div class="notification-item ${notif.read ? '' : 'unread'}" data-id="${notif.id}">
        <div class="notif-icon"><i class="fas ${getNotifIcon(notif.type)}"></i></div>
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
      await window.db.collection('notifications').doc(id).update({ read: true });
      el.classList.remove('unread');
      updateNotificationCount();
    });
  });
}

function getNotifIcon(type) {
  switch(type) {
    case 'follow': return 'fa-user-plus';
    case 'love': return 'fa-heart';
    case 'haha': return 'fa-laugh-squint';
    case 'wow': return 'fa-surprise';
    case 'sad': return 'fa-sad-tear';
    case 'dislike': return 'fa-thumbs-down';
    case 'comment': return 'fa-comment';
    default: return 'fa-bell';
  }
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

window.createNotification = createNotification;
window.openNotificationModal = openNotificationModal;
window.initNotifications = initNotifications;
window.loadNotifications = loadNotifications;