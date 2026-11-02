with open('templates/exam_page_new.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.passage-preview-box').forEach(box => {
            const textContent = box.querySelector('.passage-text-content');
            const cta = box.nextElementSibling;
            const fade = box.querySelector('.passage-fade-overlay');
            if (textContent && textContent.scrollHeight <= 150) {
                box.style.maxHeight = 'none';
                box.style.cursor = 'default';
                if (fade) fade.style.display = 'none';
                if (cta && cta.classList.contains('passage-expand-cta')) cta.style.display = 'none';
            }
        });
    });"""

new_logic = """    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.passage-preview-box').forEach(box => {
            const textContent = box.querySelector('.passage-text-content');
            const cta = box.nextElementSibling;
            const fade = box.querySelector('.passage-fade-overlay');
            const rawText = textContent ? (textContent.textContent || textContent.innerText || '').trim() : '';
            if (rawText.length <= 250 && !rawText.includes('\\n\\n')) {
                box.style.maxHeight = 'none';
                box.style.cursor = 'default';
                if (fade) fade.style.display = 'none';
                if (cta && cta.classList.contains('passage-expand-cta')) cta.style.display = 'none';
            } else {
                box.style.maxHeight = '140px';
                box.style.cursor = 'pointer';
                if (fade) fade.style.display = 'block';
                if (cta && cta.classList.contains('passage-expand-cta')) {
                    cta.style.display = 'inline-flex';
                    cta.innerHTML = '<i class="fas fa-expand-alt"></i> Read More / View Full Passage';
                }
            }
        });
    });"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
elif old_logic.replace('\n', '\r\n') in content:
    content = content.replace(old_logic.replace('\n', '\r\n'), new_logic.replace('\n', '\r\n'))

with open('templates/exam_page_new.html', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Updated exam_page_new.html passage truncation!')

# Same for ce_exam_page.html
with open('templates/ce_exam_page.html', 'r', encoding='utf-8') as f:
    ce_content = f.read()

if old_logic in ce_content:
    ce_content = ce_content.replace(old_logic, new_logic)
elif old_logic.replace('\n', '\r\n') in ce_content:
    ce_content = ce_content.replace(old_logic.replace('\n', '\r\n'), new_logic.replace('\n', '\r\n'))

with open('templates/ce_exam_page.html', 'w', encoding='utf-8', newline='') as f:
    f.write(ce_content)
print('Updated ce_exam_page.html passage truncation!')
