/**
 * CogniTara KaTeX Interactive In-Box Formula Editor & Visual Studio
 * Converts LaTeX formulas into visual interactive preview pills inside contenteditable question/option boxes.
 * Teachers can easily create, view, and edit mathematical formulas (like fractions with numerator and denominator)
 * with zero raw code confusion.
 */
(function(window, document) {
    'use strict';

    /**
     * Balanced brace extractor for LaTeX expressions like \frac{num}{den} or \sqrt{x}
     */
    function extractBalancedBraces(str, startIndex) {
        if (!str || startIndex >= str.length || str[startIndex] !== '{') return null;
        let depth = 0;
        for (let i = startIndex; i < str.length; i++) {
            if (str[i] === '{' && (i === 0 || str[i-1] !== '\\')) {
                depth++;
            } else if (str[i] === '}' && (i === 0 || str[i-1] !== '\\')) {
                depth--;
                if (depth === 0) {
                    return {
                        content: str.substring(startIndex + 1, i),
                        endIndex: i
                    };
                }
            }
        }
        return null;
    }

    /**
     * Parse fraction: \frac{num}{den} or \dfrac{num}{den} with optional whole number prefix
     */
    function parseFraction(latex) {
        if (!latex) return null;
        const trimmed = latex.trim();
        const fracIdx = trimmed.indexOf('\\frac');
        const dfracIdx = trimmed.indexOf('\\dfrac');
        const startIdx = fracIdx !== -1 ? fracIdx + 5 : (dfracIdx !== -1 ? dfracIdx + 6 : -1);
        if (startIdx === -1) return null;

        const prefix = trimmed.substring(0, fracIdx !== -1 ? fracIdx : dfracIdx).trim();

        let firstBrace = trimmed.indexOf('{', startIdx);
        if (firstBrace === -1) {
            // Handle single character fraction like \frac12
            const rem = trimmed.substring(startIdx).trim();
            if (rem.length >= 2) {
                return {
                    type: 'fraction',
                    whole: prefix,
                    numerator: rem[0],
                    denominator: rem[1]
                };
            }
            return null;
        }
        const num = extractBalancedBraces(trimmed, firstBrace);
        if (!num) return null;

        let secondBrace = trimmed.indexOf('{', num.endIndex + 1);
        if (secondBrace === -1) {
            const rem = trimmed.substring(num.endIndex + 1).trim();
            if (rem.length >= 1) {
                return {
                    type: 'fraction',
                    whole: prefix,
                    numerator: num.content,
                    denominator: rem[0]
                };
            }
            return null;
        }
        const den = extractBalancedBraces(trimmed, secondBrace);
        if (!den) return null;

        return {
            type: 'fraction',
            whole: prefix,
            numerator: num.content,
            denominator: den.content
        };
    }

    /**
     * Parse roots: \sqrt{x} or \sqrt[n]{x}
     */
    function parseRoot(latex) {
        if (!latex) return null;
        const trimmed = latex.trim();
        const sqrtIdx = trimmed.indexOf('\\sqrt');
        if (sqrtIdx === -1) return null;

        let afterSqrt = trimmed.substring(sqrtIdx + 5).trim();
        let degree = '';
        let radicand = '';

        if (afterSqrt.startsWith('[')) {
            const closeBracket = afterSqrt.indexOf(']');
            if (closeBracket !== -1) {
                degree = afterSqrt.substring(1, closeBracket).trim();
                afterSqrt = afterSqrt.substring(closeBracket + 1).trim();
            }
        }

        if (afterSqrt.startsWith('{')) {
            const rad = extractBalancedBraces(afterSqrt, 0);
            if (rad) radicand = rad.content;
        } else {
            radicand = afterSqrt.trim();
        }

        return {
            type: 'root',
            degree: degree,
            radicand: radicand
        };
    }

    /**
     * Parse power: base^{exp} or base^exp
     */
    function parsePower(latex) {
        if (!latex || !latex.includes('^')) return null;
        const trimmed = latex.trim();
        if (trimmed.startsWith('\\sum') || trimmed.startsWith('\\int') || trimmed.startsWith('\\prod')) return null;
        
        const caretIdx = trimmed.lastIndexOf('^');
        if (caretIdx <= 0) return null;

        const base = trimmed.substring(0, caretIdx).trim();
        let exp = trimmed.substring(caretIdx + 1).trim();
        if (exp.startsWith('{') && exp.endsWith('}')) {
            exp = exp.substring(1, exp.length - 1).trim();
        }

        return {
            type: 'power',
            base: base,
            exponent: exp
        };
    }

    /**
     * Parse subscript: base_{sub} or base_sub
     */
    function parseSubscript(latex) {
        if (!latex || !latex.includes('_')) return null;
        const trimmed = latex.trim();
        if (trimmed.startsWith('\\sum') || trimmed.startsWith('\\int') || trimmed.startsWith('\\prod') || trimmed.startsWith('\\ce')) return null;

        const underIdx = trimmed.lastIndexOf('_');
        if (underIdx <= 0) return null;

        const base = trimmed.substring(0, underIdx).trim();
        let sub = trimmed.substring(underIdx + 1).trim();
        if (sub.startsWith('{') && sub.endsWith('}')) {
            sub = sub.substring(1, sub.length - 1).trim();
        }

        return {
            type: 'subscript',
            base: base,
            subscript: sub
        };
    }

    /**
     * Parse chemistry: \ce{formula}
     */
    function parseChemistry(latex) {
        if (!latex) return null;
        const trimmed = latex.trim();
        if (trimmed.startsWith('\\ce{') && trimmed.endsWith('}')) {
            return {
                type: 'chemistry',
                formula: trimmed.substring(4, trimmed.length - 1).trim()
            };
        }
        return null;
    }

    /**
     * Auto-detect formula type from LaTeX string
     */
    function detectFormulaType(latex) {
        if (!latex) return { type: 'fraction', whole: '', numerator: 'a', denominator: 'b' };
        const chem = parseChemistry(latex);
        if (chem) return chem;
        const frac = parseFraction(latex);
        if (frac) return frac;
        const root = parseRoot(latex);
        if (root) return root;
        const pow = parsePower(latex);
        if (pow) return pow;
        const sub = parseSubscript(latex);
        if (sub) return sub;
        return { type: 'general', latex: latex.trim() };
    }

    const CogniTaraKaTeX = {
        activeEditorId: null,
        currentPill: null,
        modalEl: null,
        isInitialized: false,
        activeTab: 'fraction',
        lastFocusedInput: null,
        savedRange: null,

        /**
         * Initialize editors on the page
         */
        init: function(editorIds) {
            this.ensureModal();
            this.injectStyles();

            if (!Array.isArray(editorIds)) {
                editorIds = ['qEditor', 'optA', 'optB', 'optC', 'optD', 'expEditor', 'gQ', 'gA', 'gB', 'gC', 'gD', 'questionText', 'groupQuestionText'];
            }

            const self = this;
            editorIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    self.attachToEditor(el);
                    self.convertFormulasToPills(el);
                }
            });

            // Also convert any other contenteditable areas on page
            document.querySelectorAll('.editor-area, [contenteditable="true"]').forEach(el => {
                self.attachToEditor(el);
                self.convertFormulasToPills(el);
            });

            // Prevent toolbar buttons from stealing editor selection focus on mousedown
            document.addEventListener('mousedown', function(e) {
                const btn = e.target.closest('.f-btn, .fb-sym, .fb-quick-chip, .fb-preset-chip, .fb-symbol-btn');
                if (btn) {
                    e.preventDefault();
                }
            }, true);

            this.isInitialized = true;
        },

        /**
         * Save current selection inside an editor
         */
        saveSelection: function(editor) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (editor && editor.contains(range.commonAncestorContainer)) {
                    this.savedRange = range.cloneRange();
                    this.activeEditorId = editor.id || this.activeEditorId;
                }
            }
        },

        /**
         * Safely get the active contenteditable editor element
         */
        getActiveEditorElement: function(preferredId) {
            const targetId = preferredId || this.activeEditorId;
            if (targetId) {
                const el = document.getElementById(targetId);
                if (el) return el;
            }
            // Check active focused element
            if (document.activeElement && (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'TEXTAREA' || (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text'))) {
                return document.activeElement;
            }
            // If an active Bootstrap modal is showing, look inside it first
            const activeModal = document.querySelector('.modal.show');
            if (activeModal) {
                const modalEd = activeModal.querySelector('.editor-area') || activeModal.querySelector('[contenteditable="true"]');
                if (modalEd) return modalEd;
            }
            // Check well-known IDs
            const candidates = ['qEditor', 'gQ', 'questionText', 'groupQuestionText', 'optA', 'optB', 'optC', 'optD', 'gA', 'gB', 'gC', 'gD', 'expEditor'];
            for (const id of candidates) {
                const el = document.getElementById(id);
                if (el && (el.offsetParent !== null || el.clientHeight > 0)) {
                    return el;
                }
            }
            return document.querySelector('.editor-area') || document.querySelector('[contenteditable="true"]');
        },

        /**
         * Attach listeners to a contenteditable editor
         */
        attachToEditor: function(editor) {
            if (!editor) return;
            if (editor.dataset.katexAttached === 'true') return;
            editor.dataset.katexAttached = 'true';

            const self = this;

            editor.addEventListener('focus', function() {
                self.activeEditorId = this.id;
                // Only save selection on focus if we don't already have an active savedRange inside this editor
                if (!self.savedRange || !this.contains(self.savedRange.commonAncestorContainer)) {
                    self.saveSelection(this);
                }
            });

            editor.addEventListener('mouseup', function() {
                self.activeEditorId = this.id;
                self.saveSelection(this);
            });

            editor.addEventListener('click', function() {
                self.activeEditorId = this.id;
                self.saveSelection(this);
            });

            editor.addEventListener('input', function() {
                self.activeEditorId = this.id;
                self.saveSelection(this);
            });

            editor.addEventListener('paste', function() {
                setTimeout(() => {
                    self.convertFormulasToPills(editor);
                    self.notifyEditorChanged(editor.id);
                }, 60);
            });

            editor.addEventListener('keyup', function(e) {
                self.saveSelection(editor);
                if (e.key === '$' || e.key === ' ' || e.key === 'Enter') {
                    self.checkAndConvertInlineMath(editor);
                }
            });
        },

        /**
         * Trigger template change synchronization
         */
        notifyEditorChanged: function(editorId) {
            if (typeof window.updateHidden === 'function') {
                window.updateHidden(editorId);
            } else if (typeof window.syncEditor === 'function') {
                window.syncEditor(editorId);
            } else if (typeof window.upd === 'function') {
                window.upd(editorId);
            }
        },

        /**
         * Render LaTeX string to HTML using KaTeX
         */
        renderLatex: function(latex, isDisplay) {
            if (!latex) return '';
            if (typeof window.katex !== 'undefined' && window.katex.renderToString) {
                try {
                    return window.katex.renderToString(latex, {
                        displayMode: !!isDisplay,
                        throwOnError: false
                    });
                } catch (err) {
                    console.warn('KaTeX render error:', err);
                }
            }
            return `<span class="katex-fallback">${latex.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
        },

        /**
         * Create an interactive preview pill DOM element
         */
        createMathPill: function(latex, isDisplay) {
            const self = this;
            const pill = document.createElement('span');
            pill.className = 'katex-editor-pill';
            pill.contentEditable = 'false';
            pill.setAttribute('data-latex', latex);
            pill.setAttribute('data-display', isDisplay ? 'true' : 'false');
            pill.title = 'Click to edit numerator, denominator or formula';

            const preview = document.createElement('span');
            preview.className = 'pill-preview';
            preview.innerHTML = self.renderLatex(latex, isDisplay);
            pill.appendChild(preview);

            // Edit icon
            const editBtn = document.createElement('span');
            editBtn.className = 'pill-action-btn pill-edit-btn';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.title = 'Edit Formula';
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.openEditorForPill(pill);
            });
            pill.appendChild(editBtn);

            // Quick delete icon
            const delBtn = document.createElement('span');
            delBtn.className = 'pill-action-btn pill-delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete Formula';
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const editor = pill.closest('.editor-area') || 
                               (pill.parentElement ? pill.parentElement.closest('[contenteditable="true"]') : null) || 
                               self.getActiveEditorElement();
                if (pill.parentNode) pill.parentNode.removeChild(pill);
                if (editor) {
                    self.notifyEditorChanged(editor.id);
                }
            });
            pill.appendChild(delBtn);

            // Clicking pill opens the Visual Formula Builder
            pill.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.openEditorForPill(pill);
            });

            pill.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.openEditorForPill(pill);
            });

            return pill;
        },

        /**
         * Insert a formula preview pill at current selection cursor in active editor
         */
        insertFormula: function(latex, isDisplay, targetEditorId) {
            const editor = this.getActiveEditorElement(targetEditorId);
            if (!editor) {
                console.warn('CogniTaraKaTeX: No active question box found for formula insertion');
                return;
            }
            this.activeEditorId = editor.id;

            // Support plain textarea or input
            if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
                editor.focus();
                const formatted = isDisplay ? `\n$$${latex}$$\n` : `\\(${latex}\\)`;
                const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : (editor.value || '').length;
                const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;
                const val = editor.value || '';
                editor.value = val.substring(0, start) + formatted + val.substring(end);
                editor.selectionStart = editor.selectionEnd = start + formatted.length;
                this.notifyEditorChanged(editor.id);
                return;
            }

            const pill = this.createMathPill(latex, isDisplay);
            const spacer = document.createTextNode('\u00A0');

            let inserted = false;
            let range = null;

            // CRITICAL CURSOR POSITION FIX:
            // Check if savedRange is valid and still contained in the active editor
            if (this.savedRange && editor.contains(this.savedRange.commonAncestorContainer)) {
                range = this.savedRange;
            } else {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                    range = sel.getRangeAt(0);
                }
            }

            if (range) {
                try {
                    range.deleteContents();
                    range.insertNode(pill);
                    if (pill.nextSibling) {
                        pill.parentNode.insertBefore(spacer, pill.nextSibling);
                    } else {
                        pill.parentNode.appendChild(spacer);
                    }
                    const newRange = document.createRange();
                    newRange.setStartAfter(spacer);
                    newRange.collapse(true);
                    
                    const sel = window.getSelection();
                    if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                    this.savedRange = newRange;
                    inserted = true;
                } catch (err) {
                    console.warn('Range insertion error:', err);
                }
            }

            if (!inserted) {
                // Fallback: append at the end
                editor.appendChild(pill);
                editor.appendChild(spacer);
                const newRange = document.createRange();
                newRange.setStartAfter(spacer);
                newRange.collapse(true);
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                this.savedRange = newRange;
            }

            // Restore focus safely and keep cursor after inserted formula
            editor.focus();
            if (this.savedRange) {
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(this.savedRange);
                }
            }

            this.notifyEditorChanged(editor.id);
        },

        /**
         * Convert existing raw math formulas in container into preview pills
         */
        convertFormulasToPills: function(container) {
            if (!container) return;
            const self = this;

            // 1. Spans with data-math-source
            const mathSpans = container.querySelectorAll('span[data-math-source]');
            mathSpans.forEach(span => {
                const latex = span.getAttribute('data-math-source');
                const isDisplay = span.getAttribute('data-math-display') === 'true';
                if (latex) {
                    const pill = self.createMathPill(latex, isDisplay);
                    span.parentNode.replaceChild(pill, span);
                }
            });

            // 2. Scan text nodes for raw LaTeX delimiters or bare LaTeX commands
            const textNodes = [];
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
                acceptNode: function(node) {
                    if (node.parentElement && node.parentElement.closest('.katex-editor-pill')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (node.nodeValue && (/[\$\\]/.test(node.nodeValue))) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            });

            let current;
            while ((current = walker.nextNode())) {
                textNodes.push(current);
            }

            const regex = /(\$\$([\s\S]+?)\$\$)|(\$([^\$\n\r]+?)\$)|(\\\[([\s\S]+?)\\\])|(\\\(([\s\S]+?)\\\))|(\\ce\{[\s\S]+?\})|(\\(?:frac|dfrac)\{[^{}]*\}\{[^{}]*\})|(\\(?:sqrt)(?:\[[0-9]+\])?\{[^{}]*\})/g;

            textNodes.forEach(node => {
                const text = node.nodeValue;
                if (!regex.test(text)) return;
                regex.lastIndex = 0;

                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                let match;

                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                        frag.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                    }

                    let latex = '';
                    let isDisplay = false;

                    if (match[1]) {
                        latex = match[2];
                        isDisplay = true;
                    } else if (match[3]) {
                        latex = match[4];
                        isDisplay = false;
                    } else if (match[5]) {
                        latex = match[6];
                        isDisplay = true;
                    } else if (match[7]) {
                        latex = match[8];
                        isDisplay = false;
                    } else if (match[9] || match[10] || match[11]) {
                        latex = match[9] || match[10] || match[11];
                        isDisplay = false;
                    }

                    if (latex && latex.trim()) {
                        const pill = self.createMathPill(latex.trim(), isDisplay);
                        frag.appendChild(pill);
                    } else {
                        frag.appendChild(document.createTextNode(match[0]));
                    }

                    lastIndex = regex.lastIndex;
                }

                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.substring(lastIndex)));
                }

                if (node.parentNode) {
                    node.parentNode.replaceChild(frag, node);
                }
            });
        },

        /**
         * Scan editor for completed inline math like $...$ typed by user
         */
        checkAndConvertInlineMath: function(editor) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const node = sel.anchorNode;
            if (!node || node.nodeType !== Node.TEXT_NODE) return;
            if (node.parentElement && node.parentElement.closest('.katex-editor-pill')) return;

            const text = node.nodeValue || '';
            const match = text.match(/\$([^\$\n\r]+?)\$/);
            if (match) {
                this.convertFormulasToPills(editor);
                this.notifyEditorChanged(editor.id);
            }
        },

        /**
         * Serialize editor HTML to standard math storage format (for form submission)
         */
        serializeEditor: function(editor) {
            if (!editor) return '';
            const clone = editor.cloneNode(true);

            clone.querySelectorAll('.katex-editor-pill').forEach(pill => {
                const latex = pill.getAttribute('data-latex') || '';
                const isDisplay = pill.getAttribute('data-display') === 'true';
                const span = document.createElement('span');
                span.setAttribute('data-math-source', latex);
                span.setAttribute('data-math-display', isDisplay ? 'true' : 'false');
                if (isDisplay) {
                    span.innerHTML = `\\[${latex}\\]`;
                } else {
                    span.innerHTML = `\\(${latex}\\)`;
                }
                if (pill.parentNode) {
                    pill.parentNode.replaceChild(span, pill);
                }
            });

            return clone.innerHTML;
        },

        /**
         * Switch visual template tab in the popover
         */
        switchTab: function(tabName) {
            this.activeTab = tabName;
            const modal = this.modalEl;
            if (!modal) return;

            // Update formula type dropdown if present
            const typeSelect = document.getElementById('fbFormulaTypeSelect');
            if (typeSelect && typeSelect.value !== tabName) {
                typeSelect.value = tabName;
            }

            // Update tab buttons if present
            modal.querySelectorAll('.fb-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
            });

            // Update tab panels
            modal.querySelectorAll('.fb-tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.getAttribute('data-tab-content') === tabName);
            });

            // Focus first relevant input
            setTimeout(() => {
                let targetInput = null;
                if (tabName === 'fraction') targetInput = document.getElementById('fbFracNum');
                else if (tabName === 'root') targetInput = document.getElementById('fbRootRadicand');
                else if (tabName === 'power') targetInput = document.getElementById('fbPowerBase');
                else if (tabName === 'subscript') targetInput = document.getElementById('fbSubBase');
                else if (tabName === 'chemistry') targetInput = document.getElementById('fbChemFormula');
                else if (tabName === 'general') targetInput = document.getElementById('katexPopoverInput');

                if (targetInput) {
                    targetInput.focus();
                    if (targetInput.select) targetInput.select();
                    this.lastFocusedInput = targetInput;
                }
            }, 60);

            this.syncFromTemplateToLatex();
        },

        /**
         * Open the Visual Formula Builder for a specific template (Toolbar click)
         */
        openBuilderWithTemplate: function(templateName, presetVal, targetEditorId) {
            this.ensureModal();
            this.currentPill = null;
            if (targetEditorId) {
                this.activeEditorId = targetEditorId;
            } else {
                const ed = this.getActiveEditorElement();
                if (ed) this.activeEditorId = ed.id;
            }

            // Save range if editor currently has an active range
            const ed = this.getActiveEditorElement();
            if (ed) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && ed.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                    this.savedRange = sel.getRangeAt(0).cloneRange();
                }
            }

            this.resetVisualInputs();

            const selectedType = templateName || 'fraction';

            if (selectedType === 'fraction') {
                document.getElementById('fbFracNum').value = 'a';
                document.getElementById('fbFracDen').value = 'b';
            } else if (selectedType === 'root') {
                if (presetVal) document.getElementById('fbRootDegree').value = presetVal;
                document.getElementById('fbRootRadicand').value = 'x';
            } else if (selectedType === 'power') {
                document.getElementById('fbPowerBase').value = 'x';
                document.getElementById('fbPowerExp').value = presetVal || 'n';
            } else if (selectedType === 'subscript') {
                document.getElementById('fbSubBase').value = 'x';
                document.getElementById('fbSubIndex').value = presetVal || 'n';
            } else if (selectedType === 'chemistry') {
                document.getElementById('fbChemFormula').value = presetVal || 'H2O';
            } else if (selectedType === 'general') {
                document.getElementById('katexPopoverInput').value = presetVal || '';
            }

            this.switchTab(selectedType);
            this.syncFromTemplateToLatex();

            this.modalEl.classList.add('show');
            this.modalEl.style.setProperty('display', 'flex', 'important');
            const delBtn = document.getElementById('katexPopoverDeleteBtn');
            if (delBtn) delBtn.style.display = 'none';

            const titleEl = document.getElementById('katexModalActionTitle');
            if (titleEl) titleEl.textContent = 'Formulas';
            const applyBtnText = document.getElementById('katexApplyBtnText');
            if (applyBtnText) applyBtnText.textContent = 'Insert into Question';
        },

        /**
         * Reset all visual input fields
         */
        resetVisualInputs: function() {
            ['fbFracWhole', 'fbFracNum', 'fbFracDen', 'fbRootDegree', 'fbRootRadicand', 
             'fbPowerBase', 'fbPowerExp', 'fbSubBase', 'fbSubIndex', 'fbChemFormula', 'katexPopoverInput'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const displayCheck = document.getElementById('katexPopoverDisplayCheck');
            if (displayCheck) displayCheck.checked = false;
        },

        /**
         * Open the popover to edit an existing pill
         */
        openEditorForPill: function(pill) {
            this.ensureModal();
            this.currentPill = pill;
            const latex = (pill.getAttribute('data-latex') || '').trim();
            const isDisplay = pill.getAttribute('data-display') === 'true';

            // Find parent editor
            const parentEditor = pill.closest('.editor-area') || 
                                 (pill.parentElement ? pill.parentElement.closest('[contenteditable="true"]') : null) || 
                                 this.getActiveEditorElement();
            if (parentEditor) {
                this.activeEditorId = parentEditor.id;
                // Create a range pointing right to this pill
                const range = document.createRange();
                range.selectNode(pill);
                this.savedRange = range;
            }

            this.resetVisualInputs();

            const parsed = detectFormulaType(latex);

            if (parsed.type === 'fraction') {
                document.getElementById('fbFracWhole').value = parsed.whole || '';
                document.getElementById('fbFracNum').value = parsed.numerator || '';
                document.getElementById('fbFracDen').value = parsed.denominator || '';
                this.switchTab('fraction');
            } else if (parsed.type === 'root') {
                document.getElementById('fbRootDegree').value = parsed.degree || '';
                document.getElementById('fbRootRadicand').value = parsed.radicand || '';
                this.switchTab('root');
            } else if (parsed.type === 'power') {
                document.getElementById('fbPowerBase').value = parsed.base || '';
                document.getElementById('fbPowerExp').value = parsed.exponent || '';
                this.switchTab('power');
            } else if (parsed.type === 'subscript') {
                document.getElementById('fbSubBase').value = parsed.base || '';
                document.getElementById('fbSubIndex').value = parsed.subscript || '';
                this.switchTab('subscript');
            } else if (parsed.type === 'chemistry') {
                document.getElementById('fbChemFormula').value = parsed.formula || '';
                this.switchTab('chemistry');
            } else {
                document.getElementById('katexPopoverInput').value = parsed.latex || latex;
                this.switchTab('general');
            }

            const displayCheck = document.getElementById('katexPopoverDisplayCheck');
            if (displayCheck) displayCheck.checked = isDisplay;

            this.syncFromTemplateToLatex();

            this.modalEl.classList.add('show');
            this.modalEl.style.setProperty('display', 'flex', 'important');
            const delBtn = document.getElementById('katexPopoverDeleteBtn');
            if (delBtn) delBtn.style.display = 'inline-flex';

            const titleEl = document.getElementById('katexModalActionTitle');
            if (titleEl) titleEl.textContent = 'Edit Formula';
            const applyBtnText = document.getElementById('katexApplyBtnText');
            if (applyBtnText) applyBtnText.textContent = 'Update Formula';
        },

        /**
         * Close the popover
         */
        closePopover: function() {
            if (this.modalEl) {
                this.modalEl.classList.remove('show');
                this.modalEl.style.setProperty('display', 'none', 'important');
            }
            this.currentPill = null;
        },

        /**
         * Convert visual inputs of the active tab into standard LaTeX
         */
        syncFromTemplateToLatex: function() {
            const rawInput = document.getElementById('katexPopoverInput');
            if (!rawInput) return;

            let latex = '';

            if (this.activeTab === 'fraction') {
                const whole = (document.getElementById('fbFracWhole').value || '').trim();
                const num = (document.getElementById('fbFracNum').value || '').trim();
                const den = (document.getElementById('fbFracDen').value || '').trim();

                if (num || den) {
                    const fracPart = `\\frac{${num || 'a'}}{${den || 'b'}}`;
                    latex = whole ? `${whole}\\ ${fracPart}` : fracPart;
                }
            } else if (this.activeTab === 'root') {
                const degree = (document.getElementById('fbRootDegree').value || '').trim();
                const rad = (document.getElementById('fbRootRadicand').value || '').trim();
                if (rad || degree) {
                    if (degree) {
                        latex = `\\sqrt[${degree}]{${rad || 'x'}}`;
                    } else {
                        latex = `\\sqrt{${rad || 'x'}}`;
                    }
                }
            } else if (this.activeTab === 'power') {
                const base = (document.getElementById('fbPowerBase').value || '').trim();
                const exp = (document.getElementById('fbPowerExp').value || '').trim();
                if (base || exp) {
                    latex = `${base || 'x'}^{${exp || 'n'}}`;
                }
            } else if (this.activeTab === 'subscript') {
                const base = (document.getElementById('fbSubBase').value || '').trim();
                const sub = (document.getElementById('fbSubIndex').value || '').trim();
                if (base || sub) {
                    latex = `${base || 'x'}_{${sub || '1'}}`;
                }
            } else if (this.activeTab === 'chemistry') {
                const chem = (document.getElementById('fbChemFormula').value || '').trim();
                if (chem) {
                    latex = `\\ce{${chem}}`;
                }
            } else {
                latex = rawInput.value.trim();
            }

            if (this.activeTab !== 'general') {
                rawInput.value = latex;
            }

            this.updatePopoverLivePreview();
        },

        /**
         * Update the live preview inside the popover
         */
        updatePopoverLivePreview: function() {
            const input = document.getElementById('katexPopoverInput');
            const previewEl = document.getElementById('katexPopoverPreviewContent');
            const displayCheck = document.getElementById('katexPopoverDisplayCheck');
            if (!input || !previewEl) return;

            const latex = input.value.trim();
            const isDisplay = displayCheck ? displayCheck.checked : false;

            if (!latex) {
                previewEl.innerHTML = '<span style="color:#94a3b8;font-style:italic;font-size:13px;"><i class="fas fa-pencil-alt" style="margin-right:5px;"></i> Type values in the boxes above to preview student view...</span>';
                return;
            }

            try {
                if (typeof window.katex !== 'undefined' && window.katex.renderToString) {
                    previewEl.innerHTML = window.katex.renderToString(latex, {
                        displayMode: isDisplay,
                        throwOnError: false
                    });
                } else {
                    previewEl.textContent = latex;
                }
            } catch (err) {
                previewEl.innerHTML = `<span style="color:#ef4444;font-size:12px;"><i class="fas fa-exclamation-triangle"></i> Syntax Error: ${err.message}</span>`;
            }
        },

        /**
         * Insert a math symbol into the currently active/focused template input
         */
        insertSymbol: function(symbol) {
            const activeInput = this.lastFocusedInput || document.getElementById('fbFracNum') || document.getElementById('katexPopoverInput');
            if (!activeInput) return;

            const start = activeInput.selectionStart || 0;
            const end = activeInput.selectionEnd || 0;
            const text = activeInput.value || '';

            activeInput.value = text.substring(0, start) + symbol + text.substring(end);
            activeInput.focus();
            const newPos = start + symbol.length;
            if (activeInput.setSelectionRange) {
                activeInput.setSelectionRange(newPos, newPos);
            }

            this.syncFromTemplateToLatex();
        },

        /**
         * Preset helper for Chemistry
         */
        setChemPreset: function(preset) {
            const input = document.getElementById('fbChemFormula');
            if (input) {
                input.value = preset;
                input.focus();
                this.syncFromTemplateToLatex();
            }
        },

        /**
         * Apply changes from the popover to the question box
         */
        applyPopoverChanges: function() {
            this.syncFromTemplateToLatex();
            const input = document.getElementById('katexPopoverInput');
            const displayCheck = document.getElementById('katexPopoverDisplayCheck');
            if (!input) return;

            const latex = input.value.trim();
            if (!latex) {
                alert('Please enter formula values.');
                return;
            }

            const isDisplay = displayCheck ? displayCheck.checked : false;

            if (this.currentPill && this.currentPill.parentNode) {
                // Update existing pill in-place
                this.currentPill.setAttribute('data-latex', latex);
                this.currentPill.setAttribute('data-display', isDisplay ? 'true' : 'false');
                const preview = this.currentPill.querySelector('.pill-preview');
                if (preview) {
                    preview.innerHTML = this.renderLatex(latex, isDisplay);
                }
                const editor = this.currentPill.closest('.editor-area') || 
                               (this.currentPill.parentElement ? this.currentPill.parentElement.closest('[contenteditable="true"]') : null) || 
                               this.getActiveEditorElement();
                
                // Position cursor and savedRange immediately AFTER the updated pill
                const newRange = document.createRange();
                newRange.setStartAfter(this.currentPill);
                newRange.collapse(true);
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                this.savedRange = newRange;

                if (editor) {
                    editor.focus();
                    if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                    this.notifyEditorChanged(editor.id);
                }
            } else {
                // Insert brand new pill right at cursor position
                this.insertFormula(latex, isDisplay);
            }

            this.closePopover();
        },

        /**
         * Remove the currently edited pill from the question box
         */
        removeCurrentPill: function() {
            if (this.currentPill) {
                const editor = this.currentPill.closest('.editor-area') || 
                               (this.currentPill.parentElement ? this.currentPill.parentElement.closest('[contenteditable="true"]') : null) || 
                               this.getActiveEditorElement();
                const pill = this.currentPill;
                this.closePopover();
                if (pill.parentNode) {
                    pill.parentNode.removeChild(pill);
                }
                if (editor) {
                    this.notifyEditorChanged(editor.id);
                }
            } else {
                this.closePopover();
            }
        },

        /**
         * Inject HTML for formula editing popover
         */
        ensureModal: function() {
            if (document.getElementById('katexFormulaPopoverModal')) {
                this.modalEl = document.getElementById('katexFormulaPopoverModal');
                return;
            }

            const self = this;
            const modal = document.createElement('div');
            modal.id = 'katexFormulaPopoverModal';
            modal.className = 'katex-formula-popover-backdrop';
            modal.style.setProperty('display', 'none', 'important');

            modal.innerHTML = `
                <div class="katex-formula-popover-card" onclick="event.stopPropagation()">
                    <!-- Header -->
                    <div class="katex-popover-header">
                        <div class="d-flex align-items-center gap-2">
                            <span class="katex-popover-header-icon"><i class="fas fa-square-root-alt"></i></span>
                            <div>
                                <h6 id="katexModalActionTitle">Formulas</h6>
                                <p class="katex-popover-sub">Select a formula type and enter values below</p>
                            </div>
                        </div>
                        <button type="button" class="katex-popover-close" id="katexPopoverCloseBtn" title="Close">&times;</button>
                    </div>

                    <!-- Scrollable Modal Body -->
                    <div class="katex-popover-body">
                        <!-- Formula Type Dropdown Selector -->
                        <div class="fb-type-select-row mb-3">
                            <label class="fb-type-label" for="fbFormulaTypeSelect">
                                <i class="fas fa-shapes text-primary"></i> Formula Type:
                            </label>
                            <select id="fbFormulaTypeSelect" class="fb-type-select">
                                <option value="fraction" selected>Fraction (a/b)</option>
                                <option value="root">Square &amp; Nth Root (&radic;x, &#8731;x)</option>
                                <option value="power">Power / Exponent (x&#8319;, x&sup2;)</option>
                                <option value="subscript">Subscript (x&#8345;, x&#8321;)</option>
                                <option value="chemistry">Chemical Formula (H&#8322;O, CO&#8322;)</option>
                                <option value="general">Custom LaTeX Code</option>
                            </select>
                        </div>

                        <!-- TAB 1: FRACTION -->
                        <div class="fb-tab-panel active" data-tab-content="fraction">
                            <div class="fb-visual-fraction-container">
                                <div class="mb-1">
                                    <label class="fb-input-label">Numerator (Top):</label>
                                </div>
                                <input type="text" id="fbFracNum" class="fb-math-input" placeholder="e.g. 5x + 3, y, 7" autocomplete="off">

                                <div class="fb-fraction-bar">
                                    <div class="fb-fraction-line"></div>
                                    <span class="fb-fraction-badge">&divide;</span>
                                    <div class="fb-fraction-line"></div>
                                </div>

                                <div class="mb-1">
                                    <label class="fb-input-label">Denominator (Bottom):</label>
                                </div>
                                <input type="text" id="fbFracDen" class="fb-math-input" placeholder="e.g. 2, 4y, x + 1" autocomplete="off">

                                <div class="mt-2 pt-2 d-flex align-items-center gap-2 border-top">
                                    <label class="text-muted" style="font-size:11px; margin:0; font-weight:600;">Whole number (optional):</label>
                                    <input type="text" id="fbFracWhole" class="fb-math-input-sm" style="width:65px; text-align:center;" placeholder="e.g. 3">
                                </div>
                            </div>

                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Quick fractions:</span>
                                <button type="button" class="fb-preset-chip" data-num="1" data-den="2">&frac12;</button>
                                <button type="button" class="fb-preset-chip" data-num="1" data-den="3">&#8531;</button>
                                <button type="button" class="fb-preset-chip" data-num="1" data-den="4">&frac14;</button>
                                <button type="button" class="fb-preset-chip" data-num="3" data-den="4">&frac34;</button>
                                <button type="button" class="fb-preset-chip" data-num="2" data-den="3">&#8532;</button>
                                <button type="button" class="fb-preset-chip" data-num="x" data-den="2">x/2</button>
                                <button type="button" class="fb-preset-chip" data-num="y" data-den="2">y/2</button>
                                <button type="button" class="fb-preset-chip" data-num="a + b" data-den="c">(a+b)/c</button>
                            </div>
                        </div>

                        <!-- TAB 2: ROOT -->
                        <div class="fb-tab-panel" data-tab-content="root">
                            <div class="fb-visual-root-container">
                                <div class="row g-2 align-items-center">
                                    <div class="col-4">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Degree (n):</label>
                                        </div>
                                        <input type="text" id="fbRootDegree" class="fb-math-input" placeholder="Blank for &radic;" autocomplete="off" style="text-align:center;">
                                        <small class="text-muted d-block mt-1" style="font-size:10px;">Blank = &radic;</small>
                                    </div>
                                    <div class="col-8">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Radicand (Inside &radic;):</label>
                                        </div>
                                        <input type="text" id="fbRootRadicand" class="fb-math-input" placeholder="e.g. x + 4, 64" autocomplete="off">
                                    </div>
                                </div>
                            </div>
                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Quick roots:</span>
                                <button type="button" class="fb-preset-chip" data-deg="" data-rad="x">&radic;x</button>
                                <button type="button" class="fb-preset-chip" data-deg="" data-rad="2">&radic;2</button>
                                <button type="button" class="fb-preset-chip" data-deg="3" data-rad="x">&#8731;x</button>
                                <button type="button" class="fb-preset-chip" data-deg="" data-rad="x^2 + y^2">&radic;(x&sup2;+y&sup2;)</button>
                            </div>
                        </div>

                        <!-- TAB 3: POWER -->
                        <div class="fb-tab-panel" data-tab-content="power">
                            <div class="fb-visual-power-container">
                                <div class="row g-2 align-items-center">
                                    <div class="col-6">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Base Variable/Number:</label>
                                        </div>
                                        <input type="text" id="fbPowerBase" class="fb-math-input" placeholder="e.g. x, 10" autocomplete="off">
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Exponent (Power):</label>
                                        </div>
                                        <input type="text" id="fbPowerExp" class="fb-math-input" placeholder="e.g. 2, 3, n" autocomplete="off">
                                    </div>
                                </div>
                            </div>
                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Quick powers:</span>
                                <button type="button" class="fb-preset-chip" data-base="x" data-exp="2">x&sup2;</button>
                                <button type="button" class="fb-preset-chip" data-base="x" data-exp="3">x&sup3;</button>
                                <button type="button" class="fb-preset-chip" data-base="x" data-exp="n">x&#8319;</button>
                                <button type="button" class="fb-preset-chip" data-base="10" data-exp="3">10&sup3;</button>
                                <button type="button" class="fb-preset-chip" data-base="e" data-exp="x">e&#739;</button>
                            </div>
                        </div>

                        <!-- TAB 4: SUBSCRIPT -->
                        <div class="fb-tab-panel" data-tab-content="subscript">
                            <div class="fb-visual-subscript-container">
                                <div class="row g-2 align-items-center">
                                    <div class="col-6">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Base Variable:</label>
                                        </div>
                                        <input type="text" id="fbSubBase" class="fb-math-input" placeholder="e.g. x, a, v" autocomplete="off">
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-1">
                                            <label class="fb-input-label">Subscript Index:</label>
                                        </div>
                                        <input type="text" id="fbSubIndex" class="fb-math-input" placeholder="e.g. 1, 2, i, 0" autocomplete="off">
                                    </div>
                                </div>
                            </div>
                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Quick subscripts:</span>
                                <button type="button" class="fb-preset-chip" data-sbase="x" data-sub="1">x&#8321;</button>
                                <button type="button" class="fb-preset-chip" data-sbase="x" data-sub="2">x&#8322;</button>
                                <button type="button" class="fb-preset-chip" data-sbase="v" data-sub="0">v&#8320;</button>
                                <button type="button" class="fb-preset-chip" data-sbase="a" data-sub="n">a&#8345;</button>
                            </div>
                        </div>

                        <!-- TAB 5: CHEMISTRY -->
                        <div class="fb-tab-panel" data-tab-content="chemistry">
                            <div class="fb-visual-chem-container">
                                <div class="mb-1">
                                    <label class="fb-input-label"><i class="fas fa-flask text-primary"></i> Chemical Formula / Reaction:</label>
                                </div>
                                <input type="text" id="fbChemFormula" class="fb-math-input" placeholder="e.g. CaCO3 -> CaO + CO2 or H2O" autocomplete="off">
                                <small class="text-muted d-block mt-2" style="font-size:11px;">
                                    Numbers format automatically as subscripts (e.g. <code>H2O</code> becomes H₂O).
                                </small>
                            </div>
                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Common compounds:</span>
                                <span class="fb-quick-chip" data-chem="H2O">H₂O</span>
                                <span class="fb-quick-chip" data-chem="CO2">CO₂</span>
                                <span class="fb-quick-chip" data-chem="NaCl">NaCl</span>
                                <span class="fb-quick-chip" data-chem="H2SO4">H₂SO₄</span>
                                <span class="fb-quick-chip" data-chem="CaCO3 -> CaO + CO2">CaCO₃ → CaO + CO₂</span>
                                <span class="fb-quick-chip" data-chem="2H2 + O2 -> 2H2O">2H₂ + O₂ → 2H₂O</span>
                                <span class="fb-quick-chip" data-chem="HCl + NaOH -> NaCl + H2O">HCl + NaOH → NaCl + H₂O</span>
                            </div>
                        </div>

                        <!-- TAB 6: ADVANCED / GENERAL -->
                        <div class="fb-tab-panel" data-tab-content="general">
                            <div class="fb-visual-advanced-container">
                                <label class="fb-input-label">Custom LaTeX Code:</label>
                                <input type="text" id="katexPopoverInput" class="fb-math-input font-monospace" placeholder="e.g. \\frac{a}{b} or \\alpha + \\beta" autocomplete="off">
                            </div>
                            <div class="fb-preset-strip mt-2">
                                <span class="fb-preset-label">Symbols:</span>
                                <span class="fb-symbol-btn" data-sym="\\pm">&plusmn;</span>
                                <span class="fb-symbol-btn" data-sym="\\int_{a}^{b} f(x) dx">&int;</span>
                                <span class="fb-symbol-btn" data-sym="\\sum_{i=1}^{n} x_i">&sum;</span>
                                <span class="fb-symbol-btn" data-sym="\\lim_{x \\to \\infty}">lim</span>
                                <span class="fb-symbol-btn" data-sym="\\infty">&infin;</span>
                                <span class="fb-symbol-btn" data-sym="\\theta">&theta;</span>
                                <span class="fb-symbol-btn" data-sym="\\pi">&pi;</span>
                                <span class="fb-symbol-btn" data-sym="\\le">&le;</span>
                                <span class="fb-symbol-btn" data-sym="\\ge">&ge;</span>
                            </div>
                        </div>

                        <!-- UNIVERSAL MATH SYMBOL PALETTE -->
                        <div class="fb-symbol-palette-container mt-2">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="fb-palette-label">
                                    <i class="fas fa-keyboard text-primary"></i> Math Keypad (Inserts into active box)
                                </span>
                            </div>
                            <div class="fb-symbol-grid">
                                <button type="button" class="fb-sym" data-sym="+">+</button>
                                <button type="button" class="fb-sym" data-sym="-">&minus;</button>
                                <button type="button" class="fb-sym" data-sym="&times;">&times;</button>
                                <button type="button" class="fb-sym" data-sym="&divide;">&divide;</button>
                                <button type="button" class="fb-sym" data-sym="&plusmn;">&plusmn;</button>
                                <button type="button" class="fb-sym" data-sym="=">=</button>
                                <button type="button" class="fb-sym" data-sym="&ne;">&ne;</button>
                                <button type="button" class="fb-sym" data-sym="&le;">&le;</button>
                                <button type="button" class="fb-sym" data-sym="&ge;">&ge;</button>
                                <button type="button" class="fb-sym" data-sym="x">x</button>
                                <button type="button" class="fb-sym" data-sym="y">y</button>
                                <button type="button" class="fb-sym" data-sym="z">z</button>
                                <button type="button" class="fb-sym" data-sym="&pi;">&pi;</button>
                                <button type="button" class="fb-sym" data-sym="&theta;">&theta;</button>
                                <button type="button" class="fb-sym" data-sym="&alpha;">&alpha;</button>
                                <button type="button" class="fb-sym" data-sym="&beta;">&beta;</button>
                                <button type="button" class="fb-sym" data-sym="(">(</button>
                                <button type="button" class="fb-sym" data-sym=")">)</button>
                                <button type="button" class="fb-sym" data-sym="^2">&sup2;</button>
                                <button type="button" class="fb-sym" data-sym="^3">&sup3;</button>
                            </div>
                        </div>

                        <!-- LIVE PREVIEW CARD -->
                        <div class="katex-popover-preview-container mt-2">
                            <span class="katex-popover-preview-label">
                                <i class="fas fa-eye text-primary"></i> Live Preview (Student View):
                            </span>
                            <div class="katex-popover-preview-math" id="katexPopoverPreviewContent"></div>
                        </div>

                        <!-- DISPLAY MODE CHECKBOX -->
                        <div class="mt-2 d-flex align-items-center">
                            <label style="font-size:12px; color:#475569; cursor:pointer; user-select:none; margin:0; display:flex; align-items:center; gap:6px;">
                                <input type="checkbox" id="katexPopoverDisplayCheck" style="accent-color:#4f46e5; width:15px; height:15px;">
                                Center formula on its own line (Block Display Mode)
                            </label>
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div class="katex-popover-footer">
                        <button type="button" class="btn btn-sm btn-delete-formula me-auto" id="katexPopoverDeleteBtn" style="display:none;">
                            <i class="fas fa-trash-alt"></i> Remove Formula
                        </button>
                        <button type="button" class="btn btn-sm btn-cancel-builder" id="katexPopoverCancelBtn">Cancel</button>
                        <button type="button" class="btn btn-sm btn-apply-formula" id="katexPopoverApplyBtn">
                            <i class="fas fa-check"></i> <span id="katexApplyBtnText">Insert into Question</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.modalEl = modal;

            // Close on backdrop
            modal.addEventListener('click', function(e) {
                if (e.target === modal) self.closePopover();
            });

            // Close & Cancel
            document.getElementById('katexPopoverCloseBtn').addEventListener('click', function() {
                self.closePopover();
            });
            document.getElementById('katexPopoverCancelBtn').addEventListener('click', function() {
                self.closePopover();
            });

            // Apply
            document.getElementById('katexPopoverApplyBtn').addEventListener('click', function() {
                self.applyPopoverChanges();
            });

            // Delete
            document.getElementById('katexPopoverDeleteBtn').addEventListener('click', function() {
                self.removeCurrentPill();
            });

            // Formula Type dropdown change
            const typeSelect = document.getElementById('fbFormulaTypeSelect');
            if (typeSelect) {
                typeSelect.addEventListener('change', function() {
                    self.switchTab(this.value);
                });
            }

            // Tab switching fallback if any tab buttons exist
            modal.querySelectorAll('.fb-tab-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const tab = this.getAttribute('data-tab');
                    self.switchTab(tab);
                });
            });

            // Track last focused input for math palette
            const allInputs = modal.querySelectorAll('.fb-math-input, .fb-math-input-sm');
            allInputs.forEach(input => {
                input.addEventListener('focus', function() {
                    self.lastFocusedInput = this;
                });
                input.addEventListener('input', function() {
                    self.syncFromTemplateToLatex();
                });
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        self.applyPopoverChanges();
                    } else if (e.key === 'Escape') {
                        self.closePopover();
                    }
                });
            });

            // Quick preset chips (Fraction, Root, Power, Subscript)
            modal.querySelectorAll('.fb-preset-chip').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (this.dataset.num !== undefined) {
                        document.getElementById('fbFracNum').value = this.dataset.num;
                        document.getElementById('fbFracDen').value = this.dataset.den;
                    } else if (this.dataset.rad !== undefined) {
                        document.getElementById('fbRootDegree').value = this.dataset.deg || '';
                        document.getElementById('fbRootRadicand').value = this.dataset.rad;
                    } else if (this.dataset.base !== undefined) {
                        document.getElementById('fbPowerBase').value = this.dataset.base;
                        document.getElementById('fbPowerExp').value = this.dataset.exp;
                    } else if (this.dataset.sbase !== undefined) {
                        document.getElementById('fbSubBase').value = this.dataset.sbase;
                        document.getElementById('fbSubIndex').value = this.dataset.sub;
                    }
                    self.syncFromTemplateToLatex();
                });
            });

            // Math symbol palette buttons
            modal.querySelectorAll('.fb-sym').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const sym = this.getAttribute('data-sym');
                    self.insertSymbol(sym);
                });
            });

            // Chemistry quick chips
            modal.querySelectorAll('.fb-quick-chip').forEach(chip => {
                chip.addEventListener('click', function(e) {
                    e.preventDefault();
                    const val = this.getAttribute('data-chem');
                    self.setChemPreset(val);
                });
            });

            // Symbol buttons in advanced tab
            modal.querySelectorAll('.fb-symbol-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const sym = this.getAttribute('data-sym');
                    self.insertSymbol(sym);
                });
            });

            // Display checkbox
            document.getElementById('katexPopoverDisplayCheck').addEventListener('change', function() {
                self.updatePopoverLivePreview();
            });
        },

        /**
         * Inject CSS styles for pills and visual popover
         */
        injectStyles: function() {
            if (document.getElementById('katexEditorStyles')) return;
            const style = document.createElement('style');
            style.id = 'katexEditorStyles';
            style.textContent = `
                /* KaTeX Editor Pill inside contenteditable */
                .katex-editor-pill {
                    display: inline-flex !important;
                    align-items: center !important;
                    vertical-align: middle !important;
                    margin: 2px 4px !important;
                    padding: 3px 10px !important;
                    background: #ffffff !important;
                    border: 1.5px solid #a5b4fc !important;
                    border-radius: 9px !important;
                    cursor: pointer !important;
                    user-select: all !important;
                    line-height: normal !important;
                    font-size: 1.05em !important;
                    color: #1e293b !important;
                    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    box-shadow: 0 2px 5px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
                    white-space: nowrap !important;
                    position: relative !important;
                }
                .katex-editor-pill[data-display="true"] {
                    display: flex !important;
                    justify-content: center !important;
                    margin: 8px 0 !important;
                    width: fit-content !important;
                    max-width: 100% !important;
                }
                .katex-editor-pill:hover {
                    background: #f5f3ff !important;
                    border-color: #6366f1 !important;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.28) !important;
                    transform: translateY(-1px) !important;
                }
                .katex-editor-pill .pill-preview {
                    display: inline-flex !important;
                    align-items: center !important;
                    pointer-events: none !important;
                }
                .katex-editor-pill .pill-action-btn {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 10px !important;
                    padding: 0 4px !important;
                    cursor: pointer !important;
                    border-radius: 4px !important;
                    line-height: 1 !important;
                    transition: all 0.12s ease !important;
                }
                .katex-editor-pill .pill-edit-btn {
                    margin-left: 6px !important;
                    color: #6366f1 !important;
                    opacity: 0.7 !important;
                }
                .katex-editor-pill:hover .pill-edit-btn {
                    opacity: 1 !important;
                }
                .katex-editor-pill .pill-delete-btn {
                    margin-left: 3px !important;
                    color: #94a3b8 !important;
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    opacity: 0 !important;
                    width: 16px !important;
                    height: 16px !important;
                }
                .katex-editor-pill:hover .pill-delete-btn {
                    opacity: 0.8 !important;
                }
                .katex-editor-pill .pill-delete-btn:hover {
                    opacity: 1 !important;
                    color: #ef4444 !important;
                    background: #fee2e2 !important;
                }

                /* Visual Builder Backdrop */
                .katex-formula-popover-backdrop {
                    position: fixed !important;
                    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                    background: rgba(15, 23, 42, 0.65) !important;
                    backdrop-filter: blur(8px) !important;
                    z-index: 100000 !important;
                    display: none;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 12px !important;
                }
                .katex-formula-popover-backdrop.show {
                    display: flex !important;
                }
                .katex-formula-popover-card {
                    background: #ffffff !important;
                    border-radius: 14px !important;
                    box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.15) !important;
                    width: 100% !important;
                    max-width: 460px !important;
                    max-height: 85vh !important;
                    display: flex !important;
                    flex-direction: column !important;
                    overflow: hidden !important;
                    animation: popoverScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
                }
                @keyframes popoverScaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(8px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .katex-popover-header {
                    background: linear-gradient(135deg, #3730a3 0%, #4f46e5 100%) !important;
                    color: white !important;
                    padding: 12px 18px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
                    flex-shrink: 0 !important;
                }
                .katex-popover-header-icon {
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 7px !important;
                    background: rgba(255, 255, 255, 0.2) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 13px !important;
                    color: #ffffff !important;
                    flex-shrink: 0 !important;
                }
                .katex-popover-header h6 {
                    margin: 0 !important;
                    font-size: 15px !important;
                    font-weight: 700 !important;
                    color: white !important;
                    line-height: 1.2 !important;
                }
                .katex-popover-sub {
                    margin: 1px 0 0 !important;
                    font-size: 11px !important;
                    color: rgba(255, 255, 255, 0.85) !important;
                    line-height: 1.2 !important;
                }
                .katex-popover-close {
                    background: rgba(255, 255, 255, 0.18) !important;
                    border: 1px solid rgba(255, 255, 255, 0.25) !important;
                    color: white !important;
                    font-size: 18px !important;
                    cursor: pointer !important;
                    line-height: 1 !important;
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 50% !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.2s ease !important;
                    flex-shrink: 0 !important;
                }
                .katex-popover-close:hover {
                    background: rgba(239, 68, 68, 0.9) !important;
                    transform: rotate(90deg) !important;
                }

                /* Formula Type Dropdown */
                .fb-type-select-row {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 4px !important;
                }
                .fb-type-label {
                    font-size: 11.5px !important;
                    font-weight: 700 !important;
                    color: #334155 !important;
                    margin: 0 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }
                .fb-type-select {
                    width: 100% !important;
                    padding: 7px 11px !important;
                    border: 1.5px solid #cbd5e1 !important;
                    border-radius: 8px !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    color: #0f172a !important;
                    background: #ffffff !important;
                    outline: none !important;
                    cursor: pointer !important;
                    transition: all 0.15s ease !important;
                }
                .fb-type-select:focus {
                    border-color: #4f46e5 !important;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15) !important;
                }

                .katex-popover-body {
                    padding: 12px 18px 10px !important;
                    max-height: calc(85vh - 110px) !important;
                    overflow-y: auto !important;
                    flex: 1 1 auto !important;
                }
                .katex-popover-body::-webkit-scrollbar {
                    width: 6px !important;
                }
                .katex-popover-body::-webkit-scrollbar-track {
                    background: #f1f5f9 !important;
                    border-radius: 3px !important;
                }
                .katex-popover-body::-webkit-scrollbar-thumb {
                    background: #cbd5e1 !important;
                    border-radius: 3px !important;
                }
                .katex-popover-body::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8 !important;
                }

                .fb-tab-panel {
                    display: none !important;
                }
                .fb-tab-panel.active {
                    display: block !important;
                }

                .fb-input-label {
                    font-size: 11.5px !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    margin: 0 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }

                .fb-math-input {
                    width: 100% !important;
                    padding: 7px 11px !important;
                    border: 1.5px solid #cbd5e1 !important;
                    border-radius: 8px !important;
                    font-size: 13.5px !important;
                    font-weight: 600 !important;
                    color: #0f172a !important;
                    outline: none !important;
                    background: #ffffff !important;
                    transition: all 0.15s ease !important;
                }
                .fb-math-input:focus {
                    border-color: #4f46e5 !important;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15) !important;
                    background: #ffffff !important;
                }
                .fb-math-input-sm {
                    padding: 4px 7px !important;
                    border: 1.5px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    font-size: 11.5px !important;
                    font-weight: 600 !important;
                    outline: none !important;
                }
                .fb-math-input-sm:focus {
                    border-color: #4f46e5 !important;
                }

                /* Visual Containers for Fractions, Roots, Powers */
                .fb-visual-fraction-container,
                .fb-visual-root-container,
                .fb-visual-power-container,
                .fb-visual-subscript-container,
                .fb-visual-chem-container,
                .fb-visual-advanced-container {
                    background: #f8fafc !important;
                    border: 1.5px solid #e2e8f0 !important;
                    border-radius: 10px !important;
                    padding: 10px 14px !important;
                }
                .fb-fraction-bar {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    margin: 6px 0 !important;
                }
                .fb-fraction-line {
                    flex: 1 !important;
                    height: 2px !important;
                    background: #6366f1 !important;
                    border-radius: 1px !important;
                }
                .fb-fraction-badge {
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    color: #ffffff !important;
                    background: #6366f1 !important;
                    padding: 1px 8px !important;
                    border-radius: 12px !important;
                }

                /* Preset strips */
                .fb-preset-strip {
                    display: flex !important;
                    flex-wrap: wrap !important;
                    align-items: center !important;
                    gap: 4px !important;
                    margin-top: 6px !important;
                }
                .fb-preset-label {
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    color: #64748b !important;
                }
                .fb-preset-chip {
                    background: #ffffff !important;
                    color: #4338ca !important;
                    border: 1px solid #c7d2fe !important;
                    border-radius: 6px !important;
                    padding: 2px 7px !important;
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    cursor: pointer !important;
                    transition: all 0.12s ease !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.04) !important;
                }
                .fb-preset-chip:hover {
                    background: #4f46e5 !important;
                    color: white !important;
                    border-color: #4f46e5 !important;
                    transform: translateY(-1px) !important;
                }

                /* Symbol grid */
                .fb-symbol-palette-container {
                    background: #f8fafc !important;
                    border: 1.5px solid #e2e8f0 !important;
                    border-radius: 10px !important;
                    padding: 8px 10px !important;
                }
                .fb-palette-label {
                    font-size: 10.5px !important;
                    font-weight: 800 !important;
                    color: #475569 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.5px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }
                .fb-symbol-grid {
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 4px !important;
                    margin-top: 5px !important;
                }
                .fb-sym {
                    width: 28px !important;
                    height: 26px !important;
                    border: 1px solid #e2e8f0 !important;
                    background: white !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    font-weight: 700 !important;
                    color: #334155 !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.12s ease !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.04) !important;
                }
                .fb-sym:hover {
                    background: #4f46e5 !important;
                    color: white !important;
                    border-color: #4f46e5 !important;
                    transform: translateY(-1px) !important;
                    box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25) !important;
                }

                .fb-quick-chip, .fb-symbol-btn {
                    background: #eef2ff !important;
                    color: #3730a3 !important;
                    border: 1px solid #c7d2fe !important;
                    border-radius: 6px !important;
                    padding: 3px 8px !important;
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    cursor: pointer !important;
                    transition: all 0.12s ease !important;
                }
                .fb-quick-chip:hover, .fb-symbol-btn:hover {
                    background: #4f46e5 !important;
                    color: white !important;
                    border-color: #4f46e5 !important;
                    transform: translateY(-1px) !important;
                }

                /* Preview container */
                .katex-popover-preview-container {
                    background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%) !important;
                    border: 1.5px dashed #a5b4fc !important;
                    border-radius: 10px !important;
                    padding: 8px 14px !important;
                    min-height: 48px !important;
                }
                .katex-popover-preview-label {
                    font-size: 10.5px !important;
                    font-weight: 800 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.5px !important;
                    color: #3730a3 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }
                .katex-popover-preview-math {
                    font-size: 18px !important;
                    color: #1e1b4b !important;
                    overflow-x: auto !important;
                    min-height: 32px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 4px 0 !important;
                }

                .katex-popover-footer {
                    padding: 10px 18px !important;
                    background: #f8fafc !important;
                    border-top: 1px solid #e2e8f0 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    flex-shrink: 0 !important;
                }
                .btn-delete-formula {
                    color: #ef4444 !important;
                    background: #fee2e2 !important;
                    border: 1px solid #fca5a5 !important;
                    font-weight: 700 !important;
                    border-radius: 8px !important;
                    padding: 6px 12px !important;
                    font-size: 12px !important;
                    transition: all 0.15s ease !important;
                }
                .btn-delete-formula:hover {
                    background: #ef4444 !important;
                    color: white !important;
                }
                .btn-cancel-builder {
                    font-weight: 600 !important;
                    border-radius: 8px !important;
                    padding: 6px 14px !important;
                    font-size: 12.5px !important;
                    border: 1.5px solid #cbd5e1 !important;
                    background: #ffffff !important;
                    color: #475569 !important;
                }
                .btn-cancel-builder:hover {
                    background: #f1f5f9 !important;
                    color: #1e293b !important;
                }
                .btn-apply-formula {
                    background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%) !important;
                    color: white !important;
                    border: none !important;
                    font-weight: 700 !important;
                    font-size: 13px !important;
                    border-radius: 8px !important;
                    padding: 7px 18px !important;
                    box-shadow: 0 3px 10px rgba(79, 70, 229, 0.35) !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                    transition: all 0.15s ease !important;
                }
                .btn-apply-formula:hover {
                    background: linear-gradient(135deg, #4338ca 0%, #3730a3 100%) !important;
                    box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45) !important;
                    transform: translateY(-1px) !important;
                }

                /* Dedicated Formula Toolbar Buttons in shared-toolbar */
                .f-btn-group {
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 3px !important;
                    background: #eef2ff !important;
                    padding: 2px 4px !important;
                    border-radius: 8px !important;
                    border: 1px solid #c7d2fe !important;
                }
                .f-btn {
                    border: none !important;
                    background: #ffffff !important;
                    color: #4338ca !important;
                    font-size: 11.5px !important;
                    font-weight: 700 !important;
                    padding: 4px 10px !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 5px !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
                    transition: all 0.12s ease !important;
                }
                .f-btn:hover {
                    background: #4f46e5 !important;
                    color: #ffffff !important;
                    transform: translateY(-1px) !important;
                }
            `;
            document.head.appendChild(style);
        }
    };

    // Global listener: prevent Bootstrap focus trap from stealing focus away from our formula modal
    document.addEventListener('focusin', function(e) {
        const modal = document.getElementById('katexFormulaPopoverModal');
        if (modal && (modal.classList.contains('show') || (modal.style.display !== 'none' && modal.style.display !== ''))) {
            if (modal.contains(e.target)) {
                e.stopImmediatePropagation();
            }
        }
    }, true);

    // Expose globally
    window.CogniTaraKaTeX = CogniTaraKaTeX;

})(window, document);
