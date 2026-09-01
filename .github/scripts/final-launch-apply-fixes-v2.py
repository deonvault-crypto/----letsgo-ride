from pathlib import Path

runner_path = Path('.github/scripts/final-launch-apply-fixes.py')
source = runner_path.read_text(encoding='utf-8')

old_lifecycle = '''if text.count('        if not is_public_ride(ride):\\n            continue\\n') != 1:\n    raise SystemExit("ride_service.py: lifecycle legacy filter missing")\ntext = text.replace('        if not is_public_ride(ride):\\n            continue\\n', "", 1)\n'''
new_lifecycle = '''text, count = re.subn(\n    r'\\n\\s*if not is_public_ride\\(ride\\):\\n\\s*continue\\n',\n    "\\n",\n    text,\n    count=1,\n)\nif count != 1:\n    raise SystemExit("ride_service.py: lifecycle legacy filter missing")\n'''

old_bookability = '''if text.count('        is_public_ride(ride)\\n        and public_ride_status(ride) == TRIP_STATUS_SCHEDULED\\n') != 1:\n    raise SystemExit("ride_service.py: bookability legacy filter missing")\ntext = text.replace(\n    '        is_public_ride(ride)\\n        and public_ride_status(ride) == TRIP_STATUS_SCHEDULED\\n',\n    '        public_ride_status(ride) == TRIP_STATUS_SCHEDULED\\n',\n    1,\n)\n'''
new_bookability = '''text, count = re.subn(\n    r'is_public_ride\\(ride\\)\\s*\\n\\s*and public_ride_status\\(ride\\) == TRIP_STATUS_SCHEDULED',\n    'public_ride_status(ride) == TRIP_STATUS_SCHEDULED',\n    text,\n    count=1,\n)\nif count != 1:\n    raise SystemExit("ride_service.py: bookability legacy filter missing")\n'''

for old, new, label in (
    (old_lifecycle, new_lifecycle, 'lifecycle'),
    (old_bookability, new_bookability, 'bookability'),
):
    if source.count(old) != 1:
        raise SystemExit(f'wrapper: {label} patch block did not match runner source')
    source = source.replace(old, new, 1)

exec(compile(source, str(runner_path), 'exec'), {'__name__': '__main__', '__file__': str(runner_path)})
