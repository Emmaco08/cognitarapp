/**
 * CogniTara Scientific & Standard Calculator Engine
 * 100% Offline Shunting-Yard Parser & AST Evaluator (No eval())
 * Features:
 * - Glassmorphism modal with Claymorphism tactile 3D buttons & click ripple feedback
 * - Compact default sizing with dynamic drag resizing & compact/standard view toggle
 * - Continuous AUTOMATIC real-time calculation directly in main result display (no need to press '=')
 * - True mathematical symbol representation: tan⁻¹, sin⁻¹, cos⁻¹, √, ∛, ×, ÷, π, e
 * - FontAwesome backspace icon with robust event delegation
 * - Full DEG / RAD trigonometric calculation support
 * - Physical keyboard mapping with visual on-screen key depression
 */
(function(window) {
    'use strict';

    const CogniTaraCalculator = {
        type: 'none',
        angleUnit: 'deg', // 'deg' or 'rad'
        expression: '',
        result: '0',
        isResultDisplayed: false,
        isCompact: false,
        modal: null,
        header: null,
        displayExpr: null,
        displayRes: null,
        buttonsContainer: null,
        csrfToken: '',
        initialized: false,

        init: function(options) {
            options = options || {};
            this.type = options.type || 'none';
            this.csrfToken = options.csrfToken || '';
            this.angleUnit = localStorage.getItem('calc_angle_unit') || 'deg';
            this.isCompact = localStorage.getItem('calc_is_compact') === 'true';

            if (this.type === 'none') {
                const btn = document.getElementById('calculatorBtn');
                if (btn) btn.style.display = 'none';
                return;
            }

            this.modal = document.getElementById('calculatorModal');
            this.header = document.getElementById('calculatorHeader');
            this.displayExpr = document.getElementById('calcExpression');
            this.displayRes = document.getElementById('calcResult');
            this.buttonsContainer = document.getElementById('calculatorButtons');

            if (!this.modal || !this.buttonsContainer) return;

            if (this.isCompact) {
                this.modal.classList.add('compact');
            }

            this.renderButtons();
            this.initDraggable();
            this.initResizable();
            this.initKeyboard();
            this.restorePosition();
            this.initialized = true;

            const calcBtn = document.getElementById('calculatorBtn');
            if (calcBtn) {
                calcBtn.style.display = 'inline-flex';
                calcBtn.disabled = false;
                calcBtn.setAttribute('aria-disabled', 'false');
            }

            // Wire size toggle in header
            const sizeToggle = document.getElementById('calcSizeToggle');
            if (sizeToggle) {
                sizeToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleCompactMode();
                });
            }
        },

        toggleCompactMode: function() {
            this.isCompact = !this.isCompact;
            localStorage.setItem('calc_is_compact', this.isCompact ? 'true' : 'false');
            if (this.modal) {
                this.modal.classList.toggle('compact', this.isCompact);
            }
            const icon = document.querySelector('#calcSizeToggle i');
            if (icon) {
                icon.className = this.isCompact ? 'fas fa-expand' : 'fas fa-compress';
            }
        },

        renderButtons: function() {
            if (!this.buttonsContainer) return;

            const BACKSPACE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
            const COPY_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            const CHECK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

            let html = '';
            if (this.type === 'simple' || this.type === 'basic') {
                html = `
                <div class="cogni-calc-sci-topbar">
                    <span class="calc-sci-hint" style="font-family:var(--ct-mono);font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase">Standard</span>
                    <button type="button" class="calc-copy-btn" id="calcCopyBtn" title="Copy current answer">${COPY_SVG}<span>Copy</span></button>
                </div>
                <div class="cogni-calc-grid simple-grid">
                    <button type="button" class="calc-btn clear" data-val="C">C</button>
                    <button type="button" class="calc-btn backspace" data-val="back" title="Backspace" aria-label="Backspace">${BACKSPACE_SVG}</button>
                    <button type="button" class="calc-btn paren" data-val="(">(</button>
                    <button type="button" class="calc-btn paren" data-val=")">)</button>
                    <button type="button" class="calc-btn operator" data-val="÷">÷</button>

                    <button type="button" class="calc-btn num" data-val="7">7</button>
                    <button type="button" class="calc-btn num" data-val="8">8</button>
                    <button type="button" class="calc-btn num" data-val="9">9</button>
                    <button type="button" class="calc-btn operator" data-val="×">×</button>
                    <button type="button" class="calc-btn operator" data-val="%">%</button>

                    <button type="button" class="calc-btn num" data-val="4">4</button>
                    <button type="button" class="calc-btn num" data-val="5">5</button>
                    <button type="button" class="calc-btn num" data-val="6">6</button>
                    <button type="button" class="calc-btn operator" data-val="-">−</button>
                    <button type="button" class="calc-btn scientific" data-val="sqrt">√</button>

                    <button type="button" class="calc-btn num" data-val="1">1</button>
                    <button type="button" class="calc-btn num" data-val="2">2</button>
                    <button type="button" class="calc-btn num" data-val="3">3</button>
                    <button type="button" class="calc-btn operator" data-val="+">+</button>
                    <button type="button" class="calc-btn scientific" data-val="x²">x²</button>

                    <button type="button" class="calc-btn num" data-val="0">0</button>
                    <button type="button" class="calc-btn decimal" data-val=".">.</button>
                    <button type="button" class="calc-btn sign" data-val="+/-">±</button>
                    <button type="button" class="calc-btn scientific" data-val="π">π</button>
                    <button type="button" class="calc-btn equals" data-val="=">=</button>
                </div>`;
            } else {
                // Advanced / Scientific
                const isDeg = this.angleUnit === 'deg';
                html = `
                <div class="cogni-calc-sci-topbar">
                    <button type="button" class="calc-deg-badge ${isDeg ? 'deg-active' : 'rad-active'}" id="calcDegToggle" title="Click to toggle Degree / Radian mode">
                        <span class="deg-dot"></span>${isDeg ? 'DEG' : 'RAD'}
                    </button>
                    <button type="button" class="calc-copy-btn" id="calcCopyBtn" title="Copy current answer">${COPY_SVG}<span>Copy</span></button>
                </div>
                <div class="cogni-calc-grid scientific-grid">
                    <button type="button" class="calc-btn scientific" data-val="sin">sin</button>
                    <button type="button" class="calc-btn scientific" data-val="cos">cos</button>
                    <button type="button" class="calc-btn scientific" data-val="tan">tan</button>
                    <button type="button" class="calc-btn scientific" data-val="ln">ln</button>
                    <button type="button" class="calc-btn scientific" data-val="log">log</button>

                    <button type="button" class="calc-btn scientific" data-val="asin">sin⁻¹</button>
                    <button type="button" class="calc-btn scientific" data-val="acos">cos⁻¹</button>
                    <button type="button" class="calc-btn scientific" data-val="atan">tan⁻¹</button>
                    <button type="button" class="calc-btn scientific" data-val="e">e</button>
                    <button type="button" class="calc-btn scientific" data-val="π">π</button>

                    <button type="button" class="calc-btn scientific" data-val="sqrt">√</button>
                    <button type="button" class="calc-btn scientific" data-val="cbrt">∛</button>
                    <button type="button" class="calc-btn scientific" data-val="x²">x²</button>
                    <button type="button" class="calc-btn scientific" data-val="xʸ">xʸ</button>
                    <button type="button" class="calc-btn scientific" data-val="fact">n!</button>

                    <button type="button" class="calc-btn clear" data-val="C">C</button>
                    <button type="button" class="calc-btn backspace" data-val="back" title="Backspace" aria-label="Backspace">${BACKSPACE_SVG}</button>
                    <button type="button" class="calc-btn paren" data-val="(">(</button>
                    <button type="button" class="calc-btn paren" data-val=")">)</button>
                    <button type="button" class="calc-btn operator" data-val="÷">÷</button>

                    <button type="button" class="calc-btn num" data-val="7">7</button>
                    <button type="button" class="calc-btn num" data-val="8">8</button>
                    <button type="button" class="calc-btn num" data-val="9">9</button>
                    <button type="button" class="calc-btn operator" data-val="×">×</button>
                    <button type="button" class="calc-btn operator" data-val="%">%</button>

                    <button type="button" class="calc-btn num" data-val="4">4</button>
                    <button type="button" class="calc-btn num" data-val="5">5</button>
                    <button type="button" class="calc-btn num" data-val="6">6</button>
                    <button type="button" class="calc-btn operator" data-val="-">−</button>
                    <button type="button" class="calc-btn scientific" data-val="1/x">1/x</button>

                    <button type="button" class="calc-btn num" data-val="1">1</button>
                    <button type="button" class="calc-btn num" data-val="2">2</button>
                    <button type="button" class="calc-btn num" data-val="3">3</button>
                    <button type="button" class="calc-btn operator" data-val="+">+</button>
                    <button type="button" class="calc-btn sign" data-val="+/-">±</button>

                    <button type="button" class="calc-btn num calc-span-2" data-val="0">0</button>
                    <button type="button" class="calc-btn decimal" data-val=".">.</button>
                    <button type="button" class="calc-btn equals calc-span-2" data-val="=">=</button>
                </div>`;
            }

            this.buttonsContainer.innerHTML = html;

            // Wire button click handlers & tactile ripple animation with robust event delegation
            const buttons = this.buttonsContainer.querySelectorAll('.calc-btn');
            buttons.forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    this.createTactileFeedback(btn, e);
                });
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetBtn = e.target.closest('.calc-btn');
                    if (!targetBtn) return;
                    const val = targetBtn.getAttribute('data-val');
                    this.handleInput(val);
                });
            });

            // Wire DEG/RAD toggle
            const degToggle = this.buttonsContainer.querySelector('#calcDegToggle');
            if (degToggle) {
                degToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggleAngleUnit();
                });
            }

            // Wire Copy Answer button
            const copyBtn = this.buttonsContainer.querySelector('#calcCopyBtn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const text = this.result || '0';
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).catch(() => {});
                    }
                    copyBtn.classList.add('is-copied');
                    copyBtn.innerHTML = `${CHECK_SVG}<span>Copied</span>`;
                    setTimeout(() => {
                        copyBtn.classList.remove('is-copied');
                        copyBtn.innerHTML = `${COPY_SVG}<span>Copy</span>`;
                    }, 1200);
                });
            }
        },

        createTactileFeedback: function(btn, e) {
            btn.classList.add('calc-active');
            setTimeout(() => btn.classList.remove('calc-active'), 120);

            // Subtle ripple element
            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'calc-ripple';
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = `${size}px`;
            const x = (e.clientX ? (e.clientX - rect.left) : (rect.width / 2)) - (size / 2);
            const y = (e.clientY ? (e.clientY - rect.top) : (rect.height / 2)) - (size / 2);
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            btn.appendChild(ripple);
            setTimeout(() => { if (ripple.parentElement) ripple.parentElement.removeChild(ripple); }, 350);
        },

        toggleAngleUnit: function() {
            this.angleUnit = this.angleUnit === 'deg' ? 'rad' : 'deg';
            localStorage.setItem('calc_angle_unit', this.angleUnit);
            const degToggle = document.getElementById('calcDegToggle');
            if (degToggle) {
                degToggle.innerHTML = `<span class="deg-dot"></span>${this.angleUnit.toUpperCase()}`;
                degToggle.className = `calc-deg-badge ${this.angleUnit === 'deg' ? 'deg-active' : 'rad-active'}`;
            }
            this.updateDisplay();
        },

        handleInput: function(val) {
            if (!val) return;

            if (val === 'C') {
                this.expression = '';
                this.result = '0';
                this.isResultDisplayed = false;
                this.updateDisplay();
                return;
            }

            if (val === 'back') {
                if (this.isResultDisplayed) {
                    this.expression = '';
                    this.result = '0';
                    this.isResultDisplayed = false;
                } else if (this.expression.length > 0) {
                    // Check atomic function tokens to delete cleanly in one stroke
                    const funcs = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'arccos(', 'arcsin(', 'arctan(', 'sinh(', 'cosh(', 'tanh(', 'asin(', 'acos(', 'atan(', 'cbrt(', 'sqrt(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', '√(', '∛('];
                    let matched = false;
                    for (let f of funcs) {
                        if (this.expression.endsWith(f)) {
                            this.expression = this.expression.slice(0, -f.length);
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        this.expression = this.expression.slice(0, -1);
                    }
                }
                this.updateDisplay();
                return;
            }

            if (val === '=') {
                this.evaluate();
                return;
            }

            if (val === '+/-') {
                this.toggleSign();
                return;
            }

            if (val === 'x²') {
                this.append('^2');
                return;
            }

            if (val === 'xʸ') {
                this.append('^');
                return;
            }

            if (val === '1/x') {
                this.applyReciprocal();
                return;
            }

            if (val === 'fact') {
                this.append('!');
                return;
            }

            // Real mathematical symbols requested:
            if (val === 'atan') {
                this.append('tan⁻¹(');
                return;
            }
            if (val === 'asin') {
                this.append('sin⁻¹(');
                return;
            }
            if (val === 'acos') {
                this.append('cos⁻¹(');
                return;
            }
            if (val === 'sqrt') {
                this.append('√(');
                return;
            }
            if (val === 'cbrt') {
                this.append('∛(');
                return;
            }
            if (['sin', 'cos', 'tan', 'log', 'ln'].includes(val)) {
                this.append(val + '(');
                return;
            }

            this.append(val);
        },

        append: function(val) {
            const ops = ['+', '-', '−', '×', '÷', '*', '/', '^', '%'];
            if (this.isResultDisplayed) {
                if (ops.includes(val)) {
                    this.expression = this.result;
                } else {
                    this.expression = '';
                }
                this.isResultDisplayed = false;
            }

            if (this.expression === 'Error') this.expression = '';
            this.expression += val;
            this.updateDisplay();
        },

        toggleSign: function() {
            if (this.isResultDisplayed) {
                if (this.result !== '0' && this.result !== 'Error') {
                    if (this.result.startsWith('-')) {
                        this.result = this.result.substring(1);
                    } else {
                        this.result = '-' + this.result;
                    }
                    this.expression = this.result;
                    this.updateDisplay();
                }
                return;
            }
            if (!this.expression) return;
            const match = this.expression.match(/(-?\d+(?:\.\d+)?)$/);
            if (match) {
                const num = match[1];
                const prefix = this.expression.slice(0, -num.length);
                if (num.startsWith('-')) {
                    this.expression = prefix + num.substring(1);
                } else {
                    this.expression = prefix + '-' + num;
                }
                this.updateDisplay();
            }
        },

        applyReciprocal: function() {
            const base = this.isResultDisplayed ? this.result : this.expression;
            if (!base || base === 'Error') return;
            this.expression = `1/(${base})`;
            this.isResultDisplayed = false;
            this.updateDisplay();
            this.evaluate();
        },

        /**
         * Continuous AUTOMATIC Real-Time Calculation:
         * Calculates continuously as the student clicks or types.
         * The result is shown IMMEDIATELY in the main result display without clicking '='!
         */
        updateDisplay: function() {
            if (this.displayExpr) {
                this.displayExpr.textContent = this.expression || '0';
            }

            // If result was explicitly finalized (by '='), show it directly
            if (this.isResultDisplayed) {
                if (this.displayRes) {
                    this.displayRes.textContent = this.result;
                }
                return;
            }

            // If empty expression, reset to 0
            if (!this.expression || this.expression.trim() === '') {
                this.result = '0';
                if (this.displayRes) this.displayRes.textContent = '0';
                return;
            }

            // Automatically compute live result into the main result display
            try {
                let expr = this.expression;

                // Auto-close open parentheses for live evaluation
                let openP = (expr.match(/\(/g) || []).length;
                let closeP = (expr.match(/\)/g) || []).length;
                if (openP > closeP) {
                    expr += ')'.repeat(openP - closeP);
                }

                // If expression ends on an incomplete operator, evaluate the base operand(s)
                let evalExpr = expr;
                if (/[\+\-\−\×\÷\*\/\^\,\(]$/.test(evalExpr)) {
                    evalExpr = evalExpr.replace(/[\+\-\−\×\÷\*\/\^\,\(]+$/, '');
                    let subOpen = (evalExpr.match(/\(/g) || []).length;
                    let subClose = (evalExpr.match(/\)/g) || []).length;
                    if (subOpen > subClose) evalExpr += ')'.repeat(subOpen - subClose);
                }

                if (evalExpr && evalExpr.trim().length > 0) {
                    const res = this.shuntingYardEvaluate(evalExpr, this.angleUnit);
                    if (!isNaN(res) && isFinite(res)) {
                        let formatted;
                        if (Number.isInteger(res)) {
                            formatted = res.toString();
                        } else {
                            formatted = parseFloat(res.toFixed(10)).toString();
                        }
                        this.result = formatted;
                        if (this.displayRes) {
                            this.displayRes.textContent = formatted;
                        }
                        return;
                    }
                }
            } catch (e) {
                // If temporary syntax incompleteness while typing, keep current result
            }

            if (this.displayRes) {
                this.displayRes.textContent = this.result;
            }
        },

        open: function() {
            if (this.type === 'none' || !this.modal) return;
            this.modal.classList.add('show');
            if (window.innerWidth <= 480) {
                this.modal.style.left = Math.max(8, (window.innerWidth - this.modal.offsetWidth) / 2) + 'px';
                this.modal.style.top = '70px';
            }
        },

        close: function() {
            if (this.modal) this.modal.classList.remove('show');
        },

        toggle: function() {
            if (this.modal && this.modal.classList.contains('show')) {
                this.close();
            } else {
                this.open();
            }
        },

        restorePosition: function() {
            if (!this.modal) return;
            const savedLeft = localStorage.getItem('calculator_left');
            const savedTop = localStorage.getItem('calculator_top');
            if (savedLeft && savedTop) {
                const left = parseInt(savedLeft, 10);
                const top = parseInt(savedTop, 10);
                const maxLeft = Math.max(0, window.innerWidth - (this.modal.offsetWidth || 320));
                const maxTop = Math.max(0, window.innerHeight - (this.modal.offsetHeight || 380));
                this.modal.style.left = Math.min(Math.max(8, left), maxLeft) + 'px';
                this.modal.style.top = Math.min(Math.max(8, top), maxTop) + 'px';
            } else {
                const defaultW = this.isCompact ? 304 : 348;
                this.modal.style.left = Math.max(16, window.innerWidth - defaultW - 28) + 'px';
                this.modal.style.top = '118px';
            }
        },

        initDraggable: function() {
            if (!this.header || !this.modal) return;
            let isDragging = false;
            let startX, startY, modalStartX, modalStartY;

            const onStart = (clientX, clientY) => {
                isDragging = true;
                startX = clientX;
                startY = clientY;
                modalStartX = this.modal.offsetLeft;
                modalStartY = this.modal.offsetTop;
                this.modal.style.cursor = 'grabbing';
            };

            const onMove = (clientX, clientY) => {
                if (!isDragging) return;
                let newLeft = modalStartX + (clientX - startX);
                let newTop = modalStartY + (clientY - startY);
                const maxLeft = Math.max(0, window.innerWidth - this.modal.offsetWidth);
                const maxTop = Math.max(0, window.innerHeight - this.modal.offsetHeight);
                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));
                this.modal.style.left = newLeft + 'px';
                this.modal.style.top = newTop + 'px';
            };

            const onEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                this.modal.style.cursor = 'default';
                localStorage.setItem('calculator_left', this.modal.offsetLeft);
                localStorage.setItem('calculator_top', this.modal.offsetTop);
            };

            // Mouse events
            this.header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.calculator-close') || e.target.closest('#calcSizeToggle')) return;
                onStart(e.clientX, e.clientY);
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
            document.addEventListener('mouseup', onEnd);

            // Touch events for mobile/tablet
            this.header.addEventListener('touchstart', (e) => {
                if (e.target.closest('.calculator-close') || e.target.closest('#calcSizeToggle')) return;
                const t = e.touches[0];
                onStart(t.clientX, t.clientY);
            }, { passive: true });
            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                const t = e.touches[0];
                onMove(t.clientX, t.clientY);
            }, { passive: true });
            document.addEventListener('touchend', onEnd);
        },

        initResizable: function() {
            const handle = document.getElementById('calcResizeHandle');
            if (!handle || !this.modal) return;

            let isResizing = false;
            let startW, startH, startX, startY;

            const onResizeStart = (e) => {
                isResizing = true;
                const clientX = e.clientX || (e.touches && e.touches[0].clientX);
                const clientY = e.clientY || (e.touches && e.touches[0].clientY);
                startX = clientX;
                startY = clientY;
                startW = this.modal.offsetWidth;
                startH = this.modal.offsetHeight;
                document.body.style.userSelect = 'none';
            };

            const onResizeMove = (e) => {
                if (!isResizing) return;
                const clientX = e.clientX || (e.touches && e.touches[0].clientX);
                const clientY = e.clientY || (e.touches && e.touches[0].clientY);
                const newW = Math.max(280, Math.min(520, startW + (clientX - startX)));
                const newH = Math.max(360, Math.min(720, startH + (clientY - startY)));
                this.modal.style.width = newW + 'px';
                this.modal.style.height = newH + 'px';
            };

            const onResizeEnd = () => {
                if (!isResizing) return;
                isResizing = false;
                document.body.style.userSelect = '';
            };

            handle.addEventListener('mousedown', onResizeStart);
            handle.addEventListener('touchstart', onResizeStart, { passive: true });
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('touchmove', onResizeMove, { passive: true });
            document.addEventListener('mouseup', onResizeEnd);
            document.addEventListener('touchend', onResizeEnd);
        },

        initKeyboard: function() {
            document.addEventListener('keydown', (e) => {
                if (!this.modal || !this.modal.classList.contains('show')) return;
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

                if (e.key === 'Escape') {
                    this.close();
                    return;
                }

                // Trigger visual click feedback on corresponding button
                const triggerKeyBtn = (selector) => {
                    const b = this.buttonsContainer?.querySelector(selector);
                    if (b) {
                        b.classList.add('calc-active');
                        setTimeout(() => b.classList.remove('calc-active'), 120);
                    }
                };

                if (e.key >= '0' && e.key <= '9') {
                    triggerKeyBtn(`.calc-btn.num[data-val="${e.key}"]`);
                    this.handleInput(e.key);
                } else if (e.key === '.') {
                    triggerKeyBtn(`.calc-btn.decimal`);
                    this.handleInput('.');
                } else if (e.key === '+') {
                    triggerKeyBtn(`.calc-btn.operator[data-val="+"]`);
                    this.handleInput('+');
                } else if (e.key === '-') {
                    triggerKeyBtn(`.calc-btn.operator[data-val="-"]`);
                    this.handleInput('-');
                } else if (e.key === '*' || e.key === 'x') {
                    triggerKeyBtn(`.calc-btn.operator[data-val="×"]`);
                    this.handleInput('×');
                } else if (e.key === '/') {
                    triggerKeyBtn(`.calc-btn.operator[data-val="÷"]`);
                    this.handleInput('÷');
                } else if (e.key === '%' || e.key === '^') {
                    this.handleInput(e.key);
                } else if (e.key === '(' || e.key === ')') {
                    triggerKeyBtn(`.calc-btn.paren[data-val="${e.key}"]`);
                    this.handleInput(e.key);
                } else if (e.key === 'Enter' || e.key === '=') {
                    e.preventDefault();
                    triggerKeyBtn(`.calc-btn.equals`);
                    this.handleInput('=');
                } else if (e.key === 'Backspace') {
                    triggerKeyBtn(`.calc-btn.backspace`);
                    this.handleInput('back');
                }
            });
        },

        /* =========================================================================
           Offline Shunting-Yard Parser & Evaluator (100% Client-Side Parity)
           ========================================================================= */
        evaluate: function() {
            if (!this.expression || this.expression === 'Error') return;

            // Auto-close missing parentheses
            let openParen = (this.expression.match(/\(/g) || []).length;
            let closeParen = (this.expression.match(/\)/g) || []).length;
            if (openParen > closeParen) {
                this.expression += ')'.repeat(openParen - closeParen);
            }

            try {
                const res = this.shuntingYardEvaluate(this.expression, this.angleUnit);
                if (isNaN(res) || !isFinite(res)) {
                    this.result = 'Error';
                } else {
                    let formatted;
                    if (Number.isInteger(res)) {
                        formatted = res.toString();
                    } else {
                        formatted = parseFloat(res.toFixed(10)).toString();
                    }
                    this.result = formatted;
                    // When '=' is pressed, expression shows the committed result for chaining
                    this.expression = formatted;
                }
                this.isResultDisplayed = true;
                this.updateDisplay();
            } catch (err) {
                this.serverEvaluateFallback();
            }
        },

        serverEvaluateFallback: async function() {
            try {
                const response = await fetch('/api/calculate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.csrfToken
                    },
                    body: JSON.stringify({
                        expression: this.expression,
                        angle_unit: this.angleUnit,
                        type: this.type,
                        csrf_token: this.csrfToken
                    })
                });
                const data = await response.json();
                if (data.success) {
                    this.result = data.result.toString();
                    this.expression = this.result;
                } else {
                    this.result = 'Error';
                }
            } catch (e) {
                this.result = 'Error';
            }
            this.isResultDisplayed = true;
            this.updateDisplay();
        },

        shuntingYardEvaluate: function(rawExpr, angleUnit) {
            // Replace display symbols with parser identifiers
            let expr = rawExpr
                .replace(/arcsin\(/gi, 'asin(')
                .replace(/arccos\(/gi, 'acos(')
                .replace(/arctan\(/gi, 'atan(')
                .replace(/sin⁻¹\(/g, 'asin(')
                .replace(/cos⁻¹\(/g, 'acos(')
                .replace(/tan⁻¹\(/g, 'atan(')
                .replace(/√\(/g, 'sqrt(')
                .replace(/∛\(/g, 'cbrt(')
                .replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)')
                .replace(/∛(\d+(?:\.\d+)?)/g, 'cbrt($1)')
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/−/g, '-')
                .replace(/π/g, 'pi')
                .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

            // Factorial helper
            const factorial = (n) => {
                if (n < 0 || Math.floor(n) !== n) throw new Error("Factorial error");
                if (n > 100) throw new Error("Factorial overflow");
                let r = 1;
                for (let i = 2; i <= n; i++) r *= i;
                return r;
            };

            const toRad = (deg) => (deg * Math.PI) / 180;
            const toDeg = (rad) => (rad * 180) / Math.PI;

            // Tokenizer
            const tokens = [];
            let i = 0;
            while (i < expr.length) {
                const ch = expr[i];

                if (/\s/.test(ch)) {
                    i++;
                    continue;
                }

                // Numbers
                if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] || ''))) {
                    let numStr = '';
                    while (i < expr.length && (/[\d\.]/.test(expr[i]))) {
                        numStr += expr[i++];
                    }
                    tokens.push({ type: 'NUM', val: parseFloat(numStr) });
                    continue;
                }

                // Identifiers (functions or constants)
                if (/[a-zA-Z]/.test(ch)) {
                    let id = '';
                    while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
                        id += expr[i++];
                    }
                    if (id === 'pi') {
                        tokens.push({ type: 'NUM', val: Math.PI });
                    } else if (id === 'e') {
                        tokens.push({ type: 'NUM', val: Math.E });
                    } else {
                        tokens.push({ type: 'FUNC', val: id.toLowerCase() });
                    }
                    continue;
                }

                // Operators
                if (['+', '-', '*', '/', '^', '%', '!', '(', ')', ','].includes(ch)) {
                    // Check for unary minus: at start or after operator / (
                    if (ch === '-') {
                        const prev = tokens[tokens.length - 1];
                        if (!prev || prev.type === 'OP' || (prev.type === 'P' && prev.val === '(')) {
                            tokens.push({ type: 'OP', val: 'neg', prec: 4, assoc: 'R' });
                            i++;
                            continue;
                        }
                    }

                    if (ch === '!') {
                        tokens.push({ type: 'POSTFIX', val: '!', prec: 5 });
                    } else if (ch === '(' || ch === ')') {
                        tokens.push({ type: 'P', val: ch });
                    } else if (ch === ',') {
                        tokens.push({ type: 'COMMA', val: ',' });
                    } else {
                        const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }[ch];
                        const assoc = ch === '^' ? 'R' : 'L';
                        tokens.push({ type: 'OP', val: ch, prec: prec, assoc: assoc });
                    }
                    i++;
                    continue;
                }

                throw new Error("Invalid token: " + ch);
            }

            // Shunting Yard to Reverse Polish Notation (RPN)
            const output = [];
            const opStack = [];

            for (let tok of tokens) {
                if (tok.type === 'NUM') {
                    output.push(tok);
                } else if (tok.type === 'FUNC') {
                    opStack.push(tok);
                } else if (tok.type === 'POSTFIX') {
                    output.push(tok);
                } else if (tok.type === 'OP') {
                    while (opStack.length > 0) {
                        const top = opStack[opStack.length - 1];
                        if (top.type === 'FUNC') {
                            output.push(opStack.pop());
                        } else if (top.type === 'OP') {
                            if ((tok.assoc === 'L' && tok.prec <= top.prec) ||
                                (tok.assoc === 'R' && tok.prec < top.prec)) {
                                output.push(opStack.pop());
                            } else break;
                        } else break;
                    }
                    opStack.push(tok);
                } else if (tok.type === 'P' && tok.val === '(') {
                    opStack.push(tok);
                } else if (tok.type === 'P' && tok.val === ')') {
                    while (opStack.length > 0 && !(opStack[opStack.length - 1].type === 'P' && opStack[opStack.length - 1].val === '(')) {
                        output.push(opStack.pop());
                    }
                    if (opStack.length === 0) throw new Error("Mismatched parentheses");
                    opStack.pop(); // Pop '('
                    if (opStack.length > 0 && opStack[opStack.length - 1].type === 'FUNC') {
                        output.push(opStack.pop());
                    }
                }
            }

            while (opStack.length > 0) {
                const top = opStack.pop();
                if (top.type === 'P') throw new Error("Mismatched parentheses");
                output.push(top);
            }

            // RPN Evaluation
            const evalStack = [];
            for (let tok of output) {
                if (tok.type === 'NUM') {
                    evalStack.push(tok.val);
                } else if (tok.type === 'POSTFIX' && tok.val === '!') {
                    if (evalStack.length < 1) throw new Error("Operand missing for !");
                    const a = evalStack.pop();
                    evalStack.push(factorial(a));
                } else if (tok.type === 'OP' && tok.val === 'neg') {
                    if (evalStack.length < 1) throw new Error("Operand missing for -");
                    evalStack.push(-evalStack.pop());
                } else if (tok.type === 'OP') {
                    if (evalStack.length < 2) throw new Error("Operands missing for " + tok.val);
                    const b = evalStack.pop();
                    const a = evalStack.pop();
                    switch (tok.val) {
                        case '+': evalStack.push(a + b); break;
                        case '-': evalStack.push(a - b); break;
                        case '*': evalStack.push(a * b); break;
                        case '/':
                            if (b === 0) throw new Error("Division by zero");
                            evalStack.push(a / b);
                            break;
                        case '%': evalStack.push(a % b); break;
                        case '^': evalStack.push(Math.pow(a, b)); break;
                        default: throw new Error("Unknown op: " + tok.val);
                    }
                } else if (tok.type === 'FUNC') {
                    if (evalStack.length < 1) throw new Error("Missing arg for " + tok.val);
                    const x = evalStack.pop();
                    const isDeg = angleUnit === 'deg';
                    switch (tok.val) {
                        case 'sin': evalStack.push(Math.sin(isDeg ? toRad(x) : x)); break;
                        case 'cos': evalStack.push(Math.cos(isDeg ? toRad(x) : x)); break;
                        case 'tan': evalStack.push(Math.tan(isDeg ? toRad(x) : x)); break;
                        case 'asin':
                        case 'arcsin':
                            if (x < -1 || x > 1) throw new Error("Domain error");
                            evalStack.push(isDeg ? toDeg(Math.asin(x)) : Math.asin(x));
                            break;
                        case 'acos':
                        case 'arccos':
                            if (x < -1 || x > 1) throw new Error("Domain error");
                            evalStack.push(isDeg ? toDeg(Math.acos(x)) : Math.acos(x));
                            break;
                        case 'atan':
                        case 'arctan':
                            evalStack.push(isDeg ? toDeg(Math.atan(x)) : Math.atan(x));
                            break;
                        case 'sinh': evalStack.push(Math.sinh(x)); break;
                        case 'cosh': evalStack.push(Math.cosh(x)); break;
                        case 'tanh': evalStack.push(Math.tanh(x)); break;
                        case 'sqrt':
                            if (x < 0) throw new Error("Negative square root");
                            evalStack.push(Math.sqrt(x));
                            break;
                        case 'cbrt': evalStack.push(Math.cbrt(x)); break;
                        case 'ln':
                            if (x <= 0) throw new Error("Log non-positive");
                            evalStack.push(Math.log(x));
                            break;
                        case 'log':
                        case 'log10':
                            if (x <= 0) throw new Error("Log non-positive");
                            evalStack.push(Math.log10(x));
                            break;
                        case 'abs': evalStack.push(Math.abs(x)); break;
                        case 'exp': evalStack.push(Math.exp(x)); break;
                        default: throw new Error("Unknown func: " + tok.val);
                    }
                }
            }

            if (evalStack.length !== 1) throw new Error("Malformed expression");
            return evalStack[0];
        }
    };

    // Global bridge for templates & legacy calls
    window.CogniTaraCalculator = CogniTaraCalculator;
    window.openCalculator = function() { CogniTaraCalculator.open(); };
    window.closeCalculator = function() { CogniTaraCalculator.close(); };
    window.handleCalcButton = function(v) { CogniTaraCalculator.handleInput(v); };
    window.appendToExpression = function(v) { CogniTaraCalculator.append(v); };
    window.evaluateExpression = function() { CogniTaraCalculator.evaluate(); };

})(window);
