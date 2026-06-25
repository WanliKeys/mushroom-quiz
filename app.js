(() => {
  'use strict';
  const W = 941, H = 1672;
  const stage = document.getElementById('stage');
  const screens = [...document.querySelectorAll('.screen')];
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hudLevel = document.getElementById('hudLevel');
  const hudScore = document.getElementById('hudScore');
  const hudTime = document.getElementById('hudTime');
  const levelToast = document.getElementById('levelToast');
  const comboToast = document.getElementById('comboToast');
  const poisonDance = document.getElementById('poisonDance');
  const pausePanel = document.getElementById('pausePanel');
  const levelPanel = document.getElementById('levelPanel');
  const levelDrawButton = document.getElementById('levelDrawButton');
  const result = document.getElementById('result');
  const resultScore = document.getElementById('resultScore');
  const resultStatus = document.getElementById('resultStatus');
  const resultStatusCn = document.getElementById('resultStatusCn');
  const resultStatusEn = document.getElementById('resultStatusEn');
  const drawStatus = document.getElementById('drawStatus');
  const flowerRewardBadge = document.getElementById('flowerRewardBadge');
  const mushroomRewardBadge = document.getElementById('mushroomRewardBadge');
  const resultClaimCode = document.getElementById('resultClaimCode');
  const DAILY_DRAW_KEY = 'asjDailyDrawV2';
  const DAILY_DRAW_LIMIT = 3;
  const CLAIM_CODE_KEY = 'asjRewardClaimCodeV1';
  const RESULT_ARTWORK_URLS = {
    result_partial: 'assets/result_partial.webp',
    result_partial_draw_used: 'assets/result_partial_draw_used.webp',
    result_full: 'assets/result_full.webp',
    result_full_draw_used: 'assets/result_full_draw_used.webp',
    result_dynamic: 'assets/result_dynamic.webp',
    result_dynamic_draw_used: 'assets/result_dynamic_draw_used.webp'
  };
  let memoryDailyDraw = null;

  function storageGet(key){
    try{return window.localStorage?.getItem(key) ?? null;}catch(_){return null;}
  }
  function storageSet(key,value){
    try{window.localStorage?.setItem(key,String(value));}catch(_){ }
  }

  const levels = [
    { time:25, target:60, speed:1, poison:.13, text:'第1关：先切两朵，云南菌局正式开始！' },
    { time:25, target:90, speed:1.12, poison:.18, text:'第2关：会切还不够，得切得准！' },
    { time:28, target:120, speed:1.25, poison:.24, text:'第3关：过了这关，爱尚菌请你吃菌子！' },
    { time:45, target:180, speed:1.45, poison:.30, text:'挑战模式：速度更快，毒菌更狡猾！' }
  ];

  const state = {
    screen:'loading', level:0, score:0, roundStartScore:0, timeLeft:25,
    running:false, paused:false, poisonHits:0, combo:0, best:+storageGet('asjBest')||0,
    entities:[], particles:[], trails:[], slashes:[], spawnClock:0, lastTs:0, raf:0, poisonLock:false,
    pointerDown:false, lastPointer:null, completedThree:false, failed:false, hasFinishedGame:false, firstLevelCompleted:false,
    resultAction:'restart', lastRoundScore:0, lastRoundPassed:false,
    resultArtwork:'result_partial', claimCode:''
  };

  // V16：游戏菌菇直接使用用户提供参考图中的原始插画切片。
  // 只替换菌菇素材，关卡、计分、抽奖、结算和其他交互保持不变。
  const MUSHROOM_SPRITE_URLS = {
    edible: [
      'assets/mushrooms/edible_bolete.png',
      'assets/mushrooms/edible_matsutake.png',
      'assets/mushrooms/edible_parasol.png',
      'assets/mushrooms/edible_ganbajun.png'
    ],
    poison: [
      'assets/mushrooms/poison_red_russula.png',
      'assets/mushrooms/poison_deadly_amanita.png',
      'assets/mushrooms/poison_black_cluster.png'
    ]
  };
  const MUSHROOM_NAMES = {
    edible: ['牛肝菌','松茸','伞菌','干巴菌'],
    poison: ['亚稀褶红菇','致命鹅膏','火炭菌']
  };
  const mushroomSprites = {
    edible: MUSHROOM_SPRITE_URLS.edible.map(loadSprite),
    poison: MUSHROOM_SPRITE_URLS.poison.map(loadSprite)
  };
  function loadSprite(src){
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return image;
  }


  // V17：只增加音频反馈，不添加任何可见控件，也不修改现有 UI。
  const AUDIO_URLS = {
    background: 'assets/audio/background.mp3',
    draw: 'assets/audio/draw.mp3',
    drawLose: 'assets/audio/draw-lose.mp3',
    sliceGood: 'assets/audio/slice-good.mp3',
    sliceBad: 'assets/audio/slice-bad.mp3',
    victory: 'assets/audio/victory.mp3',
    failure: 'assets/audio/failure.mp3',
    drawWin: 'assets/audio/draw-win.mp3'
  };

  const sound = (() => {
    const settings = {
      sliceGood: { volume: 1.00, pool: 7 },
      sliceBad:  { volume: 0.82, pool: 5 },
      victory:   { volume: 0.92, pool: 2 },
      failure:   { volume: 0.84, pool: 2 },
      draw:      { volume: 1.00, pool: 2 },
      drawWin:   { volume: 0.90, pool: 2 },
      drawLose:  { volume: 0.86, pool: 3 }
    };
    const pools = {};
    const cursors = {};
    let background = null;
    let initialized = false;
    let unlocked = false;

    function createAudio(src, volume=1, loop=false){
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volume;
      audio.loop = loop;
      audio.playsInline = true;
      return audio;
    }

    function init(){
      if(initialized) return;
      initialized = true;
      background = createAudio(AUDIO_URLS.background, 0.24, true);
      Object.entries(settings).forEach(([name, cfg]) => {
        pools[name] = Array.from({length: cfg.pool}, () => createAudio(AUDIO_URLS[name], cfg.volume, false));
        cursors[name] = 0;
      });
    }

    function startBackground(){
      init();
      if(!unlocked || !background || !background.paused) return;
      const promise = background.play();
      if(promise?.catch) promise.catch(() => {});
    }

    function unlock(){
      init();
      unlocked = true;
      startBackground();
    }

    function play(name){
      init();
      const pool = pools[name];
      const cfg = settings[name];
      if(!pool || !cfg) return;
      let audio = pool.find(item => item.paused || item.ended);
      if(!audio){
        audio = pool[cursors[name] % pool.length];
        cursors[name] = (cursors[name] + 1) % pool.length;
      }
      try{
        audio.pause();
        audio.currentTime = 0;
        audio.volume = cfg.volume;
        const promise = audio.play();
        if(promise?.catch) promise.catch(() => {});
      }catch(_){ }
    }

    function pauseBackground(){
      if(background && !background.paused) background.pause();
    }

    function resumeBackground(){
      if(unlocked) startBackground();
    }

    return { unlock, play, pauseBackground, resumeBackground };
  })();

  // 移动端浏览器禁止自动播放；首次触摸/点击只解锁音频，不改变页面结构。
  document.addEventListener('pointerdown', sound.unlock, {passive:true});
  document.addEventListener('keydown', sound.unlock, {passive:true});

  function resizeStage(){
    const scale = Math.min(innerWidth/W, innerHeight/H);
    stage.style.transform = `translate(-50%,-50%) scale(${scale})`;
  }
  addEventListener('resize', resizeStage, {passive:true});
  resizeStage();

  function showScreen(id){
    screens.forEach(s => s.classList.toggle('active', s.id === id));
    state.screen = id;
    if(id !== 'game') stopLoop();
  }

  setTimeout(() => showScreen('home'), 1250);

  document.addEventListener('click', (e) => {
    const rankTab = e.target.closest('[data-rank-tab]');
    if(rankTab){ switchRankingTab(rankTab.dataset.rankTab); return; }
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const action = btn.dataset.action;
    if(action === 'home'){ endGame(); showScreen('home'); hideModals(); }
    if(action === 'rules') showScreen('rules');
    if(action === 'ranking'){ updateRanking(); switchRankingTab('today'); showScreen('ranking'); }
    if(action === 'start') startCampaign();
    if(action === 'result-action') handleResultAction();
    if(action === 'pause') pauseGame();
    if(action === 'resume') resumeGame();
    if(action === 'continue') nextLevel();
    if(action === 'draw') openDraw();
    if(action === 'close-draw') document.getElementById('drawPanel').classList.add('hidden');
    if(action === 'claim') openClaim();
    if(action === 'close-claim') document.getElementById('claimPanel').classList.add('hidden');
  });

  function switchRankingTab(tab){
    document.querySelectorAll('[data-rank-tab]').forEach(btn => {
      const active = btn.dataset.rankTab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-rank-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.rankPanel === tab);
    });
  }

  function updateRanking(){
    const current = Math.max(0, Math.round(state.score || 0));
    const best = Math.max(current, state.best || 0);
    const referenceRank = best > 0 ? `第${Math.max(1, Math.ceil(3600 / (best + 35)))}名` : '--';
    document.getElementById('myCurrentScore').textContent = `${current}分`;
    document.getElementById('myBestScore').textContent = `${best}分`;
    document.getElementById('myRankTitle').textContent = getTitle(best);
    document.getElementById('myReferenceRank').textContent = referenceRank;
  }

  function hideModals(){
    [pausePanel, levelPanel, document.getElementById('drawPanel'), document.getElementById('claimPanel')].forEach(x=>x.classList.add('hidden'));
  }

  function startCampaign(){
    hideModals();
    state.level = 0; state.score = 0; state.completedThree = false; state.failed = false; state.hasFinishedGame = false; state.firstLevelCompleted = false;
    state.resultAction = 'restart'; state.lastRoundScore = 0; state.lastRoundPassed = false;
    showScreen('game');
    beginLevel();
  }

  function beginLevel(){
    const cfg = levels[Math.min(state.level,3)];
    state.roundStartScore = state.score;
    state.timeLeft = cfg.time;
    state.poisonHits = 0; state.combo = 0; state.entities.length = 0; state.particles.length=0; state.trails.length=0; state.slashes.length=0;
    state.spawnClock = 0; state.running = true; state.paused = false; state.poisonLock = false; state.failed=false;
    hudLevel.textContent = String(state.level + 1);
    hudScore.textContent = state.score;
    hudTime.textContent = formatTime(state.timeLeft);
    levelToast.textContent = cfg.text;
    levelToast.classList.add('show');
    setTimeout(()=>levelToast.classList.remove('show'),1800);
    state.lastTs = performance.now();
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }

  function nextLevel(){
    levelPanel.classList.add('hidden');
    if(state.failed){ beginLevel(); return; }
    state.level++;
    if(state.level >= 3) state.completedThree = true;
    if(state.level > 3){ showResult(true); return; }
    beginLevel();
  }

  function pauseGame(){
    if(!state.running || state.paused) return;
    state.paused = true; pausePanel.classList.remove('hidden');
  }
  function resumeGame(){
    pausePanel.classList.add('hidden'); state.paused = false; state.lastTs = performance.now();
  }
  function endGame(){ state.running=false; cancelAnimationFrame(state.raf); state.entities=[]; }
  function stopLoop(){ if(state.screen !== 'game') endGame(); }

  function loop(ts){
    if(!state.running) return;
    let dt = Math.min(.035, (ts-state.lastTs)/1000 || 0); state.lastTs = ts;
    if(!state.paused){ update(dt); draw(); }
    state.raf=requestAnimationFrame(loop);
  }

  function update(dt){
    const cfg = levels[Math.min(state.level,3)];
    state.timeLeft -= dt;
    if(state.timeLeft <= 0){ state.timeLeft=0; hudTime.textContent='0:00'; finishRound(); return; }
    hudTime.textContent = formatTime(state.timeLeft);
    state.spawnClock -= dt;
    if(state.spawnClock <= 0){
      spawnMushroom(Math.random() < cfg.poison, cfg.speed);
      if(Math.random() < .18 + state.level*.06) spawnMushroom(Math.random() < cfg.poison, cfg.speed);
      state.spawnClock = Math.max(.32, .78 - state.level*.09 + Math.random()*.26);
    }
    for(const m of state.entities){
      if(m.sliced){
        m.cutT += dt;
        m.fade -= dt*1.35;
        m.x += m.vx*dt*.22;
        m.y += m.cutVy*dt;
        m.cutVy += 520*dt;
        m.rot += m.vr*dt*.32;
        continue;
      }
      m.x += m.vx*dt; m.y += m.vy*dt; m.vy += 860*dt; m.rot += m.vr*dt;
    }
    state.entities = state.entities.filter(m => m.fade>0 && m.y < 1580 && m.x > -190 && m.x < 1130);
    for(const p of state.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=420*dt; p.life-=dt; }
    state.particles = state.particles.filter(p=>p.life>0);
    state.trails.forEach(t=>t.life-=dt); state.trails=state.trails.filter(t=>t.life>0);
    state.slashes.forEach(s=>s.life-=dt); state.slashes=state.slashes.filter(s=>s.life>0);
  }

  function spawnMushroom(poison, speed){
    const fromSide = Math.random()<.22;
    const size = poison ? 64+Math.random()*22 : 58+Math.random()*34;
    let x,y,vx,vy;
    if(fromSide){
      const left=Math.random()<.5; x=left?-80:1020; y=650+Math.random()*470;
      vx=(left?1:-1)*(330+Math.random()*180)*speed; vy=-(360+Math.random()*260)*speed;
    } else {
      x=120+Math.random()*700; y=1270+Math.random()*80;
      vx=(-220+Math.random()*440)*speed; vy=-(770+Math.random()*250)*speed;
    }
    const category = poison ? 'poison' : 'edible';
    const spriteIndex = (Math.random()*mushroomSprites[category].length)|0;
    state.entities.push({
      x,y,vx,vy,size,poison,sliced:false,fade:1,
      rot:(Math.random()-.5),vr:(Math.random()-.5)*3,
      spriteIndex,
      name:MUSHROOM_NAMES[category][spriteIndex]
    });
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    for(const m of state.entities) drawMushroom(m);
    for(const p of state.particles){
      const alpha=Math.max(0,Math.min(1,p.life/p.maxLife));
      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.fillStyle=p.color;
      ctx.shadowColor=p.color;
      ctx.shadowBlur=p.glow||0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    for(const t of state.trails) drawBladeTrail(t);
    for(const s of state.slashes) drawSlashArc(s);
    ctx.globalAlpha=1;
  }

  function drawBladeTrail(t){
    const a=Math.max(0,Math.min(1,t.life/t.maxLife));
    const dx=t.x2-t.x1,dy=t.y2-t.y1;
    if(Math.hypot(dx,dy)<2) return;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    const gradient=ctx.createLinearGradient(t.x1,t.y1,t.x2,t.y2);
    gradient.addColorStop(0,`rgba(42,126,255,0)`);
    gradient.addColorStop(.45,`rgba(78,191,255,${a*.72})`);
    gradient.addColorStop(1,`rgba(255,255,255,${a})`);
    ctx.strokeStyle=gradient;
    ctx.shadowColor=`rgba(28,148,255,${a})`;
    ctx.shadowBlur=26;
    ctx.lineWidth=22*a+4;
    ctx.beginPath();ctx.moveTo(t.x1,t.y1);ctx.lineTo(t.x2,t.y2);ctx.stroke();
    ctx.shadowBlur=10;
    ctx.strokeStyle=`rgba(239,253,255,${a})`;
    ctx.lineWidth=6*a+2;
    ctx.stroke();
    ctx.restore();
  }

  function drawSlashArc(slash){
    const a=Math.max(0,Math.min(1,slash.life/slash.maxLife));
    const grow=1+(1-a)*.18;
    const len=slash.length*grow;
    const dx=Math.cos(slash.angle),dy=Math.sin(slash.angle);
    const nx=-dy,ny=dx;
    const x1=slash.x-dx*len*.55,y1=slash.y-dy*len*.55;
    const x2=slash.x+dx*len*.55,y2=slash.y+dy*len*.55;
    const cx=slash.x+nx*slash.curve,cy=slash.y+ny*slash.curve;
    const path=()=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(cx,cy,x2,y2);};
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    ctx.shadowColor=`rgba(34,146,255,${a})`;
    ctx.shadowBlur=44;
    ctx.strokeStyle=`rgba(34,139,255,${a*.42})`;
    ctx.lineWidth=50*a+12; path();ctx.stroke();
    ctx.shadowBlur=25;
    ctx.strokeStyle=`rgba(94,211,255,${a*.88})`;
    ctx.lineWidth=26*a+7; path();ctx.stroke();
    ctx.shadowColor='white';ctx.shadowBlur=18;
    ctx.strokeStyle=`rgba(255,255,255,${a})`;
    ctx.lineWidth=8*a+3; path();ctx.stroke();
    ctx.fillStyle=`rgba(255,255,255,${a})`;
    for(const k of [-.42,.12,.48]){
      const px=slash.x+dx*len*k+nx*slash.curve*(1-k*k)*.7;
      const py=slash.y+dy*len*k+ny*slash.curve*(1-k*k)*.7;
      ctx.beginPath();ctx.arc(px,py,3+7*a,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function drawMushroom(m){
    if(!m.sliced){
      ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rot);ctx.globalAlpha=m.fade;
      drawMushroomBody(m);
      ctx.restore();
      return;
    }
    const progress=Math.min(1,m.cutT/.52);
    const eased=1-Math.pow(1-progress,3);
    const sep=m.cutSep*eased;
    const nx=m.cutNormalX,ny=m.cutNormalY;
    drawMushroomHalf(m,-1,-nx*sep,-ny*sep,-m.halfSpin*eased);
    drawMushroomHalf(m,1,nx*sep,ny*sep,m.halfSpin*eased);

    ctx.save();
    ctx.translate(m.x,m.y);
    ctx.rotate(m.cutWorldAngle);
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=Math.max(0,m.fade*(1-progress));
    ctx.strokeStyle=m.poison?'#b9ff73':'#fff8c6';
    ctx.shadowColor=m.poison?'#6dff45':'#55c9ff';
    ctx.shadowBlur=25;
    ctx.lineWidth=7;
    ctx.beginPath();ctx.moveTo(-m.size*.78,0);ctx.lineTo(m.size*.78,0);ctx.stroke();
    ctx.restore();
  }

  function drawMushroomHalf(m,side,dx,dy,spin){
    ctx.save();
    ctx.translate(m.x+dx,m.y+dy);
    ctx.rotate(m.rot+spin);
    ctx.globalAlpha=m.fade;
    const a=m.cutLocalAngle;
    const big=m.size*2.3;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    if(side<0) ctx.rect(-big,-big,big*2,big+1.5);
    else ctx.rect(-big,-1.5,big*2,big+1.5);
    ctx.clip();
    ctx.rotate(-a);
    drawMushroomBody(m);
    ctx.restore();

    ctx.save();
    ctx.rotate(a);
    ctx.strokeStyle=m.poison?'#f5ddbd':'#fff0bd';
    ctx.shadowColor=m.poison?'#87ff43':'#ffca65';
    ctx.shadowBlur=10;
    ctx.lineWidth=Math.max(4,m.size*.065);
    ctx.beginPath();ctx.moveTo(-m.size*.72,0);ctx.lineTo(m.size*.72,0);ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawMushroomBody(m){
    const category=m.poison?'poison':'edible';
    const image=mushroomSprites[category][m.spriteIndex % mushroomSprites[category].length];
    if(image && image.complete && image.naturalWidth>0){
      const s=m.size;
      const targetH=s*1.62;
      const targetW=targetH*(image.naturalWidth/image.naturalHeight);
      ctx.save();
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      // 保留参考图原始颜色与笔触，不再用程序重新绘制菌盖或菌柄。
      ctx.drawImage(image,-targetW/2,-targetH*.52,targetW,targetH);
      ctx.restore();
      return;
    }

    // 素材极端情况下尚未加载完成时的临时占位；加载完成后自动显示原图菌菇。
    const s=m.size;
    ctx.fillStyle=m.poison?'#b94337':'#b87638';
    ctx.beginPath();ctx.ellipse(0,-s*.12,s*.55,s*.38,0,Math.PI,0);ctx.fill();
    ctx.fillStyle='#ead6aa';
    ctx.beginPath();ctx.moveTo(-s*.16,-s*.04);ctx.quadraticCurveTo(-s*.18,s*.48,-s*.3,s*.62);ctx.quadraticCurveTo(0,s*.7,s*.3,s*.62);ctx.quadraticCurveTo(s*.18,s*.48,s*.16,-s*.04);ctx.fill();
  }

  function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

  function pointFromEvent(e){
    const rect=stage.getBoundingClientRect();
    return {x:(e.clientX-rect.left)*W/rect.width,y:(e.clientY-rect.top)*H/rect.height};
  }
  canvas.addEventListener('pointerdown',e=>{state.pointerDown=true;state.lastPointer=pointFromEvent(e);canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!state.pointerDown || !state.running || state.paused) return;
    const p=pointFromEvent(e), a=state.lastPointer||p; state.trails.push({x1:a.x,y1:a.y,x2:p.x,y2:p.y,life:.17,maxLife:.17});
    sliceAlong(a,p); state.lastPointer=p; e.preventDefault();
  },{passive:false});
  const pointerUp=()=>{state.pointerDown=false;state.lastPointer=null;};
  canvas.addEventListener('pointerup',pointerUp); canvas.addEventListener('pointercancel',pointerUp); canvas.addEventListener('pointerleave',pointerUp);

  function distanceToSegment(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;t=Math.max(0,Math.min(1,t));
    const x=a.x+t*dx,y=a.y+t*dy;return Math.hypot(p.x-x,p.y-y);
  }
  function sliceAlong(a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    const strokeLength=Math.hypot(dx,dy);
    if(strokeLength<2) return;
    const angle=Math.atan2(dy,dx);
    for(const m of state.entities){
      if(m.sliced) continue;
      if(distanceToSegment(m,a,b) < m.size*.72) hitMushroom(m,angle,strokeLength);
    }
  }

  function hitMushroom(m,angle,strokeLength){
    m.sliced=true; m.fade=1; m.cutT=0;
    m.cutWorldAngle=angle;
    m.cutLocalAngle=angle-m.rot;
    m.cutNormalX=-Math.sin(angle);m.cutNormalY=Math.cos(angle);
    m.cutSep=m.size*(.72+Math.random()*.18);
    m.halfSpin=.65+Math.random()*.72;
    m.cutVy=Math.min(90,m.vy*.16)-40;
    state.slashes.push({
      x:m.x,y:m.y,angle,
      length:Math.max(250,Math.min(470,strokeLength*5.2)),
      curve:(Math.random()<.5?-1:1)*(35+Math.random()*48),
      life:.32,maxLife:.32
    });
    burst(m.x,m.y,m.poison?'#a5ff53':'#ffd65b');
    beep(m.poison?130:620,m.poison?.14:.07);
    sound.play(m.poison?'sliceBad':'sliceGood');
    if(m.poison){
      state.score=Math.max(0,state.score-10);state.combo=0;state.poisonHits++;
      showCombo('中毒 -10',true);
      if(state.poisonHits===3) triggerPoisonDance();
      if(state.poisonHits>=5){state.failed=true;finishRound(true);return;}
    } else {
      state.score+=10;state.combo++;
      let bonus=0,label='鲜味 +10';
      if(state.combo===2){bonus=5;label='双连鲜切 +5';}
      if(state.combo===3){bonus=10;label='三连鲜切 +10';}
      if(state.combo===5){bonus=20;label='五连暴击 +20';}
      state.score+=bonus;showCombo(label,false);
    }
    hudScore.textContent=state.score;
  }
  function burst(x,y,color){for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2,s=100+Math.random()*240,life=.48+Math.random()*.42;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-90,life,maxLife:life,r:3+Math.random()*7,color,glow:Math.random()*12});}}
  function showCombo(text,bad){comboToast.textContent=text;comboToast.style.color=bad?'#ff5c45':'#ffe569';comboToast.classList.add('show');clearTimeout(showCombo.t);showCombo.t=setTimeout(()=>comboToast.classList.remove('show'),520);}
  function triggerPoisonDance(){
    if(state.poisonLock) return; state.poisonLock=true;poisonDance.classList.add('active');
    setTimeout(()=>{poisonDance.classList.remove('active');state.poisonLock=false;},2500);
  }

  function finishRound(forceFail=false){
    if(!state.running) return;
    state.running=false;
    cancelAnimationFrame(state.raf);

    const cfg=levels[Math.min(state.level,3)];
    const roundScore=Math.max(0,state.score-state.roundStartScore);
    const passed=!forceFail && roundScore>=cfg.target;

    state.failed=!passed;
    state.lastRoundScore=roundScore;
    state.lastRoundPassed=passed;

    if(passed && state.level===0) state.firstLevelCompleted=true;
    if(passed && state.level===2) state.completedThree=true;

    if(passed){
      state.resultAction=state.level>=3?'restart':'next';
      sound.play('victory');
    }else{
      state.resultAction='retry';
      sound.play('failure');
    }

    showResult(passed, roundScore, forceFail);
  }

  function handleResultAction(){
    // 结算页左下角固定为“再玩一次”：无论通关或失败，都从第1关重新开始。
    hideModals();
    startCampaign();
  }

  function setRewardBadge(el,won){
    if(!el) return;
    el.classList.toggle('won',won);
    el.classList.toggle('locked',!won);
    el.innerHTML=won
      ? '<strong>已中奖</strong><span>WON　✓</span>'
      : '<strong>未中奖</strong><span>NOT YET　🔒</span>';
  }

  function updateResultRewards(){
    const flowerWon=state.score>=100;
    const mushroomWon=state.score>=300;
    setRewardBadge(flowerRewardBadge,flowerWon);
    setRewardBadge(mushroomRewardBadge,mushroomWon);
  }

  function showResult(completed,roundScore=state.lastRoundScore,forceFail=false){
    endGame();
    state.best=Math.max(state.best,state.score);
    storageSet('asjBest',state.best);

    // V12：恢复原始结算视觉。通关时直接使用原始结算图，不再重绘顶部与奖励状态。
    // 牛肝菌奖励达成后使用双中奖版本，否则使用鲜花饼中奖版本。
    const mushroomWon=state.score>=300;
    state.resultArtwork=mushroomWon?'result_full':'result_partial';
    result.classList.toggle('result-restored',completed);

    // 失败结算仍保留动态文字，避免把失败显示成“挑战完成”。
    // V18：结算页显示游戏结束瞬间 HUD 中的真实累计得分。
    const actualGameScore=Math.max(0,Math.round(state.score));
    resultScore.textContent=actualGameScore;
    const scoreDigits=String(actualGameScore).length;
    resultScore.style.fontSize=scoreDigits>=5?'64px':scoreDigits===4?'78px':'96px';
    resultScore.style.letterSpacing=scoreDigits>=5?'-3px':scoreDigits===4?'-5px':'-7px';
    resultStatus.classList.toggle('failed',!completed);
    if(completed){
      resultStatusCn.textContent='挑战完成';
      resultStatusEn.textContent='Challenge Complete';
    }else{
      result.classList.remove('result-restored');
      state.resultArtwork='result_dynamic';
      resultStatusCn.textContent='挑战失败';
      resultStatusEn.textContent='Challenge Failed';
    }

    const resultActionButton=document.querySelector('.result-replay');
    if(resultActionButton){
      resultActionButton.setAttribute('aria-label','再玩一次');
    }

    state.hasFinishedGame=true;
    updateResultRewards();
    updateClaimCodeUI();
    updateDailyDrawUI();
    showScreen('result');
  }

  function localDayKey(date=new Date()){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function readDailyDrawRecord(){
    try{
      const raw=storageGet(DAILY_DRAW_KEY);
      if(!raw) return memoryDailyDraw;
      const record=JSON.parse(raw);
      return record && typeof record==='object' ? record : memoryDailyDraw;
    }catch(_){ return memoryDailyDraw; }
  }

  function writeDailyDrawRecord(record){
    memoryDailyDraw=record;
    storageSet(DAILY_DRAW_KEY,JSON.stringify(record));
  }

  function getTodayDrawAttempts(){
    const record=readDailyDrawRecord();
    if(record?.date!==localDayKey()) return [];
    if(Array.isArray(record.attempts)) return record.attempts;
    return record.drawnAt ? [record] : [];
  }

  function getTodayDrawCount(){
    return getTodayDrawAttempts().length;
  }

  function getRemainingDrawCount(){
    return Math.max(0,DAILY_DRAW_LIMIT-getTodayDrawCount());
  }

  function getTodayWinningAttempt(){
    return getTodayDrawAttempts().find(attempt => attempt?.won && attempt.code) || null;
  }

  function getLatestTodayDrawAttempt(){
    const attempts=getTodayDrawAttempts();
    return attempts[attempts.length-1] || null;
  }

  function appendTodayDrawAttempt(attempt){
    const today=localDayKey();
    const existing=readDailyDrawRecord();
    const attempts=existing?.date===today && Array.isArray(existing.attempts)
      ? existing.attempts.slice()
      : getTodayDrawAttempts();
    attempts.push(attempt);
    const record={date:today,attempts,drawnAt:attempt.drawnAt,won:attempt.won,code:attempt.code || ''};
    writeDailyDrawRecord(record);
    return record;
  }

  function randomUnit(){
    if(window.crypto?.getRandomValues){
      const n=new Uint32Array(1);window.crypto.getRandomValues(n);return n[0]/4294967296;
    }
    return Math.random();
  }

  function createVoucherCode(){
    const date=localDayKey().replace(/-/g,'').slice(2);
    const suffix=Math.floor(randomUnit()*1000000).toString().padStart(6,'0');
    return `ASJ-${date}-${suffix}`;
  }

  function createClaimCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix='';
    for(let i=0;i<4;i++) suffix+=chars[Math.floor(randomUnit()*chars.length)];
    const md=localDayKey().slice(5).replace('-','');
    return `ASJ-${md}-${suffix}`;
  }

  function readClaimCodeRecord(){
    try{
      const raw=storageGet(CLAIM_CODE_KEY);
      if(!raw) return null;
      const record=JSON.parse(raw);
      return record && typeof record==='object' ? record : null;
    }catch(_){ return null; }
  }

  function getOrCreateClaimCode(){
    if(state.score<100) return '';
    const today=localDayKey();
    const existing=readClaimCodeRecord();
    if(existing?.date===today && existing.code) return existing.code;
    const record={date:today,code:createClaimCode(),createdAt:Date.now()};
    storageSet(CLAIM_CODE_KEY,JSON.stringify(record));
    return record.code;
  }

  function updateClaimCodeUI(){
    state.claimCode=getOrCreateClaimCode();
    if(resultClaimCode) resultClaimCode.textContent=state.claimCode;
  }

  function getTodayDrawRecord(){
    return getLatestTodayDrawAttempt();
  }

  function updateLevelDrawButton(){
    if(!levelDrawButton) return;
    const eligible=state.firstLevelCompleted;
    const remaining=getRemainingDrawCount();
    const used=remaining<=0;
    levelDrawButton.classList.toggle('is-hidden',!eligible);
    levelDrawButton.textContent=used?'查看今日抽奖结果':`立即抽奖（今日剩余${remaining}次）`;
    const continueButton=document.getElementById('continueButton');
    if(continueButton) continueButton.classList.toggle('secondary',eligible);
  }

  function applyResultArtwork(){
    const used=getRemainingDrawCount()<=0;
    const key=(state.resultArtwork || 'result_partial')+(used?'_draw_used':'');
    const artworkUrl=RESULT_ARTWORK_URLS[key] || RESULT_ARTWORK_URLS.result_partial;
    result.style.setProperty('--bg',`url('${artworkUrl}')`);
  }

  function updateDailyDrawUI(){
    const remaining=getRemainingDrawCount();
    const used=remaining<=0;
    result.classList.toggle('draw-used',used);
    if(drawStatus) drawStatus.textContent=used?'今日已抽完 · 明日再来':`今日剩余 ${remaining} 次`;
    const button=document.querySelector('.result-draw');
    if(button) button.setAttribute('aria-label',used?'今日抽奖机会已用完，明日再来':`每日幸运抽奖，今日剩余${remaining}次`);
    applyResultArtwork();
    updateLevelDrawButton();
  }

  function setDrawModal({icon,title,copy,code='',button='我知道了'}){
    document.getElementById('prizeIcon').textContent=icon;
    document.getElementById('drawTitle').textContent=title;
    document.getElementById('drawCopy').textContent=copy;
    document.getElementById('drawCloseButton').textContent=button;
    const codeBox=document.getElementById('rewardCodeBox');
    codeBox.classList.toggle('is-hidden',!code);
    if(code) document.getElementById('rewardCode').textContent=code;
    document.getElementById('drawPanel').classList.remove('hidden');
  }

  function openDraw(){
    if(!state.firstLevelCompleted){
      setDrawModal({icon:'🎮',title:'先完成第一关',copy:`成功通过第一关后，即可获得今天的 ${DAILY_DRAW_LIMIT} 次抽奖机会。`});
      return;
    }

    if(getTodayDrawCount()>=DAILY_DRAW_LIMIT){
      const winning=getTodayWinningAttempt();
      setDrawModal(winning?{
        icon:'🎫',title:'今日机会已用完',copy:'你今天已抽中100元抵扣券，兑奖码已为你保留。',code:winning.code,button:'查看完毕'
      }:{
        icon:'🍄',title:'今日抽奖机会已用完',copy:'你今天的3次抽奖机会已经用完，明天再来试试菌运。'
      });
      updateDailyDrawUI();
      return;
    }

    sound.play('draw');
    const won=randomUnit()<0.01;
    const attempt={won,code:won?createVoucherCode():'',drawnAt:Date.now()};
    appendTodayDrawAttempt(attempt);
    updateDailyDrawUI();
    const remaining=getRemainingDrawCount();

    if(won){
      setDrawModal({icon:'🎫',title:'恭喜中奖！',copy:`你抽中了100元抵扣券，请截图保存兑奖码。今日还剩 ${remaining} 次机会。`,code:attempt.code,button:'收下奖励'});
      setTimeout(()=>sound.play('drawWin'),900);
    }else{
      setDrawModal({icon:'🍄',title:'本次未中奖',copy:remaining>0?`别灰心，今天还剩 ${remaining} 次抽奖机会。`:'今天的3次抽奖机会已用完，明天通过第一关后可再次参与。'});
      setTimeout(()=>sound.play('drawLose'),900);
    }
  }
  function openClaim(){
    let copy='当前分数未达到兑奖门槛，再切一局试试。';
    if(state.score>=300) copy='已解锁鲜花饼 1 份及价值68元野生菌 1 份。';
    else if(state.score>=100) copy='已解锁鲜花饼 1 份。';
    document.getElementById('claimCopy').textContent=copy;
    state.claimCode=getOrCreateClaimCode();
    document.getElementById('claimCode').textContent=state.claimCode || '未达兑奖门槛';
    document.getElementById('claimPanel').classList.remove('hidden');
  }

  function getTitle(score){
    if(score>=1500)return'云南菌神';if(score>=1000)return'菌王挑战者';if(score>=700)return'爱尚菌高手';if(score>=400)return'鲜味猎手';if(score>=200)return'云南菌友';if(score>=100)return'初级切菌官';return'菌子小白';
  }
  function formatTime(s){const n=Math.max(0,Math.ceil(s));return `0:${String(n).padStart(2,'0')}`;}
  function beep(freq,duration){
    try{const A=window.AudioContext||window.webkitAudioContext;const ac=beep.ac||(beep.ac=new A());const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.045,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+duration);}catch(_){ }
  }

  addEventListener('focus',()=>{ if(state.screen==='result') updateDailyDrawUI(); sound.resumeBackground(); });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) sound.pauseBackground();
    else{
      sound.resumeBackground();
      if(state.screen==='result') updateDailyDrawUI();
    }
  });

  window.__ASJ__={showScreen,startCampaign,showResult,state,hitMushroom,draw,openDraw,getTodayDrawRecord};
})();
