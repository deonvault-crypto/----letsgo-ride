from __future__ import annotations

from pathlib import Path

path = Path(__file__).resolve().parents[1] / "mobile/components/admin/AdminControlCenter.tsx"
text = path.read_text(encoding="utf-8")

if 'onOpenSettlements={() => router.push("/(admin)/settlements" as never)}' not in text:
    anchor = '          onOpenHailing={() => router.push("/(admin)/hailing" as never)}\n'
    if anchor not in text:
        raise RuntimeError("Admin Overview call anchor missing")
    text = text.replace(
        anchor,
        anchor + '          onOpenSettlements={() => router.push("/(admin)/settlements" as never)}\n',
        1,
    )

if '  onOpenSettlements,\n' not in text:
    anchor = '  onOpenHailing,\n  onLogout,\n'
    if anchor not in text:
        raise RuntimeError("Admin Overview props destructuring anchor missing")
    text = text.replace(
        anchor,
        '  onOpenHailing,\n  onOpenSettlements,\n  onLogout,\n',
        1,
    )

if '  onOpenSettlements: () => void;\n' not in text:
    anchor = '  onOpenHailing: () => void;\n  onLogout: () => void;\n'
    if anchor not in text:
        raise RuntimeError("Admin Overview props type anchor missing")
    text = text.replace(
        anchor,
        '  onOpenHailing: () => void;\n  onOpenSettlements: () => void;\n  onLogout: () => void;\n',
        1,
    )

bad = '<ManageCard icon="cash-sync" title="Settlements" subtitle="Weekly driver fees" onPress={() => router.push("/(admin)/settlements" as never)} />'
good = '<ManageCard icon="cash-sync" title="Settlements" subtitle="Weekly driver fees" onPress={onOpenSettlements} />'
if bad in text:
    text = text.replace(bad, good, 1)
elif good not in text:
    raise RuntimeError("Admin Settlements card anchor missing")

path.write_text(text, encoding="utf-8")
print("Admin settlement navigation aligned")
