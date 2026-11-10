import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
    from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

// ⚠️ Aviso si aún no se configuró Firebase
const configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY";
if (!configured) {
    const msg = '⚠️ Falta configurar Firebase: edita firebase-config.js con los datos de tu proyecto.';
    showError($('loginError'), msg);
    showError($('regError'), msg);
    $('btnLogin').disabled = true;
    $('btnRegister').disabled = true;
    throw new Error(msg);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const toEmail = u => `${u}@parkourneon.game`;

const ERR = {
    'auth/email-already-in-use': 'Ese usuario ya existe',
    'auth/invalid-credential': 'Usuario o contraseña incorrectos',
    'auth/invalid-login-credentials': 'Usuario o contraseña incorrectos',
    'auth/wrong-password': 'Usuario o contraseña incorrectos',
    'auth/user-not-found': 'Usuario o contraseña incorrectos',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/too-many-requests': 'Demasiados intentos, espera un momento',
    'auth/network-request-failed': 'Sin conexión a internet',
    'auth/user-disabled': 'Esta cuenta fue deshabilitada',
    'auth/operation-not-allowed': 'Activa Correo/contraseña en Firebase Authentication',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication'
};
const errMsg = e => ERR[e.code] || ('Error: ' + (e.code || e.message));

// ❌ BANEO
let banActive = false;
function showBan(reason) {
    banActive = true;
    running = false;
    $('banReason').textContent = reason || 'No puedes acceder a PARKOUR NEÓN en este momento.';
    $('bannedScreen').classList.add('active');
    $('startScreen').style.display = 'none';
    $('gameUI').style.display = 'none';
}

// 👀 SESIÓN Y CUENTA EN TIEMPO REAL
let unsubUser = null, registering = false;
onAuthStateChanged(auth, user => {
    if (unsubUser) { unsubUser(); unsubUser = null; }
    if (!user) return;
    unsubUser = onSnapshot(doc(db, 'users', user.uid), snap => {
        if (!snap.exists()) {
            // Cuenta en Auth sin perfil (registro interrumpido): se repara
            if (!registering) createProfile(user.uid, user.email.split('@')[0]).catch(console.error);
            return;
        }
        const data = snap.data();
        if (data.banned) return showBan(data.banReason);
        if (banActive) return location.reload(); // lo desbanearon
        if (!currentUser) startGame(user.uid, data);
    }, err => console.error('Firestore:', err));
});

function createProfile(uid, username) {
    return setDoc(doc(db, 'users', uid), {
        username, cu: 0, au: 0, di: 0, level: 1, xp: 0,
        banned: false, banReason: '', createdAt: serverTimestamp()
    });
}

// 🔑 INICIAR SESIÓN
const btnLogin = $('btnLogin');
btnLogin.addEventListener('click', async () => {
    const user = $('loginUser').value.trim().toLowerCase();
    const pass = $('loginPass').value;
    const error = $('loginError');
    error.style.display = 'none';
    if (!user || !pass) return showError(error, 'Completa usuario y contraseña');

    btnLogin.disabled = true;
    try { await signInWithEmailAndPassword(auth, toEmail(user), pass); }
    catch (e) { showError(error, errMsg(e)); }
    finally { btnLogin.disabled = false; }
});

// ✨ REGISTRO
const btnRegister = $('btnRegister');
btnRegister.addEventListener('click', async () => {
    const user = $('regUser').value.trim().toLowerCase();
    const pass = $('regPass').value;
    const pass2 = $('regPass2').value;
    const error = $('regError');
    error.style.display = 'none';

    if (!/^[a-z0-9_]{3,16}$/.test(user)) return showError(error, 'Usuario: 3-16 caracteres (letras, números o _)');
    if (pass.length < 6) return showError(error, 'La contraseña debe tener al menos 6 caracteres');
    if (pass !== pass2) return showError(error, 'Las contraseñas no coinciden');

    btnRegister.disabled = true; registering = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, toEmail(user), pass);
        await createProfile(cred.user.uid, user);
    } catch (e) { showError(error, errMsg(e)); }
    finally { btnRegister.disabled = false; registering = false; }
});

['loginUser', 'loginPass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); }));
['regUser', 'regPass', 'regPass2'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') btnRegister.click(); }));

// 🛡️ ADMIN — desde la consola del navegador con sesión de admin:
//   banUser('nombre', 'motivo')   /   unbanUser('nombre')
async function findUser(name) {
    const s = await getDocs(query(collection(db, 'users'), where('username', '==', name.toLowerCase())));
    return s.empty ? null : s.docs[0].ref;
}
window.banUser = async (name, reason = 'Has sido baneado de PARKOUR NEÓN.') => {
    const ref = await findUser(name);
    if (!ref) return console.log('No existe ese usuario');
    await updateDoc(ref, { banned: true, banReason: reason });
    console.log('✅ Baneado:', name);
};
window.unbanUser = async name => {
    const ref = await findUser(name);
    if (!ref) return console.log('No existe ese usuario');
    await updateDoc(ref, { banned: false, banReason: '' });
    console.log('✅ Desbaneado:', name);
};

// 🎮 JUEGO
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const G = 0.6, SPEED = 5, JUMP = -13;
const COIN = { cu: { color: '#cd7f32', xp: 5 }, au: { color: '#ffd700', xp: 15 }, di: { color: '#00d8ff', xp: 50 } };
let currentUser = null, acc = null, running = false, paused = false, dirty = false;
let player, platforms, coins, enemies, bullets, particles, camX, lastX, saveTimer = 0;
const keys = {};

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize);

function startGame(uid, data) {
    currentUser = uid;
    acc = { cu: data.cu, au: data.au, di: data.di, level: data.level, xp: data.xp };
    $('startScreen').style.display = 'none';
    $('gameUI').style.display = 'block';
    resize(); resetWorld(); updateHUD();
    if (!running) { running = true; requestAnimationFrame(loop); }
}

function resetWorld() {
    player = { x: 100, y: 100, w: 28, h: 40, vx: 0, vy: 0, ground: false, jumps: 0, dir: 1, cd: 0 };
    platforms = [{ x: 0, y: canvas.height - 80, w: 500, h: 16 }];
    coins = []; enemies = []; bullets = []; particles = [];
    camX = 0; lastX = 500;
    while (lastX < canvas.width * 2) addPlatform();
}

function addPlatform() {
    const prev = platforms[platforms.length - 1];
    const gap = 80 + Math.random() * 110, w = 120 + Math.random() * 200;
    let y = prev.y + (Math.random() * 160 - 80);
    y = Math.max(canvas.height * 0.35, Math.min(canvas.height - 60, y));
    const p = { x: prev.x + prev.w + gap, y, w, h: 16 };
    platforms.push(p);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        const r = Math.random();
        coins.push({ x: p.x + (i + 1) * p.w / (n + 1), y: p.y - 30, type: r < 0.05 ? 'di' : r < 0.3 ? 'au' : 'cu' });
    }
    if (w > 180 && Math.random() < 0.35)
        enemies.push({ x: p.x + p.w / 2, y: p.y - 26, w: 26, h: 26, minX: p.x, maxX: p.x + p.w - 26, vx: 1.5 });
    lastX = p.x + p.w;
}

function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++)
        particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 30, color });
}
function jump() {
    if (player.ground || player.jumps < 2) {
        player.vy = JUMP; player.jumps++; player.ground = false;
        burst(player.x + player.w / 2, player.y + player.h, '#00ffff', 6);
    }
}
function shoot() {
    if (player.cd > 0) return;
    bullets.push({ x: player.x + player.w / 2, y: player.y + 15, vx: player.dir * 12, life: 60 });
    player.cd = 15;
}

addEventListener('keydown', e => {
    if (!running || paused) return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); if (!e.repeat) jump(); }
    if (['KeyJ', 'KeyX', 'KeyK'].includes(e.code)) shoot();
});
addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!running || paused) return;
    e.touches[0].clientX < innerWidth / 2 ? shoot() : jump();
}, { passive: false });

function gainXP(n) {
    acc.xp += n; dirty = true;
    while (acc.xp >= acc.level * 100) { acc.xp -= acc.level * 100; acc.level++; burst(player.x, player.y, '#ff00ff', 30); }
    updateHUD();
}
function respawn() {
    const safe = platforms.filter(p => p.x <= player.x).pop() || platforms[0];
    player.x = safe.x + 10; player.y = safe.y - 60; player.vx = player.vy = 0;
    burst(player.x, player.y, '#ff3333', 20);
}
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function update() {
    const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
    player.vx = right ? SPEED : left ? -SPEED : player.vx * 0.8;
    if (right) player.dir = 1; if (left) player.dir = -1;
    player.vy = Math.min(player.vy + G, 18);
    player.x = Math.max(camX, player.x + player.vx);
    player.y += player.vy;
    if (player.cd > 0) player.cd--;

    const wasGround = player.ground;
    player.ground = false;
    for (const p of platforms) {
        if (player.x + player.w > p.x && player.x < p.x + p.w && player.vy >= 0 &&
            player.y + player.h >= p.y && player.y + player.h - player.vy <= p.y + 1) {
            player.y = p.y - player.h; player.vy = 0; player.ground = true; player.jumps = 0;
        }
    }
    if (wasGround && !player.ground && player.jumps === 0) player.jumps = 1;
    if (player.y > canvas.height + 200) respawn();

    camX += (Math.max(0, player.x - canvas.width * 0.35) - camX) * 0.1;
    while (lastX < camX + canvas.width * 2) addPlatform();
    platforms = platforms.filter(p => p.x + p.w > camX - 300);

    coins = coins.filter(c => {
        if (hit(player, { x: c.x - 10, y: c.y - 10, w: 20, h: 20 })) {
            acc[c.type]++; gainXP(COIN[c.type].xp); burst(c.x, c.y, COIN[c.type].color, 8);
            return false;
        }
        return c.x > camX - 300;
    });
    for (const en of enemies) {
        en.x += en.vx;
        if (en.x < en.minX || en.x > en.maxX) en.vx *= -1;
        if (hit(player, en)) respawn();
    }
    bullets = bullets.filter(b => {
        b.x += b.vx; b.life--;
        const i = enemies.findIndex(en => hit({ x: b.x - 4, y: b.y - 2, w: 8, h: 4 }, en));
        if (i >= 0) {
            const en = enemies[i];
            burst(en.x + 13, en.y + 13, '#ff00ff', 20);
            enemies.splice(i, 1); acc.au++; gainXP(20);
            return false;
        }
        return b.life > 0;
    });
    enemies = enemies.filter(en => en.maxX > camX - 300);
    particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life--; return p.life > 0; });

    if (++saveTimer > 600) { saveTimer = 0; saveProgress(); } // cada ~10 s
}

// 💾 GUARDAR EN FIRESTORE (solo si hubo cambios)
function saveProgress() {
    if (!currentUser || banActive || !dirty) return;
    dirty = false;
    updateDoc(doc(db, 'users', currentUser), { cu: acc.cu, au: acc.au, di: acc.di, level: acc.level, xp: acc.xp })
        .catch(e => { dirty = true; console.warn('No se pudo guardar:', e.code); });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    const off = -(camX * 0.3) % 60;
    for (let x = off; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }

    ctx.save(); ctx.translate(-camX, 0); ctx.shadowBlur = 15;
    ctx.fillStyle = ctx.shadowColor = '#00ffff';
    for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h);

    const t = Date.now() / 200;
    for (const c of coins) {
        ctx.fillStyle = ctx.shadowColor = COIN[c.type].color;
        ctx.beginPath(); ctx.arc(c.x, c.y + Math.sin(t + c.x) * 3, c.type === 'di' ? 9 : 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = ctx.shadowColor = '#ff00ff';
    for (const en of enemies) ctx.fillRect(en.x, en.y, en.w, en.h);
    ctx.fillStyle = ctx.shadowColor = '#ffff00';
    for (const b of bullets) ctx.fillRect(b.x - 6, b.y - 2, 12, 4);

    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00ffff';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#050510'; ctx.shadowBlur = 0;
    ctx.fillRect(player.x + (player.dir > 0 ? 17 : 5), player.y + 10, 6, 6);

    for (const p of particles) { ctx.globalAlpha = p.life / 30; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function updateHUD() {
    $('cuCount').textContent = acc.cu;
    $('auCount').textContent = acc.au;
    $('diCount').textContent = acc.di;
    $('playerLevel').textContent = acc.level;
    $('levelFill').style.width = (acc.xp / (acc.level * 100) * 100) + '%';
}

function loop() {
    if (!running) return;
    if (!paused) { update(); draw(); }
    requestAnimationFrame(loop);
}

// ☰ MENÚ
$('menuBtn').addEventListener('click', async () => {
    paused = true; saveProgress();
    if (confirm('⏸ PAUSA\n\nAceptar = Cerrar sesión\nCancelar = Seguir jugando')) {
        await signOut(auth);
        location.reload();
    }
    paused = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
