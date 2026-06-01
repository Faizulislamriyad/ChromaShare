// script.js - Main entry with Community caching, mobile menu, messaging & notifications

const firebaseConfig = {
  apiKey: "AIzaSyDsp1FGBBDL8bFEVBY1OeaN_OSTX8fG0Fw",
  authDomain: "color-f7ea7.firebaseapp.com",
  projectId: "color-f7ea7",
  storageBucket: "color-f7ea7.firebasestorage.app",
  messagingSenderId: "30412901682",
  appId: "1:30412901682:web:2475fc3a31a74ce0f85b2b",
  measurementId: "G-65R3GNMT69"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db = firebase.firestore();
window.storage = firebase.storage();

let currentUser = null;
let userMenuDropdown = null;
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

window.showToast = function(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

window.showModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
  }
};

window.closeModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
};

function createUserMenu() {
  if (userMenuDropdown) userMenuDropdown.remove();
  const menu = document.createElement('div');
  menu.className = 'user-dropdown';
  menu.innerHTML = `
    <div class="user-dropdown-item" id="logoutItem"><i class="fas fa-sign-out-alt"></i> Logout</div>
    <div class="user-dropdown-item" id="switchAccountItem"><i class="fas fa-exchange-alt"></i> Switch Account</div>
  `;
  document.body.appendChild(menu);
  document.getElementById('logoutItem').addEventListener('click', () => {
    window.logoutUser();
    menu.remove();
    userMenuDropdown = null;
  });
  // Switch Account – call the modal from login.js
  document.getElementById('switchAccountItem').addEventListener('click', () => {
    if (window.showSwitchModal) {
      window.showSwitchModal();
    } else {
      window.showToast('Switch account not ready', 'error');
    }
    menu.remove();
    userMenuDropdown = null;
  });
  return menu;
}

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
  setTimeout(() => document.addEventListener('click', closeHandler), 100);
}

function positionUserMenuRight(btn) {
  if (userMenuDropdown) userMenuDropdown.remove();
  userMenuDropdown = createUserMenu();
  const rect = btn.getBoundingClientRect();
  userMenuDropdown.style.top = rect.bottom + window.scrollY + 5 + 'px';
  const dropdownWidth = userMenuDropdown.offsetWidth;
  userMenuDropdown.style.left = (rect.right - dropdownWidth) + window.scrollX + 'px';
  userMenuDropdown.style.right = 'auto';
  const closeHandler = (e) => {
    if (!userMenuDropdown.contains(e.target) && e.target !== btn) {
      userMenuDropdown.remove();
      userMenuDropdown = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 100);
}

document.addEventListener('DOMContentLoaded', () => {
  homeSection = document.getElementById('homeSection');
  chatbotSection = document.getElementById('chatbotSection');
  communitySection = document.getElementById('communitySection');
  profileSection = document.getElementById('profileSection');
  navBtns = document.querySelectorAll('.nav-btn[data-section]');
  authBtn = document.getElementById('authBtn');
  profileNavBtn = document.getElementById('profileNavBtn');
  const closeModalBtn = document.querySelector('.close');

  firebase.auth().onAuthStateChanged(async (user) => {
    if (window.resetCommunityData) window.resetCommunityData();
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
        positionUserMenu(authBtn);
      };
      // Refresh messaging & notifications after login
      if (window.loadConversations) window.loadConversations();
      if (window.loadNotifications) window.loadNotifications();
    } else {
      if (authBtn) {
        authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        authBtn.onclick = (e) => {
          e.preventDefault();
          window.showModal();
        };
      }
      if (profileNavBtn) profileNavBtn.style.display = 'none';
      document.getElementById('profileUsername').innerText = 'Guest';
      document.getElementById('profileBio').innerText = 'Please login to edit profile';
    }
    if (homeSection?.classList.contains('active') && window.loadPublicPalettes) {
      window.loadPublicPalettes(currentUser);
    }
    if (communitySection?.classList.contains('active') && window.loadCommunitySection) {
      window.loadCommunitySection(true);
    }
  });

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      showSection(section);
      if (section === 'home' && window.loadPublicPalettes) window.loadPublicPalettes(currentUser);
      if (section === 'profile' && currentUser && window.loadProfilePage) window.loadProfilePage(currentUser.uid);
      if (section === 'community' && window.loadCommunitySection) window.loadCommunitySection();
    });
  });

  if (closeModalBtn) closeModalBtn.addEventListener('click', () => window.closeModal());
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('authModal')) window.closeModal();
  });

  if (window.initAuth) window.initAuth();
  if (window.initChatbot) window.initChatbot();
  if (window.initCommunity) window.initCommunity();
  if (window.initMessaging) window.initMessaging();
  if (window.initNotifications) window.initNotifications();

  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const user = firebase.auth().currentUser;
      if (!user) window.showModal();
      else positionUserMenuRight(mobileMenuBtn);
    });
  }

  // Floating buttons
  document.getElementById('chatFloatingBtn')?.addEventListener('click', () => window.openChatModal());
  document.getElementById('notifFloatingBtn')?.addEventListener('click', () => window.openNotificationModal());
});

window.logoutUser = function() {
  firebase.auth().signOut();
  window.showToast('Logged out', 'info');
};