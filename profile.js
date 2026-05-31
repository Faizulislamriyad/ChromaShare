// profile.js – Cloudinary upload + My Posts section (edit/delete)

window.loadProfilePage = async function(uid) {
  try {
    const userDoc = await window.db.collection('users').doc(uid).get();
    if (!userDoc.exists) return;
    const data = userDoc.data();

    document.getElementById('profileUsername').innerText = data.username || 'User';
    document.getElementById('profileBio').innerText = data.bio || 'No bio yet';

    const favSpan = document.getElementById('profileFavColor');
    if (favSpan) {
      favSpan.innerHTML = `<span style="display:inline-block;width:20px;height:20px;background:${data.favColor};border-radius:50%;margin-right:8px;"></span> ${data.favColor}`;
    }

    let birthdayDisplay = 'Not set';
    if (data.birthday) {
      const [year, month, day] = data.birthday.split('-');
      birthdayDisplay = `${day}-${month}-${year}`;
    }
    document.getElementById('profileBirthday').innerText = birthdayDisplay;

    const avatarImg = document.getElementById('avatarImg');
    avatarImg.src = data.photoURL || 'https://via.placeholder.com/120';
    avatarImg.onerror = () => { avatarImg.src = 'https://via.placeholder.com/120'; };

    document.getElementById('editUsername').value = data.username || '';
    document.getElementById('editBio').value = data.bio || '';
    document.getElementById('editFavColor').value = data.favColor || '#3b82f6';
    document.getElementById('editBirthday').value = data.birthday || '';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('editBirthday').setAttribute('max', today);

    // Load user's posts after profile data is loaded
    if (window.getCurrentUser() && window.getCurrentUser().uid === uid) {
      await loadUserPosts(uid);
    } else {
      const myPostsDiv = document.getElementById('myPostsContainer');
      if (myPostsDiv) myPostsDiv.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><p>Login to see your posts</p></div>';
    }
  } catch (err) {
    console.error(err);
    window.showToast('Error loading profile', 'error');
  }
};

window.updateUIForUser = (user) => user && window.loadProfilePage(user.uid);

// ---------- Cloudinary upload (unchanged) ----------
async function uploadToCloudinary(file) {
  const cloudName = 'dvpkkodlk';
  const uploadPreset = 'chromashare_avatar';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.secure_url;
}

// ---------- Load user's own posts ----------
async function loadUserPosts(uid) {
  const container = document.getElementById('myPostsContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading your posts...</div>';
  try {
    const snapshot = await window.db.collection('posts')
      .where('userId', '==', uid)
      .orderBy('timestamp', 'desc')
      .get();
    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-edit"></i><p>You haven’t posted anything yet. Go to Community to share!</p></div>';
      return;
    }
    let html = '<div class="my-posts-grid">';
    for (const doc of snapshot.docs) {
      const post = doc.data();
      const timestamp = post.timestamp ? post.timestamp.toDate() : new Date();
      const dateStr = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
      html += `
        <div class="my-post-card" data-post-id="${doc.id}">
          <div class="my-post-header">
            <span class="my-post-date">${dateStr}</span>
            <div class="my-post-actions">
              <button class="edit-post-btn" data-id="${doc.id}" data-text="${escapeHtml(post.text)}"><i class="fas fa-edit"></i> Edit</button>
              <button class="delete-post-btn" data-id="${doc.id}"><i class="fas fa-trash"></i> Delete</button>
            </div>
          </div>
          <div class="my-post-text">${escapeHtml(post.text)}</div>
        </div>
      `;
    }
    html += '</div>';
    container.innerHTML = html;
    // Attach edit/delete handlers
    document.querySelectorAll('.edit-post-btn').forEach(btn => {
      btn.addEventListener('click', () => editPost(btn.dataset.id, btn.dataset.text));
    });
    document.querySelectorAll('.delete-post-btn').forEach(btn => {
      btn.addEventListener('click', () => deletePost(btn.dataset.id));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading your posts</p></div>';
  }
}

// Edit post modal
function editPost(postId, currentText) {
  const modal = document.getElementById('editPostModal');
  const textarea = document.getElementById('editPostText');
  textarea.value = currentText;
  modal.style.display = 'flex';
  const saveBtn = document.getElementById('savePostEditBtn');
  const cancelBtn = document.getElementById('cancelPostEditBtn');
  const closeBtn = modal.querySelector('.close-edit-modal');
  const saveHandler = async () => {
    const newText = textarea.value.trim();
    if (!newText) {
      window.showToast('Post cannot be empty', 'error');
      return;
    }
    try {
      await window.db.collection('posts').doc(postId).update({ text: newText });
      window.showToast('Post updated!', 'success');
      modal.style.display = 'none';
      // Reload user posts
      const user = window.getCurrentUser();
      if (user) await loadUserPosts(user.uid);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  };
  const cancelHandler = () => { modal.style.display = 'none'; };
  saveBtn.onclick = saveHandler;
  cancelBtn.onclick = cancelHandler;
  if (closeBtn) closeBtn.onclick = cancelHandler;
  window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

async function deletePost(postId) {
  if (!confirm('Delete this post permanently?')) return;
  try {
    await window.db.collection('posts').doc(postId).delete();
    window.showToast('Post deleted', 'success');
    const user = window.getCurrentUser();
    if (user) await loadUserPosts(user.uid);
  } catch (err) {
    window.showToast(err.message, 'error');
  }
}

// ---------- Profile initialization (unchanged) ----------
window.initProfile = function(user) {
  const editBtn = document.getElementById('editProfileBtn');
  const form = document.getElementById('editProfileForm');
  const saveBtn = document.getElementById('saveProfileBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const avatarUpload = document.getElementById('avatarUpload');
  const logoutBtn = document.getElementById('logoutBtn');

  if (editBtn && form) {
    editBtn.onclick = () => { form.style.display = 'block'; editBtn.style.display = 'none'; };
  }
  if (cancelBtn && editBtn && form) {
    cancelBtn.onclick = () => { form.style.display = 'none'; editBtn.style.display = 'block'; };
  }
  if (saveBtn && editBtn && form) {
    saveBtn.onclick = async () => {
      const username = document.getElementById('editUsername')?.value.trim();
      const bio = document.getElementById('editBio')?.value;
      const favColor = document.getElementById('editFavColor')?.value;
      let birthday = document.getElementById('editBirthday')?.value;
      if (!username) {
        window.showToast('Username cannot be empty', 'error');
        return;
      }
      if (birthday && new Date(birthday) > new Date()) {
        window.showToast('Birthday cannot be in the future', 'error');
        return;
      }
      try {
        await window.db.collection('users').doc(user.uid).update({ username, bio, favColor, birthday });
        window.loadProfilePage(user.uid);
        form.style.display = 'none';
        editBtn.style.display = 'block';
        window.showToast('Profile updated!', 'success');
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };
  }
  if (avatarUpload) {
    avatarUpload.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast('Please select an image file', 'error');
        avatarUpload.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        window.showToast('Image must be less than 5MB', 'error');
        avatarUpload.value = '';
        return;
      }
      const uploadIcon = document.querySelector('.upload-icon');
      const originalIcon = uploadIcon.innerHTML;
      uploadIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const imageUrl = await uploadToCloudinary(file);
        await window.db.collection('users').doc(user.uid).update({ photoURL: imageUrl });
        const avatarImg = document.getElementById('avatarImg');
        if (avatarImg) avatarImg.src = imageUrl;
        window.showToast('Avatar updated successfully!', 'success');
      } catch (err) {
        console.error(err);
        window.showToast('Upload failed: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        uploadIcon.innerHTML = originalIcon;
        avatarUpload.value = '';
      }
    };
  }
  if (logoutBtn) {
    logoutBtn.onclick = () => { window.logoutUser(); setTimeout(() => window.location.reload(), 500); };
  }
};