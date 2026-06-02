// login.js – Complete with account switching (add & switch without full logout)

window.initAuth = function() {
  const loginBtn = document.getElementById('loginBtn');
  const googleBtn = document.getElementById('googleLoginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const showSignup = document.getElementById('showSignup');
  const showLogin = document.getElementById('showLogin');

  // ---------- Account Switching Logic ----------
  const SWITCH_KEY = 'chromashare_accounts';
  
  function getSavedAccounts() {
    const raw = localStorage.getItem(SWITCH_KEY);
    return raw ? JSON.parse(raw) : [];
  }
  
  function saveAccount(account) {
    let accounts = getSavedAccounts();
    // avoid duplicates by email
    if (!accounts.find(a => a.email === account.email)) {
      accounts.push(account);
      localStorage.setItem(SWITCH_KEY, JSON.stringify(accounts));
    }
    return accounts;
  }
  
  function removeAccount(email) {
    let accounts = getSavedAccounts().filter(a => a.email !== email);
    localStorage.setItem(SWITCH_KEY, JSON.stringify(accounts));
  }
  
  // Show the switch account modal
  function showSwitchModal() {
    let modal = document.getElementById('switchAccountModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'switchAccountModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 380px;">
          <span class="close close-switch-modal">&times;</span>
          <h3>Switch Account</h3>
          <div id="accountList" style="margin: 1rem 0;"></div>
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
            ${isCurrent ? '<span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 20px; font-size: 0.7rem;">Current</span>' : ''}
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
      
      // attach click handlers for each account
      document.querySelectorAll('.account-switch-item').forEach(el => {
        el.addEventListener('click', async () => {
          const email = el.dataset.email;
          const provider = el.dataset.provider;
          const isCurrent = (email === currentEmail);
          if (isCurrent) {
            modal.style.display = 'none';
            return;
          }
          // Sign out current and switch
          await firebase.auth().signOut();
          if (provider === 'google') {
            const googleProvider = new firebase.auth.GoogleAuthProvider();
            try {
              await firebase.auth().signInWithPopup(googleProvider);
              window.showToast(`Switched to ${email}`, 'success');
            } catch (err) {
              window.showToast(err.message, 'error');
            }
          } else {
            // email/password – prompt for password
            const pwd = prompt(`Enter password for ${email}`);
            if (pwd) {
              try {
                await firebase.auth().signInWithEmailAndPassword(email, pwd);
                window.showToast(`Switched to ${email}`, 'success');
              } catch (err) {
                window.showToast(err.message, 'error');
              }
            }
          }
          modal.style.display = 'none';
        });
      });
    }
    
    document.getElementById('addAccountBtn').onclick = () => {
      modal.style.display = 'none';
      window.showModal(); // open main login modal
    };
    
    modal.style.display = 'flex';
  }
  
  // Listen to successful logins to save the account
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      let provider = 'email';
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
      saveAccount(account);
    }
  });
  
  // Override the switch account menu item in user dropdown
  const originalLogout = window.logoutUser;
  window.logoutUser = function() {
    firebase.auth().signOut();
    window.showToast('Logged out', 'info');
  };
  // Attach switch handler to the existing "Switch Account" button (created dynamically)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#switchAccountItem')) {
      e.preventDefault();
      showSwitchModal();
    }
  });
  // Also for the mobile menu if needed
  if (document.getElementById('switchAccountItem')) {
    document.getElementById('switchAccountItem').addEventListener('click', showSwitchModal);
  }
  
  // ---------- Original Authentication Handlers ----------
  if (loginBtn) {
    loginBtn.onclick = async () => {
      const email = document.getElementById('loginEmail')?.value;
      const pwd = document.getElementById('loginPassword')?.value;
      if (!email || !pwd) {
        window.showToast('Please enter email and password', 'error');
        return;
      }
      try {
        await firebase.auth().signInWithEmailAndPassword(email, pwd);
        window.closeModal();
        window.showToast('Logged in successfully!', 'success');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
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