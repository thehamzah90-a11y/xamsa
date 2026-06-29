const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- SECURITY CONFIG ---
const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

// --- DATABASE CONNECTION ---
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
} catch (error) { console.error("❌ DB Init Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// RENDER HEALTH CHECK
app.get('/', (req, res) => res.status(200).send("v1.9.6 EMPIRE SYSTEM ACTIVE"));

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const verifySignature = (data, signature, publicKey) => {
    try {
        const verifier = crypto.createVerify('sha256');
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, signature, 'hex');
    } catch (e) { return false; }
};

const getVerifiedBalance = async () => {
    if (!db) return 0;
    const snap = await db.ref('ledger/verified_balance').once('value');
    return parseFloat(snap.val() || 0);
};

const updateVerifiedBalance = async (amount, type = 'ADD') => {
    if (!db) return;
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + amount : val - amount;
    });
};

const logBalanceChange = async (phoneNumber, amount, type, oldBal, newBal, reason, actor) => {
    if (!db) return;
    const event = { ts: new Date().toISOString(), amount, type, oldBal, newBal, reason, actor };
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
            dna: req.user ? req.user.deviceId : "UNK",
            asig: (req.body && req.body.p_asig) || "SYSTEM_STAMPED",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
    } catch (e) {}
};

const triggerFraudAlert = async (type, actor, deviceId, details) => {
    if (!db) return;
    await db.ref('fraud_alerts').push().set({ ts: new Date().toISOString(), type, actor, deviceId, details, status: 'ACTIVE' });
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

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Denied" });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Access Denied" });
};

// --- AUTH ENDPOINT ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        if (!db) return res.status(503).json({ message: "DB Error" });
        const { phoneNumber, password, mode, deviceId, publicKey, pkg } = req.body;
        const normalized = normalizePhone(phoneNumber);
        const lockSnap = await db.ref('config/hardware_locks').once('value');
        const locks = lockSnap.val() || {};

        // Security check for Admins
        if (phoneNumber === 'geesi' || phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2' || phoneNumber === 'sensor_primary') {
            if (locks.pkg && locks.pkg !== pkg) return res.status(403).json({ message: "Security Block" });
        }

        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'MASTER' });
        }

        if ((phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2')) {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const currentDna = locks.support_dna ? locks.support_dna[phoneNumber] : null;
                if (currentDna && currentDna !== deviceId) return res.status(403).json({ message: "Hardware Locked" });
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                await db.ref(`config/hardware_locks/support_dna/${phoneNumber}`).set(deviceId);
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) {
            const activeDna = locks.listener;
            if (activeDna && activeDna !== deviceId) {
                await db.ref('config/gateway_secret').remove();
                await db.ref('config/hardware_locks/listener_frozen').set(true);
                return res.status(403).json({ message: "FROZEN" });
            }
            if (locks.listener_frozen) return res.status(403).json({ message: "LOCKED" });
            if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
            await db.ref(`config/hardware_locks/listener`).set(deviceId);
            const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'LISTENER' });
        }

        // Customer Logic
        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: normalized, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: normalized, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

// --- MATH ENGINE: PULSE ---
app.post('/api/v1/gateway/pulse', async (req, res) => {
    try {
        if (!db) return res.status(503).send("DB Offline");
        const { p_v1, p_v2, refId, timestamp, deviceId, currency, reportedBalance, p_asig, direction } = req.body;

        const keySnap = await db.ref(`config/hardware_keys/${deviceId}`).once('value');
        const pubKey = keySnap.val();
        if (pubKey && !verifySignature(`${p_v1}|${p_v2}|${refId}|${timestamp}|${deviceId}|${currency}`, p_asig, pubKey)) {
            return res.status(403).send("Invalid Sig");
        }

        const amount = parseFloat(p_v1);
        const phone = normalizePhone(p_v2);
        const currentVerified = await getVerifiedBalance();

        if (direction === 'OUT') {
            const paySnap = await db.ref('payout_requests').orderByChild('status').equalTo('PENDING').once('value');
            const payouts = paySnap.val() || {};
            const matchId = Object.keys(payouts).find(k => payouts[k].phoneNumber === phone && Math.abs(payouts[k].amount - amount) < 0.01);
            if (matchId) {
                await updateVerifiedBalance(amount, 'SUB');
                await db.ref('payout_requests/' + matchId).update({ status: 'VERIFIED', externalId: refId, ts: new Date().toISOString() });
                const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
                const txs = txSnap.val() || {};
                const tid = Object.keys(txs).find(k => txs[k].status === 'PENDING' && txs[k].type.includes("Withdraw") && Math.abs(txs[k].amount - amount) < 0.01);
                if (tid) {
                    const uRef = db.ref('users/' + phone);
                    const uSnap = await uRef.once('value');
                    const oldBal = uSnap.val().balance || 0;
                    await uRef.update({ balance: oldBal - amount });
                    await db.ref('transactions/' + tid).update({ status: 'APPROVED', externalId: refId });
                    await logBalanceChange(phone, amount, 'DEBIT', oldBal, oldBal - amount, "Withdrawal Confirmed", "SENSOR");
                }
                return res.json({ message: "VERIFIED" });
            }
        }

        if (Math.abs((currentVerified + amount) - parseFloat(reportedBalance)) < 0.01) {
            await updateVerifiedBalance(amount, 'ADD');
            const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
            const txs = txSnap.val() || {};
            const tid = Object.keys(txs).find(k => txs[k].status === 'PENDING' && Math.abs(txs[k].amount - amount) < 0.1);
            if (tid) {
                const uRef = db.ref('users/' + phone);
                const uSnap = await uRef.once('value');
                const oldBal = uSnap.val().balance || 0;
                await uRef.update({ balance: oldBal + amount });
                await db.ref('transactions/' + tid).update({ status: 'APPROVED', externalId: refId });
                await logBalanceChange(phone, amount, 'CREDIT', oldBal, oldBal + amount, "Auto-Approve", "SENSOR");
            }
            return res.json({ message: "OK" });
        }
        res.status(400).send("Mismatch");
    } catch (e) { res.status(500).send("Error"); }
});

// --- ADMIN API ---
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(1000).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(1000).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/admin/user-dossier/:phone', authenticate, isSupport, async (req, res) => {
    const phone = normalizePhone(req.params.phone);
    const u = await db.ref('users/' + phone).once('value');
    const tx = await db.ref('transactions').orderByChild('userId').equalTo(phone).limitToLast(50).once('value');
    const logs = await db.ref('ledger/balance_logs/' + phone).limitToLast(20).once('value');
    res.json({ profile: u.val(), transactions: Object.values(tx.val() || {}).reverse(), balanceHistory: Object.values(logs.val() || {}).reverse() });
});

app.post('/api/admin/request-payout', authenticate, isSupport, async (req, res) => {
    const ref = db.ref('payout_requests').push();
    await ref.set({ ts: new Date().toISOString(), phoneNumber: normalizePhone(req.body.targetPhone), amount: parseFloat(req.body.amount), description: req.body.description, status: 'PENDING', requestedBy: req.user.phoneNumber });
    res.json({ message: "OK" });
});

app.get('/api/admin/payouts', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('payout_requests').limitToLast(100).once('value');
    res.json(snap.val() || {});
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || {});
});

app.post('/api/admin/config-update', authenticate, isMaster, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: "OK" });
});

app.get('/api/balance', authenticate, async (req, res) => {
    const snap = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: parseFloat(snap.val() || 0) });
});

app.get('/api/transactions', authenticate, async (req, res) => {
    const snap = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(30).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    const ref = db.ref('transactions').push();
    await ref.set({ userId: req.user.phoneNumber, type: req.body.type, amount: parseFloat(req.body.amount), status: 'PENDING', date: new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});

app.post('/api/v1/sys/control', authenticate, isMaster, async (req, res) => {
    if (req.body.cmd === "UNFREEZE_SYSTEM") await db.ref('config/hardware_locks/listener_frozen').remove();
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SUPREME Active on ${PORT}`));
