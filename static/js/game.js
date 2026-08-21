/**
 * Retro Neon Tetris - Core Game Engine & Audio Synthesizer
 */

// ============================================================================
// 1. GERENCIADOR DE ÁUDIO SINTETIZADO (Web Audio API)
// ============================================================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.musicEnabled = false;
        this.soundEnabled = true;
        this.musicInterval = null;
        this.musicStep = 0;
        
        // Sequência de notas da melodia clássica do Tetris (Korobeiniki) em A menor
        // Formato: [nota, duração em ms] - 0 representa pausa
        this.melody = [
            ['E5', 400], ['B4', 200], ['C5', 200], ['D5', 400], ['C5', 200], ['B4', 200],
            ['A4', 400], ['A4', 200], ['C5', 200], ['E5', 400], ['D5', 200], ['C5', 200],
            ['B4', 600], ['C5', 200], ['D5', 400], ['E5', 400],
            ['C5', 400], ['A4', 400], ['A4', 400], [0, 200],
            
            ['D5', 600], ['F5', 200], ['A5', 400], ['G5', 200], ['F5', 200],
            ['E5', 600], ['C5', 200], ['E5', 400], ['D5', 200], ['C5', 200],
            ['B4', 400], ['B4', 200], ['C5', 200], ['D5', 400], ['E5', 400],
            ['C5', 400], ['A4', 400], ['A4', 400], [0, 200]
        ];

        // Mapeamento de Frequências (Hz) para Notas Musicais (Oitavas 4 e 5)
        this.frequencies = {
            'A4': 440.00, 'A#4': 466.16, 'B4': 493.88, 'C5': 523.25, 'C#5': 554.37,
            'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99,
            'G5': 783.99, 'G#5': 830.61, 'A5': 880.00
        };
    }

    init() {
        if (!this.ctx) {
            // Cria o contexto de áudio apenas na primeira interação do usuário
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Toca um sintetizador rápido para efeitos sonoros
    playSynth(freq, type, duration, gainStart, gainEnd) {
        if (!this.soundEnabled || !this.ctx) return;
        
        try {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(gainEnd, this.ctx.currentTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn('Erro ao tocar efeito de som:', e);
        }
    }

    playMove() {
        this.init();
        this.playSynth(150, 'triangle', 0.08, 0.2, 0.01);
    }

    playRotate() {
        this.init();
        this.playSynth(300, 'square', 0.1, 0.15, 0.01);
    }

    playLineClear(linesCount) {
        this.init();
        if (!this.soundEnabled || !this.ctx) return;
        
        // Multi-tons para comemorar linhas limpas (arpejo mais complexo quanto mais linhas)
        const delayBetween = 80; // ms
        const baseFreq = 523.25; // C5
        const scale = [1, 1.25, 1.5, 1.875]; // C5, E5, G5, B5
        
        for (let i = 0; i < linesCount; i++) {
            setTimeout(() => {
                const freq = baseFreq * (scale[i % scale.length]);
                this.playSynth(freq, 'sawtooth', 0.25, 0.25, 0.01);
            }, i * delayBetween);
        }
    }

    playLevelUp() {
        this.init();
        if (!this.soundEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        const notes = [440, 554, 659, 880]; // Arpejo Maior Triunfante
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playSynth(freq, 'sine', 0.3, 0.3, 0.01);
            }, idx * 120);
        });
    }

    playGameOver() {
        this.init();
        if (!this.soundEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        const notes = [392, 349, 311, 261]; // Escala melancólica descendente
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playSynth(freq, 'sawtooth', 0.4, 0.2, 0.01);
            }, idx * 180);
        });
    }

    // Inicia e agenda o loop da melodia retro
    startMusic() {
        this.init();
        if (this.musicInterval) return;
        
        this.musicEnabled = true;
        this.musicStep = 0;
        
        const scheduleNextNote = () => {
            if (!this.musicEnabled) return;
            
            const current = this.melody[this.musicStep];
            const note = current[0];
            const duration = current[1];
            
            if (note !== 0 && this.frequencies[note]) {
                const freq = this.frequencies[note];
                // Toca um sintetizador do tipo 'triangle' bem suave para a música de fundo
                this.playSynth(freq, 'triangle', duration / 1000, 0.06, 0.001);
            }
            
            this.musicStep = (this.musicStep + 1) % this.melody.length;
            this.musicInterval = setTimeout(scheduleNextNote, duration);
        };
        
        scheduleNextNote();
    }

    stopMusic() {
        this.musicEnabled = false;
        if (this.musicInterval) {
            clearTimeout(this.musicInterval);
            this.musicInterval = null;
        }
    }
}

const audio = new SoundManager();


// ============================================================================
// 2. CONFIGURAÇÕES E ESTADOS DO JOGO
// ============================================================================
const canvas = document.getElementById('tetris-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
let BLOCK_SIZE = 30; // 30px por bloco (dinâmico baseado no resize)

// Cores Modernas com Efeito Neon
const COLORS = {
    0: '#000000',
    1: '#00f0ff', // I - Cyan
    2: '#ffff00', // O - Yellow
    3: '#9d4edd', // T - Purple
    4: '#39ff14', // S - Green
    5: '#ff3131', // Z - Red
    6: '#0055ff', // J - Blue
    7: '#ff5f1f'  // L - Orange
};

// Cores de Sombra Glow para as Peças
const GLOW_COLORS = {
    1: 'rgba(0, 240, 255, 0.75)',
    2: 'rgba(255, 255, 0, 0.75)',
    3: 'rgba(157, 78, 221, 0.75)',
    4: 'rgba(57, 255, 20, 0.75)',
    5: 'rgba(255, 49, 49, 0.75)',
    6: 'rgba(0, 85, 255, 0.75)',
    7: 'rgba(255, 95, 31, 0.75)'
};

// Matrizes de Formatos de Tetrominós
const SHAPES = [
    [], // Índice 0 vazio
    // I
    [[0,0,0,0],
     [1,1,1,1],
     [0,0,0,0],
     [0,0,0,0]],
    // O
    [[2,2],
     [2,2]],
    // T
    [[0,3,0],
     [3,3,3],
     [0,0,0]],
    // S
    [[0,4,4],
     [4,4,0],
     [0,0,0]],
    // Z
    [[5,5,0],
     [0,5,5],
     [0,0,0]],
    // J
    [[6,0,0],
     [6,6,6],
     [0,0,0]],
    // L
    [[0,0,7],
     [7,7,7],
     [0,0,0]]
];


// ============================================================================
// 3. ENGENHARIA DE PARTÍCULAS (Glow Sparks)
// ============================================================================
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 6 - 3;
        this.speedY = Math.random() * -4 - 1;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.015;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.alpha -= this.decay;
    }

    draw(context) {
        context.save();
        context.globalAlpha = this.alpha;
        context.shadowBlur = 8;
        context.shadowColor = this.color;
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}


// ============================================================================
// 4. CLASSE PRINCIPAL DO JOGO (TETRIS ENGINE)
// ============================================================================
class GameEngine {
    constructor() {
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isPlaying = false;
        this.highScores = [];
        
        this.currentPiece = null;
        this.nextPiece = null;
        this.bag = [];
        
        // Loop de tempo (Delta Time para velocidade de queda constante)
        this.dropCounter = 0;
        this.dropInterval = 1000; // Começa com 1 segundo por queda (Level 1)
        this.lastTime = 0;
        
        // Partículas e animações
        this.particles = [];
        
        this.initEvents();
        
        // Inicializa o tamanho responsivo do canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.draw();
        });
    }

    resizeCanvas() {
        let maxH, maxW;
        if (window.innerWidth > 950) {
            // No desktop, desconta menos espaço do cabeçalho (~110px) para maximizar a área de jogo
            maxH = window.innerHeight - 110;
            // Para a largura, desconta o espaço ocupado pelos painéis laterais (250px * 2) mais folgas e gaps (30px * 2)
            maxW = window.innerWidth - 560;
        } else {
            // No mobile/telas colapsadas
            maxH = window.innerHeight - 340;
            maxW = window.innerWidth - 40;
        }
        
        // Mantém limites elegantes mais generosos para telas grandes
        maxH = Math.max(300, Math.min(maxH, 1400));
        maxW = Math.max(150, Math.min(maxW, 850));
        
        let width = maxH / 2;
        let height = maxH;
        
        if (width > maxW) {
            width = maxW;
            height = width * 2;
        }
        
        // Garante que BLOCK_SIZE seja inteiro para o grid desenhar com precisão pixel-perfect
        BLOCK_SIZE = Math.floor(width / 10);
        
        if (BLOCK_SIZE < 15) {
            BLOCK_SIZE = 15;
        }
        
        canvas.width = BLOCK_SIZE * 10;
        canvas.height = BLOCK_SIZE * 20;
    }

    createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    initEvents() {
        // Inputs do teclado
        document.addEventListener('keydown', (e) => this.handleInput(e));
        
        // Botão de Start
        document.getElementById('btn-start').addEventListener('click', () => {
            this.start();
        });
        
        // Botão de Reinício no Game Over
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.restart();
        });
        
        // Botão de Áudio - Música
        const btnMusic = document.getElementById('btn-music');
        btnMusic.addEventListener('click', () => {
            audio.init();
            if (audio.musicEnabled) {
                audio.stopMusic();
                document.getElementById('music-status').textContent = 'OFF';
                btnMusic.classList.remove('active');
            } else {
                audio.startMusic();
                document.getElementById('music-status').textContent = 'ON';
                btnMusic.classList.add('active');
            }
        });
        
        // Botão de Áudio - Efeitos Sonoros
        const btnSound = document.getElementById('btn-sound');
        btnSound.addEventListener('click', () => {
            audio.init();
            audio.soundEnabled = !audio.soundEnabled;
            document.getElementById('sound-status').textContent = audio.soundEnabled ? 'ON' : 'OFF';
            btnSound.classList.toggle('active');
        });

        // Envio de Score do Placar
        document.getElementById('btn-submit-score').addEventListener('click', () => {
            this.submitHighScore();
        });
        
        // Trata fechamento/reabertura de input de texto para o placar
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitHighScore();
            }
        });
    }

    start() {
        audio.init();
        document.getElementById('start-overlay').classList.add('hidden');
        this.isPlaying = true;
        this.isGameOver = false;
        this.isPaused = false;
        
        // Reseta atributos
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.board = this.createBoard();
        this.particles = [];
        this.bag = [];
        
        this.updateStatsDisplay();
        
        // Gera as primeiras peças
        this.currentPiece = this.generatePiece();
        this.nextPiece = this.generatePiece();
        
        this.updateInterval();
        
        // Inicia música se ativada
        if (document.getElementById('btn-music').classList.contains('active')) {
            audio.startMusic();
        }
        
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.update(time));
    }

    restart() {
        document.getElementById('gameover-modal').classList.add('hidden');
        this.start();
    }

    // Algoritmo Randomizer de Bolsa Completa (Bag of 7)
    // Evita repetição exaustiva e garante peças justas
    generatePiece() {
        if (this.bag.length === 0) {
            this.bag = [1, 2, 3, 4, 5, 6, 7];
            // Embaralha
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        
        const type = this.bag.pop();
        return {
            matrix: JSON.parse(JSON.stringify(SHAPES[type])),
            type: type,
            pos: { x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2), y: type === 1 ? -1 : 0 }
        };
    }

    // Loop do Jogo principal baseado em Tempo (Independente do FPS)
    update(time) {
        if (!this.isPlaying || this.isPaused || this.isGameOver) return;
        
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.moveDown();
        }
        
        // Atualiza as partículas de faíscas
        this.particles.forEach((p, idx) => {
            p.update();
            if (p.alpha <= 0) {
                this.particles.splice(idx, 1);
            }
        });
        
        this.draw();
        
        requestAnimationFrame((t) => this.update(t));
    }

    moveLeft() {
        this.currentPiece.pos.x--;
        if (this.collide()) {
            this.currentPiece.pos.x++;
        } else {
            audio.playMove();
        }
    }

    moveRight() {
        this.currentPiece.pos.x++;
        if (this.collide()) {
            this.currentPiece.pos.x--;
        } else {
            audio.playMove();
        }
    }

    moveDown() {
        this.currentPiece.pos.y++;
        if (this.collide()) {
            this.currentPiece.pos.y--;
            this.merge();
            this.clearLines();
            this.spawnNext();
        } else {
            this.dropCounter = 0;
        }
    }

    hardDrop() {
        let dropDistance = 0;
        while (!this.collide()) {
            this.currentPiece.pos.y++;
            dropDistance++;
        }
        this.currentPiece.pos.y--;
        this.score += dropDistance * 2; // Pontos extras por descida total instantânea
        
        this.merge();
        this.clearLines();
        this.spawnNext();
        
        audio.playMove();
        this.updateStatsDisplay();
    }

    rotate() {
        const matrix = this.currentPiece.matrix;
        const n = matrix.length;
        
        // Cria nova matriz rotacionada (90 graus sentido horário)
        const rotated = Array.from({ length: n }, () => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                rotated[c][n - 1 - r] = matrix[r][c];
            }
        }
        
        const originalMatrix = this.currentPiece.matrix;
        this.currentPiece.matrix = rotated;
        
        // Mecanismo simples de "Wall Kick" (Empurra se bater na parede ou em outra peça)
        const pos = this.currentPiece.pos;
        let offset = 1;
        while (this.collide()) {
            pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (Math.abs(offset) > n) {
                // Reverte se não couber de forma alguma
                this.currentPiece.matrix = originalMatrix;
                pos.x = pos.x;
                return;
            }
        }
        audio.playRotate();
    }

    // Detecção de Colisão Matemática
    collide() {
        const matrix = this.currentPiece.matrix;
        const pos = this.currentPiece.pos;
        
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c] !== 0) {
                    const boardX = pos.x + c;
                    const boardY = pos.y + r;
                    
                    // Verifica limites das paredes laterais e do fundo
                    if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
                        return true;
                    }
                    
                    // Verifica se já existe uma peça fixa no local (ignora se estiver acima do topo da grade)
                    if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Fixa a peça atual no tabuleiro
    merge() {
        const matrix = this.currentPiece.matrix;
        const pos = this.currentPiece.pos;
        
        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value !== 0) {
                    const boardY = pos.y + r;
                    const boardX = pos.x + c;
                    
                    // Permite fixar peças mesmo que ultrapassem o topo da grade
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = value;
                    }
                }
            });
        });
    }

    // Limpeza de Linhas e Geração de Partículas
    clearLines() {
        let clearedCount = 0;
        
        // Varre de baixo para cima
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.board[r].every(val => val !== 0)) {
                // Cria efeito visual de explosão de fagulhas coloridas
                this.createSparksEffect(r);
                
                // Remove a linha e adiciona uma linha vazia no topo
                this.board.splice(r, 1);
                this.board.unshift(Array(COLS).fill(0));
                clearedCount++;
                r++; // Reajusta índice para reavaliar a mesma linha que desceu
            }
        }
        
        if (clearedCount > 0) {
            this.lines += clearedCount;
            
            // Fase 3: Telemetria de Linhas Limpas
            sendTelemetry('line_clear', clearedCount);
            if (clearedCount === 4) {
                sendTelemetry('tetris_clear', 1);
                this.showFloatingEvent('TETRIS!', 'tetris');
            }
            
            // Sistema de Pontuação Clássico Multiplicado pelo Nível
            const scoreMultiplier = [0, 100, 300, 500, 800];
            this.score += scoreMultiplier[clearedCount] * this.level;
            
            // Aumenta nível a cada 10 linhas limpas
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                audio.playLevelUp();
                this.updateInterval();
                // Fase 3: Telemetria de Nível
                sendTelemetry('level_up', this.level);
                this.showFloatingEvent(`LEVEL UP!`, 'levelup');
            } else {
                audio.playLineClear(clearedCount);
            }
            
            // Fase 3: Verifica se desbloqueou conquistas
            setTimeout(() => fetchAndShowAchievements(), 500);
            
            this.updateStatsDisplay();
        }
    }

    showFloatingEvent(text, cssClass) {
        const container = document.getElementById('game-events-container');
        if (!container) return;
        
        const el = document.createElement('div');
        el.className = `floating-event ${cssClass}`;
        el.textContent = text;
        
        container.appendChild(el);
        
        // Remove após a animação (2.5s)
        setTimeout(() => {
            if (container.contains(el)) {
                container.removeChild(el);
            }
        }, 3000);
    }

    createSparksEffect(rowY) {
        // Gera partículas brilhantes na altura da linha limpa
        const canvasY = rowY * BLOCK_SIZE + (BLOCK_SIZE / 2);
        for (let x = 0; x < COLS * BLOCK_SIZE; x += 10) {
            // Usa cor neon de fagulha rosa ou amarela aleatória
            const color = Math.random() > 0.5 ? COLORS[1] : COLORS[3];
            this.particles.push(new Particle(x, canvasY, color));
        }
    }

    spawnNext() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.generatePiece();
        this.dropCounter = 0;
        
        // Verifica se a nova peça nasce colidindo (GAME OVER)
        if (this.collide()) {
            this.gameOver();
        }
    }

    updateInterval() {
        // Reduz progressivamente o tempo entre quedas conforme o nível aumenta (mais rápido)
        // Mínimo de 60ms por queda
        this.dropInterval = Math.max(60, 1000 - (this.level - 1) * 90);
    }

    togglePause() {
        if (!this.isPlaying || this.isGameOver) return;
        
        this.isPaused = !this.isPaused;
        const overlay = document.getElementById('pause-overlay');
        
        if (this.isPaused) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.update(time));
        }
    }

    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        audio.playGameOver();
        
        // Exibe resultados no modal
        document.getElementById('final-score').textContent = this.score.toLocaleString();
        document.getElementById('final-level').textContent = this.level;
        document.getElementById('final-lines').textContent = this.lines;
        
        // Verifica se é recorde (High Score) de forma assíncrona
        this.checkIfHighScore();
        
        document.getElementById('gameover-modal').classList.remove('hidden');
    }

    async checkIfHighScore() {
        const form = document.getElementById('new-high-score-form');
        form.classList.add('hidden');
        
        try {
            const currentScores = await fetchScores();
            if (isHighScore(this.score, currentScores)) {
                form.classList.remove('hidden');
                document.getElementById('player-name').focus();
            }
        } catch (e) {
            console.warn('Não foi possível verificar recorde com o backend.', e);
        }
    }

    async submitHighScore() {
        const nameInput = document.getElementById('player-name');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('Por favor, digite seu nome ou iniciais para o placar.');
            return;
        }
        
        const btn = document.getElementById('btn-submit-score');
        btn.disabled = true;
        btn.textContent = 'Salvando...';
        
        const success = await submitScore(name, this.score, this.level, this.lines);
        
        if (success) {
            document.getElementById('new-high-score-form').classList.add('hidden');
            nameInput.value = '';
        }
        
        btn.disabled = false;
        btn.textContent = 'Salvar Placar';
    }

    updateStatsDisplay() {
        document.getElementById('stat-score').textContent = this.score;
        document.getElementById('stat-level').textContent = this.level;
        document.getElementById('stat-lines').textContent = this.lines;
    }

    // Inputs de Teclado
    handleInput(e) {
        if (!this.isPlaying) return;
        
        if (e.key.toLowerCase() === 'p') {
            this.togglePause();
            return;
        }
        
        if (this.isPaused || this.isGameOver) return;
        
        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.moveLeft();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.moveRight();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.moveDown();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.rotate();
                break;
            case ' ': // Barra de espaço
                e.preventDefault(); // Evita scroll da página
                this.hardDrop();
                break;
        }
    }


    // ============================================================================
    // 5. SISTEMA DE RENDERIZAÇÃO NO CANVAS (DRAW ENGINE)
    // ============================================================================
    draw() {
        // 1. Limpa o Canvas Principal com fundo preto semi-transparente para rastro glow
        ctx.fillStyle = 'rgba(8, 6, 15, 0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Desenha uma leve grade de fundo futurista
        this.drawGrid(ctx, canvas.width, canvas.height);
        
        // 2. Desenha os blocos fixos no tabuleiro
        this.board.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.drawBlock(ctx, x, y, value);
                }
            });
        });
        
        // 3. Desenha a peça atual caindo
        if (this.currentPiece) {
            // Desenha uma projeção de sombra (Ghost Piece) onde a peça vai cair
            this.drawGhostPiece();
            
            // Desenha a peça real
            this.currentPiece.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        this.drawBlock(ctx, this.currentPiece.pos.x + x, this.currentPiece.pos.y + y, value);
                    }
                });
            });
        }
        
        // 4. Desenha as faíscas de partículas
        this.particles.forEach(p => p.draw(ctx));
        
        // 5. Desenha o painel da Próxima Peça
        this.drawNextPiece();
    }

    drawGrid(context, width, height) {
        context.strokeStyle = 'rgba(61, 28, 92, 0.15)';
        context.lineWidth = 1;
        
        // Linhas verticais
        for (let x = 0; x < width; x += BLOCK_SIZE) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        // Linhas horizontais
        for (let y = 0; y < height; y += BLOCK_SIZE) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }
    }

    // Desenha um bloco com visual neon sofisticado
    drawBlock(context, x, y, value, isGhost = false) {
        // Impede desenhar blocos acima da tela visível
        if (y < 0) return;
        
        const posX = x * BLOCK_SIZE;
        const posY = y * BLOCK_SIZE;
        
        context.save();
        
        if (isGhost) {
            // Peça fantasma (vazada, apenas contorno neon suave)
            context.strokeStyle = GLOW_COLORS[value];
            context.lineWidth = 2;
            context.strokeRect(posX + 2, posY + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        } else {
            // Bloco normal com efeito gradiente interno e brilho glow
            context.shadowBlur = 10;
            context.shadowColor = GLOW_COLORS[value];
            
            const grad = context.createLinearGradient(posX, posY, posX + BLOCK_SIZE, posY + BLOCK_SIZE);
            grad.addColorStop(0, '#fff'); // Brilho de reflexo interno
            grad.addColorStop(0.15, COLORS[value]);
            grad.addColorStop(1, '#000'); // Sombra de profundidade 3D
            
            context.fillStyle = grad;
            context.fillRect(posX + 1, posY + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            
            // Adiciona borda brilhante
            context.strokeStyle = GLOW_COLORS[value];
            context.lineWidth = 1.5;
            context.strokeRect(posX + 1, posY + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        }
        
        context.restore();
    }

    // Desenha a sombra de projeção onde a peça vai tocar o fundo
    drawGhostPiece() {
        const ghost = {
            pos: { x: this.currentPiece.pos.x, y: this.currentPiece.pos.y },
            matrix: this.currentPiece.matrix,
            type: this.currentPiece.type
        };
        
        // Avança até bater em colisão
        while (!this.collideGhost(ghost)) {
            ghost.pos.y++;
        }
        ghost.pos.y--; // Volta uma célula para ficar em cima da colisão
        
        // Renderiza apenas se estiver abaixo da peça atual
        if (ghost.pos.y > this.currentPiece.pos.y) {
            ghost.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        this.drawBlock(ctx, ghost.pos.x + x, ghost.pos.y + y, value, true);
                    }
                });
            });
        }
    }

    // Colisão exclusiva para a simulação da peça fantasma
    collideGhost(ghost) {
        const matrix = ghost.matrix;
        const pos = ghost.pos;
        
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c] !== 0) {
                    const boardX = pos.x + c;
                    const boardY = pos.y + r;
                    
                    if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
                        return true;
                    }
                    if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Renderiza a próxima peça no Canvas menor lateral
    drawNextPiece() {
        // Limpa o canvas lateral
        nextCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        
        if (!this.nextPiece) return;
        
        const matrix = this.nextPiece.matrix;
        const type = this.nextPiece.type;
        
        // Encontra os limites da peça para centralizá-la perfeitamente no Canvas de 120x120px
        const n = matrix.length;
        const size = BLOCK_SIZE; // Usaremos blocos de 20px ou 24px no painel lateral
        const miniBlockSize = 22;
        
        // Calcula offset para centralização
        let minX = n, maxX = -1, minY = n, maxY = -1;
        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value !== 0) {
                    if (c < minX) minX = c;
                    if (c > maxX) maxX = c;
                    if (r < minY) minY = r;
                    if (r > maxY) maxY = r;
                }
            });
        });
        
        const pieceW = (maxX - minX + 1) * miniBlockSize;
        const pieceH = (maxY - minY + 1) * miniBlockSize;
        const offsetX = (nextCanvas.width - pieceW) / 2 - minX * miniBlockSize;
        const offsetY = (nextCanvas.height - pieceH) / 2 - minY * miniBlockSize;
        
        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value !== 0) {
                    const posX = offsetX + c * miniBlockSize;
                    const posY = offsetY + r * miniBlockSize;
                    
                    nextCtx.save();
                    nextCtx.shadowBlur = 8;
                    nextCtx.shadowColor = GLOW_COLORS[value];
                    
                    const grad = nextCtx.createLinearGradient(posX, posY, posX + miniBlockSize, posY + miniBlockSize);
                    grad.addColorStop(0, '#fff');
                    grad.addColorStop(0.2, COLORS[value]);
                    grad.addColorStop(1, '#000');
                    
                    nextCtx.fillStyle = grad;
                    nextCtx.fillRect(posX + 1, posY + 1, miniBlockSize - 2, miniBlockSize - 2);
                    nextCtx.restore();
                }
            });
        });
    }
}

// Inicializa o Engine de Jogo ao carregar a página
window.addEventListener('load', () => {
    window.game = new GameEngine();
});
