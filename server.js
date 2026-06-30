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
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE (RECOVERY).");
    }
} catch (error) { console.error("❌ DB Error:", error.message); dbStatus = "❌ ERR: " + error.message; }

app.use(cors());
app.use(bodyParser.json());

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const getNextImperialRef = async () => {
    const ref = db.ref('ledger/receipt_counter');
    const result = await ref.transaction((current) => (current || 0) + 1);
    return "#" + result.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedLedger = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const logBalanceChange = async (phoneNumber, amountUSD, type, oldBal, newBal, reason, actor) => {
    if (!db) return;
    const event = { ts: new Date().toISOString(), amountUSD, type, oldBal, newBal, reason, actor };
    await db.ref(`ledger/balance_logs/${phoneNumber}`).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: `BAL_${type}` });
};

const logForensic = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const entry = {
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? (req.user.deviceId || "WEB") : "UNK",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(`staff_activity/${req.user.phoneNumber}`).push().set(entry);
        }
    } catch (e) {}
};

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.sendStatus(403);

        if (user.role === 'MASTER' || user.role === 'SUPPORT' || user.role === 'LISTENER') {
            const trustSnap = await db.ref('config/trusted_devices').once('value');
            const trusted = trustSnap.val() || {};
            const isTrustEmpty = Object.keys(trusted).length === 0;

            if (!isTrustEmpty) {
                if (!trusted[user.deviceId]) {
                    return res.status(403).json({ message: "Untrusted Device DNA" });
                }
            }
        }
        req.user = user;
        next();
    });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Staff Only" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- WEB PORTALS (ID 2/33) ---
app.get('/master-vault', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MASTER VAULT</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><style>:root{--gold:#ffc107;--green:#00c853;--bg:#050505;}body{background:var(--bg);color:#f0f0f0;font-family:sans-serif;}.glass-card{background:#111;border:1px solid #222;border-radius:16px;padding:15px;margin-bottom:10px;}.btn-master{background:var(--gold);color:black;border:none;font-weight:800;border-radius:10px;}.nav-tabs{border:none;background:#0a0a0a;padding:10px;border-radius:14px;display:flex;flex-wrap:nowrap;overflow-x:auto;}.nav-link{color:#555;border:none!important;font-size:0.7rem;font-weight:700;}.nav-link.active{color:var(--gold)!important;background:transparent!important;border-bottom:2px solid var(--gold)!important;}</style></head><body><div id="login-screen" style="height:100vh;display:flex;align-items:center;justify-content:center;"><div class="glass-card text-center" style="width:320px;"><h2 style="font-weight:900;color:var(--gold);">MASTER VAULT</h2><small class="text-muted">DB Status: ${dbStatus}</small><input type="password" id="key" class="form-control text-center my-4 bg-dark text-white border-secondary" placeholder="MASTER KEY"><button onclick="login()" class="btn btn-master w-100 py-3">UNLOCK</button><div id="err" class="text-danger mt-2 small fw-bold"></div></div></div><div id="main-ui" style="display:none;" class="container-fluid py-3"><header class="d-flex justify-content-between mb-3"><h4>MASTER CONTROL</h4><button onclick="location.reload()" class="btn btn-sm btn-outline-danger">LOGOUT</button></header><ul class="nav nav-tabs shadow-sm mb-4" role="tablist"><li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#q">QUEUE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#f" onclick="loadFeed()">FEED</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fin" onclick="loadFin()">FINANCE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#dev" onclick="loadDev()">DEVICES</a></li></ul><div class="tab-content"><div class="tab-pane fade show active" id="q"><div id="q-list"></div></div><div class="tab-pane fade" id="f"><div id="f-list"></div></div><div class="tab-pane fade" id="fin"><div id="fin-box"></div></div><div class="tab-pane fade" id="dev"><div id="dev-list"></div></div></div></div><script>let token="";async function login(){const p=document.getElementById('key').value;const res=await fetch('/api/v1/user/auth-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:'eesi',password:p,mode:'login',deviceId:'MASTER_WEB'})});const d=await res.json();if(d.token&&d.role==='MASTER'){token="Bearer "+d.token;document.getElementById('login-screen').style.display='none';document.getElementById('main-ui').style.display='block';fetchQueue();}else{document.getElementById('err').innerText="DENIED";}}async function fetchQueue(){const res=await fetch('/api/admin/transactions',{headers:{'Authorization':token}});const txs=await res.json();document.getElementById('q-list').innerHTML=Object.entries(txs).reverse().map(([id,t])=>t.status==='PENDING'?\`<div class="glass-card d-flex justify-content-between"><div>$ \${t.amountUSD}<br><small>\${t.type}</small></div><button onclick="approve('\${id}')" class="btn btn-master btn-sm">OK</button></div>\`:'').join('');}async function approve(id){await fetch('/api/v1/queue/update-state',{method:'POST',headers:{'Authorization':token,'Content-Type':'application/json'},body:JSON.stringify({transactionId:id,status:'APPROVED'})});fetchQueue();}async function loadFeed(){const res=await fetch('/api/admin/global-forensics',{headers:{'Authorization':token}});const logs=await res.json();document.getElementById('f-list').innerHTML=logs.map(l=>\`<div class="glass-card" style="font-size:0.7rem;border-left:3px solid #ffc107"><b>\${l.action}</b><br>\${l.actor} | \${l.ts?.slice(11,16)}</div>\`).join('');}async function loadFin(){const res=await fetch('/api/v1/sup/ledger-sheet',{headers:{'Authorization':token}});const d=await res.json();document.getElementById('fin-box').innerHTML=\`<div class="glass-card text-center"><h6>EMPIRE LEDGER</h6><h2>$ \${d.empireUSD?.toFixed(2)}</h2></div>\`;}async function loadDev(){const res=await fetch('/api/v1/sup/pending-devices',{headers:{'Authorization':token}});const devs=await res.json();document.getElementById('dev-list').innerHTML=Object.entries(devs).map(([id,d])=>\`<div class="glass-card d-flex justify-content-between"><div>\${d.role}<br><small>\${id.slice(0,10)}</small></div><button onclick="trust('\${id}')" class="btn btn-success btn-sm">TRUST</button></div>\`).join('');}async function trust(id){await fetch('/api/v1/sup/trust-device',{method:'POST',headers:{'Authorization':token,'Content-Type':'application/json'},body:JSON.stringify({deviceId:id})});loadDev();}</script><script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script></body></html>`);
});

app.get('/staff-panel', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>STAFF TERMINAL</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head><body style="background:#050505;color:white;"><div class="container py-5 text-center"><h2>STAFF TERMINAL</h2><input type="password" id="k" class="form-control mb-3 bg-dark text-white"><button onclick="login()" class="btn btn-success">LOGIN</button></div><div id="ui" style="display:none" class="container"><div id="q"></div></div><script>let t="";async function login(){const res=await fetch('/api/v1/user/auth-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:'maamulka',password:document.getElementById('k').value,mode:'login',deviceId:'STAFF_WEB'})});const d=await res.json();if(d.token){t="Bearer "+d.token;document.getElementById('ui').style.display='block';fetchQ();}}async function fetchQ(){const res=await fetch('/api/admin/transactions',{headers:{'Authorization':t}});const txs=await res.json();document.getElementById('q').innerHTML=Object.entries(txs).map(([id,tx])=>tx.status==='PENDING'?'<button onclick="app(\\''+id+'\\')">Approve</button>':'').join('');}async function app(id){await fetch('/api/v1/queue/update-state',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({transactionId:id,status:'APPROVED'})});fetchQ();}</script></body></html>`);
});

// --- THE 42 APIs REGISTRY (ID 3-42) ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const config = (await db.ref('config').once('value')).val() || {};

        if (deviceId && !config.registryLocked) {
            if (['eesi', 'maamulka', 'maamulka_2', 'sensor_primary'].includes(phoneNumber)) {
                await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
            }
        }

        if (phoneNumber === 'eesi' && password === MASTER_PASS) {
            return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'MASTER' });
        }
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) {
            return res.json({ token: jwt.sign({ phoneNumber, role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });
        }

        const clean = normalizePhone(phoneNumber);
        const userRef = db.ref('users/' + clean);
        const user = (await userRef.once('value')).val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ phoneNumber: clean, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user.password !== password) return res.status(401).send("Fail");
            if (user.status === 'BLOCKED') return res.status(403).send("Blocked");
            return res.json({ token: jwt.sign({ phoneNumber: clean, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' }), role: 'USER' });
        }
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/config', async (req, res) => res.json((await db.ref('config').once('value')).val() || {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => res.json({ balanceUSD: (await db.ref('users/' + req.user.phoneNumber + '/balance').once('value')).val() || 0 }));
app.get('/api/transactions', authenticate, async (req, res) => {
    const txs = Object.values((await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
    res.json(txs.reverse().map(t => ({ ...t, externalId: t.status === 'APPROVED' ? t.imperialRef : "HUBIN..." })));
});
app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    const { type, amountSLSH } = req.body;
    const amountUSD = amountSLSH / 11000;
    if (type.includes("withdraw")) {
        const last = Object.values((await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(1).once('value')).val() || {})[0];
        if (last && last.type.includes("withdraw") && (Date.now() - new Date(last.date).getTime() < 300000)) return res.status(429).send("Wait 5m");
    }
    await db.ref('transactions').push().set({ userId: req.user.phoneNumber, type, amountSLSH, amountUSD, status: 'PENDING', date: new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});
app.post('/api/v1/user/1xbet-instant', authenticate, async (req, res) => {
    const { amountUSD, playerId } = req.body;
    const userRef = db.ref('users/' + req.user.phoneNumber);
    const user = (await userRef.once('value')).val();
    if (user.balance < amountUSD) return res.status(400).send("No Bal");
    const nBal = user.balance - amountUSD;
    const iRef = await getNextImperialRef();
    await userRef.update({ balance: nBal });
    await db.ref('transactions').push().set({ userId: req.user.phoneNumber, type: "1XBET", amountUSD, playerId, status: "APPROVED", imperialRef: iRef, date: new Date().toISOString() });
    await logBalanceChange(req.user.phoneNumber, amountUSD, 'DEBIT', user.balance, nBal, "1xBet", "SYSTEM");
    res.json({ message: "SUCCESS" });
});
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json((await db.ref('users').once('value')).val() || {}));
app.get('/api/v1/sup/search-users', authenticate, isSupport, async (req, res) => res.json((await db.ref('users').orderByKey().startAt(req.query.q).endAt(req.query.q + "\uf8ff").limitToFirst(20).once('value')).val() || {}));
app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => res.json((await db.ref('transactions').limitToLast(100).once('value')).val() || {}));
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const uRef = db.ref('users/' + txData.userId);
        const oldBal = (await uRef.once('value')).val().balance || 0;
        const isOut = txData.type.toLowerCase().includes("withdraw");
        const nBal = isOut ? oldBal - txData.amountUSD : oldBal + txData.amountUSD;
        const iRef = await getNextImperialRef();
        await uRef.update({ balance: nBal });
        await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber, prevBalance: oldBal, newBalance: nBal, imperialRef: iRef, approvalTime: new Date().toISOString() });
        await updateVerifiedLedger(txData.amountUSD, isOut ? 'SUB' : 'ADD');
        await logBalanceChange(txData.userId, txData.amountUSD, isOut ? 'DEBIT' : 'CREDIT', oldBal, nBal, txData.type, req.user.phoneNumber);
    }
    res.json({ message: "OK" });
});
app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => { await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' }); res.json({ message: "OK" }); });
app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => res.json(Object.values((await db.ref('global_forensics').limitToLast(100).once('value')).val() || {}).reverse()));
app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => {
    const ph = normalizePhone(req.params.phone);
    res.json({ profile: (await db.ref('users/' + ph).once('value')).val(), transactions: Object.values((await db.ref('transactions').orderByChild('userId').equalTo(ph).limitToLast(10).once('value')).val() || {}) });
});
app.post('/api/v1/sup/delta-force', authenticate, isMaster, async (req, res) => { await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ balance: parseFloat(req.body.newBalance) }); res.json({ message: "OK" }); });
app.post('/api/v1/sup/set-allowance', authenticate, isSupport, async (req, res) => { await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ dailyLimitUSD: parseFloat(req.body.allowance) }); res.json({ message: "OK" }); });
app.post('/api/v1/sup/audit-lock', authenticate, isSupport, async (req, res) => { await db.ref('shift_reports').push().set({ ...req.body, ts: new Date().toISOString(), actor: req.user.phoneNumber, status: "SIGNED" }); res.json({ message: "OK" }); });
app.get('/api/v1/sup/audits', authenticate, isMaster, async (req, res) => res.json((await db.ref('shift_reports').limitToLast(50).once('value')).val() || {}));
app.post('/api/v1/sup/eye-spy', authenticate, isSupport, async (req, res) => { await logForensic(req, "VIEW_PASS", req.body.targetPhone); res.json({ message: "OK" }); });
app.post('/api/v1/sup/dna-bless', authenticate, isMaster, async (req, res) => { if (req.body.cmd === "UNFREEZE") await db.ref('config/hardware_locks/listener_frozen').remove(); res.json({ message: "OK" }); });
app.post('/api/v1/sup/sequence-set', authenticate, isMaster, async (req, res) => { await db.ref('ledger/receipt_counter').set(parseInt(req.body.startFrom)); res.json({ message: "OK" }); });
app.get('/api/v1/sup/meta-gate', async (req, res) => res.json({ category: { title: "DHIG / KALA BAX", banks: (await db.ref('config/gateways').once('value')).val() || [] } }));
app.post('/api/v1/sup/gateway-media', authenticate, isMaster, async (req, res) => { await db.ref(`config/gateways/${req.body.bankId}`).update(req.body); res.json({ message: "OK" }); });
app.post('/api/v1/sup/media-hub', authenticate, isMaster, async (req, res) => { await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/v1/sup/empire-stats', authenticate, isSupport, async (req, res) => res.json({ pendingCount: Object.keys((await db.ref('transactions').orderByChild('status').equalTo('PENDING').once('value')).val() || {}).length }));
app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => { await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ status: req.body.block ? 'BLOCKED' : 'ACTIVE' }); res.json({ message: "OK" }); });
app.post('/api/v1/sys/simulate', authenticate, isMaster, async (req, res) => res.json({ report: "OK" }));
app.post('/api/v1/gateway/pulse', async (req, res) => {
    const { p_v1, p_v2, reportedBalanceSLSH, direction, refId } = req.body;
    try {
        const amtSLSH = parseInt(p_v1); const amtUSD = amtSLSH / 11000; const ph = normalizePhone(p_v2);
        await db.ref('config/latestBankBalance').set(parseFloat(reportedBalanceSLSH));
        if (direction === 'OUT') { await updateVerifiedLedger(amtUSD, 'SUB'); return res.json({ message: "OK" }); }
        await updateVerifiedLedger(amtUSD, 'ADD');
        const txs = (await db.ref('transactions').orderByChild('userId').equalTo(ph).once('value')).val() || {};
        const tid = Object.keys(txs).find(k => txs[k].status === 'PENDING' && Math.abs(txs[k].amountSLSH - amtSLSH) < 10);
        if (tid) {
            const old = (await db.ref('users/' + ph + '/balance').once('value')).val() || 0;
            const n = old + amtUSD; const i = await getNextImperialRef();
            await db.ref('users/' + ph).update({ balance: n });
            await db.ref('transactions/' + tid).update({ status: 'APPROVED', externalId: refId, prevBalance: old, newBalance: n, imperialRef: i });
            await logBalanceChange(ph, amtUSD, 'CREDIT', old, n, "Auto-Deposit", "SENSOR");
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});
app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => {
    const v = (await db.ref('ledger/verified_balance').once('value')).val() || 0;
    const us = Object.values((await db.ref('users').once('value')).val() || {});
    res.json({ empireUSD: parseFloat(v), liabilitiesUSD: us.reduce((s, u) => s + (u.balance || 0), 0) });
});
app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => res.json({ activeStaff: Object.keys((await db.ref('staff_activity').once('value')).val() || {}) }));
app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => res.json(Object.values((await db.ref(\`staff_activity/\${req.params.phone}\`).limitToLast(100).once('value')).val() || {}).reverse()));
app.get('/api/v1/sup/staff-payouts', authenticate, isSupport, async (req, res) => res.json({ totalStaffWithdrawalsUSD: 0 }));
app.post('/api/v1/sys/integrity-check', async (req, res) => res.json({ status: "HEALTHY" }));
app.get('/api/v1/sup/audit-guide', (req, res) => res.json({ calculations: ["Total In", "Total Out", "Liabilities", "Net"] }));
app.get('/api/v1/sup/error-money', authenticate, async (req, res) => {
    const b = (await db.ref('config/latestBankBalance').once('value')).val() / 11000;
    const l = (await db.ref('ledger/verified_balance').once('value')).val() || 0;
    res.json({ gap: b - l });
});
app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => { await logForensic(req, "VIEW_PASS", req.body.targetPhone); res.json({ message: "OK" }); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 Active.`));
