def generate_offline_builder_html(teacher_json):
    """Generate the complete offline builder HTML with teacher data embedded"""
    
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Offline Exam Builder | COGNITARA</title>
    <!-- 100% Offline Self-Contained Styles -->
    <style>
        :root {{
            --primary: #6366f1; --primary-dark: #4f46e5; --success: #10b981;
            --warning: #f59e0b; --danger: #ef4444; --purple: #8b5cf6;
            --bg: #f8fafc; --card: #ffffff; --border: #e2e8f0;
            --text: #0f172a; --text-light: #64748b; --text-xs: #94a3b8;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
            --shadow: 0 4px 12px rgba(0,0,0,0.06);
            --shadow-lg: 0 12px 30px rgba(0,0,0,0.08);
            --radius: 14px; --radius-sm: 10px; --radius-xs: 8px;
            --transition: all 0.2s ease;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            background: var(--bg);
            font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
            color: var(--text); min-height: 100vh; min-height: 100dvh;
            -webkit-tap-highlight-color: transparent;
            -webkit-font-smoothing: antialiased;
            padding-bottom: 30px;
        }}

        .app-container {{ max-width: 800px; margin: 0 auto; }}

        /* ============ FIXED TOP BAR ============ */
        .fixed-top-bar {{
            position: sticky; top: 0; z-index: 100;
            background: rgba(255,255,255,0.9); backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
        }}
        .top-bar-inner {{ max-width: 800px; margin: 0 auto; padding: 10px 16px; }}
        .brand-row {{
            display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
        }}
        .brand-icon {{
            width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            border-radius: 10px; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(139,92,246,0.3);
        }}
        .brand-icon i {{ font-size: 17px; color: white; }}
        .brand-text h2 {{ font-size: 15px; font-weight: 800; color: var(--text); margin: 0; line-height: 1.2; }}
        .brand-text span {{ font-size: 10px; color: var(--text-light); }}
        .teacher-chip {{
            margin-left: auto; background: #f5f3ff; color: #6d28d9;
            padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 600;
            display: flex; align-items: center; gap: 5px; white-space: nowrap;
        }}

        /* ============ STICKY TOOLBAR ============ */
        .sticky-toolbar {{
            display: flex; align-items: center; gap: 2px; padding: 2px 0;
            flex-wrap: wrap; position: relative;
        }}
        .t-group {{ display: flex; gap: 1px; align-items: center; padding: 0 5px; border-right: 1px solid var(--border); }}
        .t-group:last-child {{ border-right: none; }}
        .t-btn {{
            width: 32px; height: 30px; border: 1px solid transparent; border-radius: 6px;
            background: transparent; cursor: pointer; font-size: 12px; display: flex;
            align-items: center; justify-content: center; transition: 0.1s; color: #475569;
        }}
        .t-btn:hover {{ background: #e2e8f0; }}
        .t-btn.on {{ background: var(--primary) !important; color: white !important; border-color: var(--primary) !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.2); }}
        .t-btn sup {{ font-size: 7px; vertical-align: super; position: relative; top: -2px; line-height: 0; }}
        .t-btn sub {{ font-size: 7px; vertical-align: sub; position: relative; bottom: -1px; line-height: 0; }}

        /* ============ MATH DROPDOWN (inside sticky) ============ */
        .math-dropdown {{
            display: none; position: absolute; top: 100%; left: 0; right: 0;
            background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;
            padding: 8px 10px; margin-top: 2px; z-index: 50;
            box-shadow: 0 10px 30px rgba(0,0,0,0.12);
            flex-wrap: wrap; gap: 3px; max-height: 180px; overflow-y: auto;
        }}
        .math-dropdown.show {{ display: flex; }}
        .math-label {{ width: 100%; font-size: 8px; color: #92400e; font-weight: 700; margin: 2px 0; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #fde68a; padding-top: 3px; }}
        .math-label:first-child {{ border-top: none; padding-top: 0; }}
        .m-btn {{
            width: 30px; height: 26px; border: 1px solid #e2e8f0; border-radius: 5px;
            background: white; cursor: pointer; font-size: 12px; font-weight: 600;
            transition: 0.1s; display: flex; align-items: center; justify-content: center;
            color: #475569; font-family: 'Times New Roman', serif;
        }}
        .m-btn:hover {{ background: var(--primary); color: white; border-color: var(--primary); }}
        .m-btn.wide {{ width: auto; padding: 0 8px; font-size: 10px; font-family: 'Segoe UI', sans-serif; }}

        /* ============ MAIN SCROLL ============ */
        .main-scroll {{ padding: 14px 16px 20px; }}

        .card {{
            background: var(--card); border-radius: var(--radius); padding: 16px 18px;
            margin-bottom: 14px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);
        }}
        .card-header {{
            display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
            padding-bottom: 10px; border-bottom: 1px solid var(--border);
        }}
        .card-header i {{ font-size: 17px; color: var(--primary); }}
        .card-header h3 {{ font-size: 14px; font-weight: 700; margin: 0; }}

        .form-row {{ display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }}
        .form-row > * {{ flex: 1; min-width: 120px; }}
        .form-group {{ margin-bottom: 8px; }}
        .form-group label {{ font-size: 10px; font-weight: 600; color: #64748b; margin-bottom: 3px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.3px; }}
        .form-group label i {{ color: var(--primary); font-size: 11px; }}
        input, select, textarea {{
            width: 100%; padding: 9px 11px; border: 1.5px solid var(--border);
            border-radius: 8px; font-size: 13px; font-family: inherit;
            background: #fafbfc; transition: var(--transition);
        }}
        input:focus, select:focus, textarea:focus {{
            outline: none; border-color: var(--primary); background: white;
            box-shadow: 0 0 0 3px rgba(99,102,241,0.06);
        }}

        /* ============ EDITOR ============ */
        .editor-area {{
            min-height: 60px; max-height: 140px; overflow-y: auto;
            padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 8px;
            background: white; font-size: 13px; line-height: 1.6; color: var(--text);
            outline: none; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;
            transition: var(--transition);
        }}
        .editor-area:focus {{ border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99,102,241,0.06); }}
        .editor-area:empty::before {{ content: attr(placeholder); color: #94a3b8; }}
        .editor-area sup {{ font-size: 0.7em; vertical-align: super; position: relative; top: -0.3em; }}
        .editor-area sub {{ font-size: 0.7em; vertical-align: sub; position: relative; bottom: -0.1em; }}
        .editor-label {{ font-weight: 700; font-size: 11px; margin-bottom: 3px; color: var(--text); display: flex; align-items: center; gap: 4px; }}
        .editor-label i {{ color: var(--primary); font-size: 11px; }}
        .editor-wrapper {{ margin-bottom: 8px; }}

        /* ============ SECTIONS ============ */
        .section-card {{
            background: #fafbfc; border-radius: var(--radius); border: 1px solid var(--border);
            margin-bottom: 10px; overflow: hidden;
        }}
        .section-card:hover {{ border-color: var(--purple); box-shadow: var(--shadow); }}
        .sec-header {{
            padding: 10px 14px; background: white; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center; gap: 6px;
        }}
        .sec-header:hover {{ background: #f5f3ff; }}
        .sec-name-wrap {{ display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }}
        .sec-name-wrap i {{ font-size: 15px; color: var(--purple); flex-shrink: 0; }}
        .sec-name-input {{
            border: none; background: transparent; font-weight: 700; font-size: 13px;
            color: var(--text); flex: 1; padding: 0; min-width: 0;
        }}
        .sec-name-input:focus {{ outline: none; }}
        .sec-body {{ display: none; padding: 10px 14px; }}
        .sec-body.open {{ display: block; animation: slideDown 0.2s ease; }}
        @keyframes slideDown {{ from {{ opacity:0; transform:translateY(-6px); }} to {{ opacity:1; transform:translateY(0); }} }}
        .stat-chip {{
            background: #f1f5f9; padding: 2px 8px; border-radius: 15px;
            font-size: 9px; color: #475569; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;
        }}

        .question-item {{
            background: white; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
            border: 1px solid var(--border);
        }}
        .question-item:hover {{ border-color: var(--purple); }}
        .group-item {{
            background: #f5f3ff; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
            border: 1px solid #ede9fe;
        }}
        .q-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; gap: 4px; }}
        .q-badge {{ background: var(--purple); color: white; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; }}
        .mandatory-check {{ display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 9px; font-weight: 600; color: #64748b; }}
        .mandatory-check input {{ width: 14px; height: 14px; accent-color: var(--purple); }}

        /* ============ BUTTONS ============ */
        .action-row {{
            padding: 14px 16px 30px; display: flex; gap: 10px; flex-wrap: wrap;
        }}
        .btn {{
            padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 12px;
            cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 5px;
            transition: var(--transition); touch-action: manipulation; white-space: nowrap;
        }}
        .btn-primary {{ background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; }}
        .btn-success {{ background: linear-gradient(135deg, #10b981, #059669); color: white; }}
        .btn-danger {{ background: #fee2e2; color: #ef4444; }}
        .btn-outline {{ background: white; border: 1.5px solid var(--border); color: var(--text-light); }}
        .btn-sm {{ padding: 5px 10px; font-size: 10px; border-radius: 6px; }}
        .btn-xs {{ padding: 3px 7px; font-size: 9px; border-radius: 5px; }}

        .toast {{
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #0f172a; color: white; padding: 8px 16px; border-radius: 8px;
            font-size: 11px; font-weight: 600; z-index: 200; opacity: 0;
            transition: opacity 0.3s; pointer-events: none; white-space: nowrap;
        }}
        .toast.show {{ opacity: 1; }}

        @media (max-width: 480px) {{
            .top-bar-inner {{ padding: 8px 10px; }}
            .main-scroll {{ padding: 10px 8px 16px; }}
            .card {{ padding: 12px 14px; border-radius: 12px; }}
            .form-row {{ flex-direction: column; gap: 4px; }}
            .form-row > * {{ min-width: 100%; }}
            .t-btn {{ width: 28px; height: 26px; font-size: 10px; }}
            .editor-area {{ min-height: 50px; max-height: 110px; font-size: 12px; }}
            .action-row {{ flex-direction: column; padding: 10px 8px 24px; }}
        }}
    </style>
</head>
<body>

    <!-- FIXED TOP BAR with sticky toolbar and math dropdown -->
    <div class="fixed-top-bar">
        <div class="top-bar-inner">
            <div class="brand-row">
                <div class="brand-icon"><i class="fas fa-mobile-alt"></i></div>
                <div class="brand-text">
                    <h2>Offline Exam Builder</h2>
                    <span>Create & export exams</span>
                </div>
                <div class="teacher-chip"><i class="fas fa-chalkboard-teacher"></i> <span id="teacherName"></span></div>
            </div>
            <div class="sticky-toolbar" id="mainToolbar">
                <div class="t-group">
                    <button type="button" class="t-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
                    <button type="button" class="t-btn" data-cmd="italic" title="Italic"><em>I</em></button>
                    <button type="button" class="t-btn" data-cmd="underline" title="Underline"><u>U</u></button>
                </div>
                <div class="t-group">
                    <button type="button" class="t-btn" data-cmd="superscript" title="Superscript">x<sup>2</sup></button>
                    <button type="button" class="t-btn" data-cmd="subscript" title="Subscript">x<sub>2</sub></button>
                </div>
                <div class="t-group">
                    <button type="button" class="t-btn" id="mathToggleBtn" title="Math Symbols" style="color:#8b5cf6;font-weight:700;"><i class="fas fa-square-root-alt"></i></button>
                </div>
                <div class="t-group" style="margin-left:auto;border-right:none;">
                    <span style="font-size:9px;color:var(--text-xs);white-space:nowrap;">Click question box → then use tools</span>
                </div>
            </div>
            <!-- Math Dropdown -->
            <div class="math-dropdown" id="mathDrop">
                <span class="math-label">Operators</span>
                <button type="button" class="m-btn" onclick="insSym('+')">+</button>
                <button type="button" class="m-btn" onclick="insSym('−')">−</button>
                <button type="button" class="m-btn" onclick="insSym('×')">×</button>
                <button type="button" class="m-btn" onclick="insSym('÷')">÷</button>
                <button type="button" class="m-btn" onclick="insSym('±')">±</button>
                <button type="button" class="m-btn" onclick="insSym('=')">=</button>
                <button type="button" class="m-btn" onclick="insSym('≈')">≈</button>
                <button type="button" class="m-btn" onclick="insSym('≠')">≠</button>
                <button type="button" class="m-btn" onclick="insSym('<')">&lt;</button>
                <button type="button" class="m-btn" onclick="insSym('>')">&gt;</button>
                <button type="button" class="m-btn" onclick="insSym('≤')">≤</button>
                <button type="button" class="m-btn" onclick="insSym('≥')">≥</button>
                <span class="math-label">Roots & Powers</span>
                <button type="button" class="m-btn" onclick="insSym('√')">√</button>
                <button type="button" class="m-btn" onclick="insSym('^')">xⁿ</button>
                <button type="button" class="m-btn" onclick="insSym('²')">²</button>
                <button type="button" class="m-btn" onclick="insSym('³')">³</button>
                <span class="math-label">Greek</span>
                <button type="button" class="m-btn" onclick="insSym('π')">π</button>
                <button type="button" class="m-btn" onclick="insSym('θ')">θ</button>
                <button type="button" class="m-btn" onclick="insSym('α')">α</button>
                <button type="button" class="m-btn" onclick="insSym('β')">β</button>
                <button type="button" class="m-btn" onclick="insSym('Δ')">Δ</button>
                <button type="button" class="m-btn" onclick="insSym('Σ')">Σ</button>
                <span class="math-label">Symbols</span>
                <button type="button" class="m-btn" onclick="insSym('∠')">∠</button>
                <button type="button" class="m-btn" onclick="insSym('°')">°</button>
                <button type="button" class="m-btn" onclick="insSym('∞')">∞</button>
                <button type="button" class="m-btn" onclick="insSym('%')">%</button>
                <span class="math-label">Special</span>
                <button type="button" class="m-btn wide" onclick="insFrac()"><i class="fas fa-divide"></i> Fraction</button>
            </div>
        </div>
    </div>

    <!-- MAIN SCROLL -->
    <div class="main-scroll">
        <div class="card">
            <div class="card-header"><i class="fas fa-sliders-h"></i><h3>Exam Configuration</h3></div>
            <div class="form-row"><div class="form-group" style="flex:2;"><label><i class="fas fa-tag"></i> Exam Name *</label><input type="text" id="examName" placeholder="e.g., Mathematics Final" oninput="autoSave()"></div></div>
            <div class="form-row">
                <div class="form-group"><label><i class="fas fa-users"></i> Target Class</label><select id="targetClass" onchange="updateSpec();autoSave();"><option value="">-- Select --</option></select></div>
                <div class="form-group"><label><i class="fas fa-flask"></i> Specialisation</label><select id="specialisation" onchange="autoSave()"><option value="General">General</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label><i class="fas fa-book"></i> Subject</label><input type="text" id="subjectTag" placeholder="e.g., Mathematics" oninput="autoSave()"></div>
                <div class="form-group"><label><i class="fas fa-clock"></i> Duration (min)</label><input type="number" id="duration" value="60" min="1" oninput="autoSave()"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label><i class="fas fa-shield-alt"></i> Max Warnings</label><input type="number" id="maxWarnings" value="5" min="1" max="20" oninput="autoSave()"></div>
                <div class="form-group"><label><i class="fas fa-calculator"></i> Calculator</label><select id="calculatorType" onchange="autoSave()"><option value="none">None</option><option value="simple">Simple</option><option value="advanced">Advanced</option></select></div>
            </div>
        </div>

        <div id="sectionsContainer"></div>
    </div>

    <div class="action-row">
        <button class="btn btn-primary" onclick="addSection()" style="flex:1;"><i class="fas fa-folder-plus"></i> Add Section</button>
        <button class="btn btn-success" onclick="exportExam()" style="flex:1;"><i class="fas fa-download"></i> Export JSON</button>
        <button class="btn btn-outline" onclick="resetAll()" style="flex:1;"><i class="fas fa-undo"></i> Reset</button>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        const TEACHER_DATA = {teacher_json};
        let sectionCounter = 0;

        // ============ FIXED: UNIVERSAL ACTIVE EDITOR TRACKING ============
        let lastActiveEditor = null;

        function getActiveEditor() {{
            const ae = document.activeElement;
            if (ae && ae.classList.contains('editor-area') && ae.getAttribute('contenteditable') === 'true') {{
                lastActiveEditor = ae;
                return ae;
            }}
            return lastActiveEditor;
        }}

        function syncToolbarButtons() {{
            const ed = getActiveEditor();
            if (!ed) {{
                document.querySelectorAll('#mainToolbar .t-btn.on').forEach(b => b.classList.remove('on'));
                return;
            }}
            ['bold','italic','underline','superscript','subscript'].forEach(cmd => {{
                const btn = document.querySelector(`#mainToolbar .t-btn[data-cmd="${{cmd}}"]`);
                if (btn) btn.classList.toggle('on', document.queryCommandState(cmd));
            }});
        }}

        // ============ INSERT SYMBOL AT CURSOR ============
        function insSym(sym) {{
            const ed = getActiveEditor();
            if (!ed) {{ showToast('Click inside a question box first'); return; }}
            ed.focus();
            const sel = window.getSelection();
            if (sel.rangeCount) {{
                const r = sel.getRangeAt(0); r.deleteContents();
                const t = document.createTextNode(sym);
                r.insertNode(t); r.setStartAfter(t); r.setEndAfter(t);
                sel.removeAllRanges(); sel.addRange(r);
            }}
            ed.dispatchEvent(new Event('input', {{ bubbles: true }}));
            autoSave();
        }}

        function insFrac() {{
            const ed = getActiveEditor();
            if (!ed) {{ showToast('Click inside a question box first'); return; }}
            ed.focus();
            const wrapper = document.createElement('span');
            wrapper.style.cssText = 'display:inline-block;';
            const container = document.createElement('span');
            container.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1;margin:0 2px;';
            const num = document.createElement('span');
            num.style.cssText = 'border-bottom:2px solid #1e293b;padding:0 4px;font-size:0.75em;text-align:center;min-width:12px;display:inline-block;';
            num.contentEditable = 'true'; num.textContent = 'a';
            const den = document.createElement('span');
            den.style.cssText = 'padding:0 4px;font-size:0.75em;text-align:center;min-width:12px;display:inline-block;';
            den.contentEditable = 'true'; den.textContent = 'b';
            container.appendChild(num); container.appendChild(den);
            const spacer = document.createTextNode('\u200B');
            wrapper.appendChild(container); wrapper.appendChild(spacer);
            const sel = window.getSelection();
            if (sel.rangeCount) {{
                const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(wrapper);
                r.setStartAfter(wrapper); r.setEndAfter(wrapper);
                sel.removeAllRanges(); sel.addRange(r);
            }}
            ed.dispatchEvent(new Event('input', {{ bubbles: true }}));
            autoSave();
        }}

        function showToast(msg) {{
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }}

        // ============ TOOLBAR CLICK HANDLERS ============
        document.querySelectorAll('#mainToolbar .t-btn[data-cmd]').forEach(btn => {{
            btn.addEventListener('click', function(e) {{
                e.preventDefault();
                const cmd = this.dataset.cmd;
                const ed = getActiveEditor();
                if (!ed) {{ showToast('Click a question box first, then use tools'); return; }}
                ed.focus();
                if (cmd === 'superscript' && document.queryCommandState('subscript')) document.execCommand('subscript', false, null);
                if (cmd === 'subscript' && document.queryCommandState('superscript')) document.execCommand('superscript', false, null);
                const map = {{ bold: 'bold', italic: 'italic', underline: 'underline', superscript: 'superscript', subscript: 'subscript' }};
                if (map[cmd]) document.execCommand(map[cmd], false, null);
                setTimeout(() => {{ syncToolbarButtons(); autoSave(); }}, 20);
            }});
        }});

        // ============ MATH TOGGLE ============
        document.getElementById('mathToggleBtn').addEventListener('click', function() {{
            document.getElementById('mathDrop').classList.toggle('show');
            this.classList.toggle('on');
        }});

        // ============ GLOBAL FOCUS TRACKING ============
        document.addEventListener('focusin', function(e) {{
            if (e.target.classList.contains('editor-area') && e.target.getAttribute('contenteditable') === 'true') {{
                lastActiveEditor = e.target;
                setTimeout(syncToolbarButtons, 30);
            }}
        }});

        document.addEventListener('click', function(e) {{
            if (e.target.classList.contains('editor-area') && e.target.getAttribute('contenteditable') === 'true') {{
                lastActiveEditor = e.target;
                setTimeout(syncToolbarButtons, 30);
            }}
        }});

        // Track keyup for keyboard navigation between editors (Tab)
        document.addEventListener('keyup', function(e) {{
            if (document.activeElement && document.activeElement.classList.contains('editor-area')) {{
                syncToolbarButtons();
            }}
        }});

        // ============ INIT ============
        function initTeacherData() {{
            document.getElementById('teacherName').textContent = TEACHER_DATA.name;
            const cs = document.getElementById('targetClass');
            TEACHER_DATA.classes.forEach(cls => {{
                const o = document.createElement('option'); o.value = cls; o.textContent = cls; cs.appendChild(o);
            }});
        }}

        function updateSpec() {{
            const cv = document.getElementById('targetClass').value;
            const ss = document.getElementById('specialisation');
            ss.innerHTML = '<option value="General">General</option>';
            if (cv && TEACHER_DATA.specialisations[cv]) {{
                TEACHER_DATA.specialisations[cv].forEach(s => {{
                    if (s !== 'General') {{ const o = document.createElement('option'); o.value = s; o.textContent = s; ss.appendChild(o); }}
                }});
            }}
            autoSave();
        }}
        // ============ PREVENT FOCUS STEALING ============
        document.addEventListener('mousedown', function(e) {{
            // If clicking a toolbar button or math symbol, stop the browser from moving the text cursor
            if (e.target.closest('.t-btn') || e.target.closest('.m-btn')) {{
                e.preventDefault(); 
            }}
        }});
        // ============ ADD SECTION / QUESTION / GROUP ============
        function addSection(saved = null) {{
            sectionCounter++;
            const sid = 'sec' + sectionCounter;
            const div = document.createElement('div');
            div.className = 'section-card'; div.id = sid;
            div.innerHTML = `
                <div class="sec-header" onclick="this.nextElementSibling.classList.toggle('open'); const a=this.querySelector('.fa-chevron-down'); if(a)a.style.transform=this.nextElementSibling.classList.contains('open')?'rotate(180deg)':'';">
                    <div class="sec-name-wrap"><i class="fas fa-folder-open"></i><input type="text" class="sec-name-input" id="${{sid}}_name" value="${{saved?.name || 'Section '+sectionCounter}}" onclick="event.stopPropagation()" oninput="autoSave()"><span class="stat-chip" id="${{sid}}_count">0 Q</span></div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="stat-chip"><span id="${{sid}}_sl">${{saved?.qts>0?saved.qts:'All'}}</span></span>
                        <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();this.closest('.section-card').remove();autoSave();"><i class="fas fa-trash"></i></button>
                        <i class="fas fa-chevron-down" style="color:#94a3b8;font-size:13px;"></i>
                    </div>
                </div>
                <div class="sec-body open">
                    <div class="form-row"><div class="form-group"><label>Questions to Show</label><input type="number" id="${{sid}}_qts" value="${{saved?.qts||0}}" min="0" oninput="document.getElementById('${{sid}}_sl').textContent=this.value>0?this.value:'All';autoSave();"></div><div class="form-group"><label>Randomize</label><select id="${{sid}}_rand" onchange="autoSave();"><option value="1" ${{saved?.randomize!==0?'selected':''}}>Yes</option><option value="0" ${{saved?.randomize===0?'selected':''}}>No</option></select></div></div>
                    <div id="${{sid}}_groups"></div><div id="${{sid}}_questions"></div>
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><button class="btn btn-sm" style="background:#8b5cf6;color:white;" onclick="addGroup('${{sid}}')"><i class="fas fa-layer-group"></i> Group</button><button class="btn btn-sm" style="background:#3b82f6;color:white;" onclick="addQuestion('${{sid}}')"><i class="fas fa-plus"></i> Question</button></div>
                </div>`;
            document.getElementById('sectionsContainer').appendChild(div);
            if (saved?.questions) saved.questions.forEach(q => addQuestion(sid, q));
            if (saved?.groups) saved.groups.forEach(g => addGroup(sid, g));
            updateSecCount(sid); autoSave();
        }}

        function addQuestion(sid, saved = null) {{
            const c = document.getElementById(`${{sid}}_questions`);
            const qid = sid + '_q' + Date.now();
            const div = document.createElement('div');
            div.className = 'question-item'; div.id = qid;
            div.innerHTML = `<div class="q-header"><span class="q-badge">Q</span><div style="display:flex;align-items:center;gap:8px;"><label class="mandatory-check"><input type="checkbox" id="${{qid}}_mand" ${{saved?.mandatory?'checked':''}} onchange="autoSave()">Mandatory</label><button class="btn btn-danger btn-xs" onclick="this.closest('.question-item').remove();updateSecCount('${{sid}}');autoSave();"><i class="fas fa-trash"></i></button></div></div>
            <div class="editor-wrapper"><div class="editor-label"><i class="fas fa-question-circle"></i> Question</div><div class="editor-area" id="${{qid}}_q" contenteditable="true" placeholder="Type your question...">${{saved?.text||''}}</div></div>
            <div class="editor-label"><i class="fas fa-list"></i> Options</div>
            <div class="form-row"><input type="text" id="${{qid}}_o1" placeholder="A" value="${{saved?.opt1||''}}" oninput="autoSave()"><input type="text" id="${{qid}}_o2" placeholder="B" value="${{saved?.opt2||''}}" oninput="autoSave()"></div>
            <div class="form-row"><input type="text" id="${{qid}}_o3" placeholder="C" value="${{saved?.opt3||''}}" oninput="autoSave()"><input type="text" id="${{qid}}_o4" placeholder="D" value="${{saved?.opt4||''}}" oninput="autoSave()"></div>
            <select id="${{qid}}_ans" onchange="autoSave()" style="margin-top:4px;width:100%;"><option value="1" ${{saved?.answer==1?'selected':''}}>A</option><option value="2" ${{saved?.answer==2?'selected':''}}>B</option><option value="3" ${{saved?.answer==3?'selected':''}}>C</option><option value="4" ${{saved?.answer==4?'selected':''}}>D</option></select>`;
            c.appendChild(div);
            updateSecCount(sid); autoSave();
        }}

        function addGroup(sid, saved = null) {{
            const c = document.getElementById(`${{sid}}_groups`);
            const gid = sid + '_g' + Date.now();
            const div = document.createElement('div');
            div.className = 'group-item'; div.id = gid;
            div.innerHTML = `<div class="q-header"><span class="q-badge" style="background:#7c3aed;">Group</span><div style="display:flex;gap:6px;align-items:center;"><select id="${{gid}}_type" onchange="autoSave()" style="width:auto;padding:3px 6px;font-size:10px;border-radius:5px;"><option value="normal" ${{saved?.type=='normal'?'selected':''}}>Normal</option><option value="comprehension" ${{saved?.type=='comprehension'?'selected':''}}>Passage</option><option value="sequence" ${{saved?.type=='sequence'?'selected':''}}>Sequence</option></select><button class="btn btn-danger btn-xs" onclick="this.closest('.group-item').remove();updateSecCount('${{sid}}');autoSave();"><i class="fas fa-trash"></i></button></div></div>
            <input type="text" id="${{gid}}_name" value="${{saved?.name||'Group'}}" placeholder="Group Name" oninput="autoSave()" style="margin-bottom:5px;font-weight:600;border:none;background:transparent;padding:0;width:100%;font-size:12px;">
            <input type="text" id="${{gid}}_instr" value="${{saved?.instruction||''}}" placeholder="Instruction (optional)" oninput="autoSave()" style="margin-bottom:5px;">
            <textarea id="${{gid}}_content" rows="3" placeholder="Passage content..." oninput="autoSave()">${{saved?.content||''}}</textarea>
            <div id="${{gid}}_questions"></div>
            <button class="btn btn-sm" style="background:#3b82f6;color:white;margin-top:6px;" onclick="addQToGroup('${{gid}}')"><i class="fas fa-plus"></i> Add Question</button>`;
            c.appendChild(div);
            if (saved?.questions) saved.questions.forEach(q => addQToGroup(gid, q));
            updateSecCount(sid); autoSave();
        }}

        function addQToGroup(gid, saved = null) {{
            const sid = gid.split('_')[0];
            const c = document.getElementById(`${{gid}}_questions`);
            const qid = gid + '_gq' + Date.now();
            const div = document.createElement('div');
            div.className = 'question-item'; div.id = qid;
            div.innerHTML = `<div class="q-header"><span class="q-badge" style="background:#7c3aed;">GQ</span><div style="display:flex;align-items:center;gap:8px;"><label class="mandatory-check"><input type="checkbox" id="${{qid}}_mand" ${{saved?.mandatory?'checked':''}} onchange="autoSave()">Mandatory</label><button class="btn btn-danger btn-xs" onclick="this.closest('.question-item').remove();updateSecCount('${{sid}}');autoSave();"><i class="fas fa-trash"></i></button></div></div>
            <div class="editor-wrapper"><div class="editor-label"><i class="fas fa-question-circle"></i> Question</div><div class="editor-area" id="${{qid}}_q" contenteditable="true" placeholder="Type question...">${{saved?.text||''}}</div></div>
            <div class="editor-label"><i class="fas fa-list"></i> Options</div>
            <div class="form-row"><input type="text" id="${{qid}}_o1" placeholder="A" value="${{saved?.opt1||''}}" oninput="autoSave()"><input type="text" id="${{qid}}_o2" placeholder="B" value="${{saved?.opt2||''}}" oninput="autoSave()"></div>
            <div class="form-row"><input type="text" id="${{qid}}_o3" placeholder="C" value="${{saved?.opt3||''}}" oninput="autoSave()"><input type="text" id="${{qid}}_o4" placeholder="D" value="${{saved?.opt4||''}}" oninput="autoSave()"></div>
            <select id="${{qid}}_ans" onchange="autoSave()" style="margin-top:4px;width:100%;"><option value="1" ${{saved?.answer==1?'selected':''}}>A</option><option value="2" ${{saved?.answer==2?'selected':''}}>B</option><option value="3" ${{saved?.answer==3?'selected':''}}>C</option><option value="4" ${{saved?.answer==4?'selected':''}}>D</option></select>`;
            c.appendChild(div);
            updateSecCount(sid); autoSave();
        }}

        function updateSecCount(sid) {{
            const ce = document.getElementById(`${{sid}}_count`); if (!ce) return;
            let cnt = 0;
            const qc = document.getElementById(`${{sid}}_questions`); if (qc) cnt += qc.querySelectorAll('.question-item').length;
            const gc = document.getElementById(`${{sid}}_groups`); if (gc) gc.querySelectorAll('.group-item').forEach(g => {{ const gqc = g.querySelector('[id$="_questions"]'); if (gqc) cnt += gqc.querySelectorAll('.question-item').length; }});
            ce.innerHTML = '<i class="fas fa-question-circle"></i> ' + cnt + ' Q';
        }}

        // ============ DATA COLLECTION ============
        function collectData() {{
            const d = {{ examName: document.getElementById('examName').value, targetClass: document.getElementById('targetClass').value, specialisation: document.getElementById('specialisation').value, subjectTag: document.getElementById('subjectTag').value, duration: parseInt(document.getElementById('duration').value) || 60, maxWarnings: parseInt(document.getElementById('maxWarnings').value) || 5, calculatorType: document.getElementById('calculatorType').value, sections: [] }};
            document.querySelectorAll('#sectionsContainer > .section-card').forEach(card => {{
                const sid = card.id;
                const s = {{ name: document.getElementById(sid+'_name')?.value || '', qts: parseInt(document.getElementById(sid+'_qts')?.value) || 0, randomize: parseInt(document.getElementById(sid+'_rand')?.value) || 1, questions: [], groups: [] }};
                const qc = document.getElementById(sid+'_questions'); if (qc) qc.querySelectorAll('.question-item').forEach(q => s.questions.push(extQ(q.id)));
                const gc = document.getElementById(sid+'_groups'); if (gc) gc.querySelectorAll('.group-item').forEach(g => s.groups.push(extG(g.id)));
                d.sections.push(s);
            }});
            return d;
        }}

        function extQ(qid) {{ const e = (s) => document.getElementById(qid + '_' + s); return {{ text: (e('q')?.innerHTML || ''), opt1: e('o1')?.value || '', opt2: e('o2')?.value || '', opt3: e('o3')?.value || '', opt4: e('o4')?.value || '', answer: parseInt(e('ans')?.value) || 1, mandatory: document.getElementById(qid+'_mand')?.checked || false }}; }}
        function extG(gid) {{ const e = (s) => document.getElementById(gid + '_' + s); const g = {{ name: e('name')?.value || '', type: e('type')?.value || 'normal', instruction: e('instr')?.value || '', content: e('content')?.value || '', questions: [] }}; const qc = document.getElementById(gid+'_questions'); if (qc) qc.querySelectorAll('.question-item').forEach(q => g.questions.push(extQ(q.id))); return g; }}

        // ============ SAVE / EXPORT / RESET ============
        function autoSave() {{
            clearTimeout(window._save);
            window._save = setTimeout(() => {{
                sessionStorage.setItem('exam_builder_data', JSON.stringify(collectData()));
                const t = document.getElementById('toast');
                t.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> Saved';
                t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1200);
            }}, 400);
        }}

        function exportExam() {{
            const data = collectData(); if (!data.examName) {{ alert('Enter exam name'); return; }}
            let tq = 0; data.sections.forEach(s => {{ tq += s.questions.length; s.groups.forEach(g => tq += g.questions.length); }});
            if (tq === 0) {{ alert('Add at least one question'); return; }}
            const blob = new Blob([JSON.stringify({{ name: data.examName, class: data.targetClass, specialisation: data.specialisation, subject: data.subjectTag, duration: data.duration, maxWarnings: data.maxWarnings, calculator: data.calculatorType, sections: data.sections, exportedAt: new Date().toISOString() }}, null, 2)], {{type: 'application/json'}});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (data.examName.replace(/[^a-z0-9]/gi,'_')||'exam')+'.json'; a.click();
            const t = document.getElementById('toast'); t.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> Exported!'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000);
        }}

        function resetAll() {{ if (confirm('Reset everything?')) {{ document.getElementById('sectionsContainer').innerHTML = ''; sectionCounter = 0; sessionStorage.removeItem('exam_builder_data'); addSection(); }} }}

        function loadStorage() {{
            const s = sessionStorage.getItem('exam_builder_data'); if (!s) return;
            try {{ const d = JSON.parse(s); if (d.examName) document.getElementById('examName').value = d.examName; if (d.targetClass) {{ document.getElementById('targetClass').value = d.targetClass; updateSpec(); }} if (d.specialisation) document.getElementById('specialisation').value = d.specialisation; if (d.subjectTag) document.getElementById('subjectTag').value = d.subjectTag; if (d.duration) document.getElementById('duration').value = d.duration; if (d.maxWarnings) document.getElementById('maxWarnings').value = d.maxWarnings; if (d.calculatorType) document.getElementById('calculatorType').value = d.calculatorType; if (d.sections) d.sections.forEach(s => addSection(s)); }} catch(e) {{ }}
        }}

        initTeacherData(); loadStorage();
        if (!document.querySelector('#sectionsContainer > .section-card')) addSection();
    </script>
</body>
</html>'''

