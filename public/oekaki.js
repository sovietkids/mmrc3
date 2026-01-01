const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

// =====================
// カメラ
// =====================
let camera_x = 0;
let camera_y = 0;

// =====================
// socket / canvas
// =====================
const socket = io();
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

// =====================
// 入力
// =====================
const keys = {};
let isDrawing = false;
let lastDrawTime = 0;

// =====================
// 描画データ [type, x, y, color, text]
// type: 1 = rect, 0 = text
// =====================
let edge_positions_renderer = [];

// =====================
// DPR 対応リサイズ
// =====================
let dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;

    const width  = window.innerWidth;
    const height = window.innerHeight;

    canvas.style.width  = width + "px";
    canvas.style.height = height + "px";

    canvas.width  = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// =====================
// メインループ
// =====================
function draw() {
    updateCamera();

    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (let i = 0; i < edge_positions_renderer.length; i += 5) {
        const type = edge_positions_renderer[i];
        const worldX = edge_positions_renderer[i + 1];
        const worldY = edge_positions_renderer[i + 2];
        const color  = edge_positions_renderer[i + 3];
        const text   = edge_positions_renderer[i + 4];

        const draw_x = worldX - camera_x;
        const draw_y = worldY - camera_y;

        ctx.fillStyle = color;

        if (type === 1) {
            ctx.fillRect(draw_x, draw_y, 15, 15);
        } else if (type === 0) {
            ctx.font = "60px Arial";
            ctx.fillText(text, draw_x, draw_y);
        }
    }

    requestAnimationFrame(draw);
}
draw();

// =====================
// マウス描画（スロットリング）
// =====================
canvas.addEventListener("mousedown", () => isDrawing = true);
canvas.addEventListener("mouseup",   () => isDrawing = false);
canvas.addEventListener("mouseleave",() => isDrawing = false);
canvas.addEventListener("mousemove", handleMouseMove);

function handleMouseMove(e) {
    if (!isDrawing) return;

    const now = Date.now();
    if (now - lastDrawTime < 16) return;
    lastDrawTime = now;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldX = x + camera_x;
    const worldY = y + camera_y;

    const color = document.getElementById("colorPicker").value;
    edge_positions_renderer.push(1, worldX, worldY, color, null);
    upload();
}

// =====================
// キー入力
// =====================
window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup",   e => keys[e.key.toLowerCase()] = false);

// =====================
// カメラ操作
// =====================
function updateCamera() {
    const speed = parseInt(document.getElementById("speedInput")?.value) || 5;

    if (keys["w"] || keys["arrowup"])    camera_y -= speed;
    if (keys["s"] || keys["arrowdown"])  camera_y += speed;
    if (keys["a"] || keys["arrowleft"])  camera_x -= speed;
    if (keys["d"] || keys["arrowright"]) camera_x += speed;
}

// =====================
// テレポート
// =====================
function TeleportCamera(x, y) {
    camera_x = Number(x);
    camera_y = Number(y);

    if (!Number.isFinite(camera_x)) camera_x = 0;
    if (!Number.isFinite(camera_y)) camera_y = 0;

    for (const k in keys) keys[k] = false;
}

function tp() {
    const x = Number(document.getElementById("tpX").value);
    const y = Number(document.getElementById("tpY").value);
    TeleportCamera(x, y);
}

// =====================
// テキスト描画
// =====================
function textrender() {
    const textInput = document.getElementById("text");
    const color = document.getElementById("colorPicker").value;
    const text = textInput.value.trim();
    if (!text) return;

    edge_positions_renderer.push(0, camera_x, camera_y, color, text);
    upload();
    textInput.value = "";
}

// =====================
// JSON Export
// =====================
function json_export() {
    const dataStr = JSON.stringify(edge_positions_renderer, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'oekaki_data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

document.getElementById("exportButton").addEventListener("click", json_export);

// =====================
// socket
// =====================
function upload() {
    socket.emit("uploadList", edge_positions_renderer);
}

socket.on("updateList", list => {
    if (Array.isArray(list)) edge_positions_renderer = list;
});
