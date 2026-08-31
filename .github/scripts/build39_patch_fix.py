from pathlib import Path

path = Path('.github/scripts/build39_final_cleanup.py')
text = path.read_text()
old = '''status_block = ''' + "'''" + '''        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
''' + "'''" + '''
if status_block not in text:
    raise SystemExit("search status block not found")
text = text.replace(
    status_block,
    ''' + "'''" + '''        {!noDriver ? <DriverSearchRadar active={!loading && trip?.status === "SEARCHING"} /> : null}
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
''' + "'''" + ''',
    1,
)
'''
new = '''status_marker = '          <View style={styles.statusRow}>'
if status_marker not in text:
    raise SystemExit("search status row marker not found")
text = text.replace(
    status_marker,
    '          {!noDriver ? <DriverSearchRadar active={!loading && trip?.status === "SEARCHING"} /> : null}\\n' + status_marker,
    1,
)
'''
if old not in text:
    raise SystemExit('Unable to locate old search marker logic in cleanup script')
path.write_text(text.replace(old, new, 1))
print('Build 39 cleanup script corrected for live search source')
