// ==========================================
// NOTEPULSE - FINAL COMPLETE VERSION
// Fixed: 1) Attachment display 2) Admin user data
// ==========================================

let users = JSON.parse(localStorage.getItem('users')) || [];
let notes = [];
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let blockedUsers = JSON.parse(localStorage.getItem('blockedUsers')) || [];
let currentUser = null;
let editingNoteId = null;
let filteredNotes = [];
// ✅ Admin email - change this to your admin email address
const ADMIN_EMAIL = 'shloksri003@gmail.com';

function loginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailField').value.trim();
    const password = document.getElementById('adminPasswordField').value.trim();
    
    if (!email || !password) {
        showAlert('❌ Please enter email and password', 'danger', 'loginAlert');
        return;
    }

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // ✅ Check if the signed-in email matches the admin email
            if (userCredential.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
                currentUser = { id: 'admin', role: 'admin', uid: userCredential.user.uid };
                localStorage.setItem('isAdmin', 'true');
                showAlert('✅ Admin login successful!', 'success', 'loginAlert');
                setTimeout(() => {
                    document.getElementById('loginSection').classList.remove('active');
                    document.getElementById('adminSection').classList.add('active');
                    updateAdminDashboard();
                    startNotesSync();
                }, 800);
            } else {
                showAlert('❌ You are not an admin!', 'danger', 'loginAlert');
                firebase.auth().signOut();
            }
        })
        .catch((error) => {
            showAlert('❌ Login failed: ' + error.message, 'danger', 'loginAlert');
        });
}

// 🔑 Call this from browser console to reset admin password:
// resetAdminPassword()
function resetAdminPassword() {
    firebase.auth().sendPasswordResetEmail(ADMIN_EMAIL)
        .then(() => {
            console.log('✅ Password reset email sent to: ' + ADMIN_EMAIL);
            alert('✅ Password reset email sent to: ' + ADMIN_EMAIL + '\nCheck your inbox (and spam folder).');
        })
        .catch((error) => {
            console.error('❌ Error:', error.message);
            alert('❌ Error: ' + error.message);
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
// DISPLAY NOTES WITH ATTACHMENTS - FIX #1
// ==========================================

function displayNotesGrid(notesToDisplay, containerId) {
    let html;
    if (notesToDisplay.length === 0) {
        html = '<div class="empty-state" style="grid-column: 1/-1;"><h3>No notes found</h3></div>';
    } else {
        html = notesToDisplay.map(n => `
            <div class="note-card" onclick="viewNote(${n.id})">
                ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg,#f59e0b,#fbbf24); color:white; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; box-shadow:0 2px 8px rgba(245,158,11,0.4);">⭐ FEATURED</div>' : ''}
                <div class="note-header">
                    <div class="note-title">${n.title}</div>
                    <div class="note-author">by ${n.author}</div>
                </div>
                <div class="note-content">
                    <div class="note-meta"><span class="badge">${n.topic}</span> <span class="badge">${n.difficulty}</span></div>
                    <div class="note-text">${n.content.substring(0, 150)}...</div>
                    ${n.tags && n.tags.length > 0 ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #c7d2fe;">#${tag}</span>`).join('')}</div>` : ''}
                    ${n.attachments && n.attachments.length > 0 ? `<div style="margin-top: 10px; color: #3b82f6; font-weight: 600; font-size: 12px;">📎 ${n.attachments.length} attachment(s)</div>` : ''}
                </div>
                <div class="note-footer">
                    <span class="status-badge status-approved">✓ Published</span>
                    <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">👁️ ${n.views || 0} views</span>
                </div>
            </div>
        `).join('');
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
            : subjectNotes.map(n => `
                <div class="note-card" onclick="viewNote(${n.id})">
                    <div class="note-header">
                        <div class="note-title">${n.title}</div>
                        <div class="note-author">by ${n.author}</div>
                    </div>
                    <div class="note-content">
                        <div class="note-text">${n.content.substring(0, 100)}...</div>
                        ${n.tags && n.tags.length > 0 ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;">${n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">#${tag}</span>`).join('')}</div>` : ''}
                        ${n.attachments && n.attachments.length > 0 ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">📎 ${n.attachments.length}</div>` : ''}
                    </div>
                    <div class="note-footer">
                        <span style="font-size:12px;color:var(--text-secondary);">👁️ ${n.views || 0} views</span>
                    </div>
                </div>
            `).join('');

        return `
            <div class="subject-section">
                <div class="subject-header">
                    <h2>${subject.emoji} ${subject.name}</h2>
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
        : myNotes.map(n => `
            <div class="note-card">
                <div class="note-header"><div class="note-title">${n.title}</div></div>
                <div class="note-content">
                    <div class="note-text">${n.content.substring(0, 100)}...</div>
                    ${n.tags && n.tags.length > 0 ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;">${n.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">#${tag}</span>`).join('')}</div>` : ''}
                    ${n.attachments && n.attachments.length > 0 ? `<div style="margin-top: 8px; color: #3b82f6; font-size: 12px;">📎 ${n.attachments.length} file(s)</div>` : ''}
                </div>
                <div class="note-footer">
                    ${ownerControls ? `<button class="btn btn-small" onclick="editNoteModal(${n.id})">✏️</button>
                    <button class="btn btn-danger btn-small" onclick="deleteNote(${n.id})">🗑️</button>` : ''}
                    <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">👁️ ${n.views || 0} views</span>
                </div>
            </div>
        `).join('');
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

    // Check if this user generated the room code
    const generatedCode = localStorage.getItem('generatedRoomCode');
    const isOwner = (generatedCode === roomCode);

    currentUser = {
        id: roomCode + '_' + displayName,
        name: displayName,
        roomCode: roomCode,
        isRoomOwner: isOwner
    };

    localStorage.setItem('roomCode', roomCode);
    localStorage.setItem('roomUserName', displayName);
    localStorage.setItem('isRoomOwner', isOwner ? 'true' : 'false');
    // Clear the generated code flag after use
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
}

// ==========================================
// GENERATE ROOM CODE
// ==========================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const input = document.getElementById('roomCodeField');
    if (input) {
        input.value = code;
        input.focus();
    }
    // Flag that this user generated this room code
    localStorage.setItem('generatedRoomCode', code);
}

// ==========================================
// ADMIN LOGIN
// ==========================================
// (handled by loginAdmin at top of file using Firebase Auth)

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
        for (let i = 0; i < files.length; i++) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                attachments.push({
                    name: files[i].name,
                    size: files[i].size,
                    type: files[i].type,
                    data: ev.target.result  // Store the actual file data (DataURL)
                });
                processed++;
                console.log('📎 File loaded:', files[i].name, 'Size:', files[i].size);
                if (processed === files.length) saveNote();
            };
            reader.onerror = () => {
                showAlert('❌ Error reading file', 'danger', 'userAlert');
            };
            reader.readAsDataURL(files[i]);
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
                    <h3 style="margin: 0 0 5px 0;">${note.title}</h3>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">by <strong>${note.author}</strong></p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; padding: 10px; background: var(--bg-light); border-radius: 6px;">
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">📚 Topic:</span>
                    <div style="font-weight: 600;">${note.topic}</div>
                </div>
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">📊 Difficulty:</span>
                    <div style="font-weight: 600;">${note.difficulty}</div>
                </div>
                <div>
                    <span style="color: var(--text-secondary); font-size: 12px;">👁️ Views:</span>
                    <div style="font-weight: 600;">${note.views || 0}</div>
                </div>
                ${note.tags && note.tags.length > 0 ? `<div>
                    <span style="color: var(--text-secondary); font-size: 12px;">🏷️ Tags:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px;">${note.tags.map(tag => `<span style="background:#f0f4ff;color:#4f46e5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #c7d2fe;">#${tag}</span>`).join('')}</div>
                </div>` : ''}
            </div>
            
            <div style="margin-bottom: 15px;">
                <p style="white-space: pre-wrap; line-height: 1.6;">${note.content}</p>
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
                                <div style="font-weight: 600;">📄 ${att.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'Size unknown'}</div>
                            </div>
                            ${att.data ? `<a href="${att.data}" download="${att.name}" style="padding: 8px 12px; background: var(--primary); color: white; border-radius: 4px; text-decoration: none; font-size: 12px; cursor: pointer;">⬇️ Download</a>` : '<span style="color: var(--text-secondary); font-size: 12px;">No file</span>'}
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
                    <div class="note-title">${n.title}</div>
                    <div class="note-author">by ${n.author}</div>
                </div>
                <div class="note-content">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                        📚 ${n.topic} | 📊 ${n.difficulty}
                    </div>
                    <div class="note-text">${n.content.substring(0, 150)}${n.content.length > 150 ? '...' : ''}</div>
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

    const isAdmin = localStorage.getItem('isAdmin');
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedRoomName = localStorage.getItem('roomUserName');

    if (isAdmin === 'true') {
        currentUser = { id: 'admin', role: 'admin' };
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('adminSection').classList.add('active');
        updateAdminDashboard();
        startNotesSync();
    } else if (savedRoomCode) {
        const displayName = savedRoomName || 'User_' + savedRoomCode.substring(0, 4);
        const savedIsOwner = localStorage.getItem('isRoomOwner') === 'true';
        currentUser = {
            id: savedRoomCode + '_' + displayName,
            name: displayName,
            roomCode: savedRoomCode,
            isRoomOwner: savedIsOwner
        };
        const roleLabel = savedIsOwner ? '👑 Owner' : '👤 Member';
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('userSection').classList.add('active');
        document.getElementById('userName').textContent = `🔑 Room: ${savedRoomCode} | ${roleLabel} ${displayName}`;
        startNotesSync();
    }

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

    console.log('✅ App fully initialized');
});