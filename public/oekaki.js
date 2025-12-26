const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));//timeはミリ秒

// =====================
// カメラ（画面左上が見ているワールド座標）
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

// =====================
// 描画データ [x, y, w, h, color]
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

    // CSSピクセル基準に統一
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// =====================
// メインループ（※1回だけ起動）
// =====================
function draw() {
    updateCamera();

    // DPR考慮した正しい消去
    ctx.clearRect(
        0,
        0,
        canvas.width / dpr,
        canvas.height / dpr
    );

    // 描画
    for (let i = 0; i < edge_positions_renderer.length; i += 5) {
        const worldX = edge_positions_renderer[i];
        const worldY = edge_positions_renderer[i + 1];
        const w      = edge_positions_renderer[i + 2];
        const h      = edge_positions_renderer[i + 3];
        const color  = edge_positions_renderer[i + 4];

        const draw_x = worldX - camera_x;
        const draw_y = worldY - camera_y;

        ctx.fillStyle = color;
        ctx.fillRect(draw_x, draw_y, w, h);
    }

    requestAnimationFrame(draw);
}

// ⭐ draw はここで1回だけ
draw();

// =====================
// マウス描画
// =====================
canvas.addEventListener("mousedown", () => isDrawing = true);
canvas.addEventListener("mouseup",   () => isDrawing = false);
canvas.addEventListener("mouseleave",() => isDrawing = false);
canvas.addEventListener("mousemove", handleMouseMove);

async function handleMouseMove(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 画面 → ワールド
    const worldX = x + camera_x;
    const worldY = y + camera_y;

    const color = document.getElementById("colorPicker").value;
    edge_positions_renderer.push(worldX, worldY, 15, 15, color);
    await sleep(1000); // 連続描画を防ぐためのウェイト
    upload();

};

// =====================
// キー入力
// =====================
window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
});

// =====================
// カメラ操作（視点移動）
// =====================
function updateCamera() {
    console.log("Camera:", camera_x, camera_y);
    const speed = parseInt(document.getElementById("speedInput")?.value) || 5;

    if (keys["w"] || keys["arrowup"])    camera_y -= speed;
    if (keys["s"] || keys["arrowdown"])  camera_y += speed;
    if (keys["a"] || keys["arrowleft"])  camera_x -= speed;
    if (keys["d"] || keys["arrowright"]) camera_x += speed;
}

// =====================
// テレポート（※ draw() を呼ばない）
// =====================
function TeleportCamera(x, y) {
    console.log("テレポート:", x, y);

    camera_x = x;
    camera_y = y;

        // 念のため NaN ガード
    if (!Number.isFinite(camera_x)) camera_x = 0;
    if (!Number.isFinite(camera_y)) camera_y = 0;

    // キー状態リセット（前に言った保険）
    for (const k in keys) keys[k] = false;
}

function tp() {
    const xInput = document.getElementById("tpX");
    const yInput = document.getElementById("tpY");

    if (!xInput || !yInput) {
        console.error("TP input not found");
        return;
    }

    const x = Number(xInput.value);
    const y = Number(yInput.value);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        console.error("Invalid TP value", x, y);
        return;
    }

    TeleportCamera(x, y);
};

function TextDraw() {
    const textInput = document.getElementById("TextDrawInput");
      ctx.font = "48px serif";
      ctx.fillText(textInput.value, camera_x, camera_y);
      console.log("テキスト描画:", textInput.value);
};

// =====================
// socket 通信
// =====================
function upload() {
    socket.emit("uploadList", edge_positions_renderer);
}

socket.on("updateList", (list) => {
    edge_positions_renderer = list;
});
