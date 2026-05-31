// community.js – Followed posts first, then others + suggestions sidebar

let currentFeedPosts = [];
let currentUserObj = null;
let allUsersCache = []; // cache for suggestions

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  }).replace(/\n/g, '<br>');
}

async function getCurrentUserData(uid) {
  const doc = await window.db.collection('users').doc(uid).get();
  return doc.exists ? doc.data() : null;
}

// ---------- Helper: relative time (Facebook style) ----------
function timeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  let date;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
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

// ---------- Follow/Unfollow ----------
async function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  try {
    const followDoc = await window.db.collection('follows').doc(`${followerId}_${followingId}`).get();
    return followDoc.exists;
  } catch { return false; }
}

async function followUser(followerId, followingId) {
  if (followerId === followingId) {
    window.showToast('You cannot follow yourself', 'error');
    return false;
  }
  await window.db.collection('follows').doc(`${followerId}_${followingId}`).set({
    followerId, followingId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  return true;
}

async function unfollowUser(followerId, followingId) {
  await window.db.collection('follows').doc(`${followerId}_${followingId}`).delete();
  return true;
}

async function getFollowingList(uid) {
  const snapshot = await window.db.collection('follows').where('followerId', '==', uid).get();
  return snapshot.docs.map(doc => doc.data().followingId);
}

// ---------- Create Post ----------
async function createPost(text) {
  const user = window.getCurrentUser();
  if (!user) {
    window.showToast('Please login to post', 'error');
    return false;
  }
  const userData = await getCurrentUserData(user.uid);
  await window.db.collection('posts').add({
    userId: user.uid,
    username: userData.username || user.email,
    userPhoto: userData.photoURL || '',
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    loveCount: 0, hahaCount: 0, wowCount: 0, dislikeCount: 0
  });
  window.showToast('Post created!', 'success');
  await loadCommunityFeed();
  return true;
}

// ---------- Reactions (optimistic) – unchanged ----------
async function setReaction(postId, userId, reactionType) {
  const reactionRef = window.db.collection('posts').doc(postId).collection('reactions').doc(userId);
  const postRef = window.db.collection('posts').doc(postId);
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  if (postIndex !== -1) {
    const post = currentFeedPosts[postIndex];
    const oldReaction = post.userReaction;
    if (oldReaction === reactionType) {
      post[`${reactionType}Count`] = (post[`${reactionType}Count`] || 1) - 1;
      post.userReaction = null;
    } else {
      if (oldReaction) post[`${oldReaction}Count`] = (post[`${oldReaction}Count`] || 1) - 1;
      post[`${reactionType}Count`] = (post[`${reactionType}Count`] || 0) + 1;
      post.userReaction = reactionType;
    }
    currentFeedPosts[postIndex] = post;
    updatePostDOM(postId, post);
  }
  try {
    await window.db.runTransaction(async (transaction) => {
      const reactionDoc = await transaction.get(reactionRef);
      const postDoc = await transaction.get(postRef);
      if (!postDoc.exists) return;
      let oldReaction = reactionDoc.exists ? reactionDoc.data().type : null;
      if (oldReaction === reactionType) {
        transaction.delete(reactionRef);
        transaction.update(postRef, { [`${reactionType}Count`]: firebase.firestore.FieldValue.increment(-1) });
      } else {
        if (oldReaction) transaction.update(postRef, { [`${oldReaction}Count`]: firebase.firestore.FieldValue.increment(-1) });
        transaction.set(reactionRef, { type: reactionType, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        transaction.update(postRef, { [`${reactionType}Count`]: firebase.firestore.FieldValue.increment(1) });
      }
    });
  } catch (err) {
    console.error(err);
    window.showToast('Reaction failed', 'error');
    await loadCommunityFeed();
  }
}

function updatePostDOM(postId, updatedPost) {
  const postElement = document.querySelector(`.community-post[data-post-id="${postId}"]`);
  if (!postElement) return;
  const reactionsDiv = postElement.querySelector('.post-reactions');
  if (reactionsDiv) {
    const reactionTypes = ['love', 'haha', 'wow', 'dislike'];
    const reactionEmojis = { love: '❤️', haha: '😆', wow: '😲', dislike: '👎' };
    reactionsDiv.innerHTML = reactionTypes.map(type => `
      <button class="reaction-btn ${updatedPost.userReaction === type ? 'active' : ''}" data-type="${type}" data-post-id="${postId}">
        ${reactionEmojis[type]} <span class="reaction-count">${updatedPost[`${type}Count`] || 0}</span>
      </button>
    `).join('');
    reactionsDiv.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const postId = btn.dataset.postId;
        const type = btn.dataset.type;
        const user = window.getCurrentUser();
        if (!user) { window.showToast('Please login to react', 'error'); return; }
        await setReaction(postId, user.uid, type);
      });
    });
  }
}

// ---------- Comments with Replies (Facebook style) – unchanged ----------
async function addComment(postId, text) {
  const user = window.getCurrentUser();
  if (!user) {
    window.showToast('Please login to comment', 'error');
    return false;
  }
  const userData = await getCurrentUserData(user.uid);
  const newComment = {
    userId: user.uid,
    username: userData.username || user.email,
    userPhoto: userData.photoURL || '',
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  if (postIndex !== -1) {
    currentFeedPosts[postIndex].comments = currentFeedPosts[postIndex].comments || [];
    currentFeedPosts[postIndex].comments.push({ ...newComment, replies: [] });
    updateCommentsDOM(postId, currentFeedPosts[postIndex].comments);
  }
  try {
    await window.db.collection('posts').doc(postId).collection('comments').add(newComment);
    return true;
  } catch (err) {
    console.error(err);
    window.showToast('Comment failed', 'error');
    await loadCommunityFeed();
    return false;
  }
}

async function addReply(postId, commentId, text) {
  const user = window.getCurrentUser();
  if (!user) {
    window.showToast('Please login to reply', 'error');
    return false;
  }
  const userData = await getCurrentUserData(user.uid);
  const newReply = {
    userId: user.uid,
    username: userData.username || user.email,
    userPhoto: userData.photoURL || '',
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  if (postIndex !== -1) {
    const comment = currentFeedPosts[postIndex].comments.find(c => c.id === commentId);
    if (comment) {
      comment.replies = comment.replies || [];
      comment.replies.push(newReply);
      updateCommentsDOM(postId, currentFeedPosts[postIndex].comments);
    }
  }
  try {
    await window.db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies').add(newReply);
    return true;
  } catch (err) {
    console.error(err);
    window.showToast('Reply failed', 'error');
    await loadCommunityFeed();
    return false;
  }
}

async function getComments(postId) {
  const comments = [];
  try {
    const snapshot = await window.db.collection('posts').doc(postId).collection('comments').orderBy('timestamp', 'asc').get();
    for (const doc of snapshot.docs) {
      const commentData = doc.data();
      let replies = [];
      try {
        const repliesSnap = await doc.ref.collection('replies').orderBy('timestamp', 'asc').get();
        replies = repliesSnap.docs.map(r => r.data());
      } catch (e) { console.warn('Could not load replies', e); }
      comments.push({ id: doc.id, ...commentData, replies });
    }
  } catch (err) {
    console.warn('Could not load comments', err);
  }
  return comments;
}

function updateCommentsDOM(postId, comments) {
  const postElement = document.querySelector(`.community-post[data-post-id="${postId}"]`);
  if (!postElement) return;
  const commentsListDiv = postElement.querySelector('.comments-list');
  if (commentsListDiv) {
    commentsListDiv.innerHTML = renderCommentsHTML(comments, postId);
    attachCommentEventListeners(postId);
  }
  const input = postElement.querySelector('.comment-input');
  if (input) input.value = '';
}

function renderCommentsHTML(comments, postId) {
  let html = '';
  for (const comment of comments) {
    const timeAgoStr = timeAgo(comment.timestamp);
    html += `
      <div class="comment" data-comment-id="${comment.id}">
        <div class="comment-avatar">
          <img src="${comment.userPhoto || 'https://via.placeholder.com/32'}" class="comment-avatar-img" data-user-id="${comment.userId}">
        </div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-username" data-user-id="${comment.userId}">${escapeHtml(comment.username)}</span>
            <span class="comment-time">${timeAgoStr}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
          <div class="comment-actions">
            <button class="reply-toggle-btn" data-comment-id="${comment.id}">Reply</button>
          </div>
          <div class="reply-input-container" style="display:none;">
            <input type="text" class="reply-input" placeholder="Write a reply...">
            <button class="reply-submit" data-post-id="${postId}" data-comment-id="${comment.id}">Post</button>
          </div>
          <div class="replies-list">
            ${comment.replies ? renderRepliesHTML(comment.replies) : ''}
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderRepliesHTML(replies) {
  let html = '';
  for (const reply of replies) {
    const timeAgoStr = timeAgo(reply.timestamp);
    html += `
      <div class="reply">
        <div class="reply-avatar">
          <img src="${reply.userPhoto || 'https://via.placeholder.com/28'}" class="reply-avatar-img" data-user-id="${reply.userId}">
        </div>
        <div class="reply-body">
          <div class="reply-header">
            <span class="reply-username" data-user-id="${reply.userId}">${escapeHtml(reply.username)}</span>
            <span class="reply-time">${timeAgoStr}</span>
          </div>
          <div class="reply-text">${escapeHtml(reply.text)}</div>
        </div>
      </div>
    `;
  }
  return html;
}

function attachCommentEventListeners(postId) {
  document.querySelectorAll(`.community-post[data-post-id="${postId}"] .reply-toggle-btn`).forEach(btn => {
    btn.removeEventListener('click', window._replyToggleHandler);
    const handler = (e) => {
      const commentDiv = btn.closest('.comment');
      const replyContainer = commentDiv.querySelector('.reply-input-container');
      if (replyContainer) replyContainer.style.display = replyContainer.style.display === 'none' ? 'flex' : 'none';
    };
    btn.addEventListener('click', handler);
    window._replyToggleHandler = handler;
  });
  document.querySelectorAll(`.community-post[data-post-id="${postId}"] .reply-submit`).forEach(btn => {
    btn.removeEventListener('click', window._replySubmitHandler);
    const handler = async (e) => {
      const commentId = btn.dataset.commentId;
      const input = btn.closest('.reply-input-container').querySelector('.reply-input');
      const text = input.value.trim();
      if (!text) return;
      await addReply(postId, commentId, text);
      input.value = '';
      btn.closest('.reply-input-container').style.display = 'none';
    };
    btn.addEventListener('click', handler);
    window._replySubmitHandler = handler;
  });
}

// ---------- Suggestions: fetch all users except current ----------
async function loadSuggestions() {
  const container = document.getElementById('suggestionsContainer');
  if (!container) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) {
    container.innerHTML = '<div class="suggestions-placeholder">Login to see suggestions</div>';
    return;
  }
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading suggestions...</div>';
  try {
    const snapshot = await window.db.collection('users').get();
    const users = [];
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      if (doc.id !== currentUser.uid) {
        const isFollowed = await isFollowing(currentUser.uid, doc.id);
        users.push({ uid: doc.id, ...userData, isFollowed });
      }
    }
    allUsersCache = users;
    renderSuggestions(users);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Could not load suggestions</p></div>';
  }
}

function renderSuggestions(users) {
  const container = document.getElementById('suggestionsContainer');
  if (!container) return;
  if (users.length === 0) {
    container.innerHTML = '<div class="suggestions-placeholder">No other users found</div>';
    return;
  }
  let html = '<div class="suggestions-list">';
  for (const user of users) {
    html += `
      <div class="suggestion-item" data-user-id="${user.uid}">
        <img src="${user.photoURL || 'https://via.placeholder.com/40'}" class="suggestion-avatar" data-user-id="${user.uid}">
        <div class="suggestion-info">
          <div class="suggestion-username" data-user-id="${user.uid}">${escapeHtml(user.username || 'User')}</div>
          <button class="follow-suggestion-btn ${user.isFollowed ? 'following' : ''}" data-user-id="${user.uid}">
            ${user.isFollowed ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
  
  // Attach event listeners
  document.querySelectorAll('.suggestion-avatar, .suggestion-username').forEach(el => {
    el.addEventListener('click', (e) => {
      const userId = el.dataset.userId;
      if (userId) showUserProfileModal(userId);
    });
  });
  document.querySelectorAll('.follow-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      const currentUser = window.getCurrentUser();
      if (!currentUser) { window.showToast('Please login', 'error'); return; }
      if (btn.classList.contains('following')) {
        await unfollowUser(currentUser.uid, userId);
        btn.classList.remove('following');
        btn.textContent = 'Follow';
        window.showToast('Unfollowed', 'info');
      } else {
        await followUser(currentUser.uid, userId);
        btn.classList.add('following');
        btn.textContent = 'Following';
        window.showToast('Followed', 'success');
      }
      // Update isFollowed status in cache
      const userIndex = allUsersCache.findIndex(u => u.uid === userId);
      if (userIndex !== -1) allUsersCache[userIndex].isFollowed = !allUsersCache[userIndex].isFollowed;
      // Refresh feed (because now the user follows someone)
      await loadCommunityFeed();
    });
  });
}

// ---------- Load Feed: followed posts first, then others ----------
async function loadCommunityFeed() {
  const feedContainer = document.getElementById('communityFeedContainer');
  if (!feedContainer) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) {
    feedContainer.innerHTML = '<div class="empty-state"><i class="fas fa-sign-in-alt"></i><p>Please login to see the community feed</p></div>';
    return;
  }
  feedContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading feed...</div>';
  try {
    const following = await getFollowingList(currentUser.uid);
    const followedIds = following;
    const allPosts = [];
    
    // 1. Get posts from followed users (most recent)
    if (followedIds.length > 0) {
      let followedPostsSnap;
      try {
        followedPostsSnap = await window.db.collection('posts')
          .where('userId', 'in', followedIds)
          .orderBy('timestamp', 'desc')
          .get();
      } catch (err) {
        // Fallback if index missing
        const allPostsTemp = await window.db.collection('posts').orderBy('timestamp', 'desc').get();
        followedPostsSnap = { docs: allPostsTemp.docs.filter(doc => followedIds.includes(doc.data().userId)) };
      }
      for (const doc of followedPostsSnap.docs) {
        const postData = doc.data();
        const postId = doc.id;
        const userReaction = await getUserReactionForPost(postId, currentUser.uid);
        const comments = await getComments(postId);
        allPosts.push({ id: postId, ...postData, userReaction, comments });
      }
    }
    
    // 2. Get posts from non-followed users (latest, limit to 20)
    const otherIds = [currentUser.uid, ...followedIds]; // exclude these
    let otherPostsSnap;
    try {
      otherPostsSnap = await window.db.collection('posts')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
    } catch (err) {
      otherPostsSnap = await window.db.collection('posts').orderBy('timestamp', 'desc').limit(20).get();
    }
    for (const doc of otherPostsSnap.docs) {
      const postData = doc.data();
      const postId = doc.id;
      if (!followedIds.includes(postData.userId) && postData.userId !== currentUser.uid) {
        // Avoid duplicates (in case a followed user appears in the second query)
        if (!allPosts.some(p => p.id === postId)) {
          const userReaction = await getUserReactionForPost(postId, currentUser.uid);
          const comments = await getComments(postId);
          allPosts.push({ id: postId, ...postData, userReaction, comments });
        }
      }
    }
    
    // Sort all posts by timestamp descending (newest first)
    allPosts.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.toDate() : new Date(0);
      const timeB = b.timestamp ? b.timestamp.toDate() : new Date(0);
      return timeB - timeA;
    });
    
    currentFeedPosts = allPosts;
    renderFeed(allPosts);
  } catch (err) {
    console.error(err);
    feedContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading feed. Check your internet and try again.</p></div>';
  }
}

async function getUserReactionForPost(postId, userId) {
  if (!userId) return null;
  try {
    const doc = await window.db.collection('posts').doc(postId).collection('reactions').doc(userId).get();
    return doc.exists ? doc.data().type : null;
  } catch { return null; }
}

function renderFeed(posts) {
  const feedContainer = document.getElementById('communityFeedContainer');
  if (!feedContainer) return;
  if (posts.length === 0) {
    feedContainer.innerHTML = '<div class="empty-state"><i class="fas fa-newspaper"></i><p>No posts yet. Follow someone or create a post!</p></div>';
    return;
  }
  let html = '';
  for (const post of posts) {
    const timeAgoStr = timeAgo(post.timestamp);
    const reactionTypes = ['love', 'haha', 'wow', 'dislike'];
    const reactionEmojis = { love: '❤️', haha: '😆', wow: '😲', dislike: '👎' };
    html += `
      <div class="community-post" data-post-id="${post.id}">
        <div class="post-header">
          <img src="${post.userPhoto || 'https://via.placeholder.com/40'}" class="post-avatar" data-user-id="${post.userId}">
          <div class="post-user-info">
            <span class="post-username" data-user-id="${post.userId}">${escapeHtml(post.username)}</span>
            <span class="post-time">${timeAgoStr}</span>
          </div>
        </div>
        <div class="post-text">${escapeHtml(post.text)}</div>
        <div class="post-reactions">
          ${reactionTypes.map(type => `
            <button class="reaction-btn ${post.userReaction === type ? 'active' : ''}" data-type="${type}" data-post-id="${post.id}">
              ${reactionEmojis[type]} <span class="reaction-count">${post[`${type}Count`] || 0}</span>
            </button>
          `).join('')}
        </div>
        <div class="post-comments-section">
          <div class="comments-list">
            ${renderCommentsHTML(post.comments, post.id)}
          </div>
          <div class="add-comment">
            <img src="${window.getCurrentUser()?.photoURL || 'https://via.placeholder.com/32'}" class="add-comment-avatar">
            <input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post.id}">
            <button class="comment-submit" data-post-id="${post.id}">Post</button>
          </div>
        </div>
      </div>
    `;
  }
  feedContainer.innerHTML = html;
  
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const postId = btn.dataset.postId;
      const type = btn.dataset.type;
      const user = window.getCurrentUser();
      if (!user) { window.showToast('Please login to react', 'error'); return; }
      await setReaction(postId, user.uid, type);
    });
  });
  
  document.querySelectorAll('.comment-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const postId = btn.dataset.postId;
      const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
      const text = input.value.trim();
      if (!text) return;
      await addComment(postId, text);
    });
  });
  
  const profileTriggers = document.querySelectorAll('.post-username, .post-avatar, .comment-username, .comment-avatar-img, .reply-username, .reply-avatar-img, .add-comment-avatar');
  profileTriggers.forEach(el => {
    el.addEventListener('click', (e) => {
      const userId = el.dataset.userId;
      if (userId) showUserProfileModal(userId);
    });
  });
  
  for (const post of posts) {
    attachCommentEventListeners(post.id);
  }
}

// ---------- User Profile Modal (unchanged) ----------
async function showUserProfileModal(userId) {
  const currentUser = window.getCurrentUser();
  const userDoc = await window.db.collection('users').doc(userId).get();
  if (!userDoc.exists) return;
  const userData = userDoc.data();
  const followersSnap = await window.db.collection('follows').where('followingId', '==', userId).get();
  const followerCount = followersSnap.size;
  const followingSnap = await window.db.collection('follows').where('followerId', '==', userId).get();
  const followingCount = followingSnap.size;
  let isFollowed = false;
  if (currentUser && currentUser.uid !== userId) {
    isFollowed = await isFollowing(currentUser.uid, userId);
  }
  const modal = document.getElementById('userProfileModal');
  const modalContent = document.getElementById('userProfileModalContent');
  modalContent.innerHTML = `
    <div class="profile-modal-header">
      <img src="${userData.photoURL || 'https://via.placeholder.com/80'}" class="profile-modal-avatar">
      <h3>${escapeHtml(userData.username || 'User')}</h3>
      <p>${escapeHtml(userData.bio || 'No bio yet')}</p>
      <div class="profile-modal-stats">
        <span><strong>${followerCount}</strong> Followers</span>
        <span><strong>${followingCount}</strong> Following</span>
      </div>
      ${currentUser && currentUser.uid !== userId ? `
        <button id="followModalBtn" class="follow-modal-btn ${isFollowed ? 'following' : ''}">
          ${isFollowed ? 'Following' : 'Follow'}
        </button>
      ` : ''}
    </div>
  `;
  modal.style.display = 'flex';
  if (currentUser && currentUser.uid !== userId) {
    const followBtn = document.getElementById('followModalBtn');
    followBtn.addEventListener('click', async () => {
      if (followBtn.classList.contains('following')) {
        await unfollowUser(currentUser.uid, userId);
        followBtn.classList.remove('following');
        followBtn.textContent = 'Follow';
        window.showToast(`Unfollowed ${userData.username}`, 'info');
      } else {
        await followUser(currentUser.uid, userId);
        followBtn.classList.add('following');
        followBtn.textContent = 'Following';
        window.showToast(`Following ${userData.username}`, 'success');
      }
      const newFollowers = await window.db.collection('follows').where('followingId', '==', userId).get();
      const newCount = newFollowers.size;
      const statsDiv = modalContent.querySelector('.profile-modal-stats');
      statsDiv.innerHTML = `<span><strong>${newCount}</strong> Followers</span><span><strong>${followingCount}</strong> Following</span>`;
      // Refresh suggestions and feed
      await loadSuggestions();
      await loadCommunityFeed();
    });
  }
}

// ---------- Create Post UI ----------
function renderCreatePostForm() {
  const container = document.getElementById('createPostContainer');
  if (!container) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) {
    container.innerHTML = '<div class="create-post-placeholder">Login to share your thoughts</div>';
    return;
  }
  container.innerHTML = `
    <div class="create-post-card">
      <textarea id="postText" rows="2" placeholder="What's on your mind? (text only)"></textarea>
      <button id="submitPostBtn" class="submit-post-btn">Post</button>
    </div>
  `;
  document.getElementById('submitPostBtn').addEventListener('click', async () => {
    const textarea = document.getElementById('postText');
    const text = textarea.value.trim();
    if (!text) {
      window.showToast('Please write something', 'error');
      return;
    }
    await createPost(text);
    textarea.value = '';
  });
}

// ---------- Initialize Community ----------
window.initCommunity = function() {
  renderCreatePostForm();
  loadCommunityFeed();
  loadSuggestions();
  const modal = document.getElementById('userProfileModal');
  const closeBtn = modal.querySelector('.close-profile-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
};

window.loadCommunitySection = function() {
  renderCreatePostForm();
  loadCommunityFeed();
  loadSuggestions();
};