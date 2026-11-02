with open('templates/exam_groups.html', 'r', encoding='utf-8') as f:
    c = f.read()

old_btn = 'CogniTaraKaTeX.openBuilderWithTemplate(null, null, \'gQ\')'
new_btn = 'CogniTaraKaTeX.openBuilderWithTemplate()'
c = c.replace(old_btn, new_btn)

old_drop = """                        <div class="math-drop" id="gMathDrop">
                            <button type="button" class="m-btn" onclick="gIns('+')">+</button><button type="button" class="m-btn" onclick="gIns('−')">−</button><button type="button" class="m-btn" onclick="gIns('×')">×</button><button type="button" class="m-btn" onclick="gIns('÷')">÷</button><button type="button" class="m-btn" onclick="gIns('±')">±</button><button type="button" class="m-btn" onclick="gIns('=')">=</button><button type="button" class="m-btn" onclick="CogniTaraKaTeX.openBuilderWithTemplate('root', null, 'gQ')">√</button><button type="button" class="m-btn" onclick="CogniTaraKaTeX.openBuilderWithTemplate('power', null, 'gQ')">xⁿ</button><button type="button" class="m-btn" onclick="CogniTaraKaTeX.openBuilderWithTemplate('power', '2', 'gQ')">²</button><button type="button" class="m-btn" onclick="CogniTaraKaTeX.openBuilderWithTemplate('power', '3', 'gQ')">³</button><button type="button" class="m-btn" onclick="gIns('π')">π</button><button type="button" class="m-btn" onclick="gIns('θ')">θ</button><button type="button" class="m-btn" onclick="gIns('°')">°</button><button type="button" class="m-btn" onclick="gIns('≤')">≤</button><button type="button" class="m-btn" onclick="gIns('≥')">≥</button><button type="button" class="m-btn" onclick="gIns('∞')">∞</button><button type="button" class="m-btn wide" onclick="CogniTaraKaTeX.openBuilderWithTemplate('fraction', null, 'gQ')">$\\frac{a}{b}$ Fraction</button><button type="button" class="m-btn wide" onclick="CogniTaraKaTeX.openBuilderWithTemplate('root', null, 'gQ')">$\\sqrt{x}$ Root</button><button type="button" class="m-btn wide" onclick="CogniTaraKaTeX.openBuilderWithTemplate('fraction', null, 'gQ')">a/b Fraction</button>
                        </div>"""

new_drop = """                        <div class="math-drop" id="gMathDrop">
                            <button type="button" class="m-btn" onclick="gIns('+')">+</button><button type="button" class="m-btn" onclick="gIns('−')">−</button><button type="button" class="m-btn" onclick="gIns('×')">×</button><button type="button" class="m-btn" onclick="gIns('÷')">÷</button><button type="button" class="m-btn" onclick="gIns('±')">±</button><button type="button" class="m-btn" onclick="gIns('=')">=</button><button type="button" class="m-btn" onclick="gIns('π')">π</button><button type="button" class="m-btn" onclick="gIns('θ')">θ</button><button type="button" class="m-btn" onclick="gIns('°')">°</button><button type="button" class="m-btn" onclick="gIns('≤')">≤</button><button type="button" class="m-btn" onclick="gIns('≥')">≥</button><button type="button" class="m-btn" onclick="gIns('∞')">∞</button><button type="button" class="m-btn" onclick="gIns('≈')">≈</button><button type="button" class="m-btn" onclick="gIns('≠')">≠</button>
                        </div>"""

if old_drop in c:
    c = c.replace(old_drop, new_drop)
elif old_drop.replace('\n', '\r\n') in c:
    c = c.replace(old_drop.replace('\n', '\r\n'), new_drop.replace('\n', '\r\n'))

with open('templates/exam_groups.html', 'w', encoding='utf-8', newline='') as f:
    f.write(c)

print('Updated exam_groups.html successfully!')

with open('templates/ce_groups.html', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace("CogniTaraKaTeX.openBuilderWithTemplate(null, null, 'groupQuestionText')", "CogniTaraKaTeX.openBuilderWithTemplate()")

with open('templates/ce_groups.html', 'w', encoding='utf-8', newline='') as f:
    f.write(c)

print('Updated ce_groups.html successfully!')
