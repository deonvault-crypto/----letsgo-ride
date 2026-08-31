from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"Marker not found in {path}: {old[:180]!r}")
    file.write_text(text.replace(old, new, 1))


# The production auth service now imports both background-location task modules so
# logout can stop native work before credentials are cleared. Jest must provide a
# native TaskManager boundary rather than attempting to load ExpoTaskManager.
setup_path = Path("mobile/jest.setup.ts")
setup = setup_path.read_text()
if 'jest.mock("expo-task-manager"' not in setup:
    marker = 'jest.mock("expo-location", () => ({\n'
    if marker not in setup:
        raise SystemExit("expo-location Jest mock marker not found")
    task_manager_mock = '''jest.mock("expo-task-manager", () => ({
  isTaskDefined: jest.fn(() => false),
  defineTask: jest.fn(),
}));

'''
    setup = setup.replace(marker, task_manager_mock + marker, 1)

old_location_mock = '''jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: -17.8252, longitude: 31.0335, accuracy: 20, heading: null, speed: null },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));'''
new_location_mock = '''jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  ActivityType: { AutomotiveNavigation: 1 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: -17.8252, longitude: 31.0335, accuracy: 20, heading: null, speed: null },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));'''
if old_location_mock in setup:
    setup = setup.replace(old_location_mock, new_location_mock, 1)
elif new_location_mock not in setup:
    raise SystemExit("expo-location Jest mock block changed unexpectedly")
setup_path.write_text(setup)


# EmailLoginScreen refreshes an already-enabled biometric credential after a
# successful password login. Keep the unit mock aligned with that production API.
replace_once(
    "mobile/__tests__/auth-flow.test.tsx",
    'jest.mock("../services/biometricService", () => ({ biometricLabel: jest.fn(async () => "Use Face ID"), hasBiometricLoginCredential: jest.fn(async () => false), loginWithBiometrics: jest.fn() }));',
    'jest.mock("../services/biometricService", () => ({ biometricLabel: jest.fn(async () => "Use Face ID"), hasBiometricLoginCredential: jest.fn(async () => false), loginWithBiometrics: jest.fn(), refreshBiometricCredentialAfterPasswordLogin: jest.fn(async () => undefined) }));',
)


# Build39 intentionally reserves brand green for the Go wordmark. The visual
# contract must assert the new neutral selected treatment, not the retired glow.
replace_once(
    "mobile/__tests__/ride-class-visual-contract.test.ts",
    'expect(source).toMatch(/rgba\\(84,199,121,0\\.14\\)/);',
    'expect(source).toMatch(/rgba\\(17,17,17,0\\.09\\)/);\n    expect(source).toMatch(/shadowColor: "#111111"/);\n    expect(source).not.toMatch(/84,199,121/);',
)


assert 'jest.mock("expo-task-manager"' in setup_path.read_text()
assert "refreshBiometricCredentialAfterPasswordLogin" in Path("mobile/__tests__/auth-flow.test.tsx").read_text()
assert "84,199,121" not in Path("mobile/__tests__/ride-class-visual-contract.test.ts").read_text()
print("Build39 Jest/native test contract fixes applied")
