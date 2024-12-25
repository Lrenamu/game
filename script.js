class GameManager {
    constructor(symbols) {
        this.symbols = symbols;
        this.currentLevel = 1;
        this.maxLevel = 20;
        this.game = null;
        
        this.initializeUI();
    }

    initializeUI() {
        // 初始化UI元素
        this.mainMenu = document.getElementById('main-menu');
        this.gameContainer = document.getElementById('game-container');
        this.startButton = document.getElementById('start-game');
        this.menuButton = document.querySelector('.menu-button');
        this.levelInfo = document.getElementById('level-info');

        // 绑定事件
        this.startButton.addEventListener('click', () => this.startLevel());
        this.menuButton.addEventListener('click', () => this.showMainMenu());
    }

    startLevel() {
        this.mainMenu.style.display = 'none';
        this.gameContainer.style.display = 'block';
        
        // 计算当前关卡的配置
        const config = this.getLevelConfig();
        
        // 创建新游戏
        this.game = new Game(this.symbols.slice(0, config.symbolCount), config, this);
        this.game.initGame(config);
        
        // 更新UI
        document.querySelector('.level').textContent = `关卡: ${this.currentLevel}`;
    }

    getLevelConfig() {
        return {
            cards: 15 + (this.currentLevel - 1) * 15, // 每关增加15张卡片
            slots: 7,
            symbolCount: Math.min(4 + Math.floor(this.currentLevel / 2), this.symbols.length), // 逐步增加动物种类
        };
    }

    showMainMenu() {
        this.gameContainer.style.display = 'none';
        this.mainMenu.style.display = 'block';
        this.levelInfo.textContent = `当前关卡: ${this.currentLevel}`;
    }

    handleLevelComplete() {
        if (this.currentLevel < this.maxLevel) {
            this.showModal('恭喜通关！', [
                { text: '下一关', action: () => this.nextLevel() },
                { text: '返回主菜单', action: () => this.showMainMenu() }
            ]);
        } else {
            this.showModal('恭喜通关全部关卡！', [
                { text: '重新开始', action: () => this.resetGame() },
                { text: '返回主菜单', action: () => this.showMainMenu() }
            ]);
        }
    }

    handleGameOver() {
        this.showModal('游戏失败！', [
            { text: '重试本关', action: () => this.startLevel() },
            { text: '返回主菜单', action: () => this.showMainMenu() }
        ]);
    }

    nextLevel() {
        this.currentLevel++;
        this.startLevel();
    }

    resetGame() {
        this.currentLevel = 1;
        this.startLevel();
    }

    showModal(message, buttons) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        messageElement.style.marginBottom = '20px';
        modal.appendChild(messageElement);
        
        buttons.forEach(button => {
            const buttonElement = document.createElement('button');
            buttonElement.textContent = button.text;
            buttonElement.addEventListener('click', () => {
                document.body.removeChild(modalOverlay);
                button.action();
            });
            modal.appendChild(buttonElement);
        });
        
        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);
    }
}

class Game {
    constructor(symbols, config, manager) {
        this.symbols = symbols;
        this.config = config;
        this.manager = manager;
        this.gameBoard = document.querySelector('.game-board');
        this.collectionSlot = document.querySelector('.collection-slot');
        this.scoreElement = document.querySelector('.score');
        this.cards = [];
        this.score = 0;
        this.moveHistory = [];
        this.toolCounts = {
            shuffle: 1,
            undo: 1,
            clear: 1
        };
        
        this.initTools();
        
        // 添加移除卡片的存储
        this.removedCards = [];
        
        // 初始化音效
        this.sounds = {
            click: document.getElementById('clickSound'),
            fail: document.getElementById('failSound'),
            gameover: document.getElementById('gameoverSound'),
            match: document.getElementById('matchSound'),
            success: document.getElementById('successSound'),
            gamePass: document.getElementById('gamePassSound')
        };
    }

    initTools() {
        // 重置道具次数
        this.toolCounts = {
            shuffle: 1,
            undo: 1,
            clear: 1
        };

        // 初始化道具按钮
        const shuffleBtn = document.getElementById('shuffle-tool');
        const undoBtn = document.getElementById('undo-tool');
        const clearBtn = document.getElementById('clear-tool');

        shuffleBtn.disabled = false;
        undoBtn.disabled = false;
        clearBtn.disabled = false;

        // 更新显示次数
        this.updateToolCounts();

        // 绑定事件
        shuffleBtn.onclick = () => this.useTool('shuffle');
        undoBtn.onclick = () => this.useTool('undo');
        clearBtn.onclick = () => this.useTool('clear');
    }

    updateToolCounts() {
        for (const [tool, count] of Object.entries(this.toolCounts)) {
            const btn = document.getElementById(`${tool}-tool`);
            const countSpan = btn.querySelector('.tool-count');
            countSpan.textContent = count;
            btn.disabled = count === 0;
        }
    }

    useTool(toolType) {
        if (this.toolCounts[toolType] <= 0) {
            this.playSound('fail'); // 道具使用失败音效
            return;
        }

        this.playSound('click'); // 道具使用音效
        
        switch (toolType) {
            case 'shuffle':
                this.shuffleRemainingCards();
                break;
            case 'undo':
                this.undoLastMove();
                break;
            case 'clear':
                this.clearThreeCards();
                break;
        }

        this.toolCounts[toolType]--;
        this.updateToolCounts();
    }

    shuffleRemainingCards() {
        // 获取所有剩余卡片的位置信息
        const cardPositions = this.cards.map(card => ({
            left: card.style.left,
            top: card.style.top,
            zIndex: card.style.zIndex,
            rotation: card.style.transform
        }));

        // 打乱位置信息
        this.shuffleArray(cardPositions);

        // 重新应用位置
        this.cards.forEach((card, index) => {
            card.style.left = cardPositions[index].left;
            card.style.top = cardPositions[index].top;
            card.style.zIndex = cardPositions[index].zIndex;
            card.style.transform = cardPositions[index].rotation;
        });
    }

    undoLastMove() {
        const lastMove = this.moveHistory.pop();
        if (!lastMove) return;

        // 从收集槽移除卡片
        const slots = this.collectionSlot.querySelectorAll('.slot');
        slots[lastMove.slotIndex].style.backgroundImage = 'none';

        // 恢复卡片到游戏板
        const card = document.createElement('div');
        card.className = 'card';
        card.style.backgroundImage = lastMove.backgroundImage;
        card.style.left = lastMove.position.left;
        card.style.top = lastMove.position.top;
        card.style.transform = lastMove.position.rotation;
        card.style.zIndex = lastMove.position.zIndex;

        card.addEventListener('click', () => this.handleCardClick(card));

        this.gameBoard.appendChild(card);
        this.cards.push(card);

        // 重新整理收集槽
        this.compactSlots();
    }

    clearThreeCards() {
        const slots = Array.from(this.collectionSlot.querySelectorAll('.slot'));
        const removedCards = [];
        let count = 0;

        // 找到前三张非空的卡片
        for (let i = 0; i < slots.length && count < 3; i++) {
            if (slots[i].style.backgroundImage && slots[i].style.backgroundImage !== 'none') {
                removedCards.push({
                    image: slots[i].style.backgroundImage,
                    originalIndex: i
                });
                slots[i].style.backgroundImage = 'none';
                count++;
            }
        }

        // 将移除的���片添加到右侧区域
        const removedCardsContainer = document.querySelector('.removed-cards');
        removedCards.forEach(cardData => {
            const removedCard = document.createElement('div');
            removedCard.className = 'removed-card';
            removedCard.style.backgroundImage = cardData.image;
            
            // 添加点击事件，允许卡片被放回收集槽
            removedCard.addEventListener('click', () => this.returnRemovedCard(removedCard, cardData.image));
            
            removedCardsContainer.appendChild(removedCard);
            this.removedCards.push(cardData);
        });

        // 重新整理收集槽
        this.compactSlots();
    }

    returnRemovedCard(cardElement, cardImage) {
        const emptySlot = Array.from(this.collectionSlot.querySelectorAll('.slot'))
            .find(slot => !slot.style.backgroundImage || slot.style.backgroundImage === 'none');

        if (emptySlot) {
            this.playSound('click'); // 放回卡片音效
            emptySlot.style.backgroundImage = cardImage;
            
            // 从移除区域删除卡片
            cardElement.remove();
            
            // 从removedCards数组中移除
            const index = this.removedCards.findIndex(card => card.image === cardImage);
            if (index !== -1) {
                this.removedCards.splice(index, 1);
            }

            // 检查是否有三个相同的图片可以消除
            this.checkAndRemoveMatches();
        } else {
            this.playSound('fail'); // 放回失败音效
        }
    }

    initGame(config) {
        this.gameBoard.innerHTML = '';
        this.collectionSlot.querySelectorAll('.slot').forEach(slot => {
            slot.style.backgroundImage = 'none';
        });
        this.cards = [];
        this.score = 0;
        this.scoreElement.textContent = `分数: 0`;

        // 创建卡片组合
        let cardSymbols = [];
        const symbolsNeeded = config.cards / 3; // 每种图片需要3张

        // 确保每种图片都有3张
        for (let i = 0; i < symbolsNeeded; i++) {
            const symbol = this.symbols[i % this.symbols.length];
            cardSymbols.push(symbol, symbol, symbol);
        }

        // 打乱卡片顺序
        cardSymbols = this.shuffleArray(cardSymbols);

        // 创建卡片
        cardSymbols.forEach(symbolUrl => this.createCard(symbolUrl));

        // 清空移动历史
        this.moveHistory = [];
        
        // 清空已移除卡片区域
        document.querySelector('.removed-cards').innerHTML = '';
        
        // 清空移除的卡片数组
        this.removedCards = [];
        
        // 初始化道具
        this.initTools();
        
        // 重置所有音效
        Object.values(this.sounds).forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
    }

    createCard(symbolUrl) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.backgroundImage = `url(${symbolUrl})`;

        const boardWidth = this.gameBoard.offsetWidth;
        const boardHeight = this.gameBoard.offsetHeight;
        
        const cardWidth = 70;
        const cardHeight = 90;
        
        const maxLeft = boardWidth - cardWidth;
        const maxTop = boardHeight - cardHeight;
        
        const left = Math.floor(Math.random() * maxLeft);
        const top = Math.floor(Math.random() * maxTop);
        
        const rotation = (Math.random() - 0.5) * 20;

        card.style.position = 'absolute';
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
        card.style.transform = `rotate(${rotation}deg)`;
        card.style.zIndex = Math.floor(Math.random() * 1000);

        card.addEventListener('click', () => this.handleCardClick(card));

        this.gameBoard.appendChild(card);
        this.cards.push(card);
    }

    handleCardClick(card) {
        const clickedIndex = this.cards.indexOf(card);
        if (clickedIndex === -1) return;
        
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        for (const otherCard of this.cards) {
            if (otherCard === card) continue;
            
            const otherRect = otherCard.getBoundingClientRect();
            if (centerX >= otherRect.left && centerX <= otherRect.right &&
                centerY >= otherRect.top && centerY <= otherRect.bottom) {
                const otherZIndex = parseInt(otherCard.style.zIndex || 0);
                const cardZIndex = parseInt(card.style.zIndex || 0);
                if (otherZIndex > cardZIndex) {
                    return;
                }
            }
        }

        const emptySlot = Array.from(this.collectionSlot.querySelectorAll('.slot'))
            .find(slot => !slot.style.backgroundImage || slot.style.backgroundImage === 'none');

        if (emptySlot) {
            this.playSound('click'); // 点击卡片音效
            this.moveHistory.push({
                backgroundImage: card.style.backgroundImage,
                position: {
                    left: card.style.left,
                    top: card.style.top,
                    rotation: card.style.transform,
                    zIndex: card.style.zIndex
                },
                slotIndex: Array.from(this.collectionSlot.querySelectorAll('.slot')).indexOf(emptySlot)
            });

            emptySlot.style.backgroundImage = card.style.backgroundImage;
            
            this.gameBoard.removeChild(card);
            this.cards.splice(clickedIndex, 1);

            this.checkAndRemoveMatches();

            // 检查游戏状态
            this.checkGameState();
        }
    }

    checkGameState() {
        if (this.cards.length === 0) {
            this.playSound('gamePass'); // 过关音效
            setTimeout(() => {
                this.manager.handleLevelComplete();
            }, 500);
        } else if (!this.hasEmptySlot() && this.cards.length > 0) {
            this.playSound('gameover'); // 游戏失败音效
            this.manager.handleGameOver();
        }
    }

    hasEmptySlot() {
        return Array.from(this.collectionSlot.querySelectorAll('.slot'))
            .some(slot => !slot.style.backgroundImage || slot.style.backgroundImage === 'none');
    }

    checkAndRemoveMatches() {
        const slots = Array.from(this.collectionSlot.querySelectorAll('.slot'));
        const slotImages = slots.map(slot => slot.style.backgroundImage);
        
        const imageCounts = {};
        const imagePositions = {};
        
        slotImages.forEach((image, index) => {
            if (image && image !== 'none') {
                if (!imageCounts[image]) {
                    imageCounts[image] = 1;
                    imagePositions[image] = [index];
                } else {
                    imageCounts[image]++;
                    imagePositions[image].push(index);
                }
            }
        });

        for (const image in imageCounts) {
            if (imageCounts[image] >= 3) {
                this.playSound('match'); // 消除音效
                const positions = imagePositions[image].slice(0, 3);
                positions.forEach(pos => {
                    slots[pos].style.backgroundImage = 'none';
                });

                this.score += 10;
                this.scoreElement.textContent = `分数: ${this.score}`;

                this.compactSlots();
                
                this.checkAndRemoveMatches();
                break;
            }
        }
    }

    compactSlots() {
        const slots = Array.from(this.collectionSlot.querySelectorAll('.slot'));
        const images = slots
            .map(slot => slot.style.backgroundImage)
            .filter(img => img && img !== 'none');
        
        slots.forEach(slot => slot.style.backgroundImage = 'none');
        
        images.forEach((img, index) => {
            slots[index].style.backgroundImage = img;
        });
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    playSound(soundName) {
        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(error => {
                console.log("播放音效失败:", error);
            });
        }
    }
}