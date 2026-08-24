const canvas = document.getElementById('avatarCanvas');
const ctx = canvas.getContext('2d');

const avatarColorInput = document.getElementById('avatarColor');
const avatarAccessorySelect = document.getElementById('avatarAccessory');

let avatarColor = avatarColorInput.value;
let avatarAccessory = avatarAccessorySelect.value;

function drawAvatar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = avatarColor;
  ctx.beginPath();
  ctx.arc(320, 240, 100, 0, 2 * Math.PI); // 머리
  ctx.fill();

  if (avatarAccessory === 'hat') {
    drawHat();
  } else if (avatarAccessory === 'glasses') {
    drawGlasses();
  }
}

function drawHat() {
  ctx.fillStyle = 'brown';
  ctx.beginPath();
  ctx.rect(270, 180, 100, 30);
  ctx.fill();
}

function drawGlasses() {
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.rect(280, 220, 40, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(360, 220, 40, 20);
  ctx.stroke();
}

avatarColorInput.addEventListener('input', (event) => {
  avatarColor = event.target.value;
  drawAvatar();
});

avatarAccessorySelect.addEventListener('change', (event) => {
  avatarAccessory = event.target.value;
  drawAvatar();
});

drawAvatar();