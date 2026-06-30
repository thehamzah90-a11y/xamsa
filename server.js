const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifkeenaSecret786';

const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

let db = null;
let dbStatus = "🔴 OFFLINE";

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        dbStatus = "🟢 ONLINE";
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); dbStatus = "❌ ERROR: " + error.message; }

app.use(cors());
app.use(bodyParser.json());

const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

// --- AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Denied" });
};

// --- WEB PANEL UI (REPAIRED FOR MASTER ACCESS) ---
app.get('/supreme-control', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SUPREME CONTROL</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #050505; color: white; font-family: sans-serif; }
            .card { background: #111; border: 1px solid #222; border-radius: 12px; margin-bottom: 10px; }
            .btn-supreme { background: #00c853; color: black; font-weight: 800; border-radius: 8px; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="card p-4 text-center" style="width: 320px;">
                <h3 style="color: #00c853;">SARIFKEENA</h3>
                <small class="text-muted">Database: ${dbStatus}</small>
                <input type="password" id="pass" class="form-control text-center my-3 bg-dark text-white border-secondary" placeholder="ACCESS KEY">
                <button onclick="login()" class="btn btn-supreme w-100">LOGIN</button>
                <div id="err" class="text-danger mt-2 small"></div>
            </div>
        </div>

        <div id="main-ui" style="display:none;" class="container py-3">
            <div class="d-flex justify-content-between mb-3">
                <h4 style="font-weight: 900;">SUPREME <span style="color: #00c853;">v1.9.6</span></h4>
                <button onclick="location.reload()" class="btn btn-sm btn-outline-danger">LOGOUT</button>
            </div>

            <nav class="nav nav-tabs mb-3 border-0">
                <button class="nav-link active text-white bg-transparent border-0 border-bottom" data-bs-toggle="tab" data-bs-target="#tab-q">QUEUE</button>
                <button class="nav-link text-white bg-transparent border-0" data-bs-toggle="tab" data-bs-target="#tab-u" onclick="loadUsers()">USERS</button>
                <button class="nav-link text-white bg-transparent border-0" data-bs-toggle="tab" data-bs-target="#tab-m" id="btn-master" style="display:none;">MASTER</button>
            </nav>

            <div class="tab-content">
                <div class="tab-pane show active" id="tab-q"><div id="q-list"></div></div>
                <div class="tab-pane" id="tab-u"><div id="u-list"></div></div>
                <div class="tab-pane" id="tab-m">
                    <div class="card p-3">
                        <h6>GHOST MODE (REVIEWER)</h6>
                        <button onclick="toggleGhost()" class="btn btn-sm btn-outline-warning w-100">TOGGLE STEALTH</button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let token = "";
            async function login() {
                const p = document.getElementById('pass').value;
                // Auto-detect role: try Geesi then Maamulka
                let role = "maamulka";
                if(p === "${MASTER_PASS}") role = "geesi";

                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: role, password: p, mode: 'login'})
                });
                const d = await res.json();
                if(d.token) {
                    token = "Bearer " + d.token;
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('main-ui').style.display = 'block';
                    if(d.role === 'MASTER') document.getElementById('btn-master').style.display = 'block';
                    loadQueue();
                } else { document.getElementById('err').innerText = "WRONG KEY"; }
            }

            async function loadQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('q-list').innerHTML = Object.entries(txs).reverse().map(([id, t]) =>
                    t.status === 'PENDING' ? \`
                    <div class="card p-3 d-flex flex-row justify-content-between">
                        <div><b>$ \${t.amountUSD}</b><br><small class="text-muted">\${t.type} | 6\${t.userId?.slice(-8)}</small></div>
                        <button onclick="approve('\${id}')" class="btn btn-supreme btn-sm px-3">APPROVE</button>
                    </div>\` : '').join('') || '<p class="text-center text-muted mt-5">Queue Empty</p>';
            }

            async function approve(id) {
                await fetch('/api/v1/queue/update-state', {
                    method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify({transactionId: id, status: 'APPROVED'})
                });
                loadQueue();
            }

            async function loadUsers() {
                const res = await fetch('/api/admin/all-users', {headers: {'Authorization': token}});
                const users = await res.json();
                document.getElementById('u-list').innerHTML = Object.entries(users).map(([ph, u]) => \`
                    <div class="card p-3 d-flex flex-row justify-content-between align-items-center">
                        <div><b>6\${ph.slice(-8)}</b><br><small class="text-muted">$\${u.balance?.toFixed(2)}</small></div>
                        \${u.status === 'PENDING' ? \`<button onclick="act('\${ph}')" class="btn btn-supreme btn-sm">ACTIVATE</button>\` : '<span class="badge bg-success">ACTIVE</span>'}
                    </div>\`).join('');
            }

            async function act(ph) {
                await fetch('/api/admin/user/activate', {
                    method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify({targetPhone: ph})
                });
                loadUsers();
            }
        </script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `);
});

// --- CORE API ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode } = req.body;
        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', ip: req.ip }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token, role: 'MASTER' });
        }
        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', ip: req.ip }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }
        // User Path
        const cleanPhone = normalizePhone(phoneNumber);
        if (!db) return res.status(503).json({ message: "DB Offline" });
        const userRef = db.ref('users/' + cleanPhone);
        const snap = await userRef.once('value');
        const user = snap.val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ phoneNumber: cleanPhone, password, balance: 0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING" });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: cleanPhone, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Err" }); }
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(50).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txSnap = await txRef.once('value');
    const txData = txSnap.val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const uRef = db.ref('users/' + txData.userId);
        const uSnap = await uRef.once('value');
        const oldBal = uSnap.val().balance || 0;
        await uRef.update({ balance: oldBal + txData.amountUSD });
        await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber });
    }
    res.json({ message: "OK" });
});

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' });
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 SUPREME ACTIVE.`));
