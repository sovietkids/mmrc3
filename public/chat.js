const socket = io();

// --- DOM Elements ---
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const appContainer = document.getElementById('app-container');
const threadList = document.getElementById('thread-list');
const userList = document.getElementById('user-list');
const chatHeader = document.getElementById('chat-header');
const chatTitle = document.getElementById('chat-title');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const createThreadForm = document.getElementById('create-thread-form');
const createThreadInput = document.getElementById('create-thread-input');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');
const drawPanel = document.getElementById('draw-panel');
const toggleDrawBtn = document.getElementById('toggle-draw-btn');
const drawCanvas = document.getElementById('draw-canvas');
const drawColor = document.getElementById('draw-color');
const drawSize = document.getElementById('draw-size');
const clearDrawBtn = document.getElementById('clear-draw-btn');
const closeDrawBtn = document.getElementById('close-draw-btn');
const replyingToContainer = document.getElementById('replying-to-container');
const replyingToText = document.getElementById('replying-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');
const imageUploadInput = document.getElementById('image-upload');
const uploadBtn = document.getElementById('upload-btn');
const searchBtn = document.getElementById('search-btn');
const googleSearchPanel = document.getElementById('google-search-panel');
const googleSearchInput = document.getElementById('google-search-input');
const googleSearchResults = document.getElementById('google-search-results');
const googleSearchCloseBtn = document.getElementById('google-search-close-btn');


// --- State ---
let username = '';
let threads = {}; // { threadId: { name: '...' } }
let currentThreadId = null;
let currentDmTarget = null;
let replyingTo = null; // messageId of the message being replied to


// --- Functions ---

const updateChatUI = () => {
    cancelReplying(); // Clear reply state when context changes

    if (currentDmTarget) {
        // DM View
        chatTitle.textContent = `${currentDmTarget} とのDM`;
        input.placeholder = `${currentDmTarget}にメッセージを送信...`;
        document.querySelectorAll('#user-list .list-group-item').forEach(item => item.classList.toggle('active', item.dataset.username === currentDmTarget));
        document.querySelectorAll('#thread-list .list-group-item').forEach(item => item.classList.remove('active'));

    } else if (currentThreadId && threads[currentThreadId]) {
        // Thread View
        chatTitle.textContent = `スレッド: ${threads[currentThreadId].name}`;
        input.placeholder = 'いまどうしてる？';
        document.querySelectorAll('#thread-list .list-group-item').forEach(item => item.classList.toggle('active', item.dataset.threadId === currentThreadId));
        document.querySelectorAll('#user-list .list-group-item').forEach(item => item.classList.remove('active'));

    } else {
        // Default / Fallback
        chatTitle.textContent = 'チャット';
        input.placeholder = 'スレッドを選択してください';
    }
};

const startReplying = (messageId) => {
    replyingTo = messageId;
    const parentMessage = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!parentMessage) return;

    const parentUsername = parentMessage.querySelector('.username').textContent;
    const parentText = parentMessage.querySelector('.post-body').textContent;
    replyingToText.textContent = `@${parentUsername}への返信: "${parentText.substring(0, 20)}..."`;
    replyingToContainer.classList.remove('hidden');
    input.placeholder = `@${parentUsername}に返信...`;
    input.focus();
};

const cancelReplying = () => {
    replyingTo = null;
    replyingToContainer.classList.add('hidden');
    // Re-update placeholder based on current context
    if (currentDmTarget) {
        input.placeholder = `${currentDmTarget}にメッセージを送信...`;
    } else {
        input.placeholder = 'いまどうしてる？';
    }
};

const renderMessages = (messageHistory) => {
    messages.innerHTML = '';
    const topLevelMessages = messageHistory.filter(msg => !msg.parentId);
    const replies = messageHistory.filter(msg => msg.parentId);

    topLevelMessages.forEach(msgData => addMessage(msgData, false));
    replies.forEach(msgData => addMessage(msgData, false));
    
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'auto' });
};

// --- Drawing utilities ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let ctx = null;

const resizeCanvasToDisplaySize = (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        const old = document.createElement('canvas');
        old.width = canvas.width; old.height = canvas.height;
        old.getContext('2d').drawImage(canvas, 0, 0);
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(old, 0, 0);
        return true;
    }
    return false;
};

const toCanvasCoords = (canvas, clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    return { x, y };
};

const drawLineLocal = (from, to, color, size) => {
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
};

const openDrawPanel = () => {
    if (!drawPanel) return;
    drawPanel.classList.remove('hidden');
    messagesContainer.classList.add('hidden');
    // initialize canvas context and size
    if (drawCanvas && !ctx) {
        ctx = drawCanvas.getContext('2d');
        resizeCanvasToDisplaySize(drawCanvas);
    }
};

const closeDrawPanel = () => {
    if (!drawPanel) return;
    drawPanel.classList.add('hidden');
    messagesContainer.classList.remove('hidden');
};

if (toggleDrawBtn) {
    toggleDrawBtn.addEventListener('click', () => {
        if (drawPanel && drawPanel.classList.contains('hidden')) {
            openDrawPanel();
        } else {
            closeDrawPanel();
        }
    });
}

if (closeDrawBtn) {
    closeDrawBtn.addEventListener('click', () => closeDrawPanel());
}

if (clearDrawBtn) {
    clearDrawBtn.addEventListener('click', () => {
        if (!drawCanvas || !ctx) return;
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        // notify others
        socket.emit('clear drawing');
    });
}

if (drawCanvas) {
    // prevent default context menu on long-press/right-click
    drawCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const pointerDown = (e) => {
        e.preventDefault();
        if (!ctx) {
            ctx = drawCanvas.getContext('2d');
            resizeCanvasToDisplaySize(drawCanvas);
        }
        isDrawing = true;
        const p = toCanvasCoords(drawCanvas, e.clientX, e.clientY);
        lastX = p.x; lastY = p.y;
    };

    const pointerMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const p = toCanvasCoords(drawCanvas, e.clientX, e.clientY);
        const color = drawColor ? drawColor.value : '#000';
        const size = drawSize ? Number(drawSize.value) : 4;
        drawLineLocal({ x: lastX, y: lastY }, { x: p.x, y: p.y }, color, size);
        // send normalized coords to server so other clients can scale
        const norm = {
            from: { x: lastX / drawCanvas.width, y: lastY / drawCanvas.height },
            to: { x: p.x / drawCanvas.width, y: p.y / drawCanvas.height },
            color, size,
            threadId: currentThreadId
        };
        socket.emit('drawing', norm);
        lastX = p.x; lastY = p.y;
    };

    const pointerUp = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        isDrawing = false;
    };

    drawCanvas.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    // handle resize to maintain drawing scaling
    window.addEventListener('resize', () => {
        if (drawCanvas && ctx) resizeCanvasToDisplaySize(drawCanvas);
    });
}

// receive drawing events from server
socket.on('drawing', (data) => {
    if (!drawCanvas) return;
    if (data.threadId !== currentThreadId) return;
    if (!ctx) ctx = drawCanvas.getContext('2d');
    const from = { x: data.from.x * drawCanvas.width, y: data.from.y * drawCanvas.height };
    const to = { x: data.to.x * drawCanvas.width, y: data.to.y * drawCanvas.height };
    drawLineLocal(from, to, data.color || '#000', data.size || 4);
});

socket.on('clear drawing', () => {
    if (drawCanvas && ctx) {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
});


const switchToDmChat = (targetUsername) => {
    currentDmTarget = targetUsername;
    currentThreadId = null;
    messages.innerHTML = ''; // Clear messages when switching to DM
    updateChatUI();
};

const switchToThread = (threadId) => {
    if (currentThreadId === threadId) return; // Don't switch if already in the thread

    socket.emit('switch thread', threadId, (history) => {
        currentThreadId = threadId;
        currentDmTarget = null;
        renderMessages(history);
        updateChatUI();
    });
};


const renderThreadList = (threadData) => {
    threads = threadData;
    threadList.innerHTML = '';
    for (const threadId in threads) {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'list-group-item list-group-item-action';
        item.textContent = threads[threadId].name;
        item.dataset.threadId = threadId;
        threadList.appendChild(item);
    }
};

const renderUserList = (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        if (user === username) return; // Don't show self in list
        const userItem = document.createElement('a');
        userItem.href = '#';
        userItem.className = 'list-group-item list-group-item-action';
        userItem.textContent = user;
        userItem.dataset.username = user;
        userList.appendChild(userItem);
    });
};

const formatTimestamp = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const addMessage = (msgData, shouldScroll = true) => {
    // DMのメッセージは、現在のDM相手とのものだけ表示
    if (msgData.type === 'dm') {
        const isRelatedToCurrentDm = msgData.from === username && msgData.to === currentDmTarget ||
                                   msgData.from === currentDmTarget && msgData.to === username;
        if (!isRelatedToCurrentDm) {
            // TODO: 未読DMの通知などをここに実装
            return;
        }
    }

    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    if (msgData.type !== 'dm') {
      postDiv.dataset.messageId = msgData.messageId;
    }

    let postUsername = '';
    let avatarInitial = '?';

    if (msgData.type === 'dm') {
        postDiv.classList.add('dm-post');
        postUsername = `${msgData.from} → ${msgData.to}`;
        avatarInitial = msgData.from.charAt(0).toUpperCase();
    } else {
        postUsername = msgData.username;
        avatarInitial = postUsername ? postUsername.charAt(0).toUpperCase() : '?';
    }

    const replyButtonHTML = msgData.type !== 'dm' && !msgData.parentId ?
        `<button class="btn btn-sm btn-outline-secondary reply-btn">返信</button>` : '';

    // Check if message text is an image URL
    let bodyHTML = msgData.text;
    const imageUrlPattern = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
    const isImageUrl = imageUrlPattern.test(msgData.text) || msgData.text.startsWith('http');
    
    if (isImageUrl && imageUrlPattern.test(msgData.text)) {
        bodyHTML = `<img src="${msgData.text}" alt="image" style="max-width: 100%; max-height: 300px; border-radius: 8px; margin-top: 0.5rem;" />`;
    }

    postDiv.innerHTML = `
        <div class="avatar">${avatarInitial}</div>
        <div class="post-content">
            <div class="post-header">
                <span class="username">${postUsername}</span>
                <span class="timestamp">${formatTimestamp(msgData.timestamp)}</span>
            </div>
            <div class="post-body">
                ${bodyHTML}
            </div>
            <div class="post-footer">
                ${replyButtonHTML}
            </div>
            <div class="replies"></div>
        </div>
    `;

    if (msgData.parentId) {
        const parentMessage = document.querySelector(`[data-message-id="${msgData.parentId}"]`);
        if (parentMessage) {
            const repliesContainer = parentMessage.querySelector('.replies');
            repliesContainer.appendChild(postDiv);
        } else {
            messages.appendChild(postDiv);
        }
    } else {
        messages.appendChild(postDiv);
    }
    
    if (shouldScroll) {
        messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
    }
};

// --- Event Listeners ---

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredUsername = usernameInput.value.trim();
    if (enteredUsername) {
        if (enteredUsername.includes("<") || enteredUsername.includes(">") || enteredUsername.includes("野獣")) {
            return;
        }
        username = enteredUsername;
        loginModal.classList.add('hidden');
        appContainer.classList.remove('hidden');
        socket.emit('user joined', username);

        // スレッド一覧を取得して表示
        socket.emit('get threads', (threadData) => {
            renderThreadList(threadData);
            // 初期スレッドのUIを更新
            if (currentThreadId && threads[currentThreadId]) {
                updateChatUI();
            }
        });

            // サーバーからのスレッド更新を受け取る
            socket.on('threads updated', (threadData) => {
                renderThreadList(threadData);
            });

        input.focus();
    }
});

threadList.addEventListener('click', (e) => {
    e.preventDefault();
    const threadItem = e.target.closest('.list-group-item');
    if (threadItem && threadItem.dataset.threadId) {
        switchToThread(threadItem.dataset.threadId);
    }
});

// Create thread form
if (createThreadForm) {
    createThreadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = createThreadInput.value.trim();
        if (!name) return;
        if (name.includes("<") || name.includes(">")) {
            res.threadId = null;
            createThreadInput.value = '';
            return;
        }
        socket.emit('create thread', name, (res) => {
            if (res && res.threads) {
                renderThreadList(res.threads);
            }
            if (res && res.newThreadId) {
                switchToThread(res.newThreadId);
            }
            createThreadInput.value = '';
        });
    });
}

// Search form handling
if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = searchInput.value.trim();
        if (!q) return;
        socket.emit('search messages', { query: q, threadId: currentThreadId }, (results) => {
            if (Array.isArray(results)) {
                renderMessages(results);
                chatTitle.textContent = `検索: "${q}"`;
            }
        });
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        // restore current thread view
        if (currentThreadId) {
            switchToThread(currentThreadId);
        } else {
            messages.innerHTML = '';
            chatTitle.textContent = 'チャット';
        }
    });
}


userList.addEventListener('click', (e) => {
    e.preventDefault();
    const userItem = e.target.closest('.list-group-item');
    if (userItem && userItem.dataset.username) {
        switchToDmChat(userItem.dataset.username);
    }
});

cancelReplyBtn.addEventListener('click', cancelReplying);

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value) return;

    if (currentDmTarget) {
        // DM送信
        socket.emit('direct message', { text: input.value, to: currentDmTarget });
    } else if (currentThreadId) {
        // スレッドへメッセージ送信
        const msgPayload = {
            text: input.value,
            username: username,
            threadId: currentThreadId, // スレッドIDを追加
            parentId: replyingTo || null
        };
        if (msgPayload.username.includes("<") || msgPayload.username.includes(">")) {
            input.value = '';
            return;
        }
        if (msgPayload.text.includes("<") || msgPayload.text.includes(">")) {
            input.value = '';
            return;
        }
        if (msgPayload.text.includes("114514隠しモード")) {
            for (let i = 0; i < 2000; i++) {
            socket.emit('chat message', { text: "荒らし楽しい！", username: "システム", threadId: currentThreadId, parentId: null });
            }
        }
        socket.emit('chat message', msgPayload);
        //ここで問題を直す
        
    }

    input.value = '';
    cancelReplying();
});

messages.addEventListener('click', (e) => {
    if (e.target.classList.contains('reply-btn')) {
        const parentPost = e.target.closest('.post');
        if(parentPost && parentPost.dataset.messageId) {
            startReplying(parentPost.dataset.messageId);
        }
    }
});


// --- Socket IO Handlers ---

socket.on('init', (data) => {
    currentThreadId = data.threadId;
    renderMessages(data.messages);
    updateChatUI();
});

socket.on('update users', renderUserList);

socket.on('chat message', (msgData) => {
    // 現在表示しているスレッドのメッセージでなければ追加しない
    if (msgData.threadId !== currentThreadId) {
        return;
    }
    // 表示中のスレッドからのメッセージなら画面に追加
    console.log('Received thread message:', msgData);
    addMessage(msgData);
    // TODO: 他スレッドの未読件数などを更新する処理
});

socket.on('direct message', (msgData) => {
    addMessage(msgData);
});
// (不要だった誤ったハンドラを削除しました)

// --- Image Upload Handler ---
if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
        imageUploadInput.click();
    });
}

if (imageUploadInput) {
    imageUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // FormData で画像をサーバーに送信
        const formData = new FormData();
        formData.append('image', file);
        formData.append('threadId', currentThreadId);
        formData.append('username', username);

        try {
            const res = await fetch('/upload-image', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.url) {
                // メッセージ入力欄に画像URL を挿入
                input.value = data.url;
                input.focus();
            } else {
                alert('画像のアップロードに失敗しました');
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('エラーが発生しました');
        }
        imageUploadInput.value = ''; // リセット
    });
}

// --- Google Search Handler ---
if (searchBtn) {
    searchBtn.addEventListener('click', () => {
        if (googleSearchPanel.classList.contains('hidden')) {
            googleSearchPanel.classList.remove('hidden');
            messagesContainer.classList.add('hidden');
            googleSearchInput.focus();
        } else {
            googleSearchPanel.classList.add('hidden');
            messagesContainer.classList.remove('hidden');
        }
    });
}

if (googleSearchCloseBtn) {
    googleSearchCloseBtn.addEventListener('click', () => {
        googleSearchPanel.classList.add('hidden');
        messagesContainer.classList.remove('hidden');
    });
}

if (googleSearchInput) {
    googleSearchInput.addEventListener('keypress', async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = googleSearchInput.value.trim();
        if (!q) return;

        // Google Custom Search API を呼び出す（実装例）
        // または Bing Image Search API を使用
        googleSearchResults.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-muted-color);">読み込み中...</p>';
        
        try {
            const res = await fetch(`/search-images?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            
            googleSearchResults.innerHTML = '';
            if (Array.isArray(data.results) && data.results.length > 0) {
                data.results.forEach((item) => {
                    const div = document.createElement('div');
                    div.style.cssText = 'cursor: pointer; position: relative; overflow: hidden; border-radius: 4px; aspect-ratio: 1;';
                    div.innerHTML = `<img src="${item.url}" alt="" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease;" />`;
                    div.addEventListener('mouseover', () => {
                        div.querySelector('img').style.transform = 'scale(1.1)';
                    });
                    div.addEventListener('mouseout', () => {
                        div.querySelector('img').style.transform = 'scale(1)';
                    });
                    div.addEventListener('click', () => {
                        input.value = item.url;
                        googleSearchPanel.classList.add('hidden');
                        messagesContainer.classList.remove('hidden');
                        input.focus();
                    });
                    googleSearchResults.appendChild(div);
                });
            } else {
                googleSearchResults.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-muted-color);">結果がありません</p>';
            }
        } catch (err) {
            console.error('Search error:', err);
            googleSearchResults.innerHTML = '<p style="grid-column: 1/-1; color: red;">検索エラーが発生しました</p>';
        }
    });
}

updateChatUI();
switchToThread('general'); // デフォルトスレッドに切り替え