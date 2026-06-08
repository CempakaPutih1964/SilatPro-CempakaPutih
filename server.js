const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================================
// STATE - In-memory (resets on server restart)
// ============================================================
let state = {
  tournaments: [],
  activeTId: null,
  currentLagaId: null,
  currentRound: 1,
  blueScore: 0,
  redScore: 0,
  blueHuk: { p: 0, w: 0, t: 0 },
  redHuk: { p: 0, w: 0, t: 0 },
  scoreLog: [],
  rekapBabak: [],
  timerRunning: false,
  timeLeft: 120,
  scoreMode: 'single',
  connectedUsers: {},  // socketId -> {name, role}
  pendingVotes: [],    // juri votes
  pendingJatuhan: [],  // dewan jatuhan votes
};

// Timer interval on server
let timerInterval = null;

function getAT() {
  return state.tournaments.find(t => t.id === state.activeTId) || null;
}

function broadcastState(excludeId = null) {
  const payload = {
    ...state,
    connectedUsers: Object.values(state.connectedUsers),
  };
  if (excludeId) {
    io.sockets.sockets.forEach((socket) => {
      if (socket.id !== excludeId) socket.emit('state_update', payload);
    });
  } else {
    io.emit('state_update', payload);
  }
}

function startServerTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (!state.timerRunning) return;
    state.timeLeft--;
    io.emit('timer_tick', { timeLeft: state.timeLeft });
    if (state.timeLeft <= 0) {
      state.timerRunning = false;
      clearInterval(timerInterval);
      timerInterval = null;
      io.emit('timer_end', {});
    }
  }, 1000);
}

// ============================================================
// SOCKET.IO EVENTS
// ============================================================
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Send current state to new connection
  socket.emit('state_update', {
    ...state,
    connectedUsers: Object.values(state.connectedUsers),
  });

  // ---- LOGIN ----
  socket.on('user_login', ({ name, role }) => {
    state.connectedUsers[socket.id] = { name, role, socketId: socket.id };
    io.emit('users_update', Object.values(state.connectedUsers));
    console.log(`${name} (${role}) joined`);
  });

  // ---- TURNAMEN ----
  socket.on('buat_turnamen', (data) => {
    const t = {
      id: Date.now(),
      nama: data.nama,
      tgl1: data.tgl1,
      tgl2: data.tgl2,
      lokasi: data.lokasi,
      peserta: [],
      laga: [],
      bracketData: {}
    };
    state.tournaments.push(t);
    state.activeTId = t.id;
    broadcastState();
  });

  socket.on('set_active_tournament', (id) => {
    state.activeTId = id;
    broadcastState();
  });

  socket.on('reset_tournament', (id) => {
    const t = state.tournaments.find(x => x.id === id);
    if (t) { t.peserta = []; t.laga = []; t.bracketData = {}; }
    broadcastState();
  });

  socket.on('hapus_tournament', (id) => {
    state.tournaments = state.tournaments.filter(t => t.id !== id);
    if (state.activeTId === id) state.activeTId = state.tournaments.length ? state.tournaments[0].id : null;
    broadcastState();
  });

  // ---- PESERTA ----
  socket.on('daftar_peserta', (peserta) => {
    const at = getAT();
    if (!at) return;
    at.peserta.push(peserta);
    broadcastState();
  });

  socket.on('hapus_peserta', (id) => {
    const at = getAT();
    if (!at) return;
    at.peserta = at.peserta.filter(p => p.id !== id);
    broadcastState();
  });

  // ---- LAGA ----
  socket.on('tambah_laga', (laga) => {
    const at = getAT();
    if (!at) return;
    at.laga.push(laga);
    broadcastState();
  });

  socket.on('hapus_laga', (id) => {
    const at = getAT();
    if (!at) return;
    at.laga = at.laga.filter(l => l.id !== id);
    broadcastState();
  });

  socket.on('reset_laga', () => {
    const at = getAT();
    if (!at) return;
    at.laga = [];
    broadcastState();
  });

  socket.on('laga_ke_scoring', (id) => {
    const at = getAT();
    if (!at) return;
    const l = at.laga.find(x => x.id === id);
    if (!l) return;
    // Reset scoring state
    state.currentLagaId = id;
    state.currentRound = 1;
    state.blueScore = 0;
    state.redScore = 0;
    state.blueHuk = { p: 0, w: 0, t: 0 };
    state.redHuk = { p: 0, w: 0, t: 0 };
    state.scoreLog = [];
    state.rekapBabak = [];
    state.pendingVotes = [];
    state.pendingJatuhan = [];
    state.timerRunning = false;
    state.timeLeft = 120;
    l.status = 'live';
    clearInterval(timerInterval);
    timerInterval = null;
    broadcastState();
  });

  // ---- BRACKET ----
  socket.on('save_bracket', ({ kat, data }) => {
    const at = getAT();
    if (!at) return;
    if (!at.bracketData) at.bracketData = {};
    at.bracketData[kat] = data;
    broadcastState();
  });

  socket.on('bracket_to_laga', (lagaList) => {
    const at = getAT();
    if (!at) return;
    lagaList.forEach(l => at.laga.push(l));
    broadcastState();
  });

  // ---- TIMER (Ketua only) ----
  socket.on('timer_start', () => {
    if (state.timerRunning || state.timeLeft <= 0) return;
    state.timerRunning = true;
    startServerTimer();
    broadcastState();
  });

  socket.on('timer_stop', () => {
    state.timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    broadcastState();
  });

  socket.on('timer_reset', () => {
    state.timerRunning = false;
    state.timeLeft = 120;
    clearInterval(timerInterval);
    timerInterval = null;
    broadcastState();
  });

  socket.on('set_round', (round) => {
    state.currentRound = round;
    state.blueScore = 0;
    state.redScore = 0;
    state.blueHuk = { p: 0, w: 0, t: 0 };
    state.redHuk = { p: 0, w: 0, t: 0 };
    state.scoreLog = [];
    state.pendingVotes = [];
    state.pendingJatuhan = [];
    state.timerRunning = false;
    state.timeLeft = 120;
    clearInterval(timerInterval);
    timerInterval = null;
    broadcastState();
  });

  // ---- SCORING - JURI ----
  socket.on('juri_input', ({ side, pts, label, userName, mode }) => {
    if (!state.timerRunning) {
      socket.emit('error_msg', 'Timer belum berjalan! Tunggu Ketua start timer.');
      return;
    }
    const elapsed = 120 - state.timeLeft;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const ts = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

    if (mode === 'single') {
      // Langsung masuk
      addScoreAndBroadcast(side, pts, label, userName, ts);
    } else {
      // Mode multi - perlu 2 juri
      const now = Date.now();
      const ex = state.pendingVotes.find(v => v.side === side && v.pts === pts && (now - v.time) < 3000);
      if (ex) {
        ex.votes++;
        ex.users.push(userName);
        if (ex.votes >= 2) {
          addScoreAndBroadcast(side, pts, label, ex.users.join(' + '), ts);
          state.pendingVotes = state.pendingVotes.filter(v => v !== ex);
          io.emit('vote_cleared', {});
        } else {
          io.emit('pending_votes', state.pendingVotes);
        }
      } else {
        state.pendingVotes.push({ side, pts, label, time: now, votes: 1, users: [userName] });
        io.emit('pending_votes', state.pendingVotes);
        socket.emit('toast_msg', 'Menunggu juri ke-2...');
      }
      // Auto expire
      setTimeout(() => {
        state.pendingVotes = state.pendingVotes.filter(v => (Date.now() - v.time) < 3000);
        io.emit('pending_votes', state.pendingVotes);
      }, 3100);
    }
  });

  // ---- SCORING - DEWAN JATUHAN ----
  socket.on('dewan_jatuhan', ({ side, userName }) => {
    if (!state.timerRunning) {
      socket.emit('error_msg', 'Timer belum berjalan!');
      return;
    }
    const now = Date.now();
    const ex = state.pendingJatuhan.find(v => v.side === side && (now - v.time) < 5000);
    if (ex) {
      ex.votes++;
      ex.users.push(userName);
      if (ex.votes >= 2) {
        const elapsed = 120 - state.timeLeft;
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const ts = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        addScoreAndBroadcast(side, 3, 'Jatuhan', ex.users.join(' + '), ts);
        state.pendingJatuhan = state.pendingJatuhan.filter(v => v !== ex);
        io.emit('jatuhan_cleared', {});
        io.emit('toast_msg', 'SAH! Jatuhan ' + (side === 'blue' ? 'Biru' : 'Merah') + ' +3');
      } else {
        io.emit('pending_jatuhan', state.pendingJatuhan);
        socket.emit('toast_msg', 'Jatuhan dicatat - tunggu Dewan ke-2!');
      }
    } else {
      const vote = { side, time: now, votes: 1, users: [userName] };
      state.pendingJatuhan.push(vote);
      io.emit('pending_jatuhan', state.pendingJatuhan);
      socket.emit('toast_msg', 'Jatuhan dicatat - tunggu Dewan ke-2 konfirmasi!');
      setTimeout(() => {
        state.pendingJatuhan = state.pendingJatuhan.filter(v => v !== vote);
        io.emit('pending_jatuhan', state.pendingJatuhan);
      }, 5100);
    }
  });

  // ---- SCORING - DEWAN HUKUMAN ----
  socket.on('dewan_hukuman', ({ side, type, userName }) => {
    const elapsed = 120 - state.timeLeft;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const ts = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    const HUK = {
      pembinaan1: { label: 'Pembinaan 1', pts: 0 },
      pembinaan2: { label: 'Pembinaan 2', pts: 0 },
      peringatan1: { label: 'Peringatan 1', pts: -1 },
      peringatan2: { label: 'Peringatan 2', pts: -2 },
      teguran1: { label: 'Teguran 1', pts: -5 },
      teguran2: { label: 'Teguran 2', pts: -10 },
    };
    const h = HUK[type];
    if (!h) return;
    if (h.pts !== 0) {
      addScoreAndBroadcast(side, h.pts, h.label, userName, ts);
    } else {
      state.scoreLog.unshift({ time: ts, side, label: h.label, pts: 0, by: userName });
    }
    const hk = side === 'blue' ? state.blueHuk : state.redHuk;
    if (type.includes('pembinaan')) hk.p++;
    else if (type.includes('peringatan')) hk.w++;
    else if (type.includes('teguran')) hk.t++;
    broadcastState();
  });

  // ---- AKHIR BABAK ----
  socket.on('akhir_babak', () => {
    const at = getAT();
    state.rekapBabak.push({
      babak: state.currentRound,
      blueScore: state.blueScore,
      redScore: state.redScore,
      blueHuk: { ...state.blueHuk },
      redHuk: { ...state.redHuk },
      log: [...state.scoreLog],
    });
    if (at && state.currentLagaId) {
      const l = at.laga.find(x => x.id === state.currentLagaId);
      if (l) { l.status = 'selesai'; l.skorBiru = state.blueScore; l.skorMerah = state.redScore; }
    }
    state.timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    io.emit('babak_selesai', {
      babak: state.currentRound,
      blueScore: state.blueScore,
      redScore: state.redScore,
      blueHuk: state.blueHuk,
      redHuk: state.redHuk,
      rekapBabak: state.rekapBabak,
    });
    broadcastState();
  });

  socket.on('set_score_mode', (mode) => {
    state.scoreMode = mode;
    broadcastState();
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    delete state.connectedUsers[socket.id];
    io.emit('users_update', Object.values(state.connectedUsers));
    console.log('Disconnected:', socket.id);
  });
});

function addScoreAndBroadcast(side, pts, label, by, ts) {
  if (side === 'blue') state.blueScore = Math.max(0, state.blueScore + pts);
  else state.redScore = Math.max(0, state.redScore + pts);
  state.scoreLog.unshift({ time: ts, side, label, pts, by });
  io.emit('score_update', {
    blueScore: state.blueScore,
    redScore: state.redScore,
    blueHuk: state.blueHuk,
    redHuk: state.redHuk,
    scoreLog: state.scoreLog,
    side, pts, label, by
  });
}

// ============================================================
// API ROUTES
// ============================================================
app.get('/api/state', (req, res) => res.json(state));
app.get('/api/users', (req, res) => res.json(Object.values(state.connectedUsers)));

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  SilatPro - Cempaka Putih Kaltim');
  console.log('  Server berjalan di port ' + PORT);
  console.log('  Buka: http://localhost:' + PORT);
  console.log('========================================');
  console.log('');
});
