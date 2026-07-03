/* ================================
   script.js — DarslarCMS v3.0
   Pure JS | IndexedDB | No Python
================================ */

// ===============================
// 1. GLOBAL STATE
// ===============================
let APP = {
    isAdmin: false,
    adminDashOpen: false,
    currentUser: null,
    currentVideoId: null,
    currentFilter: 'all',
    currentSort: 'new',
    searchQuery: '',
    settings: {
        maxSizeMb: 500,
        autoplay: false,
        downloadAllowed: true,
        accentColor: '#5e6ad2'
    },
    adminCreds: { id: 'samirjon', pass: 'admin22010122' }
};

// ===============================
// 2. DATABASE (IndexedDB)
// ===============================
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('DarslarCMS', 2);
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('videos')) {
                const vs = d.createObjectStore('videos', { keyPath: 'id' });
                vs.createIndex('category', 'category', { unique: false });
            }
            if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('users')) d.createObjectStore('users', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
            if (!d.objectStoreNames.contains('comments')) d.createObjectStore('comments', { keyPath: 'id' });
        };
        req.onsuccess = (e) => { db = e.target.result; resolve(); };
        req.onerror = reject;
    });
}

function dbGet(store) {
    return new Promise((res) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
    });
}
function dbGetOne(store, key) {
    return new Promise((res) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
    });
}
function dbPut(store, data) {
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(data);
        req.onsuccess = res;
        req.onerror = rej;
    });
}
function dbDelete(store, key) {
    return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(key);
        req.onsuccess = res;
        req.onerror = rej;
    });
}

// ===============================
// 3. UTILITY FUNCTIONS
// ===============================
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qAll = (sel) => document.querySelectorAll(sel);

function showToast(msg, type = 'info', dur = 3000) {
    const icons = { success:'fa-check-circle', error:'fa-times-circle', info:'fa-info-circle', warn:'fa-exclamation-triangle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${msg}</span>`;
    $('toastContainer').appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, dur);
}

function showConfirm(title, msg) {
    return new Promise((resolve) => {
        $('confirmTitle').textContent = title;
        $('confirmMessage').textContent = msg;
        openModal('confirmDialog');
        const yes = () => { closeModal('confirmDialog'); resolve(true); cleanup(); };
        const no = () => { closeModal('confirmDialog'); resolve(false); cleanup(); };
        $('confirmYes').onclick = yes;
        $('confirmNo').onclick = no;
        function cleanup() { $('confirmYes').onclick = null; $('confirmNo').onclick = null; }
    });
}

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

function formatTime(sec) {
    if (!sec || isNaN(sec)) return '--';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function timeAgo(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'Hozirgina';
    if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
    return `${Math.floor(diff / 86400)} kun oldin`;
}
function uid() { return Date.now() + Math.random().toString(36).slice(2); }

function readFileAsBase64(file) {
    return new Promise((res) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target.result);
        r.readAsDataURL(file);
    });
}

function defaultAvatar(name) {
    const initials = (name || '?').charAt(0).toUpperCase();
    const colors = ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#009688','#4caf50','#ff9800'];
    const color = colors[initials.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${color}"/><text x="50%" y="55%" font-family="Inter" font-size="18" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

// ===============================
// 4. BOOT
// ===============================
async function boot() {
    await initDB();
    await seedDefaultData();
    await loadSettings();
    loadSession();
    await renderSidebarCats();
    await renderVideos();
    renderNavState();
    initEventListeners();

    setTimeout(() => {
        $('loadingBar').style.width = '100%';
        setTimeout(() => $('loadingScreen').classList.add('fade-out'), 400);
    }, 600);
}

async function seedDefaultData() {
    const cats = await dbGet('categories');
    if (cats.length === 0) {
        const defaultCats = [
            { id:'html', name:'HTML', color:'#e44d26', icon:'fab fa-html5', order:0, active:true, visible:true },
            { id:'css', name:'CSS', color:'#264de4', icon:'fab fa-css3-alt', order:1, active:true, visible:true },
            { id:'js', name:'JavaScript', color:'#f7df1e', icon:'fab fa-js', order:2, active:true, visible:true }
        ];
        for (const c of defaultCats) await dbPut('categories', c);
    }
    const adminCred = await dbGetOne('settings', 'adminCreds');
    if (adminCred) APP.adminCreds = adminCred.value;
}

async function loadSettings() {
    const s = await dbGetOne('settings', 'appSettings');
    if (s) Object.assign(APP.settings, s.value);
    document.documentElement.style.setProperty('--accent', APP.settings.accentColor);
    document.documentElement.style.setProperty('--accent-glow', APP.settings.accentColor + '4d');
    $('maxSizeLabel').textContent = APP.settings.maxSizeMb;
}

function loadSession() {
    if (sessionStorage.getItem('adminSession') === 'true') {
        APP.isAdmin = true;
    }
    const userId = sessionStorage.getItem('userSession');
    if (userId) {
        dbGetOne('users', userId).then(u => {
            if (u && !u.blocked) {
                APP.currentUser = u;
                renderNavState();
            }
        });
    }
    const theme = localStorage.getItem('cms_theme') || 'dark';
    applyTheme(theme);
}

// ===============================
// 5. THEME
// ===============================
function applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
    document.body.classList.toggle('dark', theme === 'dark');
    $('themeToggle').innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('cms_theme', theme);
}
function toggleTheme() {
    const current = document.body.classList.contains('dark') ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ===============================
// 6. NAV STATE
// ===============================
function renderNavState() {
    const isAdmin = APP.isAdmin;
    const user = APP.currentUser;
    $('adminBadge').classList.toggle('hidden', !isAdmin);
    $('adminAddVideoBtn').classList.toggle('hidden', !isAdmin);
    $('adminLoginBtn').classList.toggle('hidden', isAdmin || !!user);
    $('userBadge').classList.toggle('hidden', !user || isAdmin);
    $('userLoginBtn').classList.toggle('hidden', !!user || isAdmin);
    if (user) {
        $('navUsername').textContent = user.name;
        $('navAvatar').src = user.avatar || defaultAvatar(user.name);
    }
}

// ===============================
// 7. SIDEBAR & CATEGORIES
// ===============================
async function renderSidebarCats() {
    const cats = await dbGet('categories');
    const sorted = cats.filter(c => c.visible !== false).sort((a, b) => a.order - b.order);
    const container = $('categoryLinks');
    container.innerHTML = '';
    sorted.forEach(cat => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'sidebar-link cat-sidebar-link';
        a.dataset.category = cat.id;
        a.innerHTML = `<span class="cat-dot" style="background:${cat.color}"></span><span>${cat.name}</span>`;
        a.addEventListener('click', (e) => { e.preventDefault(); setFilter(cat.id); });
        container.appendChild(a);
    });
}

function setFilter(filter) {
    APP.currentFilter = filter;
    APP.searchQuery = '';
    $('searchInput').value = '';
    qAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const target = q(`[data-category="${filter}"]`);
    if (target) target.classList.add('active');
    renderVideos();
}

// ===============================
// 8. VIDEO CARDS & GRID
// ===============================
function createVideoCard(v, catMap) {
    const cat = catMap[v.category] || { name: v.category, color: '#888' };
    const user = APP.currentUser;
    const isLiked = user && (user.liked || []).includes(v.id);
    const isSaved = user && (user.saved || []).includes(v.id);
    const progress = v.userProgress?.[user?.id] || 0;
    const dur = v.duration || 0;
    const progressPct = dur > 0 ? Math.min((progress / dur) * 100, 100) : 0;
    const isTrending = (v.views || 0) > 100;

    let thumbHtml = v.thumbnail
        ? `<img src="${v.thumbnail}" alt="${v.title}">`
        : `<div class="thumb-placeholder"><i class="${cat.icon || 'fas fa-play'}" style="color:${cat.color}"></i></div>`;

    const card = document.createElement('div');
    card.className = 'vcard';
    card.dataset.id = v.id;
    if (v.status === 'inactive') card.style.opacity = '0.6';

    card.innerHTML = `
        <div class="thumb-wrap">
            ${thumbHtml}
            <div class="play-overlay"><i class="fas fa-play"></i></div>
            ${v.duration ? `<span class="duration-badge">${formatTime(v.duration)}</span>` : ''}
            ${progressPct > 0 ? `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>` : ''}
            ${isTrending ? `<span class="trending-badge">🔥 Trending</span>` : ''}
            ${v.status === 'inactive' ? `<span class="badge-status inactive">Nofaol</span>` : ''}
            ${v.visibility === 'private' ? `<span class="badge-status private">🔒 Private</span>` : ''}
        </div>
        <div class="vcard-body">
            <p class="vcard-title">${v.title}</p>
            <div class="vcard-meta-row">
                <span class="cat-pill" style="background:${cat.color}">${cat.name}</span>
                <div class="vcard-stats">
                    <span><i class="fas fa-eye"></i> ${v.views || 0}</span>
                    <span><i class="fas fa-thumbs-up"></i> ${v.likes || 0}</span>
                </div>
            </div>
            <div class="vcard-actions">
                <button class="action-icon-btn ${isLiked ? 'active' : ''}" onclick="event.stopPropagation();toggleLike('${v.id}')">
                    <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
                </button>
                <button class="action-icon-btn ${isSaved ? 'active' : ''}" onclick="event.stopPropagation();toggleSave('${v.id}')">
                    <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
                </button>
                ${APP.isAdmin ? `<button class="action-icon-btn" onclick="event.stopPropagation();editVideo('${v.id}')"><i class="fas fa-edit"></i></button>` : ''}
                ${APP.isAdmin ? `<button class="action-icon-btn danger" onclick="event.stopPropagation();deleteVideo('${v.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>
    `;
    card.addEventListener('click', () => openPlayer(v.id));
    return card;
}

function createVideoRow(title, icon, videos, catMap) {
    const section = document.createElement('div');
    section.className = 'video-row-section';
    section.innerHTML = `<div class="video-row-header"><h3><i class="${icon}"></i> ${title}</h3></div>`;
    const row = document.createElement('div');
    row.className = 'video-row';
    videos.forEach(v => row.appendChild(createVideoCard(v, catMap)));
    section.appendChild(row);
    return section;
}

async function renderVideos() {
    $('skeletonGrid').classList.remove('hidden');
    $('videoGrid').classList.add('hidden');
    $('emptyState').classList.add('hidden');
    $('videoGrid').innerHTML = '';

    let videos = await dbGet('videos');
    if (!APP.isAdmin) {
        videos = videos.filter(v => v.status === 'active' && v.visibility === 'public');
    }

    const cats = await dbGet('categories');
    const catMap = {};
    cats.forEach(c => catMap[c.id] = c);

    let isFiltered = false;

    if (APP.searchQuery) {
        const q2 = APP.searchQuery.toLowerCase();
        videos = videos.filter(v => v.title.toLowerCase().includes(q2));
        isFiltered = true;
    }

    if (APP.currentFilter !== 'all') {
        isFiltered = true;
        if (APP.currentFilter === 'trending') {
            videos = videos.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20);
        } else if (APP.currentFilter === 'liked') {
            const user = APP.currentUser;
            videos = user ? videos.filter(v => (user.liked || []).includes(v.id)) : [];
        } else if (APP.currentFilter === 'saved') {
            const user = APP.currentUser;
            videos = user ? videos.filter(v => (user.saved || []).includes(v.id)) : [];
        } else if (APP.currentFilter === 'history') {
            const user = APP.currentUser;
            if (!user) { videos = []; }
            else {
                const hist = user.history || [];
                videos = hist.map(id => videos.find(v => v.id === id)).filter(Boolean).reverse();
            }
        } else {
            videos = videos.filter(v => v.category === APP.currentFilter);
        }
    }

    if (APP.currentSort !== 'new') isFiltered = true;
    if (APP.currentSort === 'new') videos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (APP.currentSort === 'old') videos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    else if (APP.currentSort === 'popular') videos.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (APP.currentSort === 'liked') videos.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    $('videoCountBadge').textContent = `${videos.length} ta video`;
    const titleMap = { all:'Barcha videolar', trending:'🔥 Trending', liked:'❤️ Yoqqanlar', saved:'💾 Saqlangan', history:'📜 Tarix' };
    $('sectionTitle').textContent = titleMap[APP.currentFilter] || APP.currentFilter.toUpperCase();

    await new Promise(r => setTimeout(r, 350));
    $('skeletonGrid').classList.add('hidden');
    $('videoGrid').classList.remove('hidden');

    if (videos.length === 0) {
        $('emptyState').classList.remove('hidden');
        return;
    }

    if (isFiltered) {
        $('videoGrid').className = 'video-grid';
        videos.forEach(v => $('videoGrid').appendChild(createVideoCard(v, catMap)));
    } else {
        $('videoGrid').className = '';
        const user = APP.currentUser;

        // Davom ettirish
        if (user) {
            const continueVids = videos.filter(v => {
                const p = v.userProgress?.[user.id] || 0;
                return p > 0 && p < (v.duration || Infinity) - 5;
            });
            if (continueVids.length > 0) {
                $('videoGrid').appendChild(createVideoRow('Davom ettirish', 'fas fa-play-circle', continueVids.slice(0, 10), catMap));
            }
        }

        // Ommabop
        const popular = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
        if (popular.length > 0) $('videoGrid').appendChild(createVideoRow('Ommabop Darslar', 'fas fa-fire', popular, catMap));

        // Yangi
        const newest = [...videos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 10);
        if (newest.length > 0) $('videoGrid').appendChild(createVideoRow("Yangi Qo'shilganlar", 'fas fa-star', newest, catMap));

        // Barchasi
        const allHeader = document.createElement('div');
        allHeader.className = 'video-row-header';
        allHeader.style.marginTop = '40px';
        allHeader.innerHTML = `<h3><i class="fas fa-layer-group"></i> Barcha darslar</h3>`;
        $('videoGrid').appendChild(allHeader);

        const allGrid = document.createElement('div');
        allGrid.className = 'video-grid';
        videos.forEach(v => allGrid.appendChild(createVideoCard(v, catMap)));
        $('videoGrid').appendChild(allGrid);
    }
}

// ===============================
// 9. VIDEO PLAYER
// ===============================
async function openPlayer(id) {
    const v = await dbGetOne('videos', id);
    if (!v) return;
    APP.currentVideoId = id;

    v.views = (v.views || 0) + 1;
    await dbPut('videos', v);

    if (APP.currentUser) {
        const u = APP.currentUser;
        u.history = u.history || [];
        u.history = u.history.filter(h => h !== id);
        u.history.push(id);
        if (u.history.length > 50) u.history.shift();
        u.totalViews = (u.totalViews || 0) + 1;
        await dbPut('users', u);
        APP.currentUser = u;
    }

    const cats = await dbGet('categories');
    const cat = cats.find(c => c.id === v.category) || { name: v.category, color: '#888' };

    $('playerTitle').textContent = v.title;
    $('playerCatBadge').textContent = cat.name;
    $('playerCatBadge').style.background = cat.color;
    $('playerViews').innerHTML = `<i class="fas fa-eye"></i> ${v.views}`;
    $('playerDuration').innerHTML = v.duration ? `<i class="fas fa-clock"></i> ${formatTime(v.duration)}` : `<i class="fas fa-clock"></i> --`;

    const videoEl = $('mainVideo');
    const iframeEl = $('youtubeFrame');

    if (v.youtubeUrl) {
        videoEl.classList.add('hidden');
        iframeEl.classList.remove('hidden');
        iframeEl.src = v.youtubeUrl + '?autoplay=1';
    } else if (v.videoBlob) {
        iframeEl.classList.add('hidden');
        videoEl.classList.remove('hidden');
        videoEl.src = v.videoBlob;
        const savedProgress = (v.userProgress || {})[APP.currentUser?.id] || 0;
        videoEl.currentTime = savedProgress;
        if (APP.settings.autoplay || $('autoplayToggle').checked) videoEl.play();
    } else {
        iframeEl.classList.add('hidden');
        videoEl.classList.remove('hidden');
        videoEl.src = '';
    }

    videoEl.loop = $('loopToggle').checked;
    const canDownload = v.downloadAllowed !== false && APP.settings.downloadAllowed;
    $('downloadBtn').classList.toggle('hidden', !canDownload);
    updateLikeSaveUI(v);
    await renderComments(id);

    $('playerSection').classList.remove('hidden');
    $('playerSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateLikeSaveUI(v) {
    const user = APP.currentUser;
    const isLiked = user && (user.liked || []).includes(v.id);
    const isSaved = user && (user.saved || []).includes(v.id);
    $('likeCountEl').textContent = v.likes || 0;
    $('likeBtn').classList.toggle('active', isLiked);
    $('saveBtn').classList.toggle('active', isSaved);
    $('saveBtn').innerHTML = isSaved ? '<i class="fas fa-bookmark"></i> Saqlangan' : '<i class="far fa-bookmark"></i> Saqlash';
}

async function toggleLike(id) {
    if (!APP.currentUser) { showToast('Layk bosish uchun tizimga kiring', 'warn'); return; }
    const v = await dbGetOne('videos', id);
    const u = APP.currentUser;
    u.liked = u.liked || [];
    if (u.liked.includes(id)) {
        u.liked = u.liked.filter(l => l !== id);
        v.likes = Math.max(0, (v.likes || 0) - 1);
    } else {
        u.liked.push(id);
        v.likes = (v.likes || 0) + 1;
        u.totalLikes = (u.totalLikes || 0) + 1;
    }
    await dbPut('videos', v);
    await dbPut('users', u);
    APP.currentUser = u;
    if (APP.currentVideoId === id) updateLikeSaveUI(v);
    renderVideos();
}

async function toggleSave(id) {
    if (!APP.currentUser) { showToast('Saqlash uchun tizimga kiring', 'warn'); return; }
    const v = await dbGetOne('videos', id);
    const u = APP.currentUser;
    u.saved = u.saved || [];
    if (u.saved.includes(id)) {
        u.saved = u.saved.filter(s => s !== id);
        showToast("Saqlanganlardan olib tashlandi", 'info');
    } else {
        u.saved.push(id);
        showToast("Saqlanganlar ro'yxatiga qo'shildi ✅", 'success');
    }
    await dbPut('users', u);
    APP.currentUser = u;
    if (APP.currentVideoId === id) updateLikeSaveUI(v);
    renderVideos();
}

// Progress tracking
$('mainVideo').addEventListener('timeupdate', async () => {
    if (!APP.currentVideoId) return;
    const v = await dbGetOne('videos', APP.currentVideoId);
    if (!v) return;
    v.userProgress = v.userProgress || {};
    if (APP.currentUser) v.userProgress[APP.currentUser.id] = $('mainVideo').currentTime;
    if ($('mainVideo').duration) v.duration = $('mainVideo').duration;
    await dbPut('videos', v);
});

$('dislikeBtn').addEventListener('click', () => {
    $('dislikeBtn').classList.toggle('active');
    showToast('Baholading', 'info');
});

$('closePlayerBtn').addEventListener('click', () => {
    $('playerSection').classList.add('hidden');
    $('mainVideo').pause();
    $('mainVideo').src = '';
    $('youtubeFrame').src = '';
    APP.currentVideoId = null;
    renderVideos();
});

$('downloadBtn').addEventListener('click', async () => {
    if (!APP.currentVideoId) return;
    const v = await dbGetOne('videos', APP.currentVideoId);
    if (!v || !v.videoBlob) { showToast("Bu video yuklab olib bo'lmaydi", 'warn'); return; }
    const a = document.createElement('a');
    a.href = v.videoBlob;
    a.download = v.title + '.mp4';
    a.click();
});

$('autoplayToggle').addEventListener('change', (e) => { APP.settings.autoplay = e.target.checked; });
$('loopToggle').addEventListener('change', (e) => { $('mainVideo').loop = e.target.checked; });

// ===============================
// 10. COMMENTS
// ===============================
async function renderComments(videoId) {
    const allComments = await dbGet('comments');
    const comments = allComments.filter(c => c.videoId === videoId);
    $('commentCount').textContent = comments.length;
    const user = APP.currentUser;
    $('commentFormWrap').style.display = user ? 'flex' : 'none';
    if (user) $('commentAvatar').src = user.avatar || defaultAvatar(user.name);

    $('commentsList').innerHTML = '';
    comments.sort((a, b) => b.createdAt - a.createdAt).forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment-item';
        div.innerHTML = `
            <img class="avatar sm" src="${c.userAvatar || defaultAvatar(c.userName)}" alt="">
            <div class="comment-body">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <p class="comment-author">${c.userName}</p>
                        <p class="comment-text">${c.text}</p>
                        <p class="comment-time">${timeAgo(c.createdAt)}</p>
                    </div>
                    ${(user && (user.id === c.userId || APP.isAdmin)) ? `<button class="comment-delete" onclick="deleteComment('${c.id}','${videoId}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
        `;
        $('commentsList').appendChild(div);
    });
}

async function deleteComment(commentId, videoId) {
    await dbDelete('comments', commentId);
    await renderComments(videoId);
    showToast("Kommentariya o'chirildi", 'success');
}

$('sendCommentBtn').addEventListener('click', async () => {
    const text = $('commentInput').value.trim();
    if (!text) return;
    if (!APP.currentUser) { showToast('Kommentariya yozish uchun kiring', 'warn'); return; }
    const comment = {
        id: uid(), videoId: APP.currentVideoId,
        userId: APP.currentUser.id, userName: APP.currentUser.name,
        userAvatar: APP.currentUser.avatar || '',
        text, createdAt: Date.now()
    };
    await dbPut('comments', comment);
    $('commentInput').value = '';
    await renderComments(APP.currentVideoId);
});

// ===============================
// 11. ADD/EDIT VIDEO
// ===============================
let selectedFile = null;
let selectedThumbBase64 = null;
let isEditMode = false;

function openAddVideoModal(editId = null) {
    isEditMode = !!editId;
    $('videoModalTitle').innerHTML = isEditMode ? '<i class="fas fa-edit"></i> Videoni tahrirlash' : '<i class="fas fa-film"></i> Video qo\'shish';
    $('videoSubmitText').textContent = isEditMode ? 'Saqlash' : "Qo'shish";
    $('editVideoId').value = editId || '';
    $('fileUploadGroup').style.display = isEditMode ? 'none' : 'block';
    selectedFile = null;
    selectedThumbBase64 = null;

    if (!isEditMode) {
        $('addVideoForm').reset();
        $('uploadPreview').classList.add('hidden');
        $('thumbPreviewImg').classList.add('hidden');
        $('uploadProgress').classList.add('hidden');
    }

    populateCatSelect('newVideoCat');

    if (editId) {
        dbGetOne('videos', editId).then(v => {
            if (!v) return;
            $('newVideoTitle').value = v.title;
            $('newVideoCat').value = v.category;
            $('youtubeUrl').value = v.youtubeUrl || '';
            $('newVideoStatus').value = v.status || 'active';
            $('newVideoVisibility').value = v.visibility || 'public';
            $('newVideoDownload').value = v.downloadAllowed === false ? '0' : '1';
            if (v.thumbnail) {
                $('thumbPreviewImg').src = v.thumbnail;
                $('thumbPreviewImg').classList.remove('hidden');
            }
        });
    }

    openModal('addVideoModal');
}

async function populateCatSelect(selId) {
    const cats = await dbGet('categories');
    const sel = $(selId);
    sel.innerHTML = '';
    cats.sort((a, b) => a.order - b.order).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
    });
}

$('newVideoFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const maxBytes = APP.settings.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
        showToast(`Fayl juda katta! Maksimal ${APP.settings.maxSizeMb}MB`, 'error');
        e.target.value = '';
        return;
    }
    selectedFile = file;
    $('uploadFileName').textContent = file.name;
    $('uploadFileSize').textContent = formatSize(file.size);
    $('uploadPreview').classList.remove('hidden');
    q('.upload-zone-label').style.display = 'none';
});

$('removeFileBtn').addEventListener('click', () => {
    selectedFile = null;
    $('newVideoFile').value = '';
    $('uploadPreview').classList.add('hidden');
    q('.upload-zone-label').style.display = 'flex';
});

$('thumbFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    selectedThumbBase64 = await readFileAsBase64(file);
    $('thumbPreviewImg').src = selectedThumbBase64;
    $('thumbPreviewImg').classList.remove('hidden');
});

const uploadZone = $('uploadZone');
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
        selectedFile = file;
        $('uploadFileName').textContent = file.name;
        $('uploadFileSize').textContent = formatSize(file.size);
        $('uploadPreview').classList.remove('hidden');
        q('.upload-zone-label').style.display = 'none';
    }
});

$('addVideoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = $('editVideoId').value;
    const title = $('newVideoTitle').value.trim();
    const cat = $('newVideoCat').value;
    const youtubeUrl = $('youtubeUrl').value.trim();
    const status = $('newVideoStatus').value;
    const visibility = $('newVideoVisibility').value;
    const downloadAllowed = $('newVideoDownload').value === '1';

    if (!editId && !selectedFile && !youtubeUrl) {
        showToast('Video fayl yoki YouTube URL kiriting', 'error');
        return;
    }

    $('videoSubmitBtn').disabled = true;
    $('videoSubmitBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...';

    try {
        let videoData;
        if (editId) {
            videoData = await dbGetOne('videos', editId) || {};
        } else {
            videoData = { id: uid(), createdAt: Date.now(), views: 0, likes: 0, dislikes: 0, userProgress: {} };
        }

        videoData.title = title;
        videoData.category = cat;
        videoData.youtubeUrl = youtubeUrl || '';
        videoData.status = status;
        videoData.visibility = visibility;
        videoData.downloadAllowed = downloadAllowed;

        if (selectedThumbBase64) videoData.thumbnail = selectedThumbBase64;

        if (selectedFile && !editId) {
            $('uploadProgress').classList.remove('hidden');
            await new Promise((res) => {
                const reader = new FileReader();
                reader.onprogress = (ev) => {
                    if (ev.lengthComputable) {
                        const pct = Math.round((ev.loaded / ev.total) * 100);
                        $('uploadProgressBar').style.width = pct + '%';
                        $('uploadProgressText').textContent = pct + '%';
                    }
                };
                reader.onload = (ev) => { videoData.videoBlob = ev.target.result; res(); };
                reader.readAsDataURL(selectedFile);
            });
            $('uploadProgress').classList.add('hidden');
        }

        await dbPut('videos', videoData);
        closeModal('addVideoModal');
        $('addVideoForm').reset();
        selectedFile = null; selectedThumbBase64 = null;
        $('uploadPreview').classList.add('hidden');
        q('.upload-zone-label').style.display = 'flex';
        showToast(editId ? '✅ Video yangilandi!' : '🎉 Video qo\'shildi!', 'success');
        await renderVideos();
        if (APP.adminDashOpen) await refreshDashboard();
    } catch (err) {
        console.error(err);
        showToast('Xatolik yuz berdi!', 'error');
    } finally {
        $('videoSubmitBtn').disabled = false;
        $('videoSubmitBtn').innerHTML = `<i class="fas fa-upload"></i> <span id="videoSubmitText">${isEditMode ? 'Saqlash' : "Qo'shish"}</span>`;
    }
});

async function deleteVideo(id) {
    const ok = await showConfirm("Videoni o'chirish", "Bu video butunlay o'chiriladi. Davom etasizmi?");
    if (!ok) return;
    await dbDelete('videos', id);
    showToast("Video o'chirildi", 'success');
    if (APP.currentVideoId === id) {
        $('playerSection').classList.add('hidden');
        $('mainVideo').src = '';
        APP.currentVideoId = null;
    }
    await renderVideos();
    if (APP.adminDashOpen) await refreshDashboard();
}

async function editVideo(id) { openAddVideoModal(id); }

// ===============================
// 12. ADMIN DASHBOARD
// ===============================
async function openAdminDashboard() {
    $('adminDashboard').classList.remove('hidden');
    APP.adminDashOpen = true;
    await refreshDashboard();
}

function closeAdminDashboard() {
    $('adminDashboard').classList.add('hidden');
    APP.adminDashOpen = false;
}

async function refreshDashboard() {
    await loadStatsPanel();
    await populateCatSelect('dashVideoCatFilter');
    const opt = document.createElement('option');
    opt.value = 'all'; opt.textContent = 'Barcha kategoriyalar';
    $('dashVideoCatFilter').insertBefore(opt, $('dashVideoCatFilter').firstChild);
    $('dashVideoCatFilter').value = 'all';
    const panel = q('.dash-panel.active')?.id?.replace('panel-', '');
    if (panel === 'videos') await loadVideosPanel();
    if (panel === 'categories') await loadCatPanel();
    if (panel === 'users') await loadUsersPanel();
}

async function loadStatsPanel() {
    const videos = await dbGet('videos');
    const users = await dbGet('users');
    const cats = await dbGet('categories');

    $('statTotalVideos').textContent = videos.length;
    $('statTotalUsers').textContent = users.length;
    $('statTotalViews').textContent = videos.reduce((s, v) => s + (v.views || 0), 0);
    $('statTotalLikes').textContent = videos.reduce((s, v) => s + (v.likes || 0), 0);
    $('statTotalCats').textContent = cats.length;

    const watchMins = videos.reduce((s, v) => {
        const prog = Object.values(v.userProgress || {});
        return s + prog.reduce((a, b) => a + b, 0);
    }, 0);
    $('statWatchTime').textContent = Math.round(watchMins / 60) + ' daq';

    const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    $('topVideosList').innerHTML = sorted.map((v, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:18px;font-weight:800;color:var(--text-muted);width:24px">${i + 1}</span>
            <div style="flex:1"><p style="font-weight:600;font-size:14px">${v.title}</p><p style="font-size:12px;color:var(--text-secondary)">${v.views || 0} ko'rish</p></div>
        </div>
    `).join('');

    $('catStatsList').innerHTML = cats.map(c => {
        const count = videos.filter(v => v.category === c.id).length;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span class="cat-pill" style="background:${c.color}">${c.name}</span>
            <span style="font-size:14px;font-weight:600">${count} ta video</span>
        </div>`;
    }).join('');
}

async function loadVideosPanel() {
    const videos = await dbGet('videos');
    const cats = await dbGet('categories');
    const catMap = {};
    cats.forEach(c => catMap[c.id] = c);

    const search = ($('dashVideoSearch').value || '').toLowerCase();
    const catF = $('dashVideoCatFilter').value;
    const statusF = $('dashVideoStatusFilter').value;

    const filtered = videos.filter(v => {
        const matchS = !search || v.title.toLowerCase().includes(search);
        const matchC = catF === 'all' || v.category === catF;
        const matchSt = statusF === 'all' || v.status === statusF;
        return matchS && matchC && matchSt;
    });

    $('dashVideoBody').innerHTML = filtered.map(v => {
        const cat = catMap[v.category] || { name: v.category, color: '#888' };
        const thumb = v.thumbnail
            ? `<img class="thumb" src="${v.thumbnail}" alt="">`
            : `<div style="width:60px;aspect-ratio:16/9;background:var(--surface-hover);border-radius:4px;display:flex;align-items:center;justify-content:center"><i class="fas fa-play" style="color:${cat.color}"></i></div>`;
        return `<tr>
            <td>${thumb}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</td>
            <td><span class="cat-pill" style="background:${cat.color}">${cat.name}</span></td>
            <td>${v.views || 0}</td>
            <td>${v.likes || 0}</td>
            <td>${formatTime(v.duration)}</td>
            <td><span class="status-badge ${v.status || 'active'}">${v.status === 'active' ? 'Faol' : 'Nofaol'}</span></td>
            <td><span class="status-badge ${v.visibility || 'public'}">${v.visibility || 'public'}</span></td>
            <td>
                <div class="dash-btn-group">
                    <button class="dash-btn" onclick="editVideo('${v.id}')"><i class="fas fa-edit"></i></button>
                    <button class="dash-btn ${v.status === 'active' ? 'warn' : 'success'}" onclick="toggleVideoStatus('${v.id}')">${v.status === 'active' ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>'}</button>
                    <button class="dash-btn ${v.visibility === 'public' ? '' : 'success'}" onclick="toggleVideoVisibility('${v.id}')">${v.visibility === 'public' ? '🌍' : '🔒'}</button>
                    <button class="dash-btn danger" onclick="deleteVideo('${v.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function toggleVideoStatus(id) {
    const v = await dbGetOne('videos', id);
    v.status = v.status === 'active' ? 'inactive' : 'active';
    await dbPut('videos', v);
    showToast(`Video ${v.status === 'active' ? 'faollashtirildi' : 'nofaol qilindi'}`, 'info');
    await loadVideosPanel();
    await renderVideos();
}

async function toggleVideoVisibility(id) {
    const v = await dbGetOne('videos', id);
    v.visibility = v.visibility === 'public' ? 'private' : 'public';
    await dbPut('videos', v);
    showToast(`Video ${v.visibility === 'public' ? 'ommaviy' : 'maxfiy'} qilindi`, 'info');
    await loadVideosPanel();
    await renderVideos();
}

async function loadCatPanel() {
    const cats = await dbGet('categories');
    const videos = await dbGet('videos');
    $('catAdminGrid').innerHTML = cats.sort((a, b) => a.order - b.order).map(c => {
        const count = videos.filter(v => v.category === c.id).length;
        return `<div class="cat-admin-card">
            <div class="cat-card-header">
                <i class="${c.icon || 'fas fa-folder'}" style="color:${c.color};font-size:28px"></i>
                <div>
                    <p class="cat-name">${c.name}</p>
                    <p class="cat-video-count">${count} ta video</p>
                </div>
                <span class="cat-pill" style="background:${c.color}">${c.active !== false ? 'Faol' : 'Nofaol'}</span>
            </div>
            <div class="cat-admin-actions">
                <button class="dash-btn" onclick="editCat('${c.id}')"><i class="fas fa-edit"></i> Tahrirlash</button>
                <button class="dash-btn ${c.visible !== false ? 'warn' : 'success'}" onclick="toggleCatVisibility('${c.id}')">${c.visible !== false ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>'}</button>
                <button class="dash-btn danger" onclick="deleteCat('${c.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function editCat(id) {
    const c = await dbGetOne('categories', id);
    if (!c) return;
    $('catModalTitle').innerHTML = '<i class="fas fa-edit"></i> Kategoriyani tahrirlash';
    $('editCatId').value = c.id;
    $('catName').value = c.name;
    $('catColor').value = c.color;
    $('catIcon').value = c.icon || '';
    $('catOrder').value = c.order || 0;
    $('catActive').checked = c.active !== false;
    $('catVisible').checked = c.visible !== false;
    updateCatPreview();
    openModal('addCatModal');
}

async function deleteCat(id) {
    const vids = await dbGet('videos');
    const hasVideos = vids.some(v => v.category === id);
    if (hasVideos) { showToast("Bu kategoriyada videolar bor! Avval ularni o'chiring.", 'error'); return; }
    const ok = await showConfirm("Kategoriyani o'chirish", "Bu kategoriya o'chiriladi. Davom etasizmi?");
    if (!ok) return;
    await dbDelete('categories', id);
    showToast("Kategoriya o'chirildi", 'success');
    await renderSidebarCats();
    await loadCatPanel();
}

async function toggleCatVisibility(id) {
    const c = await dbGetOne('categories', id);
    c.visible = c.visible === false;
    await dbPut('categories', c);
    await renderSidebarCats();
    await loadCatPanel();
}

$('addCatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = $('editCatId').value;
    const cat = {
        id: editId || $('catName').value.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
        name: $('catName').value.trim(),
        color: $('catColor').value,
        icon: $('catIcon').value.trim() || 'fas fa-folder',
        order: parseInt($('catOrder').value) || 0,
        active: $('catActive').checked,
        visible: $('catVisible').checked
    };
    if (editId) cat.id = editId;
    await dbPut('categories', cat);
    closeModal('addCatModal');
    showToast(editId ? 'Kategoriya yangilandi ✅' : "Kategoriya qo'shildi 🎉", 'success');
    await renderSidebarCats();
    await loadCatPanel();
    $('addCatForm').reset();
    $('editCatId').value = '';
});

function updateCatPreview() {
    const icon = $('catIcon').value || 'fas fa-folder';
    const color = $('catColor').value;
    const name = $('catName').value || 'Kategoriya';
    $('catIconPreview').className = icon;
    $('catColorPreview').textContent = name;
    $('catColorPreview').style.background = color;
}
$('catIcon').addEventListener('input', updateCatPreview);
$('catColor').addEventListener('input', updateCatPreview);
$('catName').addEventListener('input', updateCatPreview);

async function loadUsersPanel() {
    const users = await dbGet('users');
    $('dashUserBody').innerHTML = users.map(u => `<tr>
        <td><img class="avatar sm" src="${u.avatar || defaultAvatar(u.name)}" alt=""></td>
        <td>${u.name}</td>
        <td>${u.login}</td>
        <td><span class="status-badge ${u.role === 'admin' ? 'active' : 'public'}">${u.role || 'user'}</span></td>
        <td><span class="status-badge ${u.blocked ? 'inactive' : 'active'}">${u.blocked ? 'Bloklangan' : 'Faol'}</span></td>
        <td>${u.totalViews || 0}</td>
        <td>${u.totalLikes || 0}</td>
        <td>
            <div class="dash-btn-group">
                <button class="dash-btn ${u.blocked ? 'success' : 'warn'}" onclick="toggleBlockUser('${u.id}')">${u.blocked ? '<i class="fas fa-unlock"></i>' : '<i class="fas fa-ban"></i>'}</button>
                <button class="dash-btn" onclick="setUserRole('${u.id}','${u.role === 'admin' ? 'user' : 'admin'}')">${u.role === 'admin' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-crown"></i>'}</button>
                <button class="dash-btn danger" onclick="deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </td>
    </tr>`).join('');
}

async function toggleBlockUser(id) {
    const u = await dbGetOne('users', id);
    u.blocked = !u.blocked;
    await dbPut('users', u);
    if (APP.currentUser?.id === id && u.blocked) {
        APP.currentUser = null;
        sessionStorage.removeItem('userSession');
        renderNavState();
        showToast('Sizning akkauntingiz bloklandi', 'error');
    }
    showToast(u.blocked ? 'Foydalanuvchi bloklandi' : 'Foydalanuvchi blokdan chiqarildi', 'info');
    await loadUsersPanel();
}

async function setUserRole(id, role) {
    const u = await dbGetOne('users', id);
    u.role = role;
    await dbPut('users', u);
    showToast(`Rol ${role} ga o'zgartirildi`, 'success');
    await loadUsersPanel();
}

async function deleteUser(id) {
    const ok = await showConfirm("Foydalanuvchini o'chirish", "Bu foydalanuvchi o'chiriladi. Davom etasizmi?");
    if (!ok) return;
    await dbDelete('users', id);
    showToast("Foydalanuvchi o'chirildi", 'success');
    await loadUsersPanel();
}

// ===============================
// 13. ADMIN LOGIN/LOGOUT
// ===============================
$('adminLoginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('adminIdInput').value.trim();
    const pass = $('adminPassInput').value;
    if (id === APP.adminCreds.id && pass === APP.adminCreds.pass) {
        APP.isAdmin = true;
        sessionStorage.setItem('adminSession', 'true');
        closeModal('adminLoginModal');
        renderNavState();
        showToast('Admin sifatida kirdingiz! 🛡️', 'success');
        $('adminLoginForm').reset();
        $('adminWrongAlert').classList.add('hidden');
    } else {
        $('adminWrongAlert').classList.remove('hidden');
    }
});

$('adminLoginBtn').addEventListener('click', () => openModal('adminLoginModal'));
$('adminLogoutBtn').addEventListener('click', () => {
    APP.isAdmin = false;
    sessionStorage.removeItem('adminSession');
    closeAdminDashboard();
    renderNavState();
    showToast('Admin paneldan chiqdingiz', 'info');
});
$('adminPanelBtn').addEventListener('click', openAdminDashboard);
$('closeDashboard').addEventListener('click', closeAdminDashboard);
$('adminAddVideoBtn').addEventListener('click', () => openAddVideoModal());
$('dashAddVideoBtn').addEventListener('click', () => openAddVideoModal());

qAll('.dash-nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        qAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = btn.dataset.panel;
        qAll('.dash-panel').forEach(p => p.classList.remove('active'));
        $(`panel-${panel}`)?.classList.add('active');
        if (panel === 'stats') await loadStatsPanel();
        if (panel === 'videos') await loadVideosPanel();
        if (panel === 'categories') await loadCatPanel();
        if (panel === 'users') await loadUsersPanel();
    });
});

$('dashAddCatBtn').addEventListener('click', () => {
    $('catModalTitle').innerHTML = "<i class='fas fa-folder-plus'></i> Kategoriya qo'shish";
    $('addCatForm').reset();
    $('editCatId').value = '';
    openModal('addCatModal');
});

$('dashVideoSearch').addEventListener('input', loadVideosPanel);
$('dashVideoCatFilter').addEventListener('change', loadVideosPanel);
$('dashVideoStatusFilter').addEventListener('change', loadVideosPanel);

// ===============================
// 14. USER AUTH
// ===============================
$('userLoginBtn').addEventListener('click', () => openModal('userRegisterModal'));

qAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        qAll('.tab-btn').forEach(b => { if (b.dataset.tab) b.classList.remove('active'); });
        btn.classList.add('active');
        qAll('.tab-content').forEach(t => t.classList.remove('active'));
        $('userRegisterForm').classList.toggle('active', tab === 'register');
        $('userLoginForm').classList.toggle('active', tab === 'login');
    });
});

$('userRegisterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('regName').value.trim();
    const login = $('regLogin').value.trim();
    const pass = $('regPass').value;
    if (pass.length < 4) { showToast("Parol kamida 4 ta belgi bo'lishi kerak", 'error'); return; }
    const all = await dbGet('users');
    if (all.find(u => u.login === login)) { showToast('Bu login band!', 'error'); return; }
    const user = { id: uid(), name, login, pass, role:'user', blocked:false, createdAt:Date.now(), totalViews:0, totalLikes:0, history:[], liked:[], saved:[], avatar:'' };
    await dbPut('users', user);
    APP.currentUser = user;
    sessionStorage.setItem('userSession', user.id);
    closeModal('userRegisterModal');
    renderNavState();
    showToast(`Xush kelibsiz, ${name}! 🎉`, 'success');
    $('userRegisterForm').reset();
});

$('userLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = $('loginLogin').value.trim();
    const pass = $('loginPass').value;
    const all = await dbGet('users');
    const user = all.find(u => u.login === login && u.pass === pass);
    if (!user) { $('userWrongAlert').classList.remove('hidden'); return; }
    if (user.blocked) { showToast('Akkauntingiz bloklangan!', 'error'); return; }
    $('userWrongAlert').classList.add('hidden');
    APP.currentUser = user;
    sessionStorage.setItem('userSession', user.id);
    closeModal('userRegisterModal');
    renderNavState();
    showToast(`Xush kelibsiz, ${user.name}! 👋`, 'success');
    $('userLoginForm').reset();
});

$('userLogoutBtn').addEventListener('click', () => {
    APP.currentUser = null;
    sessionStorage.removeItem('userSession');
    renderNavState();
    renderVideos();
    showToast('Tizimdan chiqdingiz', 'info');
});

// ===============================
// 15. USER PROFILE
// ===============================
$('userProfileBtn').addEventListener('click', openProfileModal);

async function openProfileModal() {
    const u = APP.currentUser;
    if (!u) return;
    $('profileAvatarImg').src = u.avatar || defaultAvatar(u.name);
    $('profileName').textContent = u.name;
    $('profileLoginDisplay').textContent = '@' + u.login;
    $('profileRoleBadge').textContent = u.role || 'user';
    $('profileViews').textContent = u.totalViews || 0;
    $('profileLikes').textContent = u.totalLikes || 0;
    $('profileSaved').textContent = (u.saved || []).length;
    $('profileHistoryTab').classList.add('active');
    $('profileLikedTab').classList.remove('active');
    $('profileSavedTab').classList.remove('active');
    await loadProfileTab('history');
    openModal('userProfileModal');
}

async function loadProfileTab(tab) {
    const u = APP.currentUser;
    if (!u) return;
    const videos = await dbGet('videos');

    const itemHtml = (v, extra = '') => `
        <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal('userProfileModal');openPlayer('${v.id}')">
            <div style="width:80px;aspect-ratio:16/9;background:var(--surface-hover);border-radius:4px;display:flex;align-items:center;justify-content:center"><i class="fas fa-play" style="font-size:18px;color:var(--text-secondary)"></i></div>
            <div><p style="font-size:14px;font-weight:600">${v.title}</p><p style="font-size:12px;color:var(--text-secondary)">${extra}</p></div>
        </div>`;

    if (tab === 'history') {
        const hist = (u.history || []).slice().reverse().slice(0, 20);
        $('profileHistoryList').innerHTML = hist.length
            ? hist.map(id => { const v = videos.find(x => x.id === id); return v ? itemHtml(v, `${v.views || 0} ko'rish`) : ''; }).join('')
            : "<p style='color:var(--text-secondary);padding:12px'>Tarix bo'sh</p>";
    }
    if (tab === 'liked') {
        const liked = (u.liked || []).map(id => videos.find(v => v.id === id)).filter(Boolean);
        $('profileLikedList').innerHTML = liked.length
            ? liked.map(v => itemHtml(v, `❤️ ${v.likes || 0} layk`)).join('')
            : "<p style='color:var(--text-secondary);padding:12px'>Layk bosilgan video yo'q</p>";
    }
    if (tab === 'saved') {
        const saved = (u.saved || []).map(id => videos.find(v => v.id === id)).filter(Boolean);
        $('profileSavedList').innerHTML = saved.length
            ? saved.map(v => itemHtml(v, `💾 Saqlangan`)).join('')
            : "<p style='color:var(--text-secondary);padding:12px'>Saqlangan video yo'q</p>";
    }
}

qAll('[data-ptab]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const tab = btn.dataset.ptab;
        qAll('[data-ptab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        qAll('.ptab-content').forEach(t => t.classList.remove('active'));
        $(`profile${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`).classList.add('active');
        await loadProfileTab(tab);
    });
});

$('avatarUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await readFileAsBase64(file);
    APP.currentUser.avatar = b64;
    await dbPut('users', APP.currentUser);
    $('profileAvatarImg').src = b64;
    $('navAvatar').src = b64;
    showToast('Avatar yangilandi!', 'success');
});

$('userChangePassBtn').addEventListener('click', async () => {
    const oldP = $('userOldPass').value;
    const newP = $('userNewPass').value;
    if (!oldP || !newP) { showToast('Eski va yangi parolni kiriting', 'error'); return; }
    if (APP.currentUser.pass !== oldP) { showToast('Eski parol xato!', 'error'); return; }
    if (newP.length < 4) { showToast("Yangi parol kamida 4 ta belgi bo'lishi kerak", 'error'); return; }
    APP.currentUser.pass = newP;
    await dbPut('users', APP.currentUser);
    $('userOldPass').value = '';
    $('userNewPass').value = '';
    showToast("Parol o'zgartirildi ✅", 'success');
});

// ===============================
// 16. SETTINGS
// ===============================
$('saveSettingsBtn').addEventListener('click', async () => {
    APP.settings.maxSizeMb = parseInt($('maxSizeMb').value) || 500;
    APP.settings.autoplay = $('settingAutoplay').checked;
    APP.settings.downloadAllowed = $('settingDownload').checked;
    await dbPut('settings', { key:'appSettings', value: APP.settings });
    $('maxSizeLabel').textContent = APP.settings.maxSizeMb;
    showToast('Sozlamalar saqlandi ✅', 'success');
});

$('applyAccentBtn').addEventListener('click', async () => {
    const color = $('accentColor').value;
    APP.settings.accentColor = color;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-glow', color + '4d');
    await dbPut('settings', { key:'appSettings', value: APP.settings });
    showToast("Rang qo'llanildi!", 'success');
});

$('clearCacheBtn').addEventListener('click', async () => {
    const ok = await showConfirm("Cache tozalash", "Brauzerdagi barcha vaqtinchalik ma'lumotlar tozalanadi.");
    if (!ok) return;
    localStorage.clear();
    sessionStorage.clear();
    showToast('Cache tozalandi!', 'success');
});

$('changePassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const old = $('oldPass').value;
    const newP = $('newPass').value;
    if (old !== APP.adminCreds.pass) { showToast('Eski parol xato!', 'error'); return; }
    if (newP.length < 4) { showToast('Yangi parol juda qisqa!', 'error'); return; }
    APP.adminCreds.pass = newP;
    await dbPut('settings', { key:'adminCreds', value: APP.adminCreds });
    showToast("Admin paroli o'zgartirildi!", 'success');
    $('changePassForm').reset();
});

$('backupBtn').addEventListener('click', async () => {
    const videos = await dbGet('videos');
    const cats = await dbGet('categories');
    const users = await dbGet('users');
    const settings = await dbGet('settings');
    const videosNoBlob = videos.map(v => { const { videoBlob, thumbnail, ...rest } = v; return rest; });
    const data = { videos: videosNoBlob, categories: cats, users, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DarslarCMS_backup_${Date.now()}.json`;
    a.click();
    showToast('Backup yuklab olindi!', 'success');
});

$('restoreBtn').addEventListener('click', () => $('restoreFile').click());
$('restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const ok = await showConfirm('Restore', "Barcha mavjud ma'lumotlar yangi ma'lumotlar bilan almashtiriladi!");
        if (!ok) return;
        if (data.categories) for (const c of data.categories) await dbPut('categories', c);
        if (data.users) for (const u of data.users) await dbPut('users', u);
        if (data.settings) for (const s of data.settings) await dbPut('settings', s);
        showToast("Ma'lumotlar tiklandi!", 'success');
        await renderSidebarCats();
        await loadStatsPanel();
    } catch { showToast("Fayl noto'g'ri formatda!", 'error'); }
});

$('resetSystemBtn').addEventListener('click', async () => {
    const ok = await showConfirm("Tizimni tozalash", "BARCHA ma'lumotlar (videolar, foydalanuvchilar, kategoriyalar) o'chiriladi! Bu qaytarib bo'lmaydi!");
    if (!ok) return;
    const stores = ['videos','categories','users','settings','comments'];
    for (const s of stores) {
        const all = await dbGet(s);
        for (const item of all) await dbDelete(s, item.id || item.key);
    }
    APP.isAdmin = false;
    APP.currentUser = null;
    sessionStorage.clear();
    closeAdminDashboard();
    await seedDefaultData();
    await renderSidebarCats();
    await renderVideos();
    renderNavState();
    showToast('Tizim tozalandi!', 'warn');
});

// ===============================
// 17. SEARCH & FILTERS
// ===============================
$('searchInput').addEventListener('input', (e) => {
    APP.searchQuery = e.target.value;
    $('searchClear').classList.toggle('hidden', !e.target.value);
    renderVideos();
});
$('searchClear').addEventListener('click', () => {
    $('searchInput').value = '';
    APP.searchQuery = '';
    $('searchClear').classList.add('hidden');
    renderVideos();
});

qAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        qAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        APP.currentSort = chip.dataset.sort;
        renderVideos();
    });
});

$('sidebarTrending').addEventListener('click', (e) => { e.preventDefault(); APP.currentFilter = 'trending'; qAll('.sidebar-link').forEach(l => l.classList.remove('active')); $('sidebarTrending').classList.add('active'); renderVideos(); });
$('sidebarLiked').addEventListener('click', (e) => { e.preventDefault(); if (!APP.currentUser) { showToast('Avval tizimga kiring', 'warn'); return; } APP.currentFilter = 'liked'; qAll('.sidebar-link').forEach(l => l.classList.remove('active')); $('sidebarLiked').classList.add('active'); renderVideos(); });
$('sidebarSaved').addEventListener('click', (e) => { e.preventDefault(); if (!APP.currentUser) { showToast('Avval tizimga kiring', 'warn'); return; } APP.currentFilter = 'saved'; qAll('.sidebar-link').forEach(l => l.classList.remove('active')); $('sidebarSaved').classList.add('active'); renderVideos(); });
$('sidebarHistory').addEventListener('click', (e) => { e.preventDefault(); if (!APP.currentUser) { showToast('Avval tizimga kiring', 'warn'); return; } APP.currentFilter = 'history'; qAll('.sidebar-link').forEach(l => l.classList.remove('active')); $('sidebarHistory').classList.add('active'); renderVideos(); });
q('[data-category="all"]').addEventListener('click', (e) => { e.preventDefault(); APP.currentFilter = 'all'; qAll('.sidebar-link').forEach(l => l.classList.remove('active')); q('[data-category="all"]').classList.add('active'); renderVideos(); });

// ===============================
// 18. MENU TOGGLE (Sidebar)
// ===============================
$('menuToggle').addEventListener('click', () => {
    const sidebar = $('sidebar');
    const content = q('.content');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
    } else {
        sidebar.classList.toggle('collapsed');
        content.classList.toggle('expanded');
    }
});

// ===============================
// 19. THEME TOGGLE
// ===============================
$('themeToggle').addEventListener('click', toggleTheme);

// ===============================
// 20. MODAL INIT
// ===============================
function initEventListeners() {
    qAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    qAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    qAll('.eye-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = $(btn.dataset.target);
            inp.type = inp.type === 'password' ? 'text' : 'password';
            btn.innerHTML = inp.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    });
    $('maxSizeMb').value = APP.settings.maxSizeMb;
    $('settingAutoplay').checked = APP.settings.autoplay;
    $('settingDownload').checked = APP.settings.downloadAllowed;
    $('accentColor').value = APP.settings.accentColor;
}

// ===============================
// 21. KEYBOARD SHORTCUTS
// ===============================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        qAll('.modal.show').forEach(m => m.classList.remove('show'));
        if (APP.adminDashOpen) closeAdminDashboard();
    }
    if ((e.key === 'f' || e.key === 'F') && !document.activeElement.matches('input,textarea')) {
        $('searchInput').focus();
    }
});

// ===============================
// 🚀 BOOT
// ===============================
boot();
