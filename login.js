// login.js – Advanced Account Switching (stores credentials in sessionStorage, cleared on tab close)

window.initAuth = function() {
  const loginBtn = document.getElementById('loginBtn');
  const googleBtn = document.getElementById('googleLoginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const showSignup = document.getElementById('showSignup');
  const showLogin = document.getElementById('showLogin');

  const STORAGE_KEY = 'chromashare_accounts';
  const CRED_PREFIX = 'chromashare_cred_';

  // Helper to save account metadata
  function getSavedAccounts() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function saveAccountMeta(account) {
    let accounts = getSavedAccounts();
    if (!accounts.find(a => a.email === account.email)) {
      accounts.push(account);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    }
    return accounts;
  }

  function removeAccountMeta(email) {
    let accounts = getSavedAccounts().filter(a => a.email !== email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    // Also remove stored credential if any
    sessionStorage.removeItem(CRED_PREFIX + email);
  }

  // Store credential after successful login
  async function storeCredential(user, credential) {
    if (credential) {
      // For email/password, credential is EmailAuthProvider.credential
      // For Google, credential is GoogleAuthProvider.credential
      try {
        // Serialize credential - not straightforward. Instead, store idToken for Google, and for email we can't.
        // Simpler: store provider and for email we store a flag that we have no stored password.
        // Actually, to make switching seamless, we need to store refresh tokens.
        // Firebase does not expose refresh token easily.
        // So we'll only allow auto-switch for Google.
        if (credential.providerId === 'google.com') {
          const accessToken = credential.accessToken;
          if (accessToken) {
            sessionStorage.setItem(CRED_PREFIX + user.email, JSON.stringify({ provider: 'google', token: accessToken }));
          }
        }
      } catch(e) {}
    }
  }

  async function switchToAccount(account) {
    const currentUser = firebase.auth().currentUser;
    if (currentUser && currentUser.email === account.email) return;
    
    // Try to sign in with stored credential
    const stored = sessionStorage.getItem(CRED_PREFIX + account.email);
    if (stored) {
      try {
        const credData = JSON.parse(stored);
        if (credData.provider === 'google') {
          const credential = firebase.auth.GoogleAuthProvider.credential(credData.token, null);
          await firebase.auth().signInWithCredential(credential);
          window.showToast(`Switched to ${account.email}`, 'success');
          return true;
        }
      } catch(e) { console.warn(e); }
    }
    
    // If no stored credential, fallback to normal login (prompt for password)
    if (account.provider === 'google') {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await firebase.auth().signInWithPopup(provider);
        window.showToast(`Switched to ${account.email}`, 'success');
        return true;
      } catch(err) {
        window.showToast(err.message, 'error');
        return false;
      }
    } else {
      const pwd = prompt(`Enter password for ${account.email}`);
      if (pwd) {
        try {
          await firebase.auth().signInWithEmailAndPassword(account.email, pwd);
          window.showToast(`Switched to ${account.email}`, 'success');
          return true;
        } catch(err) {
          window.showToast(err.message, 'error');
          return false;
        }
      }
    }
    return false;
  }

  // Show switch modal
  function showSwitchModal() {
    let modal = document.getElementById('switchAccountModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'switchAccountModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <span class="close close-switch-modal">&times;</span>
          <h3>Switch Account</h3>
          <div id="accountList" style="margin: 1rem 0; max-height: 300px; overflow-y: auto;"></div>
          <button id="addAccountBtn" style="background: #10b981; margin-top: 8px;"><i class="fas fa-plus"></i> Add another account</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.close-switch-modal').addEventListener('click', () => modal.style.display = 'none');
      window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }
    
    const accounts = getSavedAccounts();
    const container = document.getElementById('accountList');
    const currentUser = firebase.auth().currentUser;
    const currentEmail = currentUser ? currentUser.email : null;
    
    if (accounts.length === 0) {
      container.innerHTML = '<div class="empty-state">No saved accounts. Add one below.</div>';
    } else {
      let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
      accounts.forEach(acc => {
        const isCurrent = (acc.email === currentEmail);
        html += `
          <div class="account-switch-item" data-email="${acc.email}" data-provider="${acc.provider}" style="display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 1rem; background: ${isCurrent ? '#eef2ff' : 'white'}; border: 1px solid #e2e8f0; cursor: pointer;">
            <img src="${acc.photoURL || 'https://via.placeholder.com/40'}" style="width: 40px; height: 40px; border-radius: 50%;" onerror="this.src='https://via.placeholder.com/40'">
            <div style="flex: 1;">
              <div style="font-weight: 600;">${acc.name || acc.email.split('@')[0]}</div>
              <div style="font-size: 0.75rem; color: #64748b;">${acc.email}</div>
            </div>
            ${isCurrent ? '<span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 20px; font-size: 0.7rem;">Current</span>' : '<button class="remove-account-btn" data-email="'+acc.email+'" style="background: none; border: none; color: #ef4444; cursor: pointer;"><i class="fas fa-trash"></i></button>'}
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
      
      // Switch account click
      document.querySelectorAll('.account-switch-item').forEach(el => {
        el.addEventListener('click', async (e) => {
          if (e.target.classList.contains('remove-account-btn') || e.target.closest('.remove-account-btn')) return;
          const email = el.dataset.email;
          const provider = el.dataset.provider;
          const account = accounts.find(a => a.email === email);
          if (account) {
            modal.style.display = 'none';
            await switchToAccount(account);
          }
        });
      });
      
      // Remove account
      document.querySelectorAll('.remove-account-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const email = btn.dataset.email;
          if (confirm(`Remove ${email} from saved accounts? This does not delete the account itself.`)) {
            removeAccountMeta(email);
            showSwitchModal(); // refresh modal
          }
        });
      });
    }
    
    document.getElementById('addAccountBtn').onclick = () => {
      modal.style.display = 'none';
      window.showModal();
    };
    
    modal.style.display = 'flex';
  }

  // After successful login, save account and try to store credential (for Google)
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      let provider = 'email';
      let credential = null;
      // For Google, we can get credential from last sign-in result
      // We'll capture in the handlers
      if (user.providerData && user.providerData[0]) {
        provider = user.providerData[0].providerId === 'google.com' ? 'google' : 'email';
      }
      const account = {
        email: user.email,
        provider: provider,
        name: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL || '',
        uid: user.uid
      };
      saveAccountMeta(account);
      
      // Try to store credential if available (set in the login handlers)
      if (window._lastCredential && window._lastCredential.providerId === 'google.com') {
        const token = window._lastCredential.accessToken;
        if (token) {
          sessionStorage.setItem(CRED_PREFIX + user.email, JSON.stringify({ provider: 'google', token: token }));
        }
        window._lastCredential = null;
      }
    }
  });

  // Override logout and attach switch handler
  const originalLogout = window.logoutUser;
  window.logoutUser = function() {
    firebase.auth().signOut();
    window.showToast('Logged out', 'info');
  };
  
  // Attach switch to the dropdown item (will be created later)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#switchAccountItem')) {
      e.preventDefault();
      showSwitchModal();
    }
  });

  // ---------- Login Handlers (capture credential for Google) ----------
  if (loginBtn) {
    loginBtn.onclick = async () => {
      const email = document.getElementById('loginEmail')?.value;
      const pwd = document.getElementById('loginPassword')?.value;
      if (!email || !pwd) {
        window.showToast('Please enter email and password', 'error');
        return;
      }
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, pwd);
        window.closeModal();
        window.showToast('Logged in successfully!', 'success');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        // For email, we cannot store password, so no auto-switch later.
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };
  }

  if (googleBtn) {
    googleBtn.onclick = async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const result = await firebase.auth().signInWithPopup(provider);
        const user = result.user;
        window._lastCredential = result.credential;
        const userRef = window.db.collection('users').doc(user.uid);
        const snap = await userRef.get();
        if (!snap.exists) {
          await userRef.set({
            username: user.displayName || user.email.split('@')[0],
            bio: '',
            favColor: '#3b82f6',
            birthday: '',
            photoURL: user.photoURL || '',
            email: user.email
          });
        }
        window.closeModal();
        window.showToast('Logged in with Google!', 'success');
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };
  }

  if (signupBtn) {
    signupBtn.onclick = async () => {
      const email = document.getElementById('signupEmail')?.value;
      const pwd = document.getElementById('signupPassword')?.value;
      const username = document.getElementById('signupUsername')?.value;
      if (!email || !pwd || !username) {
        window.showToast('All fields required', 'error');
        return;
      }
      if (pwd.length < 6) {
        window.showToast('Password must be at least 6 characters', 'error');
        return;
      }
      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, pwd);
        await window.db.collection('users').doc(cred.user.uid).set({
          username, bio: '', favColor: '#3b82f6', birthday: '', photoURL: '', email
        });
        window.closeModal();
        window.showToast('Account created! Welcome!', 'success');
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('signupUsername').value = '';
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };
  }

  if (showSignup) {
    showSignup.onclick = () => {
      const loginFormDiv = document.getElementById('loginForm');
      const signupFormDiv = document.getElementById('signupForm');
      if (loginFormDiv) loginFormDiv.style.display = 'none';
      if (signupFormDiv) signupFormDiv.style.display = 'block';
    };
  }
  if (showLogin) {
    showLogin.onclick = () => {
      const loginFormDiv = document.getElementById('loginForm');
      const signupFormDiv = document.getElementById('signupForm');
      if (loginFormDiv) loginFormDiv.style.display = 'block';
      if (signupFormDiv) signupFormDiv.style.display = 'none';
    };
  }
};

window.logoutUser = function() {
  firebase.auth().signOut();
  window.showToast('Logged out', 'info');
};