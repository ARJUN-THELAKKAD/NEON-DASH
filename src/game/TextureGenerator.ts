import Phaser from 'phaser';

/**
 * Generates high-DPI procedural neon canvas textures for spinning coins,
 * futuristic power-up cores, and additive glow particles.
 * (Character frames are rendered in real time at 60 FPS by RunnerAnimator.)
 */
export function generateGameTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('coin_0')) return;

  createCoinFrames(scene);
  createPowerUpTextures(scene);
  createParticleTextures(scene);
}

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): void {
  const canvasTex = scene.textures.createCanvas(key, width, height);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  canvasTex.refresh();
}

function createCoinFrames(scene: Phaser.Scene): void {
  const frames = 6;
  for (let i = 0; i < frames; i++) {
    const angle = (i / frames) * Math.PI;
    const scaleX = Math.max(0.22, Math.abs(Math.cos(angle)));
    createCanvasTexture(scene, `coin_${i}`, 84, 84, (ctx) => {
      const cx = 42;
      const cy = 42;

      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 38);
      glow.addColorStop(0, 'rgba(255, 224, 102, 0.55)');
      glow.addColorStop(0.55, 'rgba(0, 240, 255, 0.2)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scaleX, 1);

      const coinGrad = ctx.createLinearGradient(-22, -22, 22, 22);
      coinGrad.addColorStop(0, '#fff3b0');
      coinGrad.addColorStop(0.45, '#ffd166');
      coinGrad.addColorStop(1, '#f77f00');

      ctx.fillStyle = coinGrad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 12;

      const r = 24;
      ctx.beginPath();
      for (let s = 0; s < 8; s++) {
        const a = (s * Math.PI) / 4 + Math.PI / 8;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(9, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  }
}

function createPowerUpTextures(scene: Phaser.Scene): void {
  const configs: Array<{
    key: string;
    primary: string;
    drawIcon: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;
  }> = [
    {
      key: 'powerup_shield',
      primary: '#00f0ff',
      drawIcon: (ctx, cx, cy) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx + 15, cy - 10);
        ctx.lineTo(cx + 13, cy + 7);
        ctx.lineTo(cx, cy + 19);
        ctx.lineTo(cx - 13, cy + 7);
        ctx.lineTo(cx - 15, cy - 10);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      },
    },
    {
      key: 'powerup_magnet',
      primary: '#ff2a85',
      drawIcon: (ctx, cx, cy) => {
        ctx.lineWidth = 7;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 13, Math.PI, 0, false);
        ctx.lineTo(cx + 13, cy + 15);
        ctx.moveTo(cx - 13, cy + 2);
        ctx.lineTo(cx - 13, cy + 15);
        ctx.stroke();
      },
    },
    {
      key: 'powerup_multiplier',
      primary: '#c77dff',
      drawIcon: (ctx, cx, cy) => {
        ctx.font = '700 26px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('2X', cx, cy + 1);
      },
    },
    {
      key: 'powerup_boost',
      primary: '#38f9d7',
      drawIcon: (ctx, cx, cy) => {
        ctx.beginPath();
        ctx.moveTo(cx + 4, cy - 19);
        ctx.lineTo(cx - 12, cy + 2);
        ctx.lineTo(cx - 1, cy + 2);
        ctx.lineTo(cx - 5, cy + 19);
        ctx.lineTo(cx + 12, cy - 2);
        ctx.lineTo(cx + 1, cy - 2);
        ctx.closePath();
        ctx.fill();
      },
    },
  ];

  for (const cfg of configs) {
    createCanvasTexture(scene, cfg.key, 112, 112, (ctx) => {
      const cx = 56;
      const cy = 56;

      const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, 52);
      halo.addColorStop(0, cfg.primary);
      halo.addColorStop(0.5, 'rgba(157, 78, 221, 0.25)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, 52, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(10, 14, 34, 0.92)';
      ctx.strokeStyle = cfg.primary;
      ctx.lineWidth = 4;
      ctx.shadowColor = cfg.primary;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = cx + Math.cos(a) * 34;
        const py = cy + Math.sin(a) * 34;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = cfg.primary;
      ctx.shadowBlur = 10;
      cfg.drawIcon(ctx, cx, cy);
      ctx.shadowBlur = 0;
    });
  }
}

function createParticleTextures(scene: Phaser.Scene): void {
  createCanvasTexture(scene, 'particle_glow', 32, 32, (ctx) => {
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  });

  createCanvasTexture(scene, 'particle_spark', 28, 28, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(14, 1);
    ctx.lineTo(18, 10);
    ctx.lineTo(27, 14);
    ctx.lineTo(18, 18);
    ctx.lineTo(14, 27);
    ctx.lineTo(10, 18);
    ctx.lineTo(1, 14);
    ctx.lineTo(10, 10);
    ctx.closePath();
    ctx.fill();
  });

  createCanvasTexture(scene, 'particle_ring', 96, 96, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(48, 48, 38, 0, Math.PI * 2);
    ctx.stroke();
  });
}
