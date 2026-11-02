with open('templates/admin_exams_management.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add KaTeX in <head>
katex_head = """    <link rel="stylesheet" href="{{ url_for('static', filename='vendor/katex/katex.min.css') }}">
    <script src="{{ url_for('static', filename='vendor/katex/katex.min.js') }}"></script>
    <script src="{{ url_for('static', filename='vendor/katex/contrib/auto-render.min.js') }}"></script>"""

if 'katex.min.css' not in content:
    content = content.replace('</head>', katex_head + '\n</head>')

# Replace the questions tab renderer
old_q_render = """            } else if (tab === 'questions') {
                c.innerHTML = drwData.questions.map((q, i) => {
                    const rate = q.total_attempts > 0 ? ((q.correct_count||0)/q.total_attempts*100) : 0;
                    const clr = rate >= 70 ? '#10b981' : (rate >= 40 ? '#f59e0b' : '#ef4444');
                    return `<div class="q-row"><div class="q-row-head"><span>Q${i+1} · ${q.section_name||''}</span><span style="color:${clr};font-weight:600;">${Math.round(rate)}% correct</span></div><div class="q-row-track"><div class="q-row-fill" style="width:${rate}%;background:${clr};"></div></div></div>`;
                }).join('');"""

new_q_render = """            } else if (tab === 'questions') {
                if (!drwData.questions || drwData.questions.length === 0) {
                    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>No questions found in this exam.</div>';
                } else {
                    c.innerHTML = drwData.questions.map((q, i) => {
                        const rate = q.total_attempts > 0 ? ((q.correct_count||0)/q.total_attempts*100) : 0;
                        const clr = rate >= 70 ? '#10b981' : (rate >= 40 ? '#f59e0b' : '#ef4444');
                        const isOptCorrect = (optVal, optNum) => {
                            if (!q.answer) return false;
                            const ans = String(q.answer).trim();
                            return ans === String(optVal).trim() || ans === String(optNum) || (optNum === 1 && ans === 'A') || (optNum === 2 && ans === 'B') || (optNum === 3 && ans === 'C') || (optNum === 4 && ans === 'D');
                        };

                        const optHtml = [
                            { text: q.option1, num: 1, label: 'A' },
                            { text: q.option2, num: 2, label: 'B' },
                            { text: q.option3, num: 3, label: 'C' },
                            { text: q.option4, num: 4, label: 'D' }
                        ].filter(o => o.text !== null && o.text !== undefined && o.text !== '').map(o => {
                            const correct = isOptCorrect(o.text, o.num);
                            return `
                                <div class="drw-opt" style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;margin-top:5px;border-radius:8px;background:${correct ? '#ecfdf5' : '#f8fafc'};border:1px solid ${correct ? '#a7f3d0' : '#e2e8f0'};font-size:12px;">
                                    <span style="font-weight:700;color:${correct ? '#065f46' : '#64748b'};">${o.label}.</span>
                                    <div style="flex:1;color:${correct ? '#065f46' : '#334155'};">${o.text}</div>
                                    ${correct ? '<span style="color:#059669;font-weight:700;font-size:11px;margin-left:auto;"><i class="fas fa-check-circle"></i> Correct</span>' : ''}
                                </div>
                            `;
                        }).join('');

                        return `
                            <div class="q-detail-card" style="background:#ffffff;border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <span class="badge" style="background:#eff6ff;color:#1d4ed8;font-weight:700;">Question ${i+1}</span>
                                        ${q.section_name ? `<span class="badge" style="background:#f1f5f9;color:#475569;">${q.section_name}</span>` : ''}
                                        ${q.mandatory ? `<span class="badge bg-warning text-dark"><i class="fas fa-star"></i> Mandatory</span>` : ''}
                                    </div>
                                    <div style="font-size:11px;font-weight:600;color:${clr};background:${rate>=70?'#ecfdf5':(rate>=40?'#fffbeb':'#fef2f2')};padding:3px 10px;border-radius:20px;">
                                        ${q.total_attempts > 0 ? `${Math.round(rate)}% pass rate (${q.correct_count}/${q.total_attempts})` : 'Not attempted yet'}
                                    </div>
                                </div>
                                <div class="q-text-body mb-2" style="font-size:13px;font-weight:600;color:var(--text);line-height:1.5;">
                                    ${q.question || 'Untitled Question'}
                                </div>
                                ${q.image ? `<div class="mb-2"><img src="/static/images/${q.image}" style="max-height:120px;border-radius:8px;border:1px solid #e2e8f0;"></div>` : ''}
                                <div class="options-wrapper mb-2">
                                    ${optHtml}
                                </div>
                                ${q.explanation ? `
                                    <div class="q-expl mt-2" style="background:#fefce8;border:1px solid #fef08a;padding:8px 12px;border-radius:8px;font-size:11px;color:#713f12;">
                                        <i class="fas fa-lightbulb text-warning me-1"></i> <strong>Explanation:</strong> ${q.explanation}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('');

                    if (window.renderMathInElement) {
                        window.renderMathInElement(c, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '$', right: '$', display: false},
                                {left: '\\\\(', right: '\\\\)', display: false},
                                {left: '\\\\[', right: '\\\\]', display: true}
                            ],
                            throwOnError: false
                        });
                    }
                }"""

if old_q_render in content:
    content = content.replace(old_q_render, new_q_render)
elif old_q_render.replace('\n', '\r\n') in content:
    content = content.replace(old_q_render.replace('\n', '\r\n'), new_q_render.replace('\n', '\r\n'))

with open('templates/admin_exams_management.html', 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Updated admin_exams_management.html questions drawer successfully!")
