// login.js
// Note: window.showModal and window.closeModal are already defined in script.js
// We just add authentication handlers here

window.initAuth = function() {
  const loginBtn = document.getElementById('loginBtn');
  const googleBtn = document.getElementById('googleLoginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const showSignup = document.getElementById('showSignup');
  const showLogin = document.getElementById('showLogin');

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