from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"Marker not found in {path}: {old[:220]!r}")
    file.write_text(text.replace(old, new, 1))


fluid = "mobile/__tests__/fluid-canvas-wiring.test.ts"
replace_once(
    fluid,
    '    expect(brandLogo).toContain("color: colors.primaryGreen");',
    '    expect(brandLogo).toContain(\'const WORDMARK_GREEN = "#118B44"\');\n    expect(brandLogo).toContain("green: { color: WORDMARK_GREEN }");',
)
replace_once(
    fluid,
    '    expect(customerAccount).toContain(\'label="Wallet"\');',
    '    expect(customerAccount).not.toContain(\'label="Wallet"\');',
)
replace_once(
    fluid,
    '    expect(driverHome).toContain("const rideNowTitle = photoBlocksNewWork");',
    '    expect(driverHome).toContain("const nextAction = useMemo<HomeAction>");',
)
replace_once(
    fluid,
    '    expect(driverHome).toContain(\'router.push("/(driver)/hailing" as never)\');',
    '    expect(driverHome).toContain(\'route: "/(driver)/hailing"\');\n    expect(driverHome).toContain("router.push(nextAction.route as never)");',
)
replace_once(
    fluid,
    '    expect(driverHome).toContain(\'style={styles.intercityTitle}>Share a route</Text>\');',
    '    expect(driverHome).not.toContain("Share a route");\n    expect(driverHome).not.toContain("intercityTitle");',
)
replace_once(
    fluid,
    '    expect(driverHome).toContain("const photoBlocksNewWork = !photoApproved");\n    expect(driverHome).toContain("Profile photo approval required");',
    '    expect(driverHome).toContain("if (!photoApproved)");\n    expect(driverHome).toContain(\'title: "Photo under review"\');\n    expect(driverHome).toContain(\'"Add your profile photo"\');\n    expect(driverHome).toContain(\'step: "STEP 1 OF 3"\');',
)


auth = "mobile/__tests__/auth-flow.test.tsx"
replace_once(
    auth,
    '      expect(screen.getByRole("button", { name: "Create account" })).toBeOnTheScreen();',
    '      expect(screen.getByRole("button", { name: "Create customer account" })).toBeOnTheScreen();',
)


services = "mobile/__tests__/services-routing.test.tsx"
replace_once(
    services,
    '''  it("opens one Ride search for local intent and planned city-to-city trips", () => {
    const screen = render(<ServicesScreen />);
    fireEvent.press(screen.getByText("Ride"));
    expect(mockPush).toHaveBeenCalledWith("/(customer)/search");
    expect(screen.getByText("Search local journeys and planned city-to-city trips")).toBeOnTheScreen();
  });''',
    '''  it("opens Ride Now destination picker without an intercity doorway", () => {
    const screen = render(<ServicesScreen />);
    fireEvent.press(screen.getByText("Ride"));
    expect(mockPush).toHaveBeenCalledWith("/(shared)/location-picker?kind=dropoff&flow=hailing&focus=1");
    expect(screen.getByText("Request a nearby ride with live driver matching")).toBeOnTheScreen();
    expect(screen.queryByText("Search local journeys and planned city-to-city trips")).toBeNull();
  });''',
)


manual = "mobile/__tests__/manual-verification-flow.test.tsx"
replace_once(
    manual,
    '    expect(screen.getByText("Complete a camera-based identity check before posting public rides.")).toBeOnTheScreen();',
    '    expect(screen.getByText("Complete a camera-based identity and licence check before driving with Ride Now.")).toBeOnTheScreen();',
)
replace_once(
    manual,
    '    expect(screen.getByText("LetsGoRide uses live capture for your selfie, identity document, driver licence, and vehicle record. If automated checks need help, the same captured documents move to manual review.")).toBeOnTheScreen();',
    '    expect(screen.getByText("LetsGoRide uses live capture for your selfie, identity document and driver licence. If automated checks need help, the same captured documents move to manual review.")).toBeOnTheScreen();',
)
replace_once(
    manual,
    '''    fireEvent.press(screen.getByRole("button", { name: /Scan driver licence/ }));
    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(3);
    });
    fireEvent.press(screen.getByRole("button", { name: /Scan registration\\/logbook/ }));

    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(4);
      expect(screen.getAllByText("✓ Captured - Pending").length).toBe(4);
    });''',
    '''    fireEvent.press(screen.getByRole("button", { name: /Scan driver licence/ }));
    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(3);
      expect(screen.getAllByText("✓ Captured - Pending").length).toBe(3);
    });
    expect(screen.queryByRole("button", { name: /Scan registration\\/logbook/ })).toBeNull();''',
)
replace_once(
    manual,
    '    fireEvent.changeText(screen.getByLabelText("Message for verification team"), "Vehicle logbook is in my name.");',
    '    fireEvent.changeText(screen.getByLabelText("Message for verification team"), "Identity and licence captured.");',
)
replace_once(
    manual,
    '        verification_notes: "Vehicle logbook is in my name.",',
    '        verification_notes: "Identity and licence captured.",',
)
replace_once(
    manual,
    '          { document_id: "doc-vehicle_registration_or_logbook", document_type: "vehicle_registration_or_logbook" },\n',
    '',
)


# Strong final guards: the tests must now enforce Build39 rather than merely stop failing.
fluid_text = Path(fluid).read_text()
auth_text = Path(auth).read_text()
services_text = Path(services).read_text()
manual_text = Path(manual).read_text()
assert 'not.toContain(\'label="Wallet"\')' in fluid_text
assert 'not.toContain("Share a route")' in fluid_text
assert 'const nextAction = useMemo<HomeAction>' in fluid_text
assert 'Create customer account' in auth_text
assert '/(customer)/search' not in services_text
assert 'Request a nearby ride with live driver matching' in services_text
assert 'vehicle_registration_or_logbook' not in manual_text
assert 'toHaveBeenCalledTimes(4)' not in manual_text
assert 'toHaveBeenCalledTimes(3)' in manual_text
print("Build39 residual test contracts updated")
