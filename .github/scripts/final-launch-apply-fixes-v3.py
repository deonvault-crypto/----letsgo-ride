from pathlib import Path

runner_path = Path('.github/scripts/final-launch-apply-fixes-v2.py')
source = runner_path.read_text(encoding='utf-8')
exec(compile(source, str(runner_path), 'exec'), {'__name__': '__main__', '__file__': str(runner_path)})

# Keep generated Python source canonical so git diff --check remains a hard gate.
admin_path = Path('backend/app/routers/admin.py')
admin_path.write_text(admin_path.read_text(encoding='utf-8').rstrip() + '\n', encoding='utf-8')
