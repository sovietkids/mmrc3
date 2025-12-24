const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静的ファイルの配信 (publicフォルダ)
app.use(express.static(path.join(__dirname, 'public')));

// --- ゲームロジック ---

// 部屋の状態を管理
const rooms = {};

// タイピング用の単語リスト
const WORDS = ["function", "const", "let", "var", "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "try", "catch", "finally", "class", "extends", "super", "this", "new", "import", "export", "default", "null", "undefined", "true", "false", "async", "await", "promise", "document", "window", "console", "log", "map", "filter", "reduce", "push", "pop", "shift", "unshift", "splice", "slice", "split", "join", "length", "value", "innerHTML", "style", "click", "event", "target", "prevent", "default", "query", "selector", "element", "node", "child", "parent", "append", "remove", "create", "attribute", "listener", "fetch", "json", "parse", "stringify", "header", "body", "footer", "div", "span", "input", "button", "form", "img", "canvas", "script", "link", "meta", "head", "html", "css", "http", "https", "url", "api", "server", "client", "socket", "database", "sql", "nosql", "git", "commit", "push", "pull", "merge", "branch", "checkout", "clone", "init", "status", "diff", "add", "remote", "origin", "master", "main", "develop", "feature", "bugfix", "release", "hotfix", "tag", "version", "npm", "yarn", "install", "start", "build", "test", "run", "deploy", "docker", "image", "container", "volume", "network", "compose", "kubernetes", "pod", "service", "deployment", "replica", "set", "node", "cluster", "cloud", "aws", "azure", "gcp", "firebase", "heroku", "vercel", "netlify", "linux", "ubuntu", "centos", "debian", "alpine", "bash", "shell", "terminal", "command", "sudo", "root", "user", "group", "permission", "chmod", "chown", "ssh", "key", "rsa", "dsa", "ecdsa", "ed25519", "pem", "crt", "csr", "ca", "ssl", "tls", "cert", "encrypt", "decrypt", "hash", "md5", "sha1", "sha256", "bcrypt", "argon2", "jwt", "token", "session", "cookie", "local", "storage", "cache", "proxy", "vpn", "firewall", "router", "switch", "gateway", "dns", "ip", "tcp", "udp", "port", "socket", "websocket", "webrtc", "stun", "turn", "ice", "candidate", "offer", "answer", "sdp", "media", "stream", "track", "audio", "video", "canvas", "webgl", "shader", "vertex", "fragment", "buffer", "texture", "uniform", "attribute", "varying", "matrix", "vector", "quaternion", "camera", "light", "mesh", "geometry", "material", "scene", "renderer", "animation", "frame", "loop", "physics", "collision", "gravity", "velocity", "force", "mass", "friction", "restitution", "rigid", "body", "collider", "raycast", "particle", "system", "emitter", "sprite", "atlas", "tile", "map", "layer", "object", "property", "value", "type", "name", "id", "class", "style", "width", "height", "top", "left", "right", "bottom", "position", "display", "flex", "grid", "block", "inline", "none", "hidden", "visible", "opacity", "color", "background", "border", "margin", "padding", "font", "text", "align", "justify", "center", "start", "end", "between", "around", "evenly", "wrap", "column", "row", "reverse", "gap", "overflow", "scroll", "auto", "clip", "visible", "z-index", "transform", "translate", "rotate", "scale", "skew", "transition", "animation", "keyframe", "duration", "delay", "timing", "function", "ease", "linear", "bezier", "step", "iteration", "count", "direction", "fill", "mode", "play", "state", "running", "paused", "media", "query", "screen", "print", "speech", "min", "max", "width", "height", "orientation", "portrait", "landscape", "resolution", "dpi", "dpcm", "dppx", "aspect", "ratio", "color", "index", "monochrome", "scan", "grid", "hover", "focus", "active", "visited", "link", "disabled", "checked", "selected", "empty", "first", "last", "child", "type", "only", "nth", "pseudo", "element", "before", "after", "content", "attr", "counter", "calc", "var", "env", "url", "rgb", "rgba", "hsl", "hsla", "hex", "current", "color", "transparent", "inherit", "initial", "unset", "revert"];

// 敵データ
const ENEMIES = [
    { name: "Slime", avatar: "💧", baseHp: 50, baseExp: 20, damage: 1, interval: 3000 },
    { name: "Goblin", avatar: "👺", baseHp: 120, baseExp: 50, damage: 2, interval: 2500 },
    { name: "Ghost", avatar: "👻", baseHp: 80, baseExp: 60, damage: 3, interval: 2000 },
    { name: "Dragon", avatar: "🐉", baseHp: 500, baseExp: 300, damage: 5, interval: 1500 },
    { name: "Demon King", avatar: "😈", baseHp: 2000, baseExp: 1000, damage: 8, interval: 1000 }
];

// マップ生成 (0:床, 1:壁, 2:草)
function generateMap(width, height) {
    const map = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                row.push(1); // 壁
            } else {
                // 20%の確率で草、それ以外は床
                row.push(Math.random() < 0.2 ? 2 : 0);
            }
        }
        map.push(row);
    }
    return map;
}

function getRandomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;

    // --- 部屋作成 ---
    socket.on('create_room', ({ roomName }) => {
        if (rooms[roomName]) {
            socket.emit('room_error', { message: 'その部屋名は既に使用されています。' });
            return;
        }
        
        const tileMap = generateMap(50, 50); // 50x50のマップ
        const items = {};
        // アイテム生成 (ポーションを20個配置)
        for(let i=0; i<20; i++) {
            let x, y;
            let attempts = 0;
            do {
                x = Math.floor(Math.random() * 50);
                y = Math.floor(Math.random() * 50);
                attempts++;
            } while((tileMap[y][x] === 1 || items[`${x},${y}`]) && attempts < 100);
            
            if (tileMap[y][x] !== 1 && !items[`${x},${y}`]) {
                items[`${x},${y}`] = { type: 'potion', amount: 30 };
            }
        }

        rooms[roomName] = {
            name: roomName,
            players: {},
            tileMap: tileMap,
            items: items,
            battleState: null
        };
        joinRoom(socket, roomName);
    });

    // --- 部屋参加 ---
    socket.on('join_room', ({ roomName }) => {
        if (!rooms[roomName]) {
            socket.emit('room_error', { message: '部屋が見つかりません。' });
            return;
        }
        joinRoom(socket, roomName);
    });

    function joinRoom(socket, roomName) {
        currentRoom = roomName;
        socket.join(roomName);
        
        const room = rooms[roomName];
        // プレイヤー初期化
        const newPlayer = {
            id: socket.id,
            x: 2, y: 2,
            level: 1,
            hp: 200, maxHp: 200,
            exp: 0, nextLevelExp: 100
        };
        room.players[socket.id] = newPlayer;

        // 自分以外のプレイヤー情報
        const otherPlayers = { ...room.players };
        delete otherPlayers[socket.id];
        
        // ゲーム開始イベント送信
        socket.emit('game_start', {
            roomName: roomName,
            player: newPlayer,
            otherPlayers: otherPlayers,
            tileMap: room.tileMap,
            items: room.items
        });

        // 他のプレイヤーに参加を通知
        socket.to(roomName).emit('state_update', {
            otherPlayers: room.players
        });
        
        // すでに戦闘中なら戦闘状態を同期
        if (room.battleState) {
             // 途中参加者にも単語を割り当て
             room.battleState.playerWords[socket.id] = getRandomWord();
             socket.emit('battle_start', { battleState: getPublicBattleState(room.battleState) });
        }
    }

    // --- 移動 ---
    socket.on('move', ({ x, y }) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        const player = room.players[socket.id];
        if (!player) return;

        // 簡易的な衝突判定と移動
        if (y >= 0 && y < room.tileMap.length && x >= 0 && x < room.tileMap[0].length) {
            if (room.tileMap[y][x] !== 1) { // 壁でなければ移動
                player.x = x;
                player.y = y;
                
                // アイテム判定
                const key = `${x},${y}`;
                if (room.items && room.items[key]) {
                    const item = room.items[key];
                    if (item.type === 'potion') {
                        const oldHp = player.hp;
                        player.hp = Math.min(player.hp + item.amount, player.maxHp);
                        const recovered = player.hp - oldHp;
                        
                        delete room.items[key];
                        
                        io.to(currentRoom).emit('item_collected', {
                            x, y,
                            playerId: socket.id,
                            type: item.type,
                            recovered,
                            playerHp: player.hp
                        });
                    }
                }

                // 位置情報を全員に送信
                socket.to(currentRoom).emit('state_update', { otherPlayers: room.players });

                // エンカウント判定 (戦闘中でなく、草むらにいる場合)
                if (!room.battleState && room.tileMap[y][x] === 2 && Math.random() < 0.1) {
                    startBattle(currentRoom);
                }
            }
        }
    });

    // --- 戦闘アクション (単語入力完了) ---
    socket.on('word_complete', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (!room.battleState) return;

        const player = room.players[socket.id];
        if (!player) return;

        // プレイヤーごとの単語チェック (簡易的にクライアント側判定を信頼しつつ、サーバー側で更新)
        // ダメージ計算 (レベル依存)
        const damage = 10 + (player.level * 5);
        room.battleState.enemy.hp -= damage;
        
        const logMsg = { message: `Player(Lv.${player.level})が${damage}ダメージを与えた！`, type: 'damage' };
        
        if (room.battleState.enemy.hp <= 0) {
            endBattle(currentRoom, socket.id);
        } else {
            // そのプレイヤーの次の単語を設定
            room.battleState.playerWords[socket.id] = getRandomWord();
            io.to(currentRoom).emit('battle_update', { 
                battleState: getPublicBattleState(room.battleState),
                log: logMsg,
                players: room.players // HP同期のためにプレイヤー情報を送信
            });
        }
    });

    // --- 切断処理 ---
    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom].players[socket.id];
            io.to(currentRoom).emit('state_update', { otherPlayers: rooms[currentRoom].players });
            
            // 部屋が空になったら削除
            if (Object.keys(rooms[currentRoom].players).length === 0) {
                delete rooms[currentRoom];
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

function startBattle(roomName) {
    const room = rooms[roomName];
    // 敵をランダム選出 (プレイヤー平均レベルなどを考慮するとより良いが今回はランダム)
    const enemyType = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
    const levelMultiplier = 1; // 必要に応じて調整
    
    // 参加プレイヤー全員に単語を割り当て
    const playerWords = {};
    for (const pid in room.players) {
        playerWords[pid] = getRandomWord();
    }

    room.battleState = {
        enemy: {
            ...enemyType,
            level: 1, // 簡易化
            hp: enemyType.baseHp,
            maxHp: enemyType.baseHp,
            exp: enemyType.baseExp
        },
        playerWords: playerWords
    };

    // 敵の攻撃ループ
    room.battleState.intervalId = setInterval(() => {
        if (!room.battleState) return;
        const damage = room.battleState.enemy.damage;
        
        // 全プレイヤーにダメージ
        for (const pid in room.players) {
            const p = room.players[pid];
            p.hp -= damage;
            if (p.hp <= 0) {
                p.hp = p.maxHp; // 死亡したらリスポーン（簡易的に全回復）
                p.exp = 0; // 死亡ペナルティ：経験値リセット
                p.x = 2; p.y = 2; // スタート地点へ

                // 死亡通知（戦闘から離脱させる）
                const socket = io.sockets.sockets.get(pid);
                if (socket) {
                    socket.emit('player_death', { player: p });
                }
            }
        }

        io.to(roomName).emit('battle_update', {
            battleState: getPublicBattleState(room.battleState),
            log: { message: `「${room.battleState.enemy.name}」の攻撃！ ${damage}のダメージ！`, type: 'warning' },
            players: room.players // HP同期のためにプレイヤー情報を送信
        });
    }, enemyType.interval);

    io.to(roomName).emit('battle_start', { battleState: getPublicBattleState(room.battleState) });
}

function endBattle(roomName, killerId) {
    const room = rooms[roomName];
    const enemy = room.battleState.enemy;
    const expGained = enemy.exp;

    // 攻撃ループ停止
    clearInterval(room.battleState.intervalId);
    
    // 経験値分配とレベルアップ処理
    const sockets = io.sockets.adapter.rooms.get(roomName);
    if (sockets) {
        for (const socketId of sockets) {
            const player = room.players[socketId];
            if (player) {
                player.exp += expGained;
                // レベルアップ判定
                if (player.exp >= player.nextLevelExp) {
                    player.level++;
                    player.exp -= player.nextLevelExp;
                    player.nextLevelExp = Math.floor(player.nextLevelExp * 1.2);
                    player.maxHp += 20;
                    player.hp = player.maxHp; // 全回復
                }
                
                // 各プレイヤーに最新のステータスを送信
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('battle_end', {
                        enemyName: enemy.name,
                        expGained: expGained,
                        player: player
                    });
                }
            }
        }
    }

    room.battleState = null;
}

// クライアントに送信しても安全なBattleStateを返す（intervalIdなどを除外）
function getPublicBattleState(battleState) {
    if (!battleState) return null;
    const { intervalId, ...publicState } = battleState;
    return publicState;
}

const PORT = process.env.PORT || 10001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});