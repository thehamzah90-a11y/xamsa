const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifkeenaSecret786';

const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const getNextImperialRef = async () => {
    if (!db) return "#000000";
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
    await db.ref('ledger/balance_logs/' + phoneNumber).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: 'BAL_' + type });
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
            await db.ref('staff_activity/' + req.user.phoneNumber).push().set(entry);
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
            if (db) {
                const trustSnap = await db.ref('config/trusted_devices').once('value');
                const trusted = trustSnap.val() || {};
                if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) {
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

// --- WEB SERVING ---
app.get('/master-vault', (req, res) => {
    const filePath = require('path').join(__dirname, 'master_vault.html');
    if (require('fs').existsSync(filePath)) res.sendFile(filePath);
    else res.send("Restoration Pending. Please wait.");
});

app.get('/staff-panel', (req, res) => {
    const filePath = require('path').join(__dirname, 'staff_panel.html');
    if (require('fs').existsSync(filePath)) res.sendFile(filePath);
    else res.send("Operational Hub Offline.");
});

// --- THE 42 SUPREME APIs ---

app.get('/', (req, res) => res.send("v1.9.6 SARIFKEENA EMPIRE ACTIVE"));

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (db) {
            const config = (await db.ref('config').once('value')).val() || {};
            if (deviceId && !config.registryLocked && ['eesi','maamulka','maamulka_2','sensor_primary'].includes(phoneNumber)) {
                await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
            }
        }
        if (phoneNumber === 'eesi' && password === MASTER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'MASTER' });
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).send("Offline");
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

app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() || {} : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => { const b = db ? (await db.ref('users/' + req.user.phoneNumber + '/balance').once('value')).val() : 0; res.json({ balanceUSD: parseFloat(b || 0) }); });
app.get('/api/transactions', authenticate, async (req, res) => {
    if (!db) return res.json([]);
    const txs = Object.values((await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
    res.json(txs.reverse().map(t => ({ ...t, externalId: t.status === 'APPROVED' ? t.imperialRef : "HUBIN..." })));
});
app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { type, amountSLSH } = req.body;
    await db.ref('transactions').push().set({ userId: req.user.phoneNumber, type, amountSLSH, amountUSD: amountSLSH / 11000, status: 'PENDING', date: new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('users').once('value')).val() || {} : {}));
app.get('/api/v1/sup/search-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('users').orderByKey().startAt(req.query.q).endAt(req.query.q + "\\uf8ff").limitToFirst(20).once('value')).val() || {} : {}));
app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('transactions').limitToLast(100).once('value')).val() || {} : {}));
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
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
    }
    res.json({ message: "OK" });
});
app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => { if (db) await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' }); res.json({ message: "OK" }); });
app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => res.json(db ? Object.values((await db.ref('global_forensics').limitToLast(100).once('value')).val() || {}).reverse() : []));
app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => { if (!db) return res.json({}); const ph = normalizePhone(req.params.phone); res.json({ profile: (await db.ref('users/' + ph).once('value')).val(), transactions: Object.values((await db.ref('transactions').orderByChild('userId').equalTo(ph).limitToLast(10).once('value')).val() || {}) }); });
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).send("Offline"); const snap = await db.ref('config/pending_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref('config/trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref('config/pending_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).send("Err"); });
app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref('config/pending_devices').once('value')).val() || {} : {}));
app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => { if (!db) return res.json({}); const v = (await db.ref('ledger/verified_balance').once('value')).val() || 0; const us = Object.values((await db.ref('users').once('value')).val() || {}); res.json({ empireUSD: parseFloat(v), liabilitiesUSD: us.reduce((s, u) => s + (u.balance || 0), 0) }); });
app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => res.json({ activeStaff: db ? Object.keys((await db.ref('staff_activity').once('value')).val() || {}) : [] }));
app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => { if (!db) return res.json([]); const ph = req.params.phone; const snap = await db.ref('staff_activity/' + ph).limitToLast(100).once('value'); res.json(Object.values(snap.val() || {}).reverse()); });
app.get('/api/v1/sup/empire-stats', authenticate, isSupport, async (req, res) => { if (!db) return res.json({ pendingCount: 0 }); const tx = await db.ref('transactions').orderByChild('status').equalTo('PENDING').once('value'); res.json({ pendingCount: Object.keys(tx.val() || {}).length }); });
app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => { if (db) await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ status: req.body.block ? 'BLOCKED' : 'ACTIVE' }); res.json({ message: "OK" }); });
app.post('/api/v1/sys/simulate', authenticate, isMaster, async (req, res) => res.json({ report: "OK" }));
app.get('/api/v1/sup/audits', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref('shift_reports').limitToLast(50).once('value')).val() || {} : {}));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 Active.`));
