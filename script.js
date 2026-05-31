// script.js - Main entry (global version) with Community section

const firebaseConfig = {
  apiKey: "AIzaSyDsp1FGBBDL8bFEVBY1OeaN_OSTX8fG0Fw",
  authDomain: "color-f7ea7.firebaseapp.com",
  projectId: "color-f7ea7",
  storageBucket: "color-f7ea7.firebasestorage.app",
  messagingSenderId: "30412901682",
  appId: "1:30412901682:web:2475fc3a31a74ce0f85b2b",
  measurementId: "G-65R3GNMT69"
};

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db = firebase.firestore();
window.storage = firebase.storage();

let currentUser = null;
let userMenuDropdown = null; // For logged-in user menu

// DOM element references
let homeSection, chatbotSection, communitySection, profileSection, navBtns, authBtn, profileNavBtn;

function showSection(sectionId) {
  if (!homeSection || !chatbotSection || !profileSection || !communitySection) return;
  homeSection.classList.remove('active');
  chatbotSection.classList.remove('active');
  communitySection.classList.remove('active');
  profileSection.classList.remove('active');
  if (sectionId === 'home') homeSection.classList.add('active');
  else if (sectionId === 'chatbot') chatbotSection.classList.add('active');
  else if (sectionId === 'community') communitySection.classList.add('active');
  else if (sectionId === 'profile') profileSection.classList.add('active');
  navBtns.forEach(btn => {
    if (btn.dataset.section === sectionId) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

window.showSection = showSection;
window.getCurrentUser = () => currentUser;

// Show toast notification
window.showToast = function(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

// Modal control functions (for login/signup)
window.showModal = function() {
  console.log('showModal called');
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'flex';
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm) loginForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
  } else {
    console.error('Modal element not found');
  }
};

window.closeModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
};

// Create user dropdown menu
function createUserMenu() {
  if (userMenuDropdown) userMenuDropdown.remove();
  const menu = document.createElement('div');
  menu.className = 'user-dropdown';
  menu.innerHTML = `
    <div class="user-dropdown-item" id="logoutItem"><i class="fas fa-sign-out-alt"></i> Logout</div>
    <div class="user-dropdown-item" id="switchAccountItem"><i class="fas fa-exchange-alt"></i> Switch Account</div>
  `;
  document.body.appendChild(menu);
  const logoutItem = document.getElementById('logoutItem');
  const switchItem = document.getElementById('switchAccountItem');
  logoutItem.addEventListener('click', () => {
    window.logoutUser();
    menu.remove();
    userMenuDropdown = null;
  });
  switchItem.addEventListener('click', () => {
    window.logoutUser();
    setTimeout(() => {
      window.showModal();
    }, 500);
    menu.remove();
    userMenuDropdown = null;
  });
  return menu;
}

// Position dropdown relative to auth button
function positionUserMenu(btn) {
  if (userMenuDropdown) userMenuDropdown.remove();
  userMenuDropdown = createUserMenu();
  const rect = btn.getBoundingClientRect();
  userMenuDropdown.style.top = rect.bottom + window.scrollY + 5 + 'px';
  userMenuDropdown.style.left = rect.left + window.scrollX + 'px';
  const closeHandler = (e) => {
    if (!userMenuDropdown.contains(e.target) && e.target !== btn) {
      userMenuDropdown.remove();
      userMenuDropdown = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 100);
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  homeSection = document.getElementById('homeSection');
  chatbotSection = document.getElementById('chatbotSection');
  communitySection = document.getElementById('communitySection');
  profileSection = document.getElementById('profileSection');
  navBtns = document.querySelectorAll('.nav-btn[data-section]');
  authBtn = document.getElementById('authBtn');
  profileNavBtn = document.getElementById('profileNavBtn');
  const closeModalBtn = document.querySelector('.close');

  // Auth state listener
  firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      const userDoc = await window.db.collection('users').doc(user.uid).get();
      const userData = userDoc.data();
      const displayName = userData?.username || user.displayName?.split(' ')[0] || 'User';
      if (authBtn) authBtn.innerHTML = `<i class="fas fa-user-circle"></i> ${displayName} <i class="fas fa-chevron-down"></i>`;
      if (profileNavBtn) profileNavBtn.style.display = 'flex';
      if (window.updateUIForUser) window.updateUIForUser(user);
      if (window.loadProfilePage) window.loadProfilePage(user.uid);
      if (!window._profileInited && window.initProfile) {
        window.initProfile(user);
        window._profileInited = true;
      }
      authBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        positionUserMenu(authBtn);
      };
    } else {
      if (authBtn) {
        authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        authBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.showModal();
        };
      }
      if (profileNavBtn) profileNavBtn.style.display = 'none';
      const usernameEl = document.getElementById('profileUsername');
      if (usernameEl) usernameEl.innerText = 'Guest';
      const bioEl = document.getElementById('profileBio');
      if (bioEl) bioEl.innerText = 'Please login to edit profile';
    }
    // Load initial section content if active
    if (homeSection && homeSection.classList.contains('active') && window.loadPublicPalettes) {
      window.loadPublicPalettes(currentUser);
    }
    if (communitySection && communitySection.classList.contains('active') && window.loadCommunitySection) {
      window.loadCommunitySection();
    }
  });

  // Navigation
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      showSection(section);
      if (section === 'home' && window.loadPublicPalettes) {
        window.loadPublicPalettes(currentUser);
      }
      if (section === 'profile' && currentUser && window.loadProfilePage) {
        window.loadProfilePage(currentUser.uid);
      }
      if (section === 'community' && window.loadCommunitySection) {
        window.loadCommunitySection();
      }
    });
  });

  // Close modal when clicking X
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      window.closeModal();
    });
  }

  // Click outside modal to close
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('authModal');
    if (e.target === modal) {
      window.closeModal();
    }
  });

  // Initialize auth, chatbot, and community
  if (window.initAuth) window.initAuth();
  if (window.initChatbot) window.initChatbot();
  if (window.initCommunity) window.initCommunity();
});