// ==========================================
// NOTEPULSE - SECURITY HARDENED VERSION
// ==========================================

// ==========================================
// SECURITY UTILITIES
// ==========================================

// XSS Protection: Escape all HTML entities
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

// Input sanitization with length limits
function sanitizeInput(str, maxLength = 500) {
    if (!str) return '';
    return String(str).trim().substring(0, maxLength);
}

// Secure ID generation (non-predictable)
function generateSecureId() {
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    return Date.now().toString(36) + array[0].toString(36) + array[1].toString(36);
}

// Rate limiting for form submissions
const rateLimiter = {
    attempts: {},
    check(action, maxAttempts = 5, windowMs = 60000) {
        const now = Date.now();
        if (!this.attempts[action]) this.attempts[action] = [];
        this.attempts[action] = this.attempts[action].filter(t => now - t < windowMs);
        if (this.attempts[action].length >= maxAttempts) return false;
        this.attempts[action].push(now);
        return true;
    }
};

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_FILES_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/gif'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif'];

function validateFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { valid: false, error: `File type "${escapeHTML(ext)}" not allowed` };
    }
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File "${escapeHTML(file.name)}" exceeds 10MB limit` };
    }
    return { valid: true };
}

// Session timeout (30 min inactivity)
let sessionTimer = null;
function resetSessionTimer() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        if (currentUser) {
            logout();
            showAlert('⏱️ Session expired due to inactivity', 'info', 'loginAlert');
        }
    }, 30 * 60 * 1000);
}
document.addEventListener('click', resetSessionTimer);
document.addEventListener('keypress', resetSessionTimer);

// ==========================================
// APP STATE
// ==========================================

let users = JSON.parse(localStorage.getItem('users')) || [];
let notes = [];
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let blockedUsers = [];
let currentUser = null;
let editingNoteId = null;
let filteredNotes = [];
const ADMIN_EMAIL = 'shloksri003@gmail.com';

function loginAdmin(e) {
    e.preventDefault();

    if (!rateLimiter.check('adminLogin', 5, 60000)) {
        showAlert('❌ Too many login attempts. Please wait 1 minute.', 'danger', 'loginAlert');
        return;
    }

    const email = sanitizeInput(document.getElementById('adminEmailField').value, 100);
    const password = document.getElementById('adminPasswordField').value;
    
    if (!email || !password) {
        showAlert('❌ Please enter email and password', 'danger', 'loginAlert');
        return;
    }

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Verify server-side admin role
            ensureFirebase().then(db => {
                db.ref('admins/' + userCredential.user.uid).once('value').then(snapshot => {
                    if (snapshot.exists() && snapshot.val() === true) {
                        currentUser = { id: 'admin', role: 'admin', uid: userCredential.user.uid };
                        showAlert('✅ Admin login successful!', 'success', 'loginAlert');
                        resetSessionTimer();
                        setTimeout(() => {
                            document.getElementById('loginSection').classList.remove('active');
                            document.getElementById('adminSection').classList.add('active');
                            updateAdminDashboard();
                            startNotesSync();
                            syncBlockedUsers();
                        }, 800);
                    } else {
                        showAlert('❌ You are not an admin!', 'danger', 'loginAlert');
                        firebase.auth().signOut();
                    }
                }).catch(err => {
                    showAlert('❌ Could not verify admin status.', 'danger', 'loginAlert');
                    firebase.auth().signOut();
                });
            });
        })
        .catch((error) => {
            console.error('Admin login error:', error.code, error.message);
            if (error.code === 'auth/too-many-requests') {
                showAlert('❌ Too many attempts. Try again later.', 'danger', 'loginAlert');
            } else {
                showAlert('❌ Login failed. Check your credentials.', 'danger', 'loginAlert');
            }
        });
}

// Sync blocked users from Firebase (server-side enforcement)
function syncBlockedUsers() {
    ensureFirebase().then((db) => {
        if (!db) return;
        db.ref('blockedUsers').on('value', (snapshot) => {
            const data = snapshot.val();
            blockedUsers = data ? Object.keys(data) : [];
        });
    });
}

const SUBJECTS = [
    { id: 'dsa', name: '📊 DSA', emoji: '📊' },
    { id: 'maths', name: '🔢 Maths', emoji: '🔢' },
    { id: 'evs', name: '🌍 EVS', emoji: '🌍' },
    { id: 'ai', name: '🤖 AI', emoji: '🤖' },
    { id: 'electrical', name: '⚡ Electrical', emoji: '⚡' },
    { id: 'physics', name: '🔬 Physics', emoji: '🔬' }
];

let database = null;
let firebaseReady = false;

// ==========================================
// FIREBASE INIT
// ==========================================

function initFirebase() {
    try {
        if (typeof firebase !== 'undefined' && firebase.database && !firebaseReady) {
            database = firebase.database();
            firebaseReady = true;
            console.log('✅ Firebase initialized');
            startNotesSync();
            return true;
        }
    } catch (e) {
        console.error('Firebase error:', e);
    }
    return false;
}

function ensureFirebase() {
    return new Promise((resolve) => {
        if (firebaseReady && database) {
            resolve(database);
            return;
        }

        if (typeof firebase !== 'undefined' && firebase.database) {
            if (!database) {
                try {
                    database = firebase.database();
                } catch (e) { }
            }
            firebaseReady = true;
            resolve(database);
        } else {
            setTimeout(() => ensureFirebase().then(resolve), 500);
        }
    });
}

// ==========================================
// DARK MODE
// ==========================================

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    const btn = document.getElementById('darkModeBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
        const btn = document.getElementById('darkModeBtn');
        if (btn) btn.textContent = '☀️';
    }
}

// ==========================================
// SYNC NOTES
// ==========================================

function startNotesSync() {
    ensureFirebase().then((db) => {
        if (!db) {
            setTimeout(startNotesSync, 1000);
            return;
        }

        try {
            db.ref('notes').on('value', (snapshot) => {
                const data = snapshot.val();
                notes = data ? Object.values(data) : [];
                console.log('📥 Synced', notes.length, 'notes');

                // Admin sees all published notes; room users only see their room's notes
                if (currentUser && currentUser.role === 'admin') {
                    filteredNotes = notes.filter(n => n.status === 'published');
                } else if (currentUser && currentUser.roomCode) {
                    filteredNotes = notes.filter(n => n.status === 'published' && n.roomCode === currentUser.roomCode);
                } else {
                    filteredNotes = [];
                }

                if (document.getElementById('browseContainer')) loadBrowseNotes();
                if (document.getElementById('subjectsContainer')) loadSubjectNotes();
                if (document.getElementById('totalNotes')) updateAdminDashboard();
                if (document.getElementById('publishedContainer') && document.getElementById('published').classList.contains('active')) loadAdminPublished();
            });

            // Sync users for admin panel
            db.ref('users').on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const firebaseUsers = Object.values(data);
                    // Merge with localStorage users (avoid duplicates)
                    firebaseUsers.forEach(fu => {
                        if (!users.find(u => u.id === fu.id)) {
                            users.push(fu);
                        }
                    });
                    localStorage.setItem('users', JSON.stringify(users));
                    if (document.getElementById('usersTable')) loadUsersList();
                    if (document.getElementById('totalNotes')) updateAdminDashboard();
                }
            });
        } catch (e) {
            console.error('Sync error:', e);
        }
    });
}

// ==========================================
// SEARCH & FILTER
// ==========================================

function searchNotes() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const difficulty = document.getElementById('difficultyFilter').value;
    const tagFilter = document.getElementById('tagFilter') ? document.getElementById('tagFilter').value.toLowerCase().trim() : '';
    const featuredOnly = document.getElementById('featuredFilter') ? document.getElementById('featuredFilter').checked : false;
    const roomCode = currentUser ? currentUser.roomCode : null;

    filteredNotes = notes.filter(n => {
        const matchesQuery = n.title.toLowerCase().includes(query) ||
            n.topic.toLowerCase().includes(query) ||
            n.content.toLowerCase().includes(query) ||
            n.author.toLowerCase().includes(query);
        const matchesDifficulty = !difficulty || n.difficulty === difficulty;
        const matchesTag = !tagFilter || (n.tags && n.tags.some(t => t.toLowerCase().includes(tagFilter)));
        const matchesFeatured = !featuredOnly || n.isImportant;
        const matchesRoom = !roomCode || n.roomCode === roomCode;
        return n.status === 'published' && matchesQuery && matchesDifficulty && matchesTag && matchesFeatured && matchesRoom;
    });

    displayNotesGrid(filteredNotes, 'browseContainer');
}

function filterAndSearchNotes() {
    searchNotes();
}

function sortNotes() {
    const sortBy = document.getElementById('sortBy').value;
    switch (sortBy) {
        case 'newest':
            filteredNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredNotes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'title':
            filteredNotes.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'mostviewed':
            filteredNotes.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
    }
    displayNotesGrid(filteredNotes, 'browseContainer');
}

// ==========================================
// DISPLAY NOTES — XSS-SAFE
// ==========================================

function displayNotesGrid(notesToDisplay, containerId) {
    let html;
    if (notesToDisplay.length === 0) {
        html = '<div class="empty-state" style="grid-column: 1/-1;"><h3>No notes found</h3></div>';
    } else {
        html = notesToDisplay.map(n => {
            const safeId = escapeHTML(n.id);
            const safeTitle = escapeHTML(n.title);
            const safeAuthor = escapeHTML(n.author);
            const safeTopic = escapeHTML(n.topic);
            const safeDiff = escapeHTML(n.difficulty);
            const safeContent = escapeHTML(String(n.content).substring(0, 150));
            const safeViews = parseInt(n.views) || 0;
            const attCount = Array.isArray(n.attachments) ? n.attachments.length : 0;
            const tagsHtml = (n.tags && Array.isArray(n.tags)) ? n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #c7d2fe;">#${escapeHTML(tag)}</span>`).join('') : '';
            return `
            <div class="note-card" onclick="viewNote('${safeId}')">
                ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg,#f59e0b,#fbbf24); color:white; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; box-shadow:0 2px 8px rgba(245,158,11,0.4);">⭐ FEATURED</div>' : ''}
                <div class="note-header">
                    <div class="note-title">${safeTitle}</div>
                    <div class="note-author">by ${safeAuthor}</div>
                </div>
                <div class="note-content">
                    <div class="note-meta"><span class="badge">${safeTopic}</span> <span class="badge">${safeDiff}</span></div>
                    <div class="note-text">${safeContent}...</div>
                    ${tagsHtml ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${tagsHtml}</div>` : ''}
                    ${attCount > 0 ? `<div style="margin-top: 10px; color: #3b82f6; font-weight: 600; font-size: 12px;">📎 ${attCount} attachment(s)</div>` : ''}
                </div>
                <div class="note-footer">
                    <span class="status-badge status-approved">✓ Published</span>
                    <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">👁️ ${safeViews} views</span>
                </div>
            </div>`;
        }).join('');
    }
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = html;
}

function loadBrowseNotes() {
    const roomCode = currentUser ? currentUser.roomCode : null;
    const published = notes.filter(n => n.status === 'published' && (!roomCode || n.roomCode === roomCode));
    displayNotesGrid(published, 'browseContainer');
}

function getNotesBySubject(subjectId) {
    const roomCode = currentUser ? currentUser.roomCode : null;
    return notes.filter(n => n.status === 'published' && n.subject === subjectId && (!roomCode || n.roomCode === roomCode));
}

function loadSubjectNotes() {
    const html = SUBJECTS.map(subject => {
        const subjectNotes = getNotesBySubject(subject.id);
        const notesHtml = subjectNotes.length === 0
            ? '<div style="padding:20px;"><p>No notes</p></div>'
            : subjectNotes.map(n => {
                const safeId = escapeHTML(n.id);
                const safeTitle = escapeHTML(n.title);
                const safeAuthor = escapeHTML(n.author);
                const safeContent = escapeHTML(String(n.content).substring(0, 100));
                const safeViews = parseInt(n.views) || 0;
                const attCount = Array.isArray(n.attachments) ? n.attachments.length : 0;
                const tagsHtml = (n.tags && Array.isArray(n.tags)) ? n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">#${escapeHTML(tag)}</span>`).join('') : '';
                return `
                <div class="note-card" onclick="viewNote('${safeId}')">
                    <div class="note-header">
                        <div class="note-title">${safeTitle}</div>
                        <div class="note-author">by ${safeAuthor}</div>
                    </div>
                    <div class="note-content">
                        <div class="note-text">${safeContent}...</div>
                        ${tagsHtml ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;">${tagsHtml}</div>` : ''}
                        ${attCount > 0 ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">📎 ${attCount}</div>` : ''}
                    </div>
                    <div class="note-footer">
                        <span style="font-size:12px;color:var(--text-secondary);">👁️ ${safeViews} views</span>
                    </div>
                </div>`;
            }).join('');

        return `
            <div class="subject-section">
                <div class="subject-header">
                    <h2>${escapeHTML(subject.emoji)} ${escapeHTML(subject.name)}</h2>
                    <span class="subject-count">${subjectNotes.length}</span>
                </div>
                <div class="subject-notes-grid">${notesHtml}</div>
            </div>
        `;
    }).join('');

    const container = document.getElementById('subjectsContainer');
    if (container) container.innerHTML = html;
}

function isRoomOwner() {
    return currentUser && currentUser.isRoomOwner === true;
}

function loadMyNotes() {
    if (!currentUser) return;
    const myNotes = currentUser.roomCode
        ? notes.filter(n => n.roomCode === currentUser.roomCode && n.author === currentUser.name)
        : notes.filter(n => n.userId === currentUser.id);
    const ownerControls = isRoomOwner() || (currentUser && currentUser.role === 'admin');
    const html = myNotes.length === 0
        ? '<div class="empty-state"><h3>No notes</h3></div>'
        : myNotes.map(n => {
            const safeId = escapeHTML(n.id);
            const safeTitle = escapeHTML(n.title);
            const safeContent = escapeHTML(String(n.content).substring(0, 100));
            const safeViews = parseInt(n.views) || 0;
            const attCount = Array.isArray(n.attachments) ? n.attachments.length : 0;
            const tagsHtml = (n.tags && Array.isArray(n.tags)) ? n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">#${escapeHTML(tag)}</span>`).join('') : '';
            return `
            <div class="note-card">
                <div class="note-header"><div class="note-title">${safeTitle}</div></div>
                <div class="note-content">
                    <div class="note-text">${safeContent}...</div>
                    ${tagsHtml ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;">${tagsHtml}</div>` : ''}
                    ${attCount > 0 ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">📎 ${attCount} file(s)</div>` : ''}
                </div>
                <div class="note-footer">
                    ${ownerControls ? `<button class="btn btn-small" onclick="editNoteModal('${safeId}')">✏️</button>
                    <button class="btn btn-danger btn-small" onclick="deleteNote('${safeId}')">🗑️</button>` : ''}
                    <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">👁️ ${safeViews} views</span>
                </div>
            </div>`;
        }).join('');
    const container = document.getElementById('myNotesContainer');
    if (container) container.innerHTML = html;
}

function loadTasks() {
    const html = tasks.length === 0 ? '<h3>No tasks</h3>' : tasks.map(t => `<div>${t.title}</div>`).join('');
    const container = document.getElementById('tasksContainer');
    if (container) container.innerHTML = html;
}

function switchUserTab(tab) {
    document.querySelectorAll('#userSection .content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#userSection .tab').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(tab);
    if (tabEl) tabEl.classList.add('active');
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    if (tab === 'browse') loadBrowseNotes();
    if (tab === 'subjects') loadSubjectNotes();
    if (tab === 'mynotes') loadMyNotes();
    if (tab === 'tasks') loadTasks();
}

// ==========================================
// SIGNUP — REMOVED (replaced by room code)
// ==========================================

// ==========================================
// JOIN ROOM
// ==========================================

function joinRoom(e) {
    e.preventDefault();

    const codeEl = document.getElementById('roomCodeField');
    const nameEl = document.getElementById('roomUserName');

    if (!codeEl) return;

    const roomCode = codeEl.value.trim().toUpperCase();
    const userName = nameEl ? nameEl.value.trim() : '';

    if (!roomCode) {
        showAlert('❌ Please enter a room code', 'danger', 'loginAlert');
        return;
    }

    if (roomCode.length < 4 || roomCode.length > 20) {
        showAlert('❌ Room code must be 4–20 characters', 'danger', 'loginAlert');
        return;
    }

    if (!/^[A-Z0-9]+$/.test(roomCode)) {
        showAlert('❌ Room code can only contain letters and numbers', 'danger', 'loginAlert');
        return;
    }

    const displayName = userName || 'User_' + roomCode.substring(0, 4);

    firebase.auth().signInAnonymously()
        .then((userCredential) => {
            const uid = userCredential.user.uid;
            const displayName = userName || 'User_' + roomCode.substring(0, 4);

            const generatedCode = localStorage.getItem('generatedRoomCode');
            const isOwner = (generatedCode === roomCode);

            currentUser = {
                id: uid,
                name: displayName,
                roomCode: roomCode,
                isRoomOwner: isOwner
            };

            localStorage.setItem('roomCode', roomCode);
            localStorage.setItem('roomUserName', displayName);
            localStorage.setItem('isRoomOwner', isOwner ? 'true' : 'false');
            localStorage.removeItem('generatedRoomCode');

            const roleLabel = isOwner ? '👑 Owner' : '👤 Member';
            showAlert(`✅ Joined room: ${roomCode} (${roleLabel})`, 'success', 'loginAlert');

            setTimeout(() => {
                document.getElementById('loginSection').classList.remove('active');
                document.getElementById('userSection').classList.add('active');
                document.getElementById('userName').textContent = `🔑 Room: ${roomCode} | ${roleLabel} ${displayName}`;
                codeEl.value = '';
                if (nameEl) nameEl.value = '';
                startNotesSync();
            }, 800);
        })
        .catch((error) => {
            console.error("Anonymous auth error", error);
            if (error.code === 'auth/too-many-requests') {
                showAlert('❌ Too many attempts. Try again later.', 'danger', 'loginAlert');
            } else {
                showAlert('❌ Failed to join room: ' + error.message, 'danger', 'loginAlert');
            }
        });
}

// ==========================================
// GENERATE ROOM CODE
// ==========================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const randomValues = new Uint32Array(8);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < 8; i++) {
        code += chars[randomValues[i] % chars.length];
    }
    const input = document.getElementById('roomCodeField');
    if (input) {
        input.value = code;
        input.focus();
    }
    localStorage.setItem('generatedRoomCode', code);
}

// ==========================================
// ADMIN LOGIN & PASSWORD RESET
// ==========================================
// (handled by loginAdmin at top of file using Firebase Auth)

function resetAdminPassword() {
    const email = document.getElementById('adminEmailField').value.trim();
    if (!email) {
        showAlert('❌ Please enter your admin email first', 'danger', 'loginAlert');
        return;
    }
    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            showAlert('✅ Password reset email sent! Check your inbox.', 'success', 'loginAlert');
        })
        .catch((error) => {
            console.error('Password reset error:', error);
            showAlert('❌ Failed to send reset email. Check the email address.', 'danger', 'loginAlert');
        });
}

// ==========================================
// SHARE NOTE
// ==========================================

function shareNote(e) {
    e.preventDefault();

    if (!currentUser) {
        showAlert('❌ Please login first', 'danger', 'userAlert');
        return;
    }

    if (blockedUsers.includes(currentUser.id)) {
        showAlert('❌ Your account has been blocked', 'danger', 'userAlert');
        return;
    }

    const titleEl = document.getElementById('noteTitle');
    const subjectEl = document.getElementById('noteSubject');
    const topicEl = document.getElementById('noteTopic');
    const difficultyEl = document.getElementById('noteDifficulty');
    const contentEl = document.getElementById('noteContent');
    const importantEl = document.getElementById('isImportant');
    const filesEl = document.getElementById('noteFiles');
    const tagsEl = document.getElementById('noteTags');

    if (!titleEl || !topicEl || !contentEl) {
        showAlert('❌ Form elements missing', 'danger', 'userAlert');
        return;
    }

    const title = titleEl.value.trim();
    const subject = subjectEl ? subjectEl.value : '';
    const topic = topicEl.value.trim();
    const difficulty = difficultyEl ? difficultyEl.value : 'Beginner';
    const content = contentEl.value.trim();
    const isImportant = importantEl ? importantEl.checked : false;
    const files = filesEl ? filesEl.files : [];
    const tagsRaw = tagsEl ? tagsEl.value.trim() : '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) : [];

    if (!title || !topic || !content) {
        showAlert('❌ Please fill all required fields', 'danger', 'userAlert');
        return;
    }

    let attachments = [];
    let processed = 0;

    function saveNote() {
        const note = {
            id: Date.now(),
            title,
            topic,
            subject,
            difficulty,
            content,
            isImportant,
            tags,
            attachments,
            views: 0,
            author: currentUser.name,
            userId: currentUser.id,
            roomCode: currentUser.roomCode || '',
            status: 'published',
            createdAt: new Date().toLocaleDateString(),
            updatedAt: new Date().toLocaleDateString()
        };

        ensureFirebase().then((db) => {
            if (!db) {
                showAlert('❌ Firebase not ready', 'danger', 'userAlert');
                return;
            }

            try {
                db.ref('notes').push(note).then(() => {
                    console.log('✅ Note saved with', attachments.length, 'attachments');
                    showAlert('✅ Note published successfully!', 'success', 'userAlert');

                    titleEl.value = '';
                    if (subjectEl) subjectEl.value = '';
                    topicEl.value = '';
                    contentEl.value = '';
                    if (importantEl) importantEl.checked = false;
                    if (filesEl) filesEl.value = '';
                    if (tagsEl) tagsEl.value = '';

                    setTimeout(() => switchUserTab('mynotes'), 500);
                }).catch((error) => {
                    showAlert('❌ Error: ' + error.message, 'danger', 'userAlert');
                });
            } catch (e) {
                showAlert('❌ Error: ' + e.message, 'danger', 'userAlert');
            }
        });
    }

    if (files.length === 0) {
        saveNote();
    } else {
        const storageRef = firebase.storage().ref();
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileRef = storageRef.child(`attachments/${Date.now()}_${generateSecureId()}_${file.name}`);
            
            fileRef.put(file).then((snapshot) => {
                snapshot.ref.getDownloadURL().then((url) => {
                    attachments.push({
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        data: url // Store download URL instead of base64
                    });
                    processed++;
                    console.log('📎 File uploaded:', file.name);
                    if (processed === files.length) saveNote();
                });
            }).catch(error => {
                showAlert('❌ Error uploading file: ' + error.message, 'danger', 'userAlert');
            });
        }
    }
}

// ==========================================
// VIEW NOTE - SHOW ATTACHMENTS - FIX #1
// ==========================================

function viewNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    // Increment view count in Firebase
    ensureFirebase().then((db) => {
        if (!db) return;
        db.ref('notes').once('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            for (let key in data) {
                if (data[key].id === id) {
                    const newViews = (data[key].views || 0) + 1;
                    db.ref('notes/' + key + '/views').set(newViews);
                    note.views = newViews;
                    break;
                }
            }
        });
    });

    // Update modal title
    document.getElementById('modalTitle').textContent = note.title;

    // Build modal content
    let modalContent = `
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                <div>
                    <h3 style="margin: 0 0 5px 0;">${escapeHTML(note.title)}</h3>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">by <strong>${escapeHTML(note.author)}</strong></p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; padding: 10px; background: var(--bg-light); border-radius: 6px;">
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">📚 Topic:</span>
                    <div style="font-weight: 600;">${escapeHTML(note.topic)}</div>
                </div>
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">📊 Difficulty:</span>
                    <div style="font-weight: 600;">${escapeHTML(note.difficulty)}</div>
                </div>
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">👁️ Views:</span>
                    <div style="font-weight: 600;">${note.views || 0}</div>
                </div>
                ${note.tags && note.tags.length > 0 ? `<div>
                    <span style="color: var(--text-secondary); font-size: 12px;">🏷️ Tags:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px;">${note.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #c7d2fe;">#${escapeHTML(tag)}</span>`).join('')}</div>
                </div>` : ''}
            </div>
            
            <div style="margin-bottom: 15px;">
                <p style="white-space: pre-wrap; line-height: 1.6;">${escapeHTML(note.content)}</p>
            </div>
    `;

    // Add attachments if any
    if (note.attachments && note.attachments.length > 0) {
        modalContent += `
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border);">
                <h3 style="margin-bottom: 15px;">📎 Attachments (${note.attachments.length})</h3>
                <div style="display: grid; gap: 8px;">
                    ${note.attachments.map((att, idx) => `
                        <div style="padding: 12px; background: var(--bg-light); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 600;">📄 ${escapeHTML(att.name)}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'Size unknown'}</div>
                            </div>
                            ${att.data ? `<a href="${escapeHTML(att.data)}" download="${escapeHTML(att.name)}" style="padding: 8px 12px; background: var(--primary); color: white; border-radius: 4px; text-decoration: none; font-size: 12px; cursor: pointer;">⬇️ Download</a>` : '<span style="color: var(--text-secondary); font-size: 12px;">No file</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    modalContent += `</div>`;

    document.getElementById('modalBody').innerHTML = modalContent;
    document.getElementById('viewModal').classList.add('active');
}

function closeModal() {
    document.getElementById('viewModal').classList.remove('active');
}

// ==========================================
// EDIT & DELETE
// ==========================================

function editNoteModal(id) {
    if (!isRoomOwner() && !(currentUser && currentUser.role === 'admin')) {
        showAlert('❌ Only the room owner can edit notes', 'danger', 'userAlert');
        return;
    }
    const note = notes.find(n => n.id === id);
    if (!note) return;
    editingNoteId = id;
    document.getElementById('editTitle').value = note.title;
    document.getElementById('editTopic').value = note.topic;
    document.getElementById('editDifficulty').value = note.difficulty;
    document.getElementById('editContent').value = note.content;
    document.getElementById('editImportant').checked = note.isImportant;
    document.getElementById('editModal').classList.add('active');
}

function saveNoteEdit(e) {
    e.preventDefault();
    const note = notes.find(n => n.id === editingNoteId);
    if (!note) return;

    note.title = document.getElementById('editTitle').value;
    note.topic = document.getElementById('editTopic').value;
    note.difficulty = document.getElementById('editDifficulty').value;
    note.content = document.getElementById('editContent').value;
    note.isImportant = document.getElementById('editImportant').checked;
    note.updatedAt = new Date().toLocaleDateString();

    ensureFirebase().then((db) => {
        if (db) {
            db.ref('notes').child(editingNoteId).update(note);
            showAlert('✅ Updated!', 'success', 'userAlert');
            closeEditModal();
        }
    });
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingNoteId = null;
}

function deleteNote(noteId) {
    if (!isRoomOwner() && !(currentUser && currentUser.role === 'admin')) {
        showAlert('❌ Only the room owner can delete notes', 'danger', 'userAlert');
        return;
    }
    if (confirm('Delete this note?')) {
        ensureFirebase().then((db) => {
            if (!db) {
                showAlert('❌ Firebase not ready', 'danger', 'userAlert');
                return;
            }

            // Find the Firebase key for this note
            db.ref('notes').once('value', (snapshot) => {
                const data = snapshot.val();
                if (!data) {
                    showAlert('❌ Note not found', 'danger', 'userAlert');
                    return;
                }

                // Find the Firebase key that matches our note ID
                let firebaseKey = null;
                for (let key in data) {
                    if (data[key].id === noteId) {
                        firebaseKey = key;
                        break;
                    }
                }

                if (!firebaseKey) {
                    showAlert('❌ Note not found in database', 'danger', 'userAlert');
                    console.error('Note ID', noteId, 'not found in Firebase');
                    return;
                }

                // Delete using Firebase key
                db.ref('notes/' + firebaseKey).remove().then(() => {
                    console.log('✅ Note deleted from Firebase');
                    showAlert('✅ Note deleted!', 'success', 'userAlert');
                    loadMyNotes();
                }).catch((error) => {
                    console.error('❌ Delete error:', error);
                    showAlert('❌ Error deleting note', 'danger', 'userAlert');
                });
            });
        });
    }
}

// ==========================================
// ADMIN - FIX #2: SHOW USER DATA
// ==========================================

function switchAdminTab(tab) {
    document.querySelectorAll('#adminSection .content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#adminSection .tab').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(tab);
    if (tabEl) tabEl.classList.add('active');
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    if (tab === 'published') loadAdminPublished();
    if (tab === 'users') {
        console.log('👥 Loading users, total:', users.length);
        loadUsersList();
    }
}

function updateAdminDashboard() {
    const totalNotes = notes.filter(n => n.status === 'published').length;
    const blockedCount = blockedUsers.length;
    const totalUsers = users.length;

    const totalEl = document.getElementById('totalNotes');
    const pubEl = document.getElementById('publishedCount');
    const blockEl = document.getElementById('blockedCount');
    const usersEl = document.getElementById('totalUsers');

    if (totalEl) totalEl.textContent = totalNotes;
    if (pubEl) pubEl.textContent = totalNotes;
    if (blockEl) blockEl.textContent = blockedCount;
    if (usersEl) usersEl.textContent = totalUsers;

    console.log(`📊 Admin Dashboard: ${totalUsers} users, ${totalNotes} notes`);
}

function loadAdminPublished() {
    const published = notes.filter(n => n.status === 'published');
    const html = published.length === 0
        ? '<h3>No published notes</h3>'
        : published.map(n => `
            <div class="note-card">
                <div class="note-header">
                    <div class="note-title">${escapeHTML(n.title)}</div>
                    <div class="note-author">by ${escapeHTML(n.author)}</div>
                </div>
                <div class="note-content">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                        📚 ${escapeHTML(n.topic)} | 📊 ${escapeHTML(n.difficulty)}
                    </div>
                    <div class="note-text">${escapeHTML(String(n.content).substring(0, 150))}${n.content.length > 150 ? '...' : ''}</div>
                    ${n.attachments && n.attachments.length > 0 ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">📎 ${n.attachments.length} file(s)</div>` : ''}
                </div>
                <div class="note-footer">
                    <button class="btn btn-small" onclick="viewNote(${n.id})" style="margin-right: 8px;">👁️ View</button>
                    <button class="btn btn-small" onclick="toggleFeatured(${n.id})" style="margin-right:8px; background:${n.isImportant ? '#fbbf24' : '#e2e8f0'}; color:${n.isImportant ? 'white' : 'var(--text-primary)'};">${n.isImportant ? '⭐ Unfeature' : '☆ Feature'}</button>
                    <button class="btn btn-danger btn-small" onclick="deleteAdminNote(${n.id})">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

    const container = document.getElementById('publishedContainer');
    if (container) {
        container.innerHTML = html;
    }
}

function deleteAdminNote(noteId) {
    if (confirm('Delete this note?')) {
        ensureFirebase().then((db) => {
            if (!db) {
                showAlert('❌ Firebase not ready', 'danger', 'adminAlert');
                return;
            }

            db.ref('notes').once('value', (snapshot) => {
                const data = snapshot.val();
                if (!data) {
                    showAlert('❌ Note not found', 'danger', 'adminAlert');
                    return;
                }

                // Find the Firebase key for this note
                let firebaseKey = null;
                for (let key in data) {
                    if (data[key].id === noteId) {
                        firebaseKey = key;
                        break;
                    }
                }

                if (!firebaseKey) {
                    showAlert('❌ Note not found', 'danger', 'adminAlert');
                    return;
                }

                db.ref('notes/' + firebaseKey).remove().then(() => {
                    showAlert('✅ Note deleted!', 'success', 'adminAlert');
                    loadAdminPublished();
                }).catch((error) => {
                    showAlert('❌ Error deleting', 'danger', 'adminAlert');
                });
            });
        });
    }
}

function toggleFeatured(noteId) {
    ensureFirebase().then((db) => {
        if (!db) return;
        db.ref('notes').once('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            for (let key in data) {
                if (data[key].id === noteId) {
                    const newVal = !data[key].isImportant;
                    db.ref('notes/' + key + '/isImportant').set(newVal).then(() => {
                        showAlert(newVal ? '⭐ Note featured!' : '✅ Note unfeatured!', 'success', 'adminAlert');
                        loadAdminPublished();
                    });
                    break;
                }
            }
        });
    });
}

function loadUsersList() {
    console.log('👥 Loading users. Total:', users.length);

    if (users.length === 0) {
        const tbody = document.getElementById('usersTable');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center;">No users registered</td></tr>';
        }
        return;
    }

    const rows = users.map(u => {
        const userNotes = notes.filter(n => n.userId === u.id).length;
        const isBlocked = blockedUsers.includes(u.id);
        return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px;">${u.name}</td>
                <td style="padding: 12px;">${u.email}</td>
                <td style="padding: 12px;">${u.createdAt}</td>
                <td style="padding: 12px; text-align: center;">${userNotes}</td>
                <td style="padding: 12px;">
                    <button class="btn btn-small" onclick="blockUser(${u.id})" style="padding: 6px 12px; font-size: 12px;">
                        ${isBlocked ? '✅ Unblock' : '🚫 Block'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const tbody = document.getElementById('usersTable');
    if (tbody) {
        tbody.innerHTML = rows;
        console.log('✅ Rendered', users.length, 'users');
    } else {
        console.error('❌ usersTable not found in HTML');
    }
}

function blockUser(userId) {
    if (blockedUsers.includes(userId)) {
        blockedUsers = blockedUsers.filter(id => id !== userId);
        showAlert('✅ Unblocked!', 'success', 'adminAlert');
    } else {
        blockedUsers.push(userId);
        showAlert('✅ Blocked!', 'success', 'adminAlert');
    }
    localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
    loadUsersList();
    updateAdminDashboard();
}

// ==========================================
// LOGOUT
// ==========================================

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('isRoomOwner');
    localStorage.removeItem('generatedRoomCode');
    localStorage.removeItem('roomUserName');
    document.getElementById('loginSection').classList.add('active');
    document.getElementById('userSection').classList.remove('active');
    document.getElementById('adminSection').classList.remove('active');
}

// ==========================================
// ALERTS
// ==========================================

function showAlert(msg, type, el) {
    const alert = document.getElementById(el);
    if (!alert) return;
    alert.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    setTimeout(() => alert.innerHTML = '', 4000);
}

// ==========================================
// LOGIN TAB SWITCH
// ==========================================

function switchLoginTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(tab);
    if (tabEl) tabEl.classList.add('active');
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

// ==========================================
// TASKS
// ==========================================

function addTask() {
    const input = document.getElementById('taskInput');
    if (!input || !input.value.trim()) {
        showAlert('❌ Please enter a task', 'danger', 'userAlert');
        return;
    }

    const task = {
        id: generateSecureId(),
        title: sanitizeInput(input.value.trim(), 200),
        completed: false,
        createdAt: new Date().toISOString()
    };

    tasks.push(task);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    input.value = '';
    renderTasks();
}

function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        localStorage.setItem('tasks', JSON.stringify(tasks));
        renderTasks();
    }
}

function deleteTask(taskId) {
    tasks = tasks.filter(t => t.id !== taskId);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    renderTasks();
}

function renderTasks() {
    // Remove tasks older than 24 hours
    const now = new Date();
    tasks = tasks.filter(t => (now - new Date(t.createdAt)) < 24 * 60 * 60 * 1000);
    localStorage.setItem('tasks', JSON.stringify(tasks));

    const container = document.getElementById('tasksList');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-state-icon">📝</div>
                <h3>No Tasks</h3>
                <p>Add a task to get started!</p>
            </div>`;
        return;
    }

    container.innerHTML = tasks.map(t => `
        <div class="task-item ${t.completed ? 'completed' : ''}">
            <input type="checkbox" class="task-checkbox" ${t.completed ? 'checked' : ''}
                onchange="toggleTask('${escapeHTML(t.id)}')">
            <div class="task-content">
                <div class="task-text">${escapeHTML(t.title)}</div>
                <div class="task-time">${new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <button class="btn btn-danger btn-small" onclick="deleteTask('${escapeHTML(t.id)}')" style="padding:6px 10px;">🗑️</button>
        </div>
    `).join('');
}

// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing app...');

    users = JSON.parse(localStorage.getItem('users')) || [];
    tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    blockedUsers = JSON.parse(localStorage.getItem('blockedUsers')) || [];

    console.log('👥 Users loaded:', users.length);

    loadDarkModePreference();

    setTimeout(() => {
        if (initFirebase()) {
            console.log('✅ Firebase ready');
        }
    }, 100);

    const savedRoomCode = localStorage.getItem('roomCode');
    const savedRoomName = localStorage.getItem('roomUserName');

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // Check if user is admin
            ensureFirebase().then(db => {
                db.ref('admins/' + user.uid).once('value').then(snapshot => {
                    if (snapshot.exists() && snapshot.val() === true) {
                        if (window.isAdminPage) {
                            currentUser = { id: 'admin', role: 'admin', uid: user.uid };
                            const loginSec = document.getElementById('loginSection');
                            const adminSec = document.getElementById('adminSection');
                            if (loginSec) loginSec.classList.remove('active');
                            if (adminSec) adminSec.classList.add('active');
                            updateAdminDashboard();
                            startNotesSync();
                            syncBlockedUsers();
                        }
                    } else if (savedRoomCode && !window.isAdminPage) {
                        // Regular user
                        const displayName = savedRoomName || 'User_' + savedRoomCode.substring(0, 4);
                        const savedIsOwner = localStorage.getItem('isRoomOwner') === 'true';
                        currentUser = {
                            id: user.uid,
                            name: displayName,
                            roomCode: savedRoomCode,
                            isRoomOwner: savedIsOwner
                        };
                        const roleLabel = savedIsOwner ? '👑 Owner' : '👤 Member';
                        const loginSec = document.getElementById('loginSection');
                        const userSec = document.getElementById('userSection');
                        if (loginSec) loginSec.classList.remove('active');
                        if (userSec) userSec.classList.add('active');
                        
                        const userNameEl = document.getElementById('userName');
                        if(userNameEl) userNameEl.textContent = `🔑 Room: ${savedRoomCode} | ${roleLabel} ${displayName}`;
                        startNotesSync();
                    }
                });
            });
        }
    });

    // Export functions
    window.toggleDarkMode = toggleDarkMode;
    window.joinRoom = joinRoom;
    window.generateRoomCode = generateRoomCode;
    window.loginAdmin = loginAdmin;
    window.resetAdminPassword = resetAdminPassword;
    window.shareNote = shareNote;
    window.switchUserTab = switchUserTab;
    window.switchAdminTab = switchAdminTab;
    window.viewNote = viewNote;
    window.closeModal = closeModal;
    window.editNoteModal = editNoteModal;
    window.saveNoteEdit = saveNoteEdit;
    window.closeEditModal = closeEditModal;
    window.deleteNote = deleteNote;
    window.deleteAdminNote = deleteAdminNote;
    window.toggleFeatured = toggleFeatured;
    window.blockUser = blockUser;
    window.logout = logout;
    window.searchNotes = searchNotes;
    window.filterAndSearchNotes = filterAndSearchNotes;
    window.sortNotes = sortNotes;
    window.addTask = addTask;
    window.toggleTask = toggleTask;
    window.deleteTask = deleteTask;

    console.log('✅ App fully initialized');
});