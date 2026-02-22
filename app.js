let users = JSON.parse(localStorage.getItem('users')) || [];
let notes = JSON.parse(localStorage.getItem('notes')) || [];
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let blockedUsers = JSON.parse(localStorage.getItem('blockedUsers')) || [];
let currentUser = null;
let editingNoteId = null;
let filteredNotes = [];

const ADMIN_EMAIL = 'shloksri003@gmail.com';
const ADMIN_PASSWORD = 'shloksri@';

// SUBJECTS LIST
const SUBJECTS = [
    { id: 'dsa', name: '📊 DSA (Data Structures & Algorithms)', emoji: '📊', color: '#3b82f6' },
    { id: 'maths', name: '🔢 Maths', emoji: '🔢', color: '#8b5cf6' },
    { id: 'evs', name: '🌍 EVS (Environmental Studies)', emoji: '🌍', color: '#10b981' },
    { id: 'ai', name: '🤖 Essentials of AI', emoji: '🤖', color: '#f59e0b' },
    { id: 'electrical', name: '⚡ Electrical', emoji: '⚡', color: '#ef4444' },
    { id: 'physics', name: '🔬 Applied Physics', emoji: '🔬', color: '#06b6d4' }
];

// DARK MODE FUNCTIONS
function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark-mode');
    
    // Store preference
    localStorage.setItem('darkMode', isDark);
    
    // Update icon
    const btn = document.getElementById('darkModeBtn');
    if (btn) {
        btn.textContent = isDark ? '☀️' : '🌙';
    }
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
        const btn = document.getElementById('darkModeBtn');
        if (btn) {
            btn.textContent = '☀️';
        }
    }
}

// LOGIN FUNCTIONS

    function switchLoginTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    event.currentTarget.classList.add('active');
}


function signupUser(e) {
    e.preventDefault();
    const name = document.getElementById('nameField').value.trim();
    const email = document.getElementById('emailField').value.trim();
    const password = document.getElementById('passwordField').value;
    const confirm = document.getElementById('confirmField').value;

    if (!name) {
        showAlert('Please enter your name', 'danger', 'loginAlert');
        return;
    }
    if (password.length < 6) {
        showAlert('Password must be 6+ characters', 'danger', 'loginAlert');
        return;
    }
    if (password !== confirm) {
        showAlert('Passwords do not match', 'danger', 'loginAlert');
        return;
    }
    if (users.find(u => u.email === email)) {
        showAlert('Email already registered', 'danger', 'loginAlert');
        return;
    }

    const newUser = {
        id: Date.now(),
        name: name,
        email: email,
        password: password,
        createdAt: new Date().toLocaleDateString()
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    currentUser = newUser;
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    showAlert('✅ Account created!', 'success', 'loginAlert');
    
    setTimeout(() => {
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('userSection').classList.add('active');
        document.getElementById('userName').textContent = `👋 Welcome, ${newUser.name}!`;
        loadBrowseNotes();
    }, 1000);
}

function loginUser(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMeUser').checked;

    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        if (rememberMe) {
            localStorage.setItem('rememberedUserEmail', email);
            localStorage.setItem('rememberedUserPassword', password);
        } else {
            localStorage.removeItem('rememberedUserEmail');
            localStorage.removeItem('rememberedUserPassword');
        }
        
        showAlert('✅ Logged in!', 'success', 'loginAlert');
        setTimeout(() => {
            document.getElementById('loginSection').classList.remove('active');
            document.getElementById('userSection').classList.add('active');
            document.getElementById('userName').textContent = `👋 Welcome, ${user.name}!`;
            loadBrowseNotes();
        }, 1000);
    } else {
        showAlert('Invalid email or password', 'danger', 'loginAlert');
    }
}

function loginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailField').value.trim();
    const password = document.getElementById('adminPasswordField').value.trim();
    const rememberMe = document.getElementById('rememberMeAdmin').checked;

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {

        currentUser = { id: 'admin', role: 'admin' };
        localStorage.setItem('isAdmin', 'true');

        if (rememberMe) {
            localStorage.setItem('rememberedAdminEmail', email);
            localStorage.setItem('rememberedAdminPassword', password);
        } else {
            localStorage.removeItem('rememberedAdminEmail');
            localStorage.removeItem('rememberedAdminPassword');
        }

        showAlert('✅ Admin login successful!', 'success', 'loginAlert');

        setTimeout(() => {
            document.getElementById('loginSection').classList.remove('active');
            document.getElementById('adminSection').classList.add('active');
            updateAdminDashboard();
        }, 1000);

    } else {
        showAlert('❌ Wrong Admin Credentials', 'danger', 'loginAlert');
    }
}

// USER FUNCTIONS
function switchUserTab(tab) {
    document.querySelectorAll('#userSection .content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#userSection .tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tab === 'browse') loadBrowseNotes();
    if (tab === 'subjects') loadSubjectNotes();
    if (tab === 'mynotes') loadMyNotes();
    if (tab === 'tasks') loadTasks();
}

function shareNote(e) {
    e.preventDefault();
    
    // Check if user is blocked
    if (blockedUsers.includes(currentUser.id)) {
        showAlert('❌ Your account has been blocked by admin. You cannot publish notes.', 'danger', 'userAlert');
        return;
    }
    
    const files = document.getElementById('noteFiles').files;
    
    let attachments = [];
    let processed = 0;

    function saveNote() {
        const note = {
            id: Date.now(),
            title: document.getElementById('noteTitle').value,
            topic: document.getElementById('noteTopic').value,
            subject: document.getElementById('noteSubject').value,
            difficulty: document.getElementById('noteDifficulty').value,
            content: document.getElementById('noteContent').value,
            isImportant: document.getElementById('isImportant').checked,
            attachments: attachments,
            author: currentUser.name,
            userId: currentUser.id,
            status: 'published',
            createdAt: new Date().toLocaleDateString(),
            updatedAt: new Date().toLocaleDateString()
        };

        notes.push(note);
        localStorage.setItem('notes', JSON.stringify(notes));
        showAlert('✅ Note published successfully!', 'success', 'userAlert');
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteSubject').value = '';
        document.getElementById('noteTopic').value = '';
        document.getElementById('noteContent').value = '';
        document.getElementById('isImportant').checked = false;
        document.getElementById('noteFiles').value = '';
        switchUserTab('mynotes');
    }

    if (files.length === 0) {
        saveNote();
    } else {
        for (let i = 0; i < files.length; i++) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                attachments.push({
                    name: files[i].name,
                    type: files[i].type,
                    size: files[i].size,
                    data: ev.target.result
                });
                processed++;
                if (processed === files.length) saveNote();
            };
            reader.readAsDataURL(files[i]);
        }
    }
}

function loadBrowseNotes() {
    const published = notes.filter(n => n.status === 'published');
    displayNotesGrid(published, 'browseContainer');
}

// SEARCH & FILTER FUNCTIONS
function searchNotes() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const difficulty = document.getElementById('difficultyFilter').value;
    
    filteredNotes = notes.filter(n => {
        const matchesQuery = n.title.toLowerCase().includes(query) ||
                           n.topic.toLowerCase().includes(query) ||
                           n.content.toLowerCase().includes(query) ||
                           n.author.toLowerCase().includes(query);
        
        const matchesDifficulty = !difficulty || n.difficulty === difficulty;
        
        return n.status === 'published' && matchesQuery && matchesDifficulty;
    });
    
    displayNotesGrid(filteredNotes, 'browseContainer');
}

function filterAndSearchNotes() {
    searchNotes();
}

function sortNotes() {
    const sortBy = document.getElementById('sortBy').value;
    
    switch(sortBy) {
        case 'newest':
            filteredNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredNotes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'title':
            filteredNotes.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }
    
    displayNotesGrid(filteredNotes, 'browseContainer');
}

function displayNotesGrid(notesToDisplay, containerId) {
    if (notesToDisplay.length === 0) {
        if (document.getElementById('searchInput') && document.getElementById('searchInput').value) {
            var html = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">🔍</div><h3>No notes found</h3><p>Try different search terms</p></div>';
        } else {
            var html = '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">📭</div><h3>No published notes</h3><p>Be the first to share a note!</p></div>';
        }
    } else {
        var html = notesToDisplay.map(n => `
            <div class="note-card" onclick="viewNote(${n.id})">
                ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; font-size: 24px;">⭐</div>' : ''}
                <div class="note-header">
                    <div class="note-title">${n.title}</div>
                    <div class="note-author">by ${n.author}</div>
                </div>
                <div class="note-content">
                    <div class="note-meta"><span class="badge">📚 ${n.topic}</span> <span class="badge">📊 ${n.difficulty}</span></div>
                    <div class="note-text">${n.content.substring(0, 150)}...</div>
                    ${n.attachments && n.attachments.length > 0 ? `<div style="margin-top: 10px; color: var(--primary); font-weight: 600; font-size: 12px;">📎 ${n.attachments.length} file(s)</div>` : ''}
                </div>
                <div class="note-footer"><span class="status-badge status-approved">✓ Published</span></div>
            </div>
        `).join('');
    }
    document.getElementById(containerId).innerHTML = html;
}

// SUBJECT-BASED FUNCTIONS
function getNotesBySubject(subjectId) {
    return notes.filter(n => n.status === 'published' && n.subject === subjectId);
}

function loadSubjectNotes() {
    const html = SUBJECTS.map(subject => {
        const subjectNotes = getNotesBySubject(subject.id);
        const notesHtml = subjectNotes.length === 0 
            ? `<div class="empty-state-small">
                <div style="font-size: 32px; margin-bottom: 10px;">📭</div>
                <p style="color: var(--text-secondary);">No notes yet</p>
              </div>`
            : subjectNotes.map(n => `
                <div class="note-card" onclick="viewNote(${n.id})">
                    ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; font-size: 24px;">⭐</div>' : ''}
                    <div class="note-header">
                        <div class="note-title">${n.title}</div>
                        <div class="note-author">by ${n.author}</div>
                    </div>
                    <div class="note-content">
                        <div class="note-meta"><span class="badge">📚 ${n.topic}</span> <span class="badge">📊 ${n.difficulty}</span></div>
                        <div class="note-text">${n.content.substring(0, 100)}...</div>
                    </div>
                    <div class="note-footer"><span class="status-badge status-approved">✓ Published</span></div>
                </div>
            `).join('');

        return `
            <div class="subject-section">
                <div class="subject-header">
                    <h2 style="display: flex; align-items: center; gap: 10px; margin: 0;">
                        <span style="font-size: 28px;">${subject.emoji}</span>
                        ${subject.name}
                    </h2>
                    <span class="subject-count">${subjectNotes.length} note${subjectNotes.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="subject-notes-grid">
                    ${notesHtml}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('subjectsContainer').innerHTML = html;
}

function loadMyNotes() {
    const myNotes = notes.filter(n => n.userId === currentUser.id);
    const html = myNotes.length === 0 
        ? '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">📭</div><h3>No notes</h3></div>'
        : myNotes.map(n => `
            <div class="note-card">
                ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; font-size: 24px;">⭐</div>' : ''}
                <div class="note-header">
                    <div class="note-title">${n.title}</div>
                    <div class="note-author">${n.createdAt}</div>
                </div>
                <div class="note-content">
                    <div class="note-meta"><span class="badge">📚 ${n.topic}</span> <span class="badge">📊 ${n.difficulty}</span></div>
                    <div class="note-text">${n.content.substring(0, 150)}...</div>
                </div>
                <div class="note-footer">
                    <span class="status-badge status-approved">✓ Published</span>
                    <button class="btn btn-warning btn-small" onclick="editNote(${n.id}); event.stopPropagation();">✏️ Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteNote(${n.id}); event.stopPropagation();">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    document.getElementById('myNotesContainer').innerHTML = html;
}

function viewNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    let attachmentHTML = '';
    if (note.attachments && note.attachments.length > 0) {
        attachmentHTML = `
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border);">
                <h3 style="margin-bottom: 15px; color: var(--primary);">📎 Attachments (${note.attachments.length})</h3>
                <div style="display: grid; gap: 10px;">
                    ${note.attachments.map((att, idx) => `
                        <div class="attachment-item" style="cursor: pointer;" onclick="previewFile(${id}, ${idx})">
                            <div class="attachment-icon">${getFileIcon(att.type)}</div>
                            <div class="attachment-info">
                                <div class="attachment-name">${att.name}</div>
                                <div class="attachment-size">${(att.size/1024).toFixed(2)}KB</div>
                            </div>
                            <button type="button" class="btn btn-small" style="background: var(--primary); color: white; margin-left: auto;" onclick="downloadFile(${id}, ${idx}); event.stopPropagation();">⬇️</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    document.getElementById('modalTitle').textContent = `📖 ${note.title}`;
    document.getElementById('modalBody').innerHTML = `
        <div style="margin-bottom: 20px;">
            <div class="note-meta">
                <span class="badge">📚 ${note.topic}</span>
                <span class="badge">📊 ${note.difficulty}</span>
                ${note.isImportant ? '<span class="badge" style="background: #fef3c7; color: #92400e; border-color: #f59e0b;">⭐ Important</span>' : ''}
            </div>
            <div style="margin-top: 15px; color: var(--text-secondary); font-size: 13px;">
                👤 By ${note.author} | 📅 ${note.createdAt}
            </div>
        </div>
        <div style="margin-bottom: 20px; padding: 20px; background: var(--bg-light); border-radius: 8px; border-left: 4px solid var(--primary); line-height: 1.8;">
            ${note.content}
        </div>
        ${attachmentHTML}
    `;
    document.getElementById('viewModal').classList.add('active');
}

function editNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    editingNoteId = id;
    document.getElementById('editTitle').value = note.title;
    document.getElementById('editTopic').value = note.topic;
    document.getElementById('editDifficulty').value = note.difficulty;
    document.getElementById('editContent').value = note.content;
    document.getElementById('editImportant').checked = note.isImportant || false;
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

    localStorage.setItem('notes', JSON.stringify(notes));
    showAlert('✅ Note updated!', 'success', 'userAlert');
    closeEditModal();
    loadMyNotes();
}

function deleteNote(id) {
    if (confirm('Delete this note?')) {
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('notes', JSON.stringify(notes));
        showAlert('✅ Deleted!', 'success', 'userAlert');
        loadMyNotes();
    }
}

// TASKS
function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    if (!text) return;

    const task = {
        id: Date.now(),
        text: text,
        completed: false,
        userId: currentUser.id,
        createdAt: new Date().toLocaleTimeString(),
        dueDate: new Date(Date.now() + 24*60*60*1000).toLocaleDateString()
    };

    tasks.push(task);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    input.value = '';
    loadTasks();
    showAlert('✅ Task added!', 'success', 'userAlert');
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        localStorage.setItem('tasks', JSON.stringify(tasks));
        loadTasks();
    }
}

function loadTasks() {
    const userTasks = tasks.filter(t => t.userId === currentUser.id);
    const html = userTasks.length === 0
        ? '<div class="empty-state" style="padding: 40px 20px;"><div class="empty-state-icon">📝</div><h3>No tasks</h3></div>'
        : userTasks.map(t => `
            <div class="task-item ${t.completed ? 'completed' : ''}">
                <input type="checkbox" class="task-checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask(${t.id})">
                <div class="task-content">
                    <div class="task-text">${t.text}</div>
                    <div class="task-time">Due: ${t.dueDate} at ${t.createdAt}</div>
                </div>
                <button class="btn btn-danger btn-small" onclick="deleteTask(${t.id})">🗑️</button>
            </div>
        `).join('');
    document.getElementById('tasksList').innerHTML = html;
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    loadTasks();
    showAlert('✅ Task deleted!', 'success', 'userAlert');
}

// ADMIN FUNCTIONS
function switchAdminTab(tab) {
    document.querySelectorAll('#adminSection .content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#adminSection .tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tab === 'published') loadPublishedNotes();
    if (tab === 'users') loadUsersList();
}

function loadPublishedNotes() {
    const published = notes.filter(n => n.status === 'published');
    const html = published.length === 0 
        ? '<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-state-icon">📭</div><h3>No published notes</h3></div>'
        : published.map(n => `
            <div class="note-card" onclick="viewNote(${n.id})">
                ${n.isImportant ? '<div style="position: absolute; top: 10px; right: 10px; font-size: 24px;">⭐</div>' : ''}
                <div class="note-header">
                    <div class="note-title">${n.title}</div>
                    <div class="note-author">by ${n.author}</div>
                </div>
                <div class="note-content">
                    <div class="note-meta"><span class="badge">📚 ${n.topic}</span> <span class="badge">📊 ${n.difficulty}</span></div>
                    <div class="note-text">${n.content.substring(0, 150)}...</div>
                </div>
                <div class="note-footer">
                    <span class="status-badge status-approved">✓ Published</span>
                    <button class="btn btn-danger btn-small" onclick="deleteAdminNote(${n.id}); event.stopPropagation();">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
    document.getElementById('publishedContainer').innerHTML = html;
}

function loadUsersList() {
    const rows = users.length === 0
        ? '<tr><td colspan="5" style="text-align: center; padding: 40px;">No users</td></tr>'
        : users.map(u => `
            <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td>${u.createdAt}</td>
                <td><span class="badge">${notes.filter(n => n.userId === u.id).length}</span></td>
                <td>
                    ${blockedUsers.includes(u.id) 
                        ? `<button class="btn btn-success btn-small" onclick="unblockUser(${u.id}); event.stopPropagation();">✓ Unblock</button>`
                        : `<button class="btn btn-danger btn-small" onclick="blockUser(${u.id}); event.stopPropagation();">🚫 Block</button>`
                    }
                </td>
            </tr>
        `).join('');
    document.getElementById('usersTable').innerHTML = rows;
}

function blockUser(userId) {
    if (confirm('Block this user? They will not be able to publish new notes.')) {
        if (!blockedUsers.includes(userId)) {
            blockedUsers.push(userId);
            localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
            showAlert('✅ User blocked successfully!', 'success', 'adminAlert');
            loadUsersList();
        }
    }
}

function unblockUser(userId) {
    if (confirm('Unblock this user? They will be able to publish notes again.')) {
        blockedUsers = blockedUsers.filter(id => id !== userId);
        localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
        showAlert('✅ User unblocked successfully!', 'success', 'adminAlert');
        loadUsersList();
    }
}

function deleteAdminNote(id) {
    if (confirm('Delete this note?')) {
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('notes', JSON.stringify(notes));
        showAlert('✅ Deleted!', 'success', 'adminAlert');
        loadApprovedNotes();
        updateAdminDashboard();
    }
}

function updateAdminDashboard() {
    document.getElementById('totalNotes').textContent = notes.length;
    document.getElementById('publishedCount').textContent = notes.filter(n => n.status === 'published').length;
    document.getElementById('blockedCount').textContent = blockedUsers.length;
}

// FILE FUNCTIONS
function getFileIcon(type) {
    if (type.includes('image')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('presentation') || type.includes('ppt')) return '📊';
    return '📎';
}

function downloadFile(noteId, attIndex) {
    const note = notes.find(n => n.id === noteId);
    if (note && note.attachments[attIndex]) {
        const att = note.attachments[attIndex];
        const link = document.createElement('a');
        link.href = att.data;
        link.download = att.name;
        link.click();
        showAlert(`📥 Downloaded: ${att.name}`, 'success', 'userAlert');
    }
}

function previewFile(noteId, attIndex) {
    const note = notes.find(n => n.id === noteId);
    if (!note || !note.attachments[attIndex]) return;

    const att = note.attachments[attIndex];
    const type = att.type.toLowerCase();

    if (type.includes('image')) {
        const modal = document.getElementById('viewModal');
        document.getElementById('modalTitle').textContent = `🖼️ ${att.name}`;
        document.getElementById('modalBody').innerHTML = `<img src="${att.data}" style="max-width: 100%; border-radius: 8px;">`;
        modal.classList.add('active');
    } else if (type.includes('pdf')) {
        showAlert('📄 Download PDF to view', 'info', 'userAlert');
        downloadFile(noteId, attIndex);
    } else {
        showAlert('📎 Download file to view', 'info', 'userAlert');
        downloadFile(noteId, attIndex);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAdmin');
    document.getElementById('loginSection').classList.add('active');
    document.getElementById('userSection').classList.remove('active');
    document.getElementById('adminSection').classList.remove('active');
}

function closeModal() {
    document.getElementById('viewModal').classList.remove('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingNoteId = null;
}

function showAlert(msg, type, el) {
    const alert = document.getElementById(el);
    alert.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    setTimeout(() => alert.innerHTML = '', 4000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    users = JSON.parse(localStorage.getItem('users')) || [];
    notes = JSON.parse(localStorage.getItem('notes')) || [];
    tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    blockedUsers = JSON.parse(localStorage.getItem('blockedUsers')) || [];
    
    // Load dark mode preference
    loadDarkModePreference();
    
    // Initialize filtered notes with all published notes
    filteredNotes = notes.filter(n => n.status === 'published');

    // Check for remembered user credentials
    const rememberedUserEmail = localStorage.getItem('rememberedUserEmail');
    const rememberedUserPassword = localStorage.getItem('rememberedUserPassword');
    if (rememberedUserEmail && rememberedUserPassword) {
        setTimeout(() => {
            document.getElementById('loginEmail').value = rememberedUserEmail;
            document.getElementById('loginPassword').value = rememberedUserPassword;
            document.getElementById('rememberMeUser').checked = true;
        }, 100);
    }

    // Check for remembered admin credentials
    const rememberedAdminEmail = localStorage.getItem('rememberedAdminEmail');
    const rememberedAdminPassword = localStorage.getItem('rememberedAdminPassword');
    if (rememberedAdminEmail && rememberedAdminPassword) {
        setTimeout(() => {
            document.getElementById('adminEmailField').value = rememberedAdminEmail;
            document.getElementById('adminPasswordField').value = rememberedAdminPassword;
            document.getElementById('rememberMeAdmin').checked = true;
        }, 100);
    }

    // Auto-login if user was previously logged in
    const currentUserData = localStorage.getItem('currentUser');
    if (currentUserData) {
        try {
            const user = JSON.parse(currentUserData);
            currentUser = user;
            document.getElementById('loginSection').classList.remove('active');
            document.getElementById('userSection').classList.add('active');
            document.getElementById('userName').textContent = `👋 Welcome, ${user.name}!`;
            loadBrowseNotes();
        } catch(e) {
            console.log('Could not auto-login user');
        }
    }

    // Auto-login if admin was previously logged in
    const isAdmin = localStorage.getItem('isAdmin');
    if (isAdmin) {
        currentUser = { id: 'admin', role: 'admin' };
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('adminSection').classList.add('active');
        updateAdminDashboard();
    }
});