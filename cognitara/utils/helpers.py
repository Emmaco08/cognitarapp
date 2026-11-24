import ast
import math
import re
from datetime import datetime, timezone, timedelta
import bleach
from bleach.css_sanitizer import CSSSanitizer
from PIL import Image

class SafeMathEvaluator:
    @staticmethod
    def _safe_pow(base, exp):
        if abs(exp) > 100 or (abs(base) > 1e10 and exp > 1):
            raise ValueError("Exponent or result exceeds limits")
        res = base ** exp
        if isinstance(res, complex):
            raise ValueError("Complex numbers not supported")
        if math.isinf(res) or math.isnan(res):
            raise ValueError("Numeric overflow")
        return res

    @staticmethod
    def _safe_cbrt(x):
        res = math.cbrt(x) if hasattr(math, 'cbrt') else (x ** (1 / 3) if x >= 0 else -((-x) ** (1 / 3)))
        nearest = round(res)
        if abs(res - nearest) < 1e-12:
            return float(nearest) if isinstance(x, float) else nearest
        return res

    FUNCS = {
        'abs': abs,
        'round': round,
        'sqrt': math.sqrt,
        'cbrt': lambda x: SafeMathEvaluator._safe_cbrt(x),
        'exp': math.exp,
        'sin': lambda x: math.sin(math.radians(x)),
        'cos': lambda x: math.cos(math.radians(x)),
        'tan': lambda x: math.tan(math.radians(x)),
        'asin': lambda x: math.degrees(math.asin(x)),
        'acos': lambda x: math.degrees(math.acos(x)),
        'atan': lambda x: math.degrees(math.atan(x)),
        'arcsin': lambda x: math.degrees(math.asin(x)),
        'arccos': lambda x: math.degrees(math.acos(x)),
        'arctan': lambda x: math.degrees(math.atan(x)),
        'sinh': math.sinh,
        'cosh': math.cosh,
        'tanh': math.tanh,
        'log': math.log10,
        'log10': math.log10,
        'ln': math.log,
        'factorial': lambda x: math.factorial(int(x)) if 0 <= int(x) <= 100 else (_ for _ in ()).throw(ValueError("Factorial input must be 0..100")),
    }

    FUNCS_RAD = {
        'abs': abs,
        'round': round,
        'sqrt': math.sqrt,
        'cbrt': lambda x: SafeMathEvaluator._safe_cbrt(x),
        'exp': math.exp,
        'sin': math.sin,
        'cos': math.cos,
        'tan': math.tan,
        'asin': math.asin,
        'acos': math.acos,
        'atan': math.atan,
        'arcsin': math.asin,
        'arccos': math.acos,
        'arctan': math.atan,
        'sinh': math.sinh,
        'cosh': math.cosh,
        'tanh': math.tanh,
        'log': math.log10,
        'log10': math.log10,
        'ln': math.log,
        'factorial': lambda x: math.factorial(int(x)) if 0 <= int(x) <= 100 else (_ for _ in ()).throw(ValueError("Factorial input must be 0..100")),
    }

    CONSTANTS = {
        'pi': math.pi,
        'π': math.pi,
        'e': math.e,
        'inf': math.inf
    }

    @classmethod
    def evaluate(cls, expression, angle_unit='deg'):
        if not expression or not expression.strip():
            return 0
        expr = expression.strip()
        if len(expr) > 200:
            raise ValueError("Expression is too long (max 200 characters)")
        
        open_count = expr.count('(') - expr.count(')')
        if open_count > 0:
            expr += ')' * open_count
            
        expr = expr.replace("×", "*").replace("÷", "/").replace("^", "**")
        expr = expr.replace("√", "sqrt").replace("∛", "cbrt")
        expr = expr.replace("π", "pi")
        expr = expr.replace("x²", "**2").replace("xʸ", "**").replace("x³", "**3")
        expr = re.sub(r'(\d+(?:\.\d+)?)%', r'(\1/100)', expr)
        
        funcs = cls.FUNCS_RAD if angle_unit == 'rad' else cls.FUNCS
        tree = ast.parse(expr, mode='eval')
        return cls._eval_node(tree.body, funcs=funcs)

    @classmethod
    def _eval_node(cls, node, funcs=None):
        if funcs is None:
            funcs = cls.FUNCS
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError(f"Unsupported constant type: {type(node.value)}")
        elif isinstance(node, ast.Name):
            if node.id in cls.CONSTANTS:
                return cls.CONSTANTS[node.id]
            raise ValueError(f"Unknown variable or identifier: {node.id}")
        elif isinstance(node, ast.UnaryOp):
            val = cls._eval_node(node.operand, funcs=funcs)
            if isinstance(node.op, ast.UAdd):
                return +val
            elif isinstance(node.op, ast.USub):
                return -val
            raise ValueError("Unsupported unary operator")
        elif isinstance(node, ast.BinOp):
            left = cls._eval_node(node.left, funcs=funcs)
            right = cls._eval_node(node.right, funcs=funcs)
            if isinstance(node.op, ast.Add): return left + right
            elif isinstance(node.op, ast.Sub): return left - right
            elif isinstance(node.op, ast.Mult): return left * right
            elif isinstance(node.op, ast.Div):
                if right == 0: raise ZeroDivisionError("Division by zero")
                return left / right
            elif isinstance(node.op, ast.FloorDiv):
                if right == 0: raise ZeroDivisionError("Division by zero")
                return left // right
            elif isinstance(node.op, ast.Mod):
                if right == 0: raise ZeroDivisionError("Division by zero")
                return left % right
            elif isinstance(node.op, ast.Pow):
                return cls._safe_pow(left, right)
            raise ValueError("Unsupported binary operator")
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Method and attribute calls are forbidden")
            func_name = node.func.id
            if func_name not in funcs:
                raise ValueError(f"Function '{func_name}' is not allowed")
            args = [cls._eval_node(arg, funcs=funcs) for arg in node.args]
            return funcs[func_name](*args)
        else:
            raise ValueError(f"Unsupported expression syntax: {type(node).__name__}")

BLEACH_ALLOWED_TAGS = [
    'a', 'b', 'i', 'u', 'em', 'strong', 'sub', 'sup', 'p', 'br', 'span', 'div',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'blockquote', 'code', 'pre'
]
BLEACH_ALLOWED_ATTRS = {
    '*': ['class', 'style', 'title', 'data-math-source', 'data-math-display'],
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'width', 'height', 'style'],
    'td': ['colspan', 'rowspan', 'style'],
    'th': ['colspan', 'rowspan', 'style']
}
BLEACH_ALLOWED_STYLES = [
    'color', 'background-color', 'font-size', 'font-weight', 'font-style',
    'text-align', 'text-decoration', 'margin', 'padding', 'width', 'height',
    'max-width', 'max-height', 'border', 'border-collapse'
]

_css_sanitizer = CSSSanitizer(allowed_css_properties=BLEACH_ALLOWED_STYLES)

def sanitize_html(html_content):
    if not html_content or not isinstance(html_content, str):
        return html_content or ""
    return bleach.clean(
        html_content,
        tags=BLEACH_ALLOWED_TAGS,
        attributes=BLEACH_ALLOWED_ATTRS,
        css_sanitizer=_css_sanitizer,
        strip=True
    )

def get_utc_now():
    """Return naive datetime in UTC matching SQLite CURRENT_TIMESTAMP format."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

def to_nigeria_time(dt_val, fmt="%Y-%m-%d %I:%M:%S %p WAT"):
    """
    Convert a UTC datetime string or object to Nigeria Time (West Africa Time - WAT, UTC+1).
    """
    if not dt_val:
        return ""
    if isinstance(dt_val, str):
        cleaned = dt_val.strip().replace('T', ' ')
        try:
            parts = cleaned.split('.')
            base = parts[0]
            dt = datetime.strptime(base, "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                dt = datetime.fromisoformat(cleaned)
            except Exception:
                return dt_val
    elif isinstance(dt_val, datetime):
        dt = dt_val
    else:
        return str(dt_val)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    nigeria_tz = timezone(timedelta(hours=1))
    return dt.astimezone(nigeria_tz).strftime(fmt)

def log_action(user_role, username, action, conn):
    conn.execute(
        "INSERT INTO audit_logs (user_role, username, action) VALUES (?, ?, ?)",
        (user_role, username, action)
    )

def compress_image(file, output_path, max_size_kb=None, **kwargs):
    """
    Saves image verifying it is a genuine image with Pillow and within safe 5MB limits.
    Preserves original image quality, resolution, transparency, and format.
    """
    try:
        from PIL import Image
        import io
        
        MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB per image
        if hasattr(file, 'seek'):
            try:
                file.seek(0, io.SEEK_END)
                size = file.tell()
                file.seek(0)
                if size > MAX_IMAGE_SIZE:
                    return False
            except Exception:
                pass
                
        # Verify genuine image header using PIL
        if hasattr(file, 'seek'):
            file.seek(0)
        img = Image.open(file)
        img.verify()
        
        # Re-open for saving because verify() invalidates file pointer
        if hasattr(file, 'seek'):
            file.seek(0)
        img = Image.open(file)
        
        # Convert RGBA/P to RGB if saving to JPEG
        if output_path.lower().endswith(('.jpg', '.jpeg')) and img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        parent_dir = os.path.dirname(os.path.abspath(output_path))
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        img.save(output_path)
        return True
    except Exception:
        return False
