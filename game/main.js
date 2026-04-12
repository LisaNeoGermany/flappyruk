(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const msg = document.getElementById('msg');
  const bgm = document.getElementById('bgm');

  let state = 'idle';
  let score = 0;
  let best = +localStorage.getItem('fr_best') || 0;
  let t = 0;
  let timeAlive = 0;

  const BASE_SCROLL = 160;
  const G = 1200;
  const FLAP = -350;
  let PIPE_GAP = Math.max(170, Math.floor(canvas.height * 0.30));
  const PIPE_W = 70;
  const BASE_INTERVAL = 1500;
  const GROUND_Y = canvas.height - 80;

  const bird = { x:120, y:canvas.height*0.5, vy:0, r:Math.floor(56*0.32), flapTimer:0 };
  let pipes = [];

  // --- Load Sora sprite sheet ---
  const FRAME_W = 48, FRAME_H = 48, FRAMES = 3;
  // Token override
  const urlParams = new URLSearchParams(location.search);
  let tokenURL = urlParams.get('token');
  try { tokenURL = tokenURL ? decodeURIComponent(tokenURL) : ""; } catch(e) {}
  if (tokenURL && !/^https?:|^data:|^\//i.test(tokenURL)) tokenURL = "/" + tokenURL; // enforce absolute within site
  const tokenImg = new Image();
  let tokenLoaded = false;
  if (tokenURL) { tokenImg.src = tokenURL; tokenImg.onload = () => tokenLoaded = true; }
  const FRAME_DUR = 0.09; // seconds per frame
  let frameIdx = 0, frameTimer = 0;
  // Draw parameters: scale and anchor so physics center aligns with sprite body
  const DRAW_W = 56, DRAW_H = 56;            // on-canvas size in px
  const DRAW_OX = 10, DRAW_OY = -9;          // pixel offsets to nudge sprite right/up
  const sprite = new Image();
  sprite.src = "assets/crow_black_v4_3x1_48.png";
  ctx.imageSmoothingEnabled = false;
  let spriteLoaded = false;
  sprite.onload = () => { spriteLoaded = true; };

  function speedFactor(){
    if (score < 20) return 1.0;
    let extra = Math.floor((score - 20) / 10);
    return Math.min(2.0, 1.0 + extra * 0.05);
  }

  function showMsg(html){ msg.innerHTML = html; msg.style.display = 'flex'; }
  function hideMsg(){ msg.style.display = 'none'; }
  const MUSIC_VOL = 0.25;
  let __frukFadeTimer = null;
  function fadeBgmTo(target, durMs){
    try { if (__frukFadeTimer) clearInterval(__frukFadeTimer); } catch(e) {}
    const steps = 30;
    const iv = Math.max(16, Math.floor(durMs/steps));
    const start = bgm.volume || 0;
    let i = 0;
    __frukFadeTimer = setInterval(() => {
      i++;
      const v = start + (target - start) * (i/steps);
      bgm.volume = Math.max(0, Math.min(1, v));
      if (i >= steps) { clearInterval(__frukFadeTimer); __frukFadeTimer = null; bgm.volume = target; }
    }, iv);
  }

  function start(){
    state='running'; hideMsg(); lastTime=performance.now(); timeAlive = 0;
    bgm.playbackRate = speedFactor(); bgm.volume = 0.0;
    bgm.play().catch(()=>{});
    fadeBgmTo(MUSIC_VOL, 800);
  }
  function flap() {
    if (state === 'idle') { start(); }
    if (state !== 'running') return;
    bird.vy = FLAP * speedFactor()*0.9;
    bird.flapTimer = 0.12;
  }

  window.addEventListener('pointerdown', (e) => {
    if (!(e.isPrimary && e.button === 0)) return;
    if (state === 'dead') return; // Wait for auto-return to main menu
    flap();
  }, {passive:true});

  function reset() {
    state = 'idle'; score = 0; scoreEl.textContent = score; t = 0;
    bird.x = 120; bird.y = canvas.height*0.5; bird.vy = 0; pipes = [];
    hideMsg();
    try { if (!bgm.paused) bgm.pause(); } catch(e) {}
    try { bgm.currentTime = 0; } catch(e) {}
  }
  function gameOver(){
    if (state === 'dead') return; // Prevent multiple calls
    state='dead'; best=Math.max(best,score); localStorage.setItem('fr_best',best);
    try { parent.postMessage({ type:'fruk:score', score }, '*'); } catch(e) {}
    showMsg(`Game Over<br>Punkte: ${score} • Beste: ${best}`);
    fadeBgmTo(0.0, 600); setTimeout(()=>{ try{ bgm.pause(); }catch(e){} }, 620);
    // Return to main menu after delay
    setTimeout(() => {
      try { parent.postMessage({ type:'fruk:gameover' }, '*'); } catch(e) {}
    }, 2500);
  }

  // Listen for clear best score command
  window.addEventListener('message', (ev) => {
    if (ev.data?.type === 'fruk:clearBest') {
      localStorage.removeItem('fr_best');
      best = 0;
    }
  });

  let spawnTimer=0;
  function spawnPipe(){
    const padding=60; 
    const sky = GROUND_Y - PIPE_GAP - padding;
    const topH = padding + Math.random()*Math.max(20, sky);
    pipes.push({x:canvas.width+20,y:topH,passed:false});
  }

  function drawBackground(){
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0,'#6c8fb0'); g.addColorStop(1,'#2a3b4b');
    ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#79c257'; ctx.fillRect(0,GROUND_Y,canvas.width,canvas.height-GROUND_Y);
    ctx.fillStyle='#6ab14a';
    for(let i=0;i<5;i++){const w=180,h=80;const x=(i*140-(t*40)%140);
      ctx.beginPath(); ctx.ellipse(x,GROUND_Y,w,h,0,Math.PI,0); ctx.fill();}
  }
  function drawPipe(x,topH){ ctx.fillStyle='#2e8b57'; ctx.fillRect(x,0,PIPE_W,topH);
    const by=topH+PIPE_GAP; ctx.fillRect(x,by,PIPE_W,GROUND_Y-by);
    ctx.strokeStyle='#1e5c3a'; ctx.lineWidth=4;
    ctx.strokeRect(x+2,2,PIPE_W-4,topH-4);
    ctx.strokeRect(x+2,by+2,PIPE_W-4,GROUND_Y-by-4);
  }
  function drawCrowSprite(b){
    const dx = Math.floor(b.x - DRAW_W/2 + DRAW_OX);
    const dy = Math.floor(b.y - DRAW_H/2 + DRAW_OY);
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (tokenLoaded) {
      // Draw token as body
      const bw = Math.floor(DRAW_W*0.85), bh = Math.floor(DRAW_H*0.85);
      const bx = Math.floor(b.x - bw/2 + DRAW_OX);
      const by = Math.floor(b.y - bh/2 + DRAW_OY - 2);
      ctx.drawImage(tokenImg, bx, by, bw, bh);

      // Draw small white wings (flapping)
      const tphase = Math.sin(performance.now()/120) * 0.5 + (bird.flapTimer>0 ? 0.8 : 0);
      const leftX = b.x - bw*0.35 + DRAW_OX, leftY = b.y - 6 + DRAW_OY;
      const rightX = b.x + bw*0.35 + DRAW_OX, rightY = b.y - 6 + DRAW_OY;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 1;

      // left wing
      ctx.save();
      ctx.translate(leftX, leftY);
      ctx.rotate(-0.6 + tphase*0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // right wing
      ctx.save();
      ctx.translate(rightX, rightY);
      ctx.rotate(0.6 - tphase*0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (spriteLoaded) {
      ctx.drawImage(sprite, frameIdx*FRAME_W, 0, FRAME_W, FRAME_H, dx, dy, DRAW_W, DRAW_H);
    } else {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;}
  let lastTime=performance.now();
  function loop(now){
    const dt=Math.min(1/30,(now-lastTime)/1000); lastTime=now; t+=dt;
    if(state==='running'){ timeAlive += dt; }
    const sf = speedFactor();
    if (state==='running' && bgm.playbackRate !== sf){ bgm.playbackRate = sf; }

    if(bird.flapTimer>0)bird.flapTimer-=dt;
    if(state==='running'){ 
      bird.vy += G * dt * sf; 
      bird.y += bird.vy * dt;
      if(bird.y+bird.r>GROUND_Y){bird.y=GROUND_Y-bird.r; gameOver();}
      if(bird.y-bird.r<0){bird.y=bird.r; bird.vy=0;}
      spawnTimer += dt*1000 * sf;
      const interval = BASE_INTERVAL / sf;
      if (spawnTimer>=interval){spawnTimer=0;spawnPipe();}
      for(let i=pipes.length-1;i>=0;i--){
        const p=pipes[i]; p.x -= BASE_SCROLL * dt * sf;
        if(p.x+PIPE_W<-40) pipes.splice(i,1);
        if(!p.passed&&p.x+PIPE_W<bird.x-bird.r){p.passed=true;score++;scoreEl.textContent=score;}
      }
      for(const p of pipes){
        const bx=bird.x-bird.r,by=bird.y-bird.r,bw=bird.r*2,bh=bird.r*2;
        if(rectsOverlap(bx,by,bw,bh,p.x,0,PIPE_W,p.y))gameOver();
        if(rectsOverlap(bx,by,bw,bh,p.x,p.y+PIPE_GAP,PIPE_W,GROUND_Y-(p.y+PIPE_GAP)))gameOver();
      }
      // advance animation
      frameTimer += dt * sf;
      if (frameTimer >= FRAME_DUR) { frameTimer -= FRAME_DUR; frameIdx = (frameIdx+1)%FRAMES; }
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBackground(); for(const p of pipes)drawPipe(p.x,p.y); drawCrowSprite(bird);
    requestAnimationFrame(loop);
  }
  reset(); requestAnimationFrame(loop);
})();