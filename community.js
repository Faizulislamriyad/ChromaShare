// community.js – Optimized feed, nested replies, own posts included, notification detail

let currentFeedPosts = [];
let allUsersCache = [];
let communityDataLoaded = false;

const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23cbd5e1" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"%3E%3C/path%3E%3Ccircle cx="12" cy="7" r="4"%3E%3C/circle%3E%3C/svg%3E';
const DEFAULT_AVATAR_32 = DEFAULT_AVATAR.replace('width="40"', 'width="32"').replace('height="40"', 'height="32"');
const DEFAULT_AVATAR_28 = DEFAULT_AVATAR.replace('width="40"', 'width="28"').replace('height="40"', 'height="28"');
const DEFAULT_AVATAR_80 = DEFAULT_AVATAR.replace('width="40"', 'width="80"').replace('height="40"', 'height="80"');

function escapeHtml(str) {
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;').replace(/\n/g, '<br>');
}

async function getCurrentUserData(uid) {
  const doc = await window.db.collection('users').doc(uid).get();
  return doc.exists ? doc.data() : null;
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

// ---------- Follow/Unfollow ----------
async function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  try {
    const followDoc = await window.db.collection('follows').doc(`${followerId}_${followingId}`).get();
    return followDoc.exists;
  } catch { return false; }
}

async function followUser(followerId, followingId) {
  if (followerId === followingId) { window.showToast('You cannot follow yourself', 'error'); return false; }
  await window.db.collection('follows').doc(`${followerId}_${followingId}`).set({
    followerId, followingId, timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  if (window.createNotification && followerId !== followingId) window.createNotification(followingId, 'follow', followerId);
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
  if (!user) { window.showToast('Please login to post', 'error'); return false; }
  const userData = await getCurrentUserData(user.uid);
  const newPostRef = await window.db.collection('posts').add({
    userId: user.uid, username: userData.username || user.email,
    userPhoto: userData.photoURL || DEFAULT_AVATAR, text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    loveCount: 0, hahaCount: 0, wowCount: 0, sadCount: 0, dislikeCount: 0
  });
  window.showToast('Post created!', 'success');
  const newPostSnap = await newPostRef.get();
  const newPostData = newPostSnap.data();
  const newPost = { id: newPostSnap.id, ...newPostData, userReaction: null, comments: [] };
  currentFeedPosts.unshift(newPost);
  renderFeed(currentFeedPosts);
  return true;
}

// ---------- Reactions ----------
async function setReaction(postId, userId, reactionType) {
  const reactionRef = window.db.collection('posts').doc(postId).collection('reactions').doc(userId);
  const postRef = window.db.collection('posts').doc(postId);
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  let oldReaction = null;
  if (postIndex !== -1) {
    const post = currentFeedPosts[postIndex];
    oldReaction = post.userReaction;
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
      let old = reactionDoc.exists ? reactionDoc.data().type : null;
      if (old === reactionType) {
        transaction.delete(reactionRef);
        transaction.update(postRef, { [`${reactionType}Count`]: firebase.firestore.FieldValue.increment(-1) });
      } else {
        if (old) transaction.update(postRef, { [`${old}Count`]: firebase.firestore.FieldValue.increment(-1) });
        transaction.set(reactionRef, { type: reactionType, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        transaction.update(postRef, { [`${reactionType}Count`]: firebase.firestore.FieldValue.increment(1) });
      }
    });
    const postDoc = await postRef.get();
    if (userId !== postDoc.data().userId && window.createNotification) {
      window.createNotification(postDoc.data().userId, reactionType, userId, postId);
    }
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
    const reactionTypes = ['love', 'haha', 'wow', 'sad', 'dislike'];
    const emojis = { love: '❤️', haha: '😆', wow: '😲', sad: '😓', dislike: '👎' };
    reactionsDiv.innerHTML = reactionTypes.map(type => `
      <button class="reaction-btn ${updatedPost.userReaction === type ? 'active' : ''}" data-type="${type}" data-post-id="${postId}">
        ${emojis[type]} <span class="reaction-count">${updatedPost[`${type}Count`] || 0}</span>
      </button>
    `).join('');
    reactionsDiv.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const user = window.getCurrentUser();
        if (!user) { window.showToast('Please login to react', 'error'); return; }
        await setReaction(btn.dataset.postId, user.uid, btn.dataset.type);
      });
    });
  }
}

// ---------- Nested Replies (full tree) ----------
async function addReply(postId, commentId, parentReplyId, text) {
  const user = window.getCurrentUser();
  if (!user) { window.showToast('Please login to reply', 'error'); return false; }
  const userData = await getCurrentUserData(user.uid);
  const newReply = {
    userId: user.uid, username: userData.username || user.email,
    userPhoto: userData.photoURL || DEFAULT_AVATAR_28,
    text: text.trim(), timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    parentReplyId: parentReplyId || null
  };
  // Optimistic update to nested tree
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  if (postIndex !== -1) {
    const comment = currentFeedPosts[postIndex].comments.find(c => c.id === commentId);
    if (comment) {
      const addToTree = (replies, parentId) => {
        if (!parentId) { replies.push({ ...newReply, replies: [] }); return true; }
        for (let r of replies) {
          if (r.id === parentId) { r.replies = r.replies || []; r.replies.push({ ...newReply, replies: [] }); return true; }
          if (r.replies && addToTree(r.replies, parentId)) return true;
        }
        return false;
      };
      comment.replies = comment.replies || [];
      addToTree(comment.replies, parentReplyId);
      updateCommentsDOM(postId, currentFeedPosts[postIndex].comments);
    }
  }
  try {
    const repliesRef = window.db.collection('posts').doc(postId).collection('comments').doc(commentId).collection('replies');
    await repliesRef.add(newReply);
    return true;
  } catch (err) { console.error(err); window.showToast('Reply failed', 'error'); await loadCommunityFeed(); return false; }
}

// ---------- Comments ----------
async function addComment(postId, text) {
  const user = window.getCurrentUser();
  if (!user) { window.showToast('Please login to comment', 'error'); return false; }
  const userData = await getCurrentUserData(user.uid);
  const newComment = {
    userId: user.uid, username: userData.username || user.email,
    userPhoto: userData.photoURL || DEFAULT_AVATAR_32,
    text: text.trim(), timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };
  const postIndex = currentFeedPosts.findIndex(p => p.id === postId);
  if (postIndex !== -1) {
    currentFeedPosts[postIndex].comments = currentFeedPosts[postIndex].comments || [];
    currentFeedPosts[postIndex].comments.push({ ...newComment, replies: [] });
    updateCommentsDOM(postId, currentFeedPosts[postIndex].comments);
  }
  try {
    await window.db.collection('posts').doc(postId).collection('comments').add(newComment);
    const postDoc = await window.db.collection('posts').doc(postId).get();
    if (user.uid !== postDoc.data().userId && window.createNotification) {
      window.createNotification(postDoc.data().userId, 'comment', user.uid, postId, text);
    }
    return true;
  } catch (err) { console.error(err); window.showToast('Comment failed', 'error'); await loadCommunityFeed(); return false; }
}

async function getComments(postId) {
  const comments = [];
  try {
    const commentSnap = await window.db.collection('posts').doc(postId).collection('comments').orderBy('timestamp', 'asc').get();
    for (const commentDoc of commentSnap.docs) {
      const commentData = commentDoc.data();
      const replySnap = await commentDoc.ref.collection('replies').orderBy('timestamp', 'asc').get();
      const flatReplies = replySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const replyMap = {};
      flatReplies.forEach(r => { replyMap[r.id] = r; r.replies = []; });
      const topReplies = [];
      flatReplies.forEach(r => {
        if (r.parentReplyId && replyMap[r.parentReplyId]) replyMap[r.parentReplyId].replies.push(r);
        else topReplies.push(r);
      });
      comments.push({ id: commentDoc.id, ...commentData, replies: topReplies });
    }
  } catch (err) { console.warn(err); }
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
        <div class="comment-avatar"><img src="${comment.userPhoto || DEFAULT_AVATAR_32}" class="comment-avatar-img" data-user-id="${comment.userId}" onerror="this.src='${DEFAULT_AVATAR_32}'"></div>
        <div class="comment-body">
          <div class="comment-header"><span class="comment-username" data-user-id="${comment.userId}">${escapeHtml(comment.username)}</span><span class="comment-time">${timeAgoStr}</span></div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
          <div class="comment-actions"><button class="reply-toggle-btn" data-comment-id="${comment.id}" data-parent-type="comment">Reply</button></div>
          <div class="reply-input-container" style="display:none;" data-parent-id="${comment.id}" data-parent-type="comment">
            <input type="text" class="reply-input" placeholder="Write a reply..."><button class="reply-submit" data-post-id="${postId}" data-comment-id="${comment.id}" data-parent-reply-id="">Post</button>
          </div>
          <div class="replies-list">${renderRepliesHTML(comment.replies, postId, comment.id)}</div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderRepliesHTML(replies, postId, commentId, level = 0) {
  let html = '';
  for (const reply of replies) {
    const timeAgoStr = timeAgo(reply.timestamp);
    html += `
      <div class="reply" data-reply-id="${reply.id}" style="margin-left: ${Math.min(level * 20, 60)}px;">
        <div class="reply-avatar"><img src="${reply.userPhoto || DEFAULT_AVATAR_28}" class="reply-avatar-img" data-user-id="${reply.userId}" onerror="this.src='${DEFAULT_AVATAR_28}'"></div>
        <div class="reply-body">
          <div class="reply-header"><span class="reply-username" data-user-id="${reply.userId}">${escapeHtml(reply.username)}</span><span class="reply-time">${timeAgoStr}</span></div>
          <div class="reply-text">${escapeHtml(reply.text)}</div>
          <div class="reply-actions"><button class="reply-toggle-btn" data-reply-id="${reply.id}" data-parent-type="reply">Reply</button></div>
          <div class="reply-input-container" style="display:none;" data-parent-id="${reply.id}" data-parent-type="reply">
            <input type="text" class="reply-input" placeholder="Write a reply..."><button class="reply-submit" data-post-id="${postId}" data-comment-id="${commentId}" data-parent-reply-id="${reply.id}">Post</button>
          </div>
          <div class="nested-replies-list">${renderRepliesHTML(reply.replies || [], postId, commentId, level + 1)}</div>
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
      const container = btn.closest('.comment-body')?.querySelector('.reply-input-container') || btn.closest('.reply-body')?.querySelector('.reply-input-container');
      if (container) container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    };
    btn.addEventListener('click', handler);
    window._replyToggleHandler = handler;
  });
  document.querySelectorAll(`.community-post[data-post-id="${postId}"] .reply-submit`).forEach(btn => {
    btn.removeEventListener('click', window._replySubmitHandler);
    const handler = async () => {
      const postId = btn.dataset.postId;
      const commentId = btn.dataset.commentId;
      const parentReplyId = btn.dataset.parentReplyId || null;
      const input = btn.closest('.reply-input-container').querySelector('.reply-input');
      const text = input.value.trim();
      if (!text) return;
      await addReply(postId, commentId, parentReplyId, text);
      input.value = '';
      btn.closest('.reply-input-container').style.display = 'none';
    };
    btn.addEventListener('click', handler);
    window._replySubmitHandler = handler;
  });
}

// ---------- Suggestions ----------
async function loadSuggestions() {
  const container = document.getElementById('suggestionsContainer');
  if (!container) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) { container.innerHTML = '<div class="suggestions-placeholder">Login to see suggestions</div>'; return; }
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading suggestions...</div>';
  try {
    const snapshot = await window.db.collection('users').get();
    const users = [];
    for (const doc of snapshot.docs) {
      if (doc.id !== currentUser.uid) {
        const isFollowed = await isFollowing(currentUser.uid, doc.id);
        users.push({ uid: doc.id, ...doc.data(), isFollowed });
      }
    }
    allUsersCache = users;
    renderSuggestions(users);
  } catch (err) { container.innerHTML = '<div class="empty-state">Could not load suggestions</div>'; }
}

function renderSuggestions(users) {
  const container = document.getElementById('suggestionsContainer');
  if (!container) return;
  if (users.length === 0) { container.innerHTML = '<div class="suggestions-placeholder">No other users found</div>'; return; }
  let html = '<div class="suggestions-list">';
  for (const user of users) {
    html += `
      <div class="suggestion-item" data-user-id="${user.uid}">
        <img src="${user.photoURL || DEFAULT_AVATAR}" class="suggestion-avatar" data-user-id="${user.uid}" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="suggestion-info">
          <div class="suggestion-username" data-user-id="${user.uid}">${escapeHtml(user.username || 'User')}</div>
          <button class="follow-suggestion-btn ${user.isFollowed ? 'following' : ''}" data-user-id="${user.uid}">${user.isFollowed ? 'Following' : 'Follow'}</button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
  document.querySelectorAll('.suggestion-avatar, .suggestion-username').forEach(el => {
    el.addEventListener('click', () => showUserProfileModal(el.dataset.userId));
  });
  document.querySelectorAll('.follow-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      const currentUser = window.getCurrentUser();
      if (!currentUser) { window.showToast('Please login', 'error'); return; }
      if (btn.classList.contains('following')) {
        await unfollowUser(currentUser.uid, userId);
        btn.classList.remove('following'); btn.textContent = 'Follow';
        window.showToast('Unfollowed', 'info');
        currentFeedPosts = currentFeedPosts.filter(p => p.userId !== userId);
        renderFeed(currentFeedPosts);
      } else {
        await followUser(currentUser.uid, userId);
        btn.classList.add('following'); btn.textContent = 'Following';
        window.showToast('Followed', 'success');
        const newPostsSnap = await window.db.collection('posts').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(5).get();
        const newPosts = [];
        for (const doc of newPostsSnap.docs) {
          const postData = doc.data();
          const userReaction = await getUserReactionForPost(doc.id, currentUser.uid);
          const comments = await getComments(doc.id);
          newPosts.push({ id: doc.id, ...postData, userReaction, comments });
        }
        currentFeedPosts = [...currentFeedPosts, ...newPosts];
        currentFeedPosts.sort((a,b) => (b.timestamp?.toDate?.()||0) - (a.timestamp?.toDate?.()||0));
        renderFeed(currentFeedPosts);
      }
      const idx = allUsersCache.findIndex(u => u.uid === userId);
      if (idx !== -1) allUsersCache[idx].isFollowed = !allUsersCache[idx].isFollowed;
    });
  });
}

// ---------- Load Feed (followed + own) ----------
async function loadCommunityFeed() {
  const feedContainer = document.getElementById('communityFeedContainer');
  if (!feedContainer) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) { feedContainer.innerHTML = '<div class="empty-state">Please login to see the community feed</div>'; return; }
  feedContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading feed...</div>';
  try {
    const following = await getFollowingList(currentUser.uid);
    const followedIds = following;
    const allPosts = [];
    if (followedIds.length > 0) {
      let followedPostsSnap;
      try {
        followedPostsSnap = await window.db.collection('posts').where('userId', 'in', followedIds).orderBy('timestamp', 'desc').get();
      } catch (err) {
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
    // Add current user's own posts
    const ownPostsSnap = await window.db.collection('posts').where('userId', '==', currentUser.uid).orderBy('timestamp', 'desc').get();
    for (const doc of ownPostsSnap.docs) {
      if (!allPosts.some(p => p.id === doc.id)) {
        const postData = doc.data();
        const userReaction = await getUserReactionForPost(doc.id, currentUser.uid);
        const comments = await getComments(doc.id);
        allPosts.push({ id: doc.id, ...postData, userReaction, comments });
      }
    }
    // Add other random posts for discoverability (limit 20)
    let otherPostsSnap;
    try {
      otherPostsSnap = await window.db.collection('posts').orderBy('timestamp', 'desc').limit(20).get();
    } catch { otherPostsSnap = await window.db.collection('posts').orderBy('timestamp', 'desc').limit(20).get(); }
    for (const doc of otherPostsSnap.docs) {
      if (!followedIds.includes(doc.data().userId) && doc.data().userId !== currentUser.uid && !allPosts.some(p => p.id === doc.id)) {
        const postData = doc.data();
        const userReaction = await getUserReactionForPost(doc.id, currentUser.uid);
        const comments = await getComments(doc.id);
        allPosts.push({ id: doc.id, ...postData, userReaction, comments });
      }
    }
    allPosts.sort((a,b) => (b.timestamp?.toDate?.()||0) - (a.timestamp?.toDate?.()||0));
    currentFeedPosts = allPosts;
    renderFeed(allPosts);
  } catch (err) { feedContainer.innerHTML = '<div class="empty-state">Error loading feed. Check your internet.</div>'; }
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
  if (posts.length === 0) { feedContainer.innerHTML = '<div class="empty-state">No posts yet. Follow someone or create a post!</div>'; return; }
  let html = '';
  const currentUserPhoto = window.getCurrentUser()?.photoURL || DEFAULT_AVATAR_32;
  for (const post of posts) {
    const timeAgoStr = timeAgo(post.timestamp);
    const reactionTypes = ['love', 'haha', 'wow', 'sad', 'dislike'];
    const emojis = { love: '❤️', haha: '😆', wow: '😲', sad: '😓', dislike: '👎' };
    html += `
      <div class="community-post" data-post-id="${post.id}">
        <div class="post-header">
          <img src="${post.userPhoto || DEFAULT_AVATAR}" class="post-avatar" data-user-id="${post.userId}" onerror="this.src='${DEFAULT_AVATAR}'">
          <div class="post-user-info"><span class="post-username" data-user-id="${post.userId}">${escapeHtml(post.username)}</span><span class="post-time">${timeAgoStr}</span></div>
        </div>
        <div class="post-text">${escapeHtml(post.text)}</div>
        <div class="post-reactions">${reactionTypes.map(type => `<button class="reaction-btn ${post.userReaction === type ? 'active' : ''}" data-type="${type}" data-post-id="${post.id}">${emojis[type]} <span class="reaction-count">${post[`${type}Count`] || 0}</span></button>`).join('')}</div>
        <div class="post-comments-section">
          <div class="comments-list">${renderCommentsHTML(post.comments, post.id)}</div>
          <div class="add-comment"><img src="${currentUserPhoto}" class="add-comment-avatar" onerror="this.src='${DEFAULT_AVATAR_32}'"><input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post.id}"><button class="comment-submit" data-post-id="${post.id}">Post</button></div>
        </div>
      </div>
    `;
  }
  feedContainer.innerHTML = html;
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const user = window.getCurrentUser();
      if (!user) { window.showToast('Please login to react', 'error'); return; }
      await setReaction(btn.dataset.postId, user.uid, btn.dataset.type);
    });
  });
  document.querySelectorAll('.comment-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
      const text = input.value.trim();
      if (!text) return;
      await addComment(postId, text);
    });
  });
  const profileTriggers = document.querySelectorAll('.post-username, .post-avatar, .comment-username, .comment-avatar-img, .reply-username, .reply-avatar-img, .add-comment-avatar');
  profileTriggers.forEach(el => el.addEventListener('click', () => { if (el.dataset.userId) showUserProfileModal(el.dataset.userId); }));
  for (const post of posts) attachCommentEventListeners(post.id);
}

// ---------- User Profile Modal ----------
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
  if (currentUser && currentUser.uid !== userId) isFollowed = await isFollowing(currentUser.uid, userId);
  const modal = document.getElementById('userProfileModal');
  const modalContent = document.getElementById('userProfileModalContent');
  modalContent.innerHTML = `
    <div class="profile-modal-header">
      <img src="${userData.photoURL || DEFAULT_AVATAR_80}" class="profile-modal-avatar" onerror="this.src='${DEFAULT_AVATAR_80}'">
      <h3>${escapeHtml(userData.username || 'User')}</h3>
      <p>${escapeHtml(userData.bio || 'No bio yet')}</p>
      <div class="profile-modal-stats"><span><strong>${followerCount}</strong> Followers</span><span><strong>${followingCount}</strong> Following</span></div>
      ${currentUser && currentUser.uid !== userId ? `<button id="followModalBtn" class="follow-modal-btn ${isFollowed ? 'following' : ''}">${isFollowed ? 'Following' : 'Follow'}</button>` : ''}
    </div>
  `;
  modal.style.display = 'flex';
  if (currentUser && currentUser.uid !== userId) {
    const followBtn = document.getElementById('followModalBtn');
    followBtn.addEventListener('click', async () => {
      if (followBtn.classList.contains('following')) {
        await unfollowUser(currentUser.uid, userId);
        followBtn.classList.remove('following'); followBtn.textContent = 'Follow';
        window.showToast(`Unfollowed ${userData.username}`, 'info');
        currentFeedPosts = currentFeedPosts.filter(p => p.userId !== userId);
        renderFeed(currentFeedPosts);
      } else {
        await followUser(currentUser.uid, userId);
        followBtn.classList.add('following'); followBtn.textContent = 'Following';
        window.showToast(`Following ${userData.username}`, 'success');
        const newPostsSnap = await window.db.collection('posts').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(5).get();
        const newPosts = [];
        for (const doc of newPostsSnap.docs) {
          const postData = doc.data();
          const userReaction = await getUserReactionForPost(doc.id, currentUser.uid);
          const comments = await getComments(doc.id);
          newPosts.push({ id: doc.id, ...postData, userReaction, comments });
        }
        currentFeedPosts = [...currentFeedPosts, ...newPosts];
        currentFeedPosts.sort((a,b) => (b.timestamp?.toDate?.()||0) - (a.timestamp?.toDate?.()||0));
        renderFeed(currentFeedPosts);
      }
      const newFollowers = await window.db.collection('follows').where('followingId', '==', userId).get();
      const statsDiv = modalContent.querySelector('.profile-modal-stats');
      statsDiv.innerHTML = `<span><strong>${newFollowers.size}</strong> Followers</span><span><strong>${followingCount}</strong> Following</span>`;
      await loadSuggestions();
    });
  }
}

// ---------- Create Post UI ----------
function renderCreatePostForm() {
  const container = document.getElementById('createPostContainer');
  if (!container) return;
  const currentUser = window.getCurrentUser();
  if (!currentUser) { container.innerHTML = '<div class="create-post-placeholder">Login to share your thoughts</div>'; return; }
  container.innerHTML = `<div class="create-post-card"><textarea id="postText" rows="2" placeholder="What's on your mind? (text only)"></textarea><button id="submitPostBtn" class="submit-post-btn">Post</button></div>`;
  document.getElementById('submitPostBtn').addEventListener('click', async () => {
    const text = document.getElementById('postText').value.trim();
    if (!text) { window.showToast('Please write something', 'error'); return; }
    await createPost(text);
    document.getElementById('postText').value = '';
  });
}

// ---------- Reset ----------
window.resetCommunityData = function() {
  communityDataLoaded = false;
  currentFeedPosts = [];
  allUsersCache = [];
  const feed = document.getElementById('communityFeedContainer');
  if (feed) feed.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading feed...</div>';
  const suggestions = document.getElementById('suggestionsContainer');
  if (suggestions) suggestions.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading suggestions...</div>';
};

// ---------- Main entry ----------
window.loadCommunitySection = async function(forceRefresh = false) {
  if (!forceRefresh && communityDataLoaded) return;
  renderCreatePostForm();
  await Promise.all([loadCommunityFeed(), loadSuggestions()]);
  communityDataLoaded = true;
};

window.initCommunity = function() {
  renderCreatePostForm();
  const modal = document.getElementById('userProfileModal');
  const closeBtn = modal.querySelector('.close-profile-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
};